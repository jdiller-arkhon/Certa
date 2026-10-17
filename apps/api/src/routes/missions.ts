import { api, Id, newId, type GeoPoint } from '@certa/core';
import { aircraft, and, asc, authorizations, eq, flights, inArray, isNull, missionAircraft, missionAuthorizations, missionCrew, missions, pilots, sql, type Db } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const MissionParams = OrgParams.extend({ missionId: Id });

const point = (p: GeoPoint | null | undefined) => (p ? sql`ST_GeogFromText(${`SRID=4326;POINT(${p.lon} ${p.lat})`})` : null);

const missionSelection = {
  m: missions,
  lat: sql<number | null>`ST_Y(${missions.location}::geometry)`,
  lon: sql<number | null>`ST_X(${missions.location}::geometry)`,
};

/** Missions with their crew, aircraft, authorizations, and flights flown so far. */
async function loadMissions(db: Db, ids?: string[]): Promise<api.MissionRecord[]> {
  const rows = await db
    .select(missionSelection)
    .from(missions)
    .where(and(isNull(missions.deletedAt), ids ? inArray(missions.id, ids) : undefined))
    .orderBy(asc(missions.plannedStart), asc(missions.id));
  if (!rows.length) return [];
  const mids = rows.map((r) => r.m.id);
  const [crew, craft, auths, flown] = await Promise.all([
    db.select().from(missionCrew).where(inArray(missionCrew.missionId, mids)),
    db.select().from(missionAircraft).where(inArray(missionAircraft.missionId, mids)),
    db.select().from(missionAuthorizations).where(inArray(missionAuthorizations.missionId, mids)),
    db
      .select({ missionId: flights.missionId, n: sql<number>`count(*)::int`, s: sql<number>`coalesce(sum(${flights.durationSeconds}), 0)::int` })
      .from(flights)
      .where(and(inArray(flights.missionId, mids), isNull(flights.deletedAt)))
      .groupBy(flights.missionId),
  ]);
  return rows.map(({ m, lat, lon }) => {
    const f = flown.find((x) => x.missionId === m.id);
    return {
      id: m.id,
      orgId: m.orgId,
      createdAt: iso(m.createdAt)!,
      updatedAt: iso(m.updatedAt)!,
      createdBy: m.createdBy,
      deletedAt: iso(m.deletedAt),
      name: m.name,
      purpose: m.purpose,
      plannedStart: iso(m.plannedStart),
      plannedEnd: iso(m.plannedEnd),
      status: m.status,
      crew: crew.filter((c) => c.missionId === m.id).map((c) => ({ pilotId: c.pilotId, role: c.role === 'pic' ? ('pic' as const) : ('observer' as const) })),
      aircraftIds: craft.filter((c) => c.missionId === m.id).map((c) => c.aircraftId),
      authorizationIds: auths.filter((c) => c.missionId === m.id).map((c) => c.authorizationId),
      deliverables: m.deliverables,
      locationName: m.locationName,
      location: lat != null && lon != null ? { lat, lon } : null,
      maxAltitudeAglM: m.maxAltitudeAglM,
      operationType: m.operationType as api.MissionRecord['operationType'],
      flightCount: f?.n ?? 0,
      flightSeconds: f?.s ?? 0,
    };
  });
}

async function loadMission(db: Db, id: string) {
  const [m] = await loadMissions(db, [id]);
  if (!m) throw notFound('Mission');
  return m;
}

/** The people, aircraft and authorizations a mission names must exist in this org. */
async function checkReferences(db: Db, b: { crew?: { pilotId: string }[]; aircraftIds?: string[]; authorizationIds?: string[] }) {
  const people = [...new Set((b.crew ?? []).map((c) => c.pilotId))];
  if (people.length && (await db.select({ id: pilots.id }).from(pilots).where(and(inArray(pilots.id, people), isNull(pilots.deletedAt)))).length !== people.length) throw badRequest('Unknown pilot');
  const craft = [...new Set(b.aircraftIds ?? [])];
  if (craft.length && (await db.select({ id: aircraft.id }).from(aircraft).where(and(inArray(aircraft.id, craft), isNull(aircraft.deletedAt)))).length !== craft.length) throw badRequest('Unknown aircraft');
  const auths = [...new Set(b.authorizationIds ?? [])];
  if (auths.length && (await db.select({ id: authorizations.id }).from(authorizations).where(and(inArray(authorizations.id, auths), isNull(authorizations.deletedAt)))).length !== auths.length) throw badRequest('Unknown authorization');
}

async function replaceLinks(db: Db, missionId: string, b: { crew?: { pilotId: string; role: 'pic' | 'observer' }[]; aircraftIds?: string[]; authorizationIds?: string[] }) {
  if (b.crew) {
    await db.delete(missionCrew).where(eq(missionCrew.missionId, missionId));
    if (b.crew.length) await db.insert(missionCrew).values(b.crew.map((c) => ({ missionId, pilotId: c.pilotId, role: c.role })));
  }
  if (b.aircraftIds) {
    await db.delete(missionAircraft).where(eq(missionAircraft.missionId, missionId));
    const ids = [...new Set(b.aircraftIds)];
    if (ids.length) await db.insert(missionAircraft).values(ids.map((aircraftId) => ({ missionId, aircraftId })));
  }
  if (b.authorizationIds) {
    await db.delete(missionAuthorizations).where(eq(missionAuthorizations.missionId, missionId));
    const ids = [...new Set(b.authorizationIds)];
    if (ids.length) await db.insert(missionAuthorizations).values(ids.map((authorizationId) => ({ missionId, authorizationId })));
  }
}

/**
 * Planned operations: when, where, how high, who flies which aircraft, under which
 * authorizations. Chief pilots and admins plan them; everyone who can read the fleet sees them.
 * Flights logged against a mission link back to it.
 */
export const missionRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/orgs/:orgId/missions',
      { schema: { tags: ['missions'], params: OrgParams, response: { 200: api.MissionListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'missions.read');
        return inOrg(ctx.pool, req, oc, async (db) => ({ missions: await loadMissions(db) }));
      },
    );

    app.get(
      '/orgs/:orgId/missions/:missionId',
      { schema: { tags: ['missions'], params: MissionParams, response: { 200: api.MissionRecord } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'missions.read');
        return inOrg(ctx.pool, req, oc, (db) => loadMission(db, req.params.missionId));
      },
    );

    app.post(
      '/orgs/:orgId/missions',
      { schema: { tags: ['missions'], params: OrgParams, body: api.CreateMissionRequest, response: { 201: api.MissionRecord } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'missions.manage');
        const b = req.body;
        const m = await inOrg(ctx.pool, req, oc, async (db) => {
          await checkReferences(db, b);
          const id = newId();
          await db.insert(missions).values({
            id,
            name: b.name,
            purpose: b.purpose ?? null,
            plannedStart: b.plannedStart ?? null,
            plannedEnd: b.plannedEnd ?? null,
            status: b.status ?? 'planned',
            deliverables: b.deliverables ?? null,
            locationName: b.locationName ?? null,
            location: point(b.location) as unknown as string,
            maxAltitudeAglM: b.maxAltitudeAglM ?? null,
            operationType: b.operationType ?? 'commercial',
          });
          await replaceLinks(db, id, b);
          return loadMission(db, id);
        });
        return reply.status(201).send(m);
      },
    );

    app.patch(
      '/orgs/:orgId/missions/:missionId',
      { schema: { tags: ['missions'], params: MissionParams, body: api.UpdateMissionRequest, response: { 200: api.MissionRecord } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'missions.manage');
        const b = req.body;
        return inOrg(ctx.pool, req, oc, async (db) => {
          const cur = await loadMission(db, req.params.missionId);
          await checkReferences(db, b);
          const start = b.plannedStart === undefined ? cur.plannedStart : b.plannedStart;
          const end = b.plannedEnd === undefined ? cur.plannedEnd : b.plannedEnd;
          if (start && end && Date.parse(end) <= Date.parse(start)) throw badRequest('The end must be after the start');
          const set: Partial<typeof missions.$inferInsert> = {};
          for (const k of ['name', 'purpose', 'plannedStart', 'plannedEnd', 'status', 'deliverables', 'locationName', 'maxAltitudeAglM', 'operationType'] as const) if (b[k] !== undefined) (set as Record<string, unknown>)[k] = b[k];
          if (b.location !== undefined) set.location = point(b.location) as unknown as string;
          if (Object.keys(set).length) await db.update(missions).set(set).where(eq(missions.id, cur.id));
          await replaceLinks(db, cur.id, b);
          return loadMission(db, cur.id);
        });
      },
    );

    app.delete(
      '/orgs/:orgId/missions/:missionId',
      { schema: { tags: ['missions'], summary: 'Delete a mission. Its flights stay in the logbook.', params: MissionParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'missions.manage');
        await inOrg(ctx.pool, req, oc, async (db) => {
          const cur = await loadMission(db, req.params.missionId);
          await db.update(missions).set({ deletedAt: sql`now()` }).where(eq(missions.id, cur.id));
        });
        return reply.status(204).send(null);
      },
    );
  };
