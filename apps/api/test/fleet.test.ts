import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fleetReadiness, newId, type FleetSnapshot } from '@certa/core';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';

const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;

interface Session {
  cookie: string;
  orgId: string;
}

const cookieFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
  return list.map((c: string) => c.split(';')[0]).join('; ');
};

async function signUp(name: string, email: string, org: string): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/signup',
    headers: { origin: ORIGIN },
    payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' },
  });
  expect(res.statusCode, res.body).toBe(201);
  return { cookie: cookieFrom(res), orgId: res.json().memberships[0].orgId };
}

const call = (s: Session, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1/orgs/${s.orgId}${path}`, headers: { origin: ORIGIN, cookie: s.cookie }, payload: payload as object });
const ok = async (p: ReturnType<typeof call>, status = 200) => {
  const res = await p;
  expect(res.statusCode, res.body).toBe(status);
  return res.statusCode === 204 ? null : res.json();
};

let owner: Session;
let other: Session;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

beforeAll(async () => {
  tdb = await createTestDatabase('fleet');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
  });
  app = await buildApp({ config, pool, mailer: new MemoryMailer() }, { logger: false });
  owner = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
  other = await signUp('Oscar Other', 'oscar@example.com', 'Other Co');
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

let pilotId: string;
let aircraftId: string;
let batteryId: string;

describe('pilots and credentials', () => {
  it('creates a pilot and validates credentials against the rule pack', async () => {
    const p = await ok(call(owner, 'POST', '/pilots', { displayName: 'Dana Reyes', certificateNumber: '4123456' }), 201);
    pilotId = p.id;
    await ok(call(owner, 'POST', `/pilots/${pilotId}/credentials`, { credentialType: 'not_a_real_type' }), 400);
    await ok(call(owner, 'POST', `/pilots/${pilotId}/credentials`, { credentialType: 'part107_certificate', issuedOn: today, expiresOn: daysFromNow(-1) }), 400);
    await ok(call(owner, 'POST', `/pilots/${pilotId}/credentials`, { credentialType: 'part107_certificate', identifier: '4123456', issuedOn: '2022-03-01' }), 201);
    const rec = await ok(call(owner, 'POST', `/pilots/${pilotId}/credentials`, { credentialType: 'part107_recurrent', issuedOn: daysFromNow(-100) }), 201);
    expect(rec.jurisdiction).toBe('US-FAA-Part107');
  });
});

describe('prior experience', () => {
  it('adds totals from other apps to the snapshot, validates them, and keeps them per org', async () => {
    const made = await ok(call(owner, 'POST', `/pilots/${pilotId}/prior-experience`, { source: 'DJI Fly', flights: 120, missions: 14, flightSeconds: 30 * 3600 + 15 * 60, asOf: today, notes: 'From the DJI Fly flight record' }), 201);
    expect(made).toMatchObject({ pilotId, source: 'DJI Fly', flights: 120, missions: 14, flightSeconds: 108900, asOf: today });

    const fleet = await ok(call(owner, 'GET', '/fleet'));
    expect(fleet.priorExperience).toEqual([expect.objectContaining({ id: made.id, source: 'DJI Fly' })]);
    expect(fleet.pilotTotals[pilotId] ?? { missions: 0 }).toHaveProperty('missions');

    await ok(call(owner, 'POST', `/pilots/${pilotId}/prior-experience`, { source: 'AirData', flights: 1, missions: 0, flightSeconds: 60, asOf: daysFromNow(2) }), 400);
    await ok(call(owner, 'POST', `/pilots/${pilotId}/prior-experience`, { source: '', flights: 1, missions: 0, flightSeconds: 60, asOf: today }), 400);
    await ok(call(owner, 'POST', `/pilots/${pilotId}/prior-experience`, { source: 'AirData', flights: -1, missions: 0, flightSeconds: 60, asOf: today }), 400);

    expect(await ok(call(owner, 'PATCH', `/prior-experience/${made.id}`, { flights: 125 }))).toMatchObject({ flights: 125, missions: 14 });
    // Another org can neither see nor change it.
    expect((await ok(call(other, 'GET', '/fleet'))).priorExperience).toEqual([]);
    await ok(call(other, 'PATCH', `/prior-experience/${made.id}`, { flights: 1 }), 404);
    await ok(call(other, 'DELETE', `/prior-experience/${made.id}`), 404);

    await ok(call(owner, 'DELETE', `/prior-experience/${made.id}`), 204);
    expect((await ok(call(owner, 'GET', '/fleet'))).priorExperience).toEqual([]);
    await ok(call(owner, 'PATCH', `/prior-experience/${made.id}`, { flights: 1 }), 404);
  });
});

describe('aircraft, batteries, grounding', () => {
  it('creates aircraft and rejects a duplicate serial', async () => {
    const a = await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Matrice 30T', serialNumber: 'SN-1', registrationNumber: 'FA3TEST001', registrationExpiresOn: daysFromNow(400), takeoffMassKg: 3.77 }), 201);
    aircraftId = a.id;
    expect(a.status).toBe('active');
    await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Matrice 30T', serialNumber: 'SN-1' }), 409);
    const b = await ok(call(owner, 'POST', '/batteries', { serialNumber: 'BAT-1', label: 'M30 #1', aircraftModel: 'Matrice 30T', thresholds: { maxCycles: 2 } }), 201);
    batteryId = b.id;
    expect(b.thresholds.maxCycles).toBe(2);
  });

  it('grounds and returns to service, recording the reason', async () => {
    const g = await ok(call(owner, 'POST', `/aircraft/${aircraftId}/ground`, { reason: 'Prop strike on landing' }), 200);
    expect(g.status).toBe('grounded');
    await ok(call(owner, 'PATCH', `/aircraft/${aircraftId}`, { status: 'active' }), 400);
    const r = await ok(call(owner, 'POST', `/aircraft/${aircraftId}/return-to-service`, { reason: 'Props replaced and test hovered' }), 200);
    expect(r.status).toBe('active');
    const ev = await ok(call(owner, 'GET', `/maintenance/events?targetId=${aircraftId}`));
    expect(ev.events[0].description).toContain('Props replaced');
    expect(ev.events[0].description).toContain('Prop strike');
  });
});

describe('flights', () => {
  const takeoff = new Date(Date.now() - 3 * 3600_000).toISOString();
  const landing = new Date(Date.now() - 3 * 3600_000 + 1200_000).toISOString();
  const flightId = newId();

  it('logs a flight and derives aircraft hours and battery cycles', async () => {
    await ok(call(owner, 'POST', '/flights', { pilotInCommandId: pilotId, aircraftId, takeoffAt: landing, landingAt: takeoff, localTimeZone: 'America/Denver' }), 400);
    const f = await ok(
      call(owner, 'POST', '/flights', {
        id: flightId,
        pilotInCommandId: pilotId,
        aircraftId,
        batteries: [{ batteryId, startPct: 100, endPct: 30 }],
        takeoffAt: takeoff,
        landingAt: landing,
        localTimeZone: 'America/Denver',
        takeoffPoint: { lat: 39.74, lon: -104.99 },
        locationName: 'Cherry Creek Bridge',
        maxAltitudeAglM: 91.4,
        goNoGo: { decision: 'go', checks: [{ key: 'pilot', label: 'Pilot', level: 'green', detail: 'Current' }] },
      }),
      201,
    );
    expect(f.durationSeconds).toBe(1200);
    expect(f.takeoffPoint.lat).toBeCloseTo(39.74, 4);
    expect(f.goNoGo.decision).toBe('go');
    const fleet: FleetSnapshot = await ok(call(owner, 'GET', '/fleet'));
    const a = fleet.aircraft.find((x) => x.id === aircraftId)!;
    expect(a.totalFlights).toBe(1);
    expect(a.totalFlightSeconds).toBe(1200);
    expect(fleet.batteries.find((x) => x.id === batteryId)!.cycleCount).toBe(1);
    expect(fleet.pilotTotals[pilotId]!.flights).toBe(1);
    expect(fleet.lastFlight?.id).toBe(flightId);
    expect(fleet.recentLocations).toContain('Cherry Creek Bridge');
  });

  it('is idempotent for a client-supplied id (offline retries)', async () => {
    const again = await call(owner, 'POST', '/flights', { id: flightId, pilotInCommandId: pilotId, aircraftId, takeoffAt: takeoff, landingAt: landing, localTimeZone: 'America/Denver' });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(flightId);
    const fleet: FleetSnapshot = await ok(call(owner, 'GET', '/fleet'));
    expect(fleet.aircraft.find((x) => x.id === aircraftId)!.totalFlights).toBe(1);
  });

  it('pages newest first with totals and filters', async () => {
    for (let i = 1; i <= 4; i++) {
      const t0 = new Date(Date.now() - (10 + i) * 86400_000).toISOString();
      await ok(call(owner, 'POST', '/flights', { pilotInCommandId: pilotId, aircraftId, takeoffAt: t0, landingAt: new Date(Date.parse(t0) + 600_000).toISOString(), localTimeZone: 'America/Denver' }), 201);
    }
    const p1 = await ok(call(owner, 'GET', '/flights?limit=2'));
    expect(p1.items).toHaveLength(2);
    expect(p1.total).toBe(5);
    expect(p1.totals.flightSeconds).toBe(1200 + 4 * 600);
    expect(p1.items[0].id).toBe(flightId);
    const p2 = await ok(call(owner, 'GET', `/flights?limit=2&cursor=${p1.nextCursor}`));
    const p3 = await ok(call(owner, 'GET', `/flights?limit=2&cursor=${p2.nextCursor}`));
    const ids = [...p1.items, ...p2.items, ...p3.items].map((f: { id: string }) => f.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
    const ranged = await ok(call(owner, 'GET', `/flights?from=${daysFromNow(-1)}`));
    expect(ranged.total).toBe(1);
    await ok(call(owner, 'GET', '/flights?cursor=bm90LWEtY3Vyc29y'), 400);
  });

  it('reverses derived totals when a flight is deleted', async () => {
    await ok(call(owner, 'DELETE', `/flights/${flightId}`), 204);
    const fleet: FleetSnapshot = await ok(call(owner, 'GET', '/fleet'));
    expect(fleet.batteries.find((x) => x.id === batteryId)!.cycleCount).toBe(0);
    expect(fleet.aircraft.find((x) => x.id === aircraftId)!.totalFlights).toBe(4);
    await ok(call(owner, 'GET', `/flights/${flightId}`), 404);
  });
});

describe('readiness additions', () => {
  it('flags missing Remote ID, tracks insurance, and counts maintenance by flights', async () => {
    const noRid = await ok(call(owner, 'POST', '/aircraft', { make: 'Custom', model: 'Quad', serialNumber: 'SN-2', registrationNumber: 'FA3TEST002', registrationExpiresOn: daysFromNow(400), remoteIdMethod: 'none' }), 201);
    await ok(call(owner, 'POST', '/insurance', { carrier: 'SkyWatch', policyNumber: 'P-1', effectiveOn: daysFromNow(-300), expiresOn: daysFromNow(10), coveredAircraftIds: [aircraftId] }), 201);
    await ok(call(owner, 'POST', '/insurance', { carrier: 'Bad', policyNumber: 'P-2', effectiveOn: today, expiresOn: daysFromNow(-1) }), 400);
    await ok(call(owner, 'POST', '/maintenance/schedules', { name: 'Propeller inspection', target: { type: 'aircraft', id: aircraftId }, everyFlights: 2 }), 201);
    await ok(call(owner, 'POST', '/maintenance/schedules', { name: 'Nothing', target: { type: 'aircraft', id: aircraftId } }), 400);
    for (let i = 0; i < 2; i++) {
      const t0 = new Date(Date.now() - (2 + i) * 3600_000).toISOString();
      await ok(call(owner, 'POST', '/flights', { pilotInCommandId: pilotId, aircraftId, takeoffAt: t0, landingAt: new Date(Date.parse(t0) + 300_000).toISOString(), localTimeZone: 'America/Denver' }), 201);
    }
    const fleet: FleetSnapshot = await ok(call(owner, 'GET', '/fleet'));
    const r = fleetReadiness(fleet, { today, now: new Date(), units: fleet.organization.units, orgTimeZone: fleet.organization.timezone });
    const ridReasons = r.aircraft.get(noRid.id)!.reasons.map((x) => x.reason);
    expect(ridReasons).toContain('No Remote ID');
    expect(r.aircraft.get(noRid.id)!.level).toBe('red');
    const main = r.aircraft.get(aircraftId)!;
    expect(main.items.some((i) => i.kind === 'insurance' && i.level === 'amber')).toBe(true);
    // Two flights since the schedule started and it grounds when overdue → red.
    expect(main.items.find((i) => i.kind === 'maintenance')?.level).toBe('red');
    expect(main.level).toBe('red');

    // Completing the scheduled item resets it.
    const sched = fleet.maintenanceSchedules[0]!;
    await ok(call(owner, 'POST', '/maintenance/events', { scheduleId: sched.id, target: { type: 'aircraft', id: aircraftId }, performedAt: new Date().toISOString(), performedBy: 'Olivia Owner', description: 'Props inspected' }), 201);
    const after: FleetSnapshot = await ok(call(owner, 'GET', '/fleet'));
    const r2 = fleetReadiness(after, { today, now: new Date(), units: after.organization.units, orgTimeZone: after.organization.timezone });
    expect(r2.aircraft.get(aircraftId)!.items.find((i) => i.kind === 'maintenance')?.level).toBe('green');
  });

  it('returns a pre-flight go / no-go', async () => {
    const res = await ok(call(owner, 'POST', '/preflight', { pilotId, aircraftId, batteryIds: [batteryId] }));
    expect(['go', 'caution', 'no_go']).toContain(res.decision);
    expect(res.checks.map((c: { key: string }) => c.key)).toEqual(['pilot', 'aircraft', `battery:${batteryId}`]);
    await ok(call(owner, 'POST', `/aircraft/${aircraftId}/ground`, { reason: 'Motor noise' }), 200);
    const grounded = await ok(call(owner, 'POST', '/preflight', { pilotId, aircraftId, batteryIds: [] }));
    expect(grounded.decision).toBe('no_go');
    expect(grounded.checks[1].detail).toContain('Motor noise');
  });
});

describe('tenant isolation', () => {
  it("never shows or accepts another org's fleet", async () => {
    await ok(call({ ...other, orgId: owner.orgId }, 'GET', '/fleet'), 404);
    const theirs: FleetSnapshot = await ok(call(other, 'GET', '/fleet'));
    expect(theirs.pilots.map((p) => p.displayName)).not.toContain('Dana Reyes');
    expect(theirs.aircraft).toHaveLength(0);
    // Referencing our aircraft from their org is rejected as unknown (RLS hides it).
    const theirPilot = await ok(call(other, 'POST', '/pilots', { displayName: 'Oscar' }), 201);
    const t0 = new Date(Date.now() - 3600_000).toISOString();
    await ok(call(other, 'POST', '/flights', { pilotInCommandId: theirPilot.id, aircraftId, takeoffAt: t0, landingAt: new Date(Date.parse(t0) + 60_000).toISOString(), localTimeZone: 'UTC' }), 400);
    await ok(call(other, 'PATCH', `/aircraft/${aircraftId}`, { nickname: 'mine now' }), 404);
  });
});
