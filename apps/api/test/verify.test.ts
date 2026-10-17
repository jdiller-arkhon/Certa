import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';

const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;
// Calendar dates in the test org's zone (America/Denver), so the suite passes at any hour UTC.
const days = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

async function signUp(name: string, email: string, org: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' } });
  expect(res.statusCode, res.body).toBe(201);
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw as string]).map((c) => c.split(';')[0]).join('; ');
  const orgId: string = res.json().memberships[0].orgId;
  const call = (method: 'GET' | 'POST' | 'DELETE', path: string, payload?: object) => app.inject({ method, url: `/api/v1/orgs/${orgId}${path}`, headers: { origin: ORIGIN, cookie }, payload });
  return { orgId, call };
}
const machine = (key: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${key}` }, payload });

beforeAll(async () => {
  tdb = await createTestDatabase('verify');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000' });
  app = await buildApp({ config, pool, mailer: new MemoryMailer() }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('Argus verification API', () => {
  it('answers with an org API key, only for that org, and stops when revoked', async () => {
    const a = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
    const b = await signUp('Bea Other', 'bea@example.com', 'Other Co');
    const pilot = (await a.call('POST', '/pilots', { displayName: 'Dana Reyes', certificateNumber: '4123456' })).json();
    await a.call('POST', `/pilots/${pilot.id}/credentials`, { credentialType: 'part107_certificate', identifier: '4123456', issuedOn: '2023-01-10' });
    await a.call('POST', `/pilots/${pilot.id}/credentials`, { credentialType: 'part107_recurrent', issuedOn: days(-40) });
    const good = (await a.call('POST', '/aircraft', { nickname: 'Falcon 1', make: 'DJI', model: 'M30T', serialNumber: 'SN-1', registrationNumber: 'FA3ABC', registrationExpiresOn: days(400) })).json();
    const lapsed = (await a.call('POST', '/aircraft', { make: 'Autel', model: 'EVO', serialNumber: 'SN-2', registrationNumber: 'FA3OLD', registrationExpiresOn: days(-1) })).json();
    const otherAc = (await b.call('POST', '/aircraft', { make: 'Skydio', model: 'X10', serialNumber: 'SN-3', registrationNumber: 'FA3B' })).json();

    const created = await a.call('POST', '/api-keys', { name: 'Argus' });
    expect(created.statusCode, created.body).toBe(201);
    const { key, prefix, id } = created.json();
    expect(key).toMatch(/^ck_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    expect(key.startsWith(`${prefix}_`)).toBe(true);
    // The list never shows the secret.
    expect(JSON.stringify((await a.call('GET', '/api-keys')).json())).not.toContain(key.slice(prefix.length + 1));

    const p = await machine(key, 'GET', `/verify/pilots/${pilot.id}`);
    expect(p.statusCode, p.body).toBe(200);
    expect(p.json()).toMatchObject({ subject: { type: 'pilot', name: 'Dana Reyes', identifier: '4123456' }, legalToFly: true, status: 'green' });

    const byCert = (await machine(key, 'GET', '/verify/lookup?certificateNumber=4123-456')).json();
    expect(byCert.subject.id).toBe(pilot.id);
    const byReg = (await machine(key, 'GET', '/verify/lookup?registration=fa3old')).json();
    expect(byReg).toMatchObject({ subject: { id: lapsed.id }, legalToFly: false, status: 'red' });
    expect(byReg.reasons[0].text).toMatch(/Registration/);
    expect((await machine(key, 'GET', '/verify/lookup?registration=FA3ABC&serialNumber=SN-1')).statusCode).toBe(400);

    const flight = (await machine(key, 'POST', '/verify/flight', { pilotId: pilot.id, aircraftId: good.id })).json();
    expect(flight.goNoGo.decision).toBe('go');

    // Another org's aircraft is invisible to this key.
    expect((await machine(key, 'GET', `/verify/aircraft/${otherAc.id}`)).statusCode).toBe(404);
    expect((await machine(key, 'GET', '/verify/lookup?registration=FA3B')).statusCode).toBe(404);

    // Bad keys: malformed, right prefix wrong secret, no header.
    expect((await machine('nope', 'GET', `/verify/pilots/${pilot.id}`)).statusCode).toBe(401);
    expect((await machine(`${prefix}_${'x'.repeat(43)}`, 'GET', `/verify/pilots/${pilot.id}`)).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v1/verify/pilots/${pilot.id}` })).statusCode).toBe(401);

    // Use is recorded.
    const listed = (await a.call('GET', '/api-keys')).json().keys[0];
    expect(listed.lastUsedAt).not.toBeNull();

    // Members without integrations.manage can't mint keys: the other org's owner can't touch ours.
    expect((await b.call('DELETE', `/api-keys/${id}`)).statusCode).toBe(404);

    expect((await a.call('DELETE', `/api-keys/${id}`)).statusCode).toBe(204);
    expect((await machine(key, 'GET', `/verify/pilots/${pilot.id}`)).statusCode).toBe(401);
  });

  it('expired keys stop working', async () => {
    const a = await signUp('Exp Owner', 'exp@example.com', 'Expiring Co');
    const pilot = (await a.call('POST', '/pilots', { displayName: 'Pat' })).json();
    const { key, id } = (await a.call('POST', '/api-keys', { name: 'Short', expiresInDays: 1 })).json();
    expect((await machine(key, 'GET', `/verify/pilots/${pilot.id}`)).statusCode).toBe(200);
    const admin = new pg.Client({ connectionString: tdb.adminUrl });
    await admin.connect();
    await admin.query(`UPDATE api_keys SET expires_at = now() - interval '1 second' WHERE id = $1`, [id]);
    await admin.end();
    expect((await machine(key, 'GET', `/verify/pilots/${pilot.id}`)).statusCode).toBe(401);
  });
});
