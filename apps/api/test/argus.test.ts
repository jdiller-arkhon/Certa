import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';

const ORIGIN = 'http://localhost:8080';
const TOKEN = 'argus-ingest-token-argus-ingest-token-0123';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;
const mailer = new MemoryMailer();

interface Session {
  cookie: string;
  orgId: string;
}

const cookieFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
  return list.map((c: string) => c.split(';')[0]).join('; ');
};

const configFor = (overrides: Record<string, string | undefined> = {}) =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
    ARGUS_INGEST_TOKEN: TOKEN,
    ...overrides,
  });

async function signUp(name: string, email: string, org: string): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' } });
  expect(res.statusCode, res.body).toBe(201);
  return { cookie: cookieFrom(res), orgId: res.json().memberships[0].orgId };
}

const call = (s: Session, method: 'GET' | 'POST' | 'DELETE', path: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1/orgs/${s.orgId}${path}`, headers: { origin: ORIGIN, cookie: s.cookie }, payload: payload as object });
const ok = async (p: ReturnType<typeof call>, status = 200) => {
  const res = await p;
  expect(res.statusCode, res.body).toBe(status);
  return res.statusCode === 204 ? null : res.json();
};
const ingest = (body: unknown, token = TOKEN, on = app) =>
  on.inject({ method: 'POST', url: '/api/v1/integrations/argus/flights', headers: { authorization: `Bearer ${token}` }, payload: body as object });

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const olivia = { arkhonUserId: 'ark-olivia', name: 'Olivia Owner', email: 'Olivia@Example.com' };
const job = (jobId: string, takeoffH: number, minutes: number, pilot = olivia) => ({
  pilot,
  jobId,
  reference: `Argus job ${jobId}`,
  takeoffAt: hoursAgo(takeoffH),
  landingAt: new Date(Date.parse(hoursAgo(takeoffH)) + minutes * 60_000).toISOString(),
  locationName: 'Boulder, CO',
  lat: 40.015,
  lng: -105.27,
});

let owner: Session;
let other: Session;
let pilotId: string;

beforeAll(async () => {
  tdb = await createTestDatabase('argus');
  pool = createPool(tdb.appUrl);
  app = await buildApp({ config: configFor(), pool, mailer }, { logger: false });
  owner = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
  other = await signUp('Oscar Other', 'oscar@example.com', 'Other Co');
  pilotId = (await ok(call(owner, 'GET', '/fleet'))).pilots[0].id;
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('Argus mission flights', () => {
  it('needs the Argus token, and is off without one (blank counts as unset)', async () => {
    expect((await ingest(job('J0', 2, 10), 'wrong-token')).statusCode).toBe(401);
    expect((await ingest(job('J0', 2, 10), '')).statusCode).toBe(401);
    for (const token of [undefined, '', '  ']) {
      const off = await buildApp({ config: configFor({ ARGUS_INGEST_TOKEN: token }), pool, mailer: new MemoryMailer() }, { logger: false });
      expect((await ingest(job('J0', 2, 10), TOKEN, off)).statusCode).toBe(503);
      await off.close();
    }
    expect(() => configFor({ ARGUS_INGEST_TOKEN: 'too-short' })).toThrow(/at least 32/);
  });

  it('rejects impossible times', async () => {
    expect((await ingest({ ...job('J0', 2, 10), landingAt: hoursAgo(3) })).statusCode).toBe(422);
    expect((await ingest(job('J0', 30, 13 * 60))).statusCode).toBe(422);
  });

  it('counts a landed job toward the pilot’s totals in their own logbook, once', async () => {
    const res = await ingest(job('J1', 2, 25));
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().status).toBe('created');
    const again = await ingest(job('J1', 2, 25));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ status: 'unchanged', externalFlightId: res.json().externalFlightId });

    const fleet = await ok(call(owner, 'GET', '/fleet'));
    expect(fleet.pilotTotals[pilotId]).toMatchObject({ flights: 1, missions: 1, flightSeconds: 25 * 60, last90DaysFlights: 1 });
    expect(fleet.externalFlights).toEqual([expect.objectContaining({ pilotId, externalId: 'J1', reference: 'Argus job J1', durationSeconds: 1500, locationName: 'Boulder, CO' })]);
    // Linked by Arkhon's verified email: no second account or logbook.
    const me = (await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: owner.cookie } })).json();
    expect(me.memberships).toHaveLength(1);
    // Other orgs never see it.
    expect((await ok(call(other, 'GET', '/fleet'))).externalFlights).toEqual([]);
  });

  it('updates a resent job whose times changed', async () => {
    const res = await ingest(job('J1', 2, 40));
    expect(res.json().status).toBe('updated');
    expect((await ok(call(owner, 'GET', '/fleet'))).pilotTotals[pilotId].flightSeconds).toBe(40 * 60);
  });

  it('gives a pilot new to Certa their own logbook', async () => {
    const res = await ingest(job('J9', 5, 15, { arkhonUserId: 'ark-new', name: 'Nina New', email: 'nina@example.com' }));
    expect(res.statusCode, res.body).toBe(201);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM auth_users WHERE email = 'nina@example.com' AND arkhon_user_id = 'ark-new'");
    expect(rows[0].n).toBe(1);
  });

  it('turns into a regular flight when the pilot picks the drone', async () => {
    const ac = await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Mavic 3E', serialNumber: 'ARG-1' }), 201);
    const ext = (await ok(call(owner, 'GET', '/fleet'))).externalFlights[0];
    await ok(call(other, 'POST', `/external-flights/${ext.id}/convert`, { aircraftId: ac.id }), 404);
    const { flightId } = await ok(call(owner, 'POST', `/external-flights/${ext.id}/convert`, { aircraftId: ac.id }), 201);
    const flight = await ok(call(owner, 'GET', `/flights/${flightId}`));
    expect(flight).toMatchObject({ pilotInCommandId: pilotId, aircraftId: ac.id, durationSeconds: 2400, source: 'import', importParser: 'argus', locationName: 'Boulder, CO' });

    // Counted once: as the Certa flight now, not also as the Argus one.
    const fleet = await ok(call(owner, 'GET', '/fleet'));
    expect(fleet.externalFlights).toEqual([]);
    expect(fleet.pilotTotals[pilotId]).toMatchObject({ flights: 1, flightSeconds: 2400 });
    expect(fleet.aircraft.find((a: { id: string }) => a.id === ac.id).totalFlightSeconds).toBe(2400);
    // A resend leaves the converted flight alone.
    expect((await ingest(job('J1', 2, 55))).json().status).toBe('unchanged');
    await ok(call(owner, 'POST', `/external-flights/${ext.id}/convert`, { aircraftId: ac.id }), 404);
  });

  it('only the pilot (or those who manage flights) can pick the drone or dismiss it', async () => {
    const { externalFlightId } = (await ingest(job('J3', 6, 9))).json();
    const ac = (await ok(call(owner, 'GET', '/fleet'))).aircraft[0];
    for (const role of ['pilot', 'viewer'] as const) {
      const email = `${role}-member@example.com`;
      await ok(call(owner, 'POST', '/members', { email, name: `A ${role}`, role }), 201);
      const link = /(https?:\/\/\S+)/.exec(mailer.sent.find((m) => m.to === email)!.text)![1]!;
      const url = new URL(link);
      const verify = await app.inject({ method: 'GET', url: url.pathname + url.search, headers: { origin: ORIGIN } });
      const member = { cookie: cookieFrom(verify), orgId: owner.orgId };
      await ok(call(member, 'POST', `/external-flights/${externalFlightId}/convert`, { aircraftId: ac.id }), 403);
      await ok(call(member, 'DELETE', `/external-flights/${externalFlightId}`), 403);
    }
    expect((await ok(call(owner, 'GET', '/fleet'))).externalFlights.map((x: { id: string }) => x.id)).toContain(externalFlightId);
    await ok(call(owner, 'DELETE', `/external-flights/${externalFlightId}`), 204);
  });

  it('can be dismissed, and a resend doesn’t bring it back', async () => {
    const { externalFlightId } = (await ingest(job('J2', 4, 12))).json();
    await ok(call(owner, 'DELETE', `/external-flights/${externalFlightId}`), 204);
    expect((await ingest(job('J2', 4, 12))).json().status).toBe('unchanged');
    expect((await ok(call(owner, 'GET', '/fleet'))).externalFlights).toEqual([]);
  });
});
