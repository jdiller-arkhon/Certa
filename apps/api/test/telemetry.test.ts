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
let other: Session;

beforeAll(async () => {
  tdb = await createTestDatabase('telemetry');
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

describe('flights imported from aircraft logs', () => {
  const T0 = Date.parse('2026-10-20T16:00:30Z');
  const track = Array.from({ length: 50 }, (_, i) => [-104.85, 39.65 + i * 0.00008, i < 5 ? i * 10 : 50, Math.round(T0 / 1000) + i * 10] as [number, number, number, number]);
  const telemetry = {
    parser: 'airdata-csv', takeoffAt: new Date(T0).toISOString(), landingAt: new Date(T0 + 490_000).toISOString(), durationSeconds: 490,
    maxHeightM: 50, maxDistanceM: 436, totalDistanceM: 436, maxSpeedMps: 9.1, home: { lat: 39.65, lon: -104.85 }, landing: { lat: 39.65392, lon: -104.85 },
    battery: { startPct: 98, endPct: 41, startVoltageV: 25.1, minVoltageV: 22.3, minCellV: 3.58, maxCellDeltaV: 0.14 },
    aircraftModel: 'Mavic 3 Enterprise', aircraftSerial: '1581F5FHD23', batterySerials: [], events: [{ at: new Date(T0 + 200_000).toISOString(), level: 'warning', text: 'Strong wind' }], warnings: [], samples: 4900,
  };
  let pilotId: string;
  let aircraftId: string;
  const body = (over: Record<string, unknown> = {}) => ({
    pilotInCommandId: pilotId, aircraftId, batteries: [], takeoffAt: telemetry.takeoffAt, landingAt: telemetry.landingAt, localTimeZone: 'America/Denver',
    maxAltitudeAglM: 50, maxDistanceM: 436, totalDistanceM: 436, track, telemetry, import: { parser: 'airdata-csv', dedupeKey: '1581F5FHD23@2026-10-20T16:00', warnings: [] }, ...over,
  });

  it('stores the track and metrics, and serves them back', async () => {
    pilotId = (await ok(call(owner, 'POST', '/pilots', { displayName: 'Dana Reyes' }), 201)).id;
    aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Mavic 3 Enterprise', serialNumber: '1581F5FHD23' }), 201)).id;
    const f = await ok(call(owner, 'POST', '/flights', body()), 201);
    expect(f).toMatchObject({ source: 'import', importParser: 'airdata-csv', hasPath: true, durationSeconds: 490, totalDistanceM: 436, takeoffPoint: { lat: 39.65, lon: -104.85 }, landingPoint: { lat: 39.65392, lon: -104.85 } });
    const t = await ok(call(owner, 'GET', `/flights/${f.id}/track`));
    expect(t.points).toHaveLength(50);
    expect(t.points[0]).toEqual(track[0]);
    expect(t.points[49]).toEqual(track[49]);
    expect(t.telemetry).toMatchObject({ maxHeightM: 50, battery: { minCellV: 3.58 }, events: [{ text: 'Strong wind' }] });
  });

  it('refuses the same log twice, but a retry with the same id is fine', async () => {
    const id = '019a0000-0000-7000-8000-00000000abcd';
    await ok(call(owner, 'POST', '/flights', body({ id, import: { parser: 'csv', dedupeKey: 'X@2026-10-20T17:00', warnings: [] } })), 201);
    await ok(call(owner, 'POST', '/flights', body({ id, import: { parser: 'csv', dedupeKey: 'X@2026-10-20T17:00', warnings: [] } })), 200);
    const dup = await call(owner, 'POST', '/flights', body({ import: { parser: 'csv', dedupeKey: 'X@2026-10-20T17:00', warnings: [] } }));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message ?? dup.json().error).toMatch(/already in the logbook/);
  });

  it('keeps tracks inside the organization and validates points', async () => {
    const f = await ok(call(owner, 'GET', '/flights'));
    const imported = f.items.find((x: { source: string }) => x.source === 'import');
    expect((await call(other, 'GET', `/flights/${imported.id}/track`)).statusCode).toBe(404);
    const bad = await call(owner, 'POST', '/flights', body({ track: [[-200, 0, 0, 1], [0, 0, 0, 2]], import: { parser: 'csv', dedupeKey: 'Y@1', warnings: [] } }));
    expect(bad.statusCode).toBe(400);
    const manual = await ok(call(owner, 'POST', '/flights', { pilotInCommandId: pilotId, aircraftId, batteries: [], takeoffAt: '2026-10-21T16:00:00Z', landingAt: '2026-10-21T16:10:00Z', localTimeZone: 'America/Denver' }), 201);
    expect(manual).toMatchObject({ source: 'manual', hasPath: false });
    expect(await ok(call(owner, 'GET', `/flights/${manual.id}/track`))).toEqual({ points: [], telemetry: null });
  });
});
