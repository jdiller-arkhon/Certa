import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import pg from 'pg';
import { buildApp, redactUrl, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { pdfSafe } from '../src/lib/packet-pdf.js';
import type { Pusher } from '../src/lib/push.js';

/** Regression tests for the security review of the Phase 2+ work. */
const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;
const pusher: Pusher = { publicKey: 'BKey', send: async () => 'sent' };
const days = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  tdb = await createTestDatabase('security');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000' });
  app = await buildApp({ config, pool, mailer: new MemoryMailer(), pusher }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

async function signUp(email: string, org: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name: 'Owner', email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' } });
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw as string]).map((c) => c.split(';')[0]).join('; ');
  const orgId: string = res.json().memberships[0].orgId;
  const call = (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, extra: Record<string, string> = {}) =>
    app.inject({ method, url: `/api/v1/orgs/${orgId}${path}`, headers: { origin: ORIGIN, cookie, ...extra }, payload });
  return { orgId, call, cookie };
}

describe('security review fixes', () => {
  it('keeps share tokens out of logs and strips PDF-unsafe control characters', () => {
    expect(redactUrl('/certa/api/v1/public/share/AbC_123-xyz/packet.pdf?x=1')).toBe('/certa/api/v1/public/share/:token/packet.pdf?x=1');
    expect(pdfSafe('A\u0081B\u009fC — ok')).toBe('A?B?C — ok');
  });

  it('flights: server computes the stored go/no-go; duplicates, 48 h edits, and replays are rejected', async () => {
    const a = await signUp('sec1@example.com', 'Sec One');
    const pilot = (await a.call('POST', '/pilots', { displayName: 'No Cert' })).json();
    const ac = (await a.call('POST', '/aircraft', { make: 'DJI', model: 'M30T', serialNumber: 'S1', registrationNumber: 'FA3S', registrationExpiresOn: days(300) })).json();
    const bat = (await a.call('POST', '/batteries', { serialNumber: 'B1' })).json();
    const t0 = new Date(Date.now() - 86400_000);
    const body = { pilotInCommandId: pilot.id, aircraftId: ac.id, takeoffAt: t0.toISOString(), landingAt: new Date(t0.getTime() + 600_000).toISOString(), localTimeZone: 'America/Denver' };
    const forged = { decision: 'go', checks: [{ key: 'pilot', label: 'Pilot', level: 'green', detail: 'All good, trust me' }] };
    const f = await a.call('POST', '/flights', { ...body, goNoGo: forged });
    expect(f.statusCode, f.body).toBe(201);
    expect(f.json().goNoGo.decision).toBe('no_go'); // pilot has no certificate on file
    expect(JSON.stringify(f.json().goNoGo)).not.toContain('trust me');

    expect((await a.call('POST', '/flights', { ...body, batteries: [{ batteryId: bat.id, startPct: null, endPct: null }, { batteryId: bat.id, startPct: null, endPct: null }] })).statusCode).toBe(400);
    expect((await a.call('PATCH', `/flights/${f.json().id}`, { landingAt: new Date(t0.getTime() + 48 * 3600_000).toISOString() })).statusCode).toBe(400);

    const id = '0199c4a0-0000-7000-8000-00000000abcd';
    expect((await a.call('POST', '/flights', { ...body, id })).statusCode).toBe(201);
    expect((await a.call('POST', '/flights', { ...body, id })).statusCode).toBe(200); // real retry
    const other = (await a.call('POST', '/pilots', { displayName: 'Other' })).json();
    expect((await a.call('POST', '/flights', { ...body, id, pilotInCommandId: other.id })).statusCode).toBe(409);
    await app.inject({ method: 'DELETE', url: `/api/v1/orgs/${a.orgId}/flights/${id}`, headers: { origin: ORIGIN, cookie: a.cookie } });
    expect((await a.call('POST', '/flights', { ...body, id })).json().error.message).toBe('That flight was deleted');
  });

  it('verify lookup rejects blank values instead of matching empty fields', async () => {
    const a = await signUp('sec2@example.com', 'Sec Two');
    await a.call('POST', '/pilots', { displayName: 'Blank Cert' });
    const { key } = (await a.call('POST', '/api-keys', { name: 'k' })).json();
    const r = await app.inject({ method: 'GET', url: '/api/v1/verify/lookup?certificateNumber=-', headers: { authorization: `Bearer ${key}` } });
    expect(r.statusCode).toBe(400);
  });

  it('rate limits hold when a client varies its own X-Forwarded-For entries', async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) {
      const r = await app.inject({ method: 'GET', url: `/api/v1/public/share/${'A'.repeat(43)}`, headers: { 'x-forwarded-for': `10.0.${i}.1, 203.0.113.7` } });
      last = r.statusCode;
    }
    expect(last).toBe(429);
  });

  it('push subscription keys and endpoints are redacted from the audit log', async () => {
    const a = await signUp('sec3@example.com', 'Sec Three');
    const endpoint = 'https://fcm.googleapis.com/fcm/send/shared-device';
    const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
    expect((await a.call('POST', '/push-subscriptions', { endpoint, keys })).statusCode).toBe(204);
    const admin = new pg.Client({ connectionString: tdb.adminUrl });
    await admin.connect();
    const audit = await admin.query(`SELECT after FROM audit_events WHERE table_name = 'push_subscriptions' ORDER BY id DESC LIMIT 1`);
    expect(audit.rows[0].after).not.toHaveProperty('p256dh');
    expect(audit.rows[0].after).not.toHaveProperty('endpoint');
    await admin.end();
  });
});
