/**
 * Flights from Argus missions. When a pilot marks an Argus job landed, Argus sends the flight
 * here (and resends recent ones daily, so a missed push catches up). It counts toward the
 * pilot's flight time straight away; the pilot later picks the drone they flew, which turns it
 * into a regular Certa flight with aircraft hours, maintenance and currency.
 *
 * Argus authenticates with ARGUS_INGEST_TOKEN. Ingest is idempotent per Argus job: a resend of
 * the same job updates times that changed and never duplicates, and a flight the pilot already
 * converted or dismissed is left alone.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { api, Id, newId } from '@certa/core';
import { aircraft, and, eq, externalFlights, flights, isNull, memberships, pilots, sql, withTenant, type Db } from '@certa/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { provisionArkhonUser } from '../lib/arkhon.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { ApiError, notFound } from '../lib/errors.js';
import { orgMapContext, recomputeDerived } from '../lib/fleet.js';
import { OrgParams } from './orgs.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const ExternalFlightParams = OrgParams.extend({ externalFlightId: Id });
/** Longer than any battery allows; a bigger gap means a step was marked late, not a real flight. */
const MAX_FLIGHT_SECONDS = 12 * 3600;
/** Owner first: a pilot's own logbook is where their Argus flights belong. */
const ROLE_ORDER = ['owner', 'chief_pilot', 'pilot', 'admin'] as const;

const unprocessable = (message: string) => new ApiError(422, 'unprocessable', message);
const point = (lat: number, lng: number) => sql`ST_GeogFromText(${`SRID=4326;POINT(${lng} ${lat})`})` as unknown as string;

export const argusRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const argusAuth = async (req: FastifyRequest) => {
      const configured = ctx.config.ARGUS_INGEST_TOKEN;
      if (!configured) throw new ApiError(503, 'argus_ingest_disabled', 'Argus flight ingest is not enabled on this server');
      const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
      if (!timingSafeEqual(Buffer.from(sha256(given), 'hex'), Buffer.from(sha256(configured), 'hex'))) throw new ApiError(401, 'unauthorized', 'Invalid Argus token');
    };

    /** The pilot record their Argus flights go to: in the org they own, else the first org where they fly. */
    const pilotFor = async (userId: string, requestId: string) => {
      const ms = await withTenant(ctx.pool, { orgId: null, userId, requestId }, (t) =>
        t
          .select({ id: memberships.id, orgId: memberships.orgId, role: memberships.role, expiresAt: memberships.expiresAt, createdAt: memberships.createdAt })
          .from(memberships)
          .where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt))),
      );
      const usable = ms
        .filter((m) => (ROLE_ORDER as readonly string[]).includes(m.role) && (!m.expiresAt || new Date(m.expiresAt).getTime() > Date.now()))
        .sort((a, b) => ROLE_ORDER.indexOf(a.role as never) - ROLE_ORDER.indexOf(b.role as never) || String(a.createdAt).localeCompare(String(b.createdAt)));
      for (const m of usable) {
        const [p] = await withTenant(ctx.pool, { orgId: m.orgId, userId, requestId }, (t) =>
          t.select({ id: pilots.id }).from(pilots).where(and(eq(pilots.membershipId, m.id), isNull(pilots.deletedAt))),
        );
        if (p) return { orgId: m.orgId, pilotId: p.id };
      }
      return null;
    };

    const ingest: FastifyPluginAsyncZod = async (argus) => {
      argus.addHook('onRequest', argusAuth);

      argus.post(
        '/integrations/argus/flights',
        {
          schema: {
            tags: ['integrations'],
            summary: 'Argus: a flight from a job the pilot marked landed. Idempotent per jobId; links or creates the pilot’s Certa account.',
            body: api.ArgusFlightIngestRequest,
            response: { 200: api.ArgusFlightIngestResponse, 201: api.ArgusFlightIngestResponse, 409: api.ErrorResponse, 422: api.ErrorResponse },
          },
        },
        async (req, reply) => {
          const b = req.body;
          const seconds = Math.round((Date.parse(b.landingAt) - Date.parse(b.takeoffAt)) / 1000);
          if (seconds <= 0) throw unprocessable('landingAt must be after takeoffAt.');
          if (seconds > MAX_FLIGHT_SECONDS) throw unprocessable('A single flight can’t be longer than 12 hours.');
          if (Date.parse(b.takeoffAt) > Date.now() + 5 * 60_000) throw unprocessable('takeoffAt is in the future.');

          const userId = await provisionArkhonUser(
            ctx.config,
            ctx.pool,
            { id: b.pilot.arkhonUserId, name: b.pilot.name.trim(), email: b.pilot.email.toLowerCase(), role: 'pilot', adminLevel: null },
            req.id,
            { fromSignIn: false },
          );
          const target = await pilotFor(userId, req.id);
          if (!target) throw unprocessable('This pilot has no Certa logbook to add the flight to.');

          const values = {
            reference: b.reference ?? null,
            takeoffAt: new Date(b.takeoffAt).toISOString(),
            landingAt: new Date(b.landingAt).toISOString(),
            durationSeconds: seconds,
            locationName: b.locationName ?? null,
            takeoffPoint: b.lat != null && b.lng != null ? point(b.lat, b.lng) : null,
          };
          const result = await withTenant(ctx.pool, { orgId: target.orgId, userId: null, requestId: req.id }, async (db) => {
            const [existing] = await db.select().from(externalFlights).where(and(eq(externalFlights.source, 'argus'), eq(externalFlights.externalId, b.jobId)));
            if (!existing) {
              const id = newId();
              await db.insert(externalFlights).values({ id, pilotId: target.pilotId, source: 'argus', externalId: b.jobId, ...values });
              return { code: 201 as const, status: 'created' as const, externalFlightId: id };
            }
            const same =
              existing.reference === values.reference &&
              new Date(existing.takeoffAt).getTime() === Date.parse(values.takeoffAt) &&
              new Date(existing.landingAt).getTime() === Date.parse(values.landingAt) &&
              existing.locationName === values.locationName;
            // Converted or dismissed by the pilot: theirs now, a resend doesn't touch it.
            if (same || existing.convertedFlightId || existing.deletedAt) return { code: 200 as const, status: 'unchanged' as const, externalFlightId: existing.id };
            await db.update(externalFlights).set(values).where(eq(externalFlights.id, existing.id));
            return { code: 200 as const, status: 'updated' as const, externalFlightId: existing.id };
          });
          return reply.status(result.code).send({ status: result.status, externalFlightId: result.externalFlightId });
        },
      );
    };
    await app.register(ingest);

    // ---------------------------------------------------------------- for the pilot (session)
    const pending = async (db: Db, id: string) => {
      const [x] = await db.select().from(externalFlights).where(and(eq(externalFlights.id, id), isNull(externalFlights.deletedAt), isNull(externalFlights.convertedFlightId)));
      if (!x) throw notFound('Argus flight');
      return x;
    };

    app.post(
      '/orgs/:orgId/external-flights/:externalFlightId/convert',
      {
        schema: {
          tags: ['flights'],
          summary: 'Pick the drone flown on an Argus mission flight, turning it into a regular Certa flight',
          params: ExternalFlightParams,
          body: api.ConvertExternalFlightRequest,
          response: { 201: api.ConvertExternalFlightResponse, 404: api.ErrorResponse },
        },
      },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const flightId = await inOrg(ctx.pool, req, oc, async (db) => {
          const x = await pending(db, req.params.externalFlightId);
          authorize(oc, 'flights.log', x.pilotId);
          const [ac] = await db.select({ id: aircraft.id, status: aircraft.status }).from(aircraft).where(and(eq(aircraft.id, req.body.aircraftId), isNull(aircraft.deletedAt)));
          if (!ac) throw notFound('Aircraft');
          const mapCtx = await orgMapContext(db, oc.orgId);
          const id = newId();
          const note = x.reference ? `From Argus (${x.reference}).` : 'From Argus.';
          await db.insert(flights).values({
            id,
            pilotInCommandId: x.pilotId,
            aircraftId: ac.id,
            takeoffAt: x.takeoffAt,
            landingAt: x.landingAt,
            localTimeZone: mapCtx.org.timezone,
            takeoffPoint: x.takeoffPoint,
            locationName: x.locationName,
            durationSeconds: x.durationSeconds,
            notes: note,
            source: 'import',
            importParser: 'argus',
            dedupeKey: `argus:${x.externalId}`,
          });
          await db.update(externalFlights).set({ convertedFlightId: id }).where(eq(externalFlights.id, x.id));
          await recomputeDerived(db, { aircraftIds: [ac.id], batteryIds: [] });
          return id;
        });
        return reply.status(201).send({ flightId });
      },
    );

    app.delete(
      '/orgs/:orgId/external-flights/:externalFlightId',
      { schema: { tags: ['flights'], summary: 'Dismiss an Argus mission flight (e.g. the job had no flight); a resend won’t bring it back', params: ExternalFlightParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        await inOrg(ctx.pool, req, oc, async (db) => {
          const x = await pending(db, req.params.externalFlightId);
          authorize(oc, 'flights.edit', x.pilotId);
          await db.update(externalFlights).set({ deletedAt: sql`now()` }).where(eq(externalFlights.id, x.id));
        });
        return reply.status(204).send(null);
      },
    );
  };
