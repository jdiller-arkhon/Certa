import { api, goNoGo, Id, newId, type GeoPoint } from '@certa/core';
import {
  aircraft,
  and,
  batteries,
  desc,
  eq,
  flightBatteries,
  flightObservers,
  flights,
  inArray,
  isNull,
  lt,
  or,
  pilots,
  sql,
  type Db,
  type SQL,
} from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { flightSelection, loadFleet, orgMapContext, recomputeDerived, toFlights, type FlightSelectRow } from '../lib/fleet.js';
import { OrgParams } from './orgs.js';

const FlightParams = OrgParams.extend({ flightId: Id });

const ewkt = (p: GeoPoint | null | undefined) => (p ? sql`ST_GeogFromText(${`SRID=4326;POINT(${p.lon} ${p.lat})`})` : null);

const encodeCursor = (takeoffAt: string, id: string) => Buffer.from(`${takeoffAt}|${id}`).toString('base64url');
function decodeCursor(c: string): { takeoffAt: string; id: string } {
  const [takeoffAt, id] = Buffer.from(c, 'base64url').toString().split('|');
  if (!takeoffAt || !id || !z.uuid().safeParse(id).success || Number.isNaN(Date.parse(takeoffAt))) throw badRequest('Invalid cursor');
  return { takeoffAt, id };
}

/** Validates the people and equipment a flight references, inside the org's RLS context. */
async function checkReferences(db: Db, b: { pilotInCommandId?: string; visualObserverIds?: string[]; aircraftId?: string; batteries?: { batteryId: string }[] }) {
  const people = [...new Set([b.pilotInCommandId, ...(b.visualObserverIds ?? [])].filter(Boolean) as string[])];
  if (people.length) {
    const found = await db.select({ id: pilots.id }).from(pilots).where(and(inArray(pilots.id, people), isNull(pilots.deletedAt)));
    if (found.length !== people.length) throw badRequest('Unknown pilot or observer');
  }
  if (b.aircraftId) {
    const [a] = await db.select({ status: aircraft.status }).from(aircraft).where(and(eq(aircraft.id, b.aircraftId), isNull(aircraft.deletedAt)));
    if (!a) throw badRequest('Unknown aircraft');
    if (a.status === 'retired') throw badRequest('That aircraft is retired');
  }
  const batteryIds = [...new Set((b.batteries ?? []).map((x) => x.batteryId))];
  if (batteryIds.length) {
    const found = await db.select({ id: batteries.id }).from(batteries).where(and(inArray(batteries.id, batteryIds), isNull(batteries.deletedAt)));
    if (found.length !== batteryIds.length) throw badRequest('Unknown battery');
  }
}

export const flightRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const loadOne = async (db: Db, id: string) => {
      const rows = (await db.select(flightSelection).from(flights).where(and(eq(flights.id, id), isNull(flights.deletedAt)))) as FlightSelectRow[];
      const [f] = await toFlights(db, rows);
      if (!f) throw notFound('Flight');
      return f;
    };

    app.get(
      '/orgs/:orgId/flights',
      { schema: { tags: ['flights'], summary: 'Flights, newest first (cursor-paged)', params: OrgParams, querystring: api.FlightListQuery, response: { 200: api.FlightListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'flights.read');
        const q = req.query;
        return inOrg(ctx.pool, req, oc, async (db) => {
          const filters: (SQL | undefined)[] = [
            isNull(flights.deletedAt),
            q.pilotId ? eq(flights.pilotInCommandId, q.pilotId) : undefined,
            q.aircraftId ? eq(flights.aircraftId, q.aircraftId) : undefined,
            q.from ? sql`${flights.takeoffAt} >= ${`${q.from}T00:00:00Z`}` : undefined,
            // `to` is inclusive of the whole day.
            q.to ? sql`${flights.takeoffAt} < (${q.to}::date + 1)` : undefined,
          ];
          const where = and(...filters);
          const [totals] = await db
            .select({ n: sql<number>`count(*)::int`, s: sql<number>`coalesce(sum(${flights.durationSeconds}), 0)::bigint` })
            .from(flights)
            .where(where);
          const cursor = q.cursor ? decodeCursor(q.cursor) : null;
          const rows = (await db
            .select(flightSelection)
            .from(flights)
            .where(
              and(
                where,
                cursor ? or(lt(flights.takeoffAt, cursor.takeoffAt), and(eq(flights.takeoffAt, cursor.takeoffAt), lt(flights.id, cursor.id))) : undefined,
              ),
            )
            .orderBy(desc(flights.takeoffAt), desc(flights.id))
            .limit(q.limit + 1)) as FlightSelectRow[];
          const page = rows.slice(0, q.limit);
          const items = (await toFlights(db, page)).map(({ goNoGo: _g, ...f }) => f);
          const last = page.at(-1);
          return {
            items,
            total: totals!.n,
            nextCursor: rows.length > q.limit && last ? encodeCursor(new Date(last.f.takeoffAt).toISOString(), last.f.id) : null,
            totals: { flights: totals!.n, flightSeconds: Number(totals!.s) },
          };
        });
      },
    );

    app.get(
      '/orgs/:orgId/flights/:flightId',
      { schema: { tags: ['flights'], params: FlightParams, response: { 200: api.FlightWithGoNoGo } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'flights.read');
        return inOrg(ctx.pool, req, oc, (db) => loadOne(db, req.params.flightId));
      },
    );

    app.post(
      '/orgs/:orgId/flights',
      {
        schema: {
          tags: ['flights'],
          summary: 'Log a flight. Idempotent when the client supplies `id`: re-sending returns the stored flight.',
          params: OrgParams,
          body: api.CreateFlightRequest,
          response: { 200: api.FlightWithGoNoGo, 201: api.FlightWithGoNoGo, 409: api.ErrorResponse },
        },
      },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const b = req.body;
        authorize(oc, 'flights.log', b.pilotInCommandId);
        const duration = Math.round((Date.parse(b.landingAt) - Date.parse(b.takeoffAt)) / 1000);
        if (duration <= 0) throw badRequest('Landing must be after takeoff');
        if (duration > 24 * 3600) throw badRequest('A flight cannot be longer than 24 hours');
        const { status, flight } = await inOrg(ctx.pool, req, oc, async (db) => {
          if (b.id) {
            const [existing] = await db.select({ id: flights.id, deletedAt: flights.deletedAt, pilotInCommandId: flights.pilotInCommandId }).from(flights).where(eq(flights.id, b.id));
            if (existing?.deletedAt) throw conflict('That flight was deleted');
            // A retry is the same flight; a different pilot on a known id is not a retry.
            if (existing && existing.pilotInCommandId !== b.pilotInCommandId) throw conflict('That flight id is already in use');
            if (existing) return { status: 200 as const, flight: await loadOne(db, b.id) };
          }
          await checkReferences(db, b);
          // The stored pre-flight check is the server's, from records on file now; a client can't supply its own.
          const check = goNoGo(await loadFleet(db, oc.orgId), { pilotId: b.pilotInCommandId, aircraftId: b.aircraftId, batteryIds: b.batteries.map((x) => x.batteryId) }, await orgMapContext(db, oc.orgId));
          const id = b.id ?? newId();
          try {
            await db.insert(flights).values({
              id,
              pilotInCommandId: b.pilotInCommandId,
              aircraftId: b.aircraftId,
              takeoffAt: b.takeoffAt,
              landingAt: b.landingAt,
              localTimeZone: b.localTimeZone,
              takeoffPoint: ewkt(b.takeoffPoint) as unknown as string,
              locationName: b.locationName ?? null,
              durationSeconds: duration,
              maxAltitudeAglM: b.maxAltitudeAglM ?? null,
              maxDistanceM: b.maxDistanceM ?? null,
              operationType: b.operationType,
              airspaceClass: b.airspaceClass ?? null,
              weather: b.weather ?? null,
              notes: b.notes ?? null,
              source: 'manual',
              goNoGo: check,
            });
          } catch (err) {
            // An id that exists in another org is invisible here (RLS) but still collides.
            if ((err as { code?: string; cause?: { code?: string } }).cause?.code === '23505' || (err as { code?: string }).code === '23505') throw conflict('That flight id is already in use');
            throw err;
          }
          const observers = [...new Set(b.visualObserverIds.filter((o) => o !== b.pilotInCommandId))];
          if (observers.length) await db.insert(flightObservers).values(observers.map((pilotId) => ({ flightId: id, pilotId })));
          if (b.batteries.length) await db.insert(flightBatteries).values(b.batteries.map((x) => ({ flightId: id, batteryId: x.batteryId, startPct: x.startPct, endPct: x.endPct })));
          await recomputeDerived(db, { aircraftIds: [b.aircraftId], batteryIds: b.batteries.map((x) => x.batteryId) });
          return { status: 201 as const, flight: await loadOne(db, id) };
        });
        return reply.status(status).send(flight);
      },
    );

    app.patch(
      '/orgs/:orgId/flights/:flightId',
      { schema: { tags: ['flights'], params: FlightParams, body: api.UpdateFlightRequest, response: { 200: api.FlightWithGoNoGo } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const b = req.body;
        return inOrg(ctx.pool, req, oc, async (db) => {
          const cur = await loadOne(db, req.params.flightId);
          authorize(oc, 'flights.edit', cur.pilotInCommandId);
          // Reassigning a flight to another pilot needs the edit right over that pilot too.
          if (b.pilotInCommandId && b.pilotInCommandId !== cur.pilotInCommandId) authorize(oc, 'flights.edit', b.pilotInCommandId);
          await checkReferences(db, b);
          const takeoffAt = b.takeoffAt ?? cur.takeoffAt;
          const landingAt = b.landingAt ?? cur.landingAt;
          const duration = Math.round((Date.parse(landingAt) - Date.parse(takeoffAt)) / 1000);
          if (duration <= 0) throw badRequest('Landing must be after takeoff');
          if (duration > 24 * 3600) throw badRequest('A flight cannot be longer than 24 hours');
          await db
            .update(flights)
            .set({
              pilotInCommandId: b.pilotInCommandId,
              aircraftId: b.aircraftId,
              takeoffAt: b.takeoffAt,
              landingAt: b.landingAt,
              localTimeZone: b.localTimeZone,
              takeoffPoint: b.takeoffPoint === undefined ? undefined : (ewkt(b.takeoffPoint) as unknown as string),
              locationName: b.locationName === undefined ? undefined : b.locationName,
              durationSeconds: duration,
              maxAltitudeAglM: b.maxAltitudeAglM === undefined ? undefined : b.maxAltitudeAglM,
              maxDistanceM: b.maxDistanceM === undefined ? undefined : b.maxDistanceM,
              operationType: b.operationType,
              airspaceClass: b.airspaceClass === undefined ? undefined : b.airspaceClass,
              weather: b.weather === undefined ? undefined : b.weather,
              notes: b.notes === undefined ? undefined : b.notes,
            })
            .where(eq(flights.id, cur.id));
          if (b.visualObserverIds) {
            await db.delete(flightObservers).where(eq(flightObservers.flightId, cur.id));
            const pic = b.pilotInCommandId ?? cur.pilotInCommandId;
            const obs = [...new Set(b.visualObserverIds.filter((o) => o !== pic))];
            if (obs.length) await db.insert(flightObservers).values(obs.map((pilotId) => ({ flightId: cur.id, pilotId })));
          }
          if (b.batteries) {
            await db.delete(flightBatteries).where(eq(flightBatteries.flightId, cur.id));
            if (b.batteries.length) await db.insert(flightBatteries).values(b.batteries.map((x) => ({ flightId: cur.id, batteryId: x.batteryId, startPct: x.startPct, endPct: x.endPct })));
          }
          await recomputeDerived(db, {
            aircraftIds: [cur.aircraftId, b.aircraftId ?? cur.aircraftId],
            batteryIds: [...cur.batteries.map((x) => x.batteryId), ...(b.batteries ?? []).map((x) => x.batteryId)],
          });
          return loadOne(db, cur.id);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/flights/:flightId',
      { schema: { tags: ['flights'], summary: 'Delete a flight (kept in the audit log)', params: FlightParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        await inOrg(ctx.pool, req, oc, async (db) => {
          const cur = await loadOne(db, req.params.flightId);
          authorize(oc, 'flights.edit', cur.pilotInCommandId);
          await db.update(flights).set({ deletedAt: sql`now()` }).where(eq(flights.id, cur.id));
          await recomputeDerived(db, { aircraftIds: [cur.aircraftId], batteryIds: cur.batteries.map((x) => x.batteryId) });
        });
        return reply.status(204).send(null);
      },
    );
  };
