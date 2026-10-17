import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const call = (s: Session, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1/orgs/${s.orgId}${path}`, headers: { origin: ORIGIN, cookie: s.cookie }, payload: payload as object });
const ok = async (p: ReturnType<typeof call>, status = 200) => {
  const res = await p;
  expect(res.statusCode, res.body).toBe(status);
  return res.statusCode === 204 ? null : res.json();
};

let owner: Session;
let pilot: Session;
const mailer = new MemoryMailer();
let other: Session;

beforeAll(async () => {
  tdb = await createTestDatabase('missions');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
  });
  app = await buildApp({ config, pool, mailer }, { logger: false });
  owner = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
  other = await signUp('Oscar Other', 'oscar@example.com', 'Other Co');
  // A pilot member, signed in through the invite's magic link.
  await ok(call(owner, 'POST', '/members', { email: 'pete@example.com', name: 'Pete Pilot', role: 'pilot' }), 201);
  const link = new URL(/(https?:\/\/\S+)/.exec(mailer.sent.find((m) => m.to === 'pete@example.com')!.text)![1]!);
  const verify = await app.inject({ method: 'GET', url: link.pathname + link.search, headers: { origin: ORIGIN } });
  pilot = { cookie: cookieFrom(verify), orgId: owner.orgId };
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('missions', () => {
  let pilotId: string;
  let observerId: string;
  let aircraftId: string;
  let waiverId: string;
  let missionId: string;
  const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();

  it('plans a mission with crew, aircraft, authorizations and a location', async () => {
    pilotId = (await ok(call(owner, 'POST', '/pilots', { displayName: 'Dana Reyes' }), 201)).id;
    observerId = (await ok(call(owner, 'POST', '/pilots', { displayName: 'Sam Ortiz' }), 201)).id;
    aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'Skydio', model: 'X10', serialNumber: 'SKX-1' }), 201)).id;
    waiverId = (await ok(call(owner, 'POST', '/authorizations', { kind: 'waiver', reference: '107W-2026-01234', validFrom: inDays(-30), validTo: inDays(700) }), 201)).id;
    const m = await ok(
      call(owner, 'POST', '/missions', {
        name: 'Substation inspection',
        purpose: 'Thermal survey of the north yard',
        plannedStart: inDays(3),
        plannedEnd: inDays(3.1),
        locationName: 'Henderson substation',
        location: { lat: 39.8617, lon: -104.6731 },
        maxAltitudeAglM: 60,
        crew: [{ pilotId, role: 'pic' }, { pilotId: observerId, role: 'observer' }],
        aircraftIds: [aircraftId],
        authorizationIds: [waiverId],
      }),
      201,
    );
    missionId = m.id;
    expect(m).toMatchObject({ status: 'planned', operationType: 'commercial', locationName: 'Henderson substation', maxAltitudeAglM: 60, aircraftIds: [aircraftId], authorizationIds: [waiverId], flightCount: 0 });
    expect(m.location.lat).toBeCloseTo(39.8617, 4);
    expect(m.location.lon).toBeCloseTo(-104.6731, 4);
    expect(m.crew).toEqual(expect.arrayContaining([{ pilotId, role: 'pic' }, { pilotId: observerId, role: 'observer' }]));
    expect((await ok(call(owner, 'GET', '/missions'))).missions.map((x: { id: string }) => x.id)).toEqual([missionId]);
  });

  it('validates the window, the crew and references', async () => {
    await ok(call(owner, 'POST', '/missions', { name: 'Backwards', plannedStart: inDays(2), plannedEnd: inDays(1) }), 400);
    await ok(call(owner, 'POST', '/missions', { name: 'Two PICs', crew: [{ pilotId, role: 'pic' }, { pilotId: observerId, role: 'pic' }] }), 400);
    await ok(call(owner, 'POST', '/missions', { name: 'Ghost', aircraftIds: ['01a14820-2044-70e3-b6db-c4feaac3b630'] }), 400);
    await ok(call(owner, 'PATCH', `/missions/${missionId}`, { plannedEnd: inDays(2) }), 400);
  });

  it('edits, replacing crew and clearing the location', async () => {
    const m = await ok(call(owner, 'PATCH', `/missions/${missionId}`, { crew: [{ pilotId, role: 'pic' }], location: null, deliverables: 'Thermal orthomosaic' }));
    expect(m.crew).toEqual([{ pilotId, role: 'pic' }]);
    expect(m.location).toBeNull();
    expect(m.deliverables).toBe('Thermal orthomosaic');
    expect(m.locationName).toBe('Henderson substation');
  });

  it('links flights, starts the mission on the first one, and filters the logbook by mission', async () => {
    const base = { pilotInCommandId: pilotId, aircraftId, takeoffAt: new Date(Date.now() - 3600_000).toISOString(), landingAt: new Date(Date.now() - 2400_000).toISOString(), localTimeZone: 'America/Denver' };
    const f = await ok(call(owner, 'POST', '/flights', { ...base, missionId }), 201);
    expect(f.missionId).toBe(missionId);
    await ok(call(owner, 'POST', '/flights', base), 201);
    await ok(call(owner, 'POST', '/flights', { ...base, missionId: '01a14820-2044-70e3-b6db-c4feaac3b630' }), 400);
    const m = await ok(call(owner, 'GET', `/missions/${missionId}`));
    expect(m).toMatchObject({ status: 'in_progress', flightCount: 1, flightSeconds: 1200 });
    const list = await ok(call(owner, 'GET', `/flights?missionId=${missionId}`));
    expect(list.items.map((x: { id: string }) => x.id)).toEqual([f.id]);
    expect((await ok(call(owner, 'PATCH', `/missions/${missionId}`, { status: 'completed' }))).status).toBe('completed');
  });

  it('lets pilots read but not plan, and keeps orgs apart', async () => {
    expect((await ok(call(pilot, 'GET', '/missions'))).missions).toHaveLength(1);
    await ok(call(pilot, 'POST', '/missions', { name: 'Mine' }), 403);
    await ok(call(pilot, 'PATCH', `/missions/${missionId}`, { name: 'Renamed' }), 403);
    expect((await ok(call(other, 'GET', '/missions'))).missions).toEqual([]);
    await ok(call(other, 'GET', `/missions/${missionId}`), 404);
    await ok(call(other, 'PATCH', `/missions/${missionId}`, { name: 'HIJACK' }), 404);
  });

  it('deletes a mission and keeps its flights', async () => {
    await ok(call(owner, 'DELETE', `/missions/${missionId}`), 204);
    await ok(call(owner, 'GET', `/missions/${missionId}`), 404);
    expect((await ok(call(owner, 'GET', `/flights?missionId=${missionId}`))).items).toHaveLength(1);
  });
});
