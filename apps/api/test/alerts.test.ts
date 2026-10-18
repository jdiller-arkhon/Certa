import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { runExpiryAlerts } from '../src/jobs/expiry-alerts.js';
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
  const call = async (method: 'POST' | 'PATCH', path: string, payload: object, status = 201) => {
    const r = await app.inject({ method, url: `/api/v1/orgs/${orgId}${path}`, headers: { origin: ORIGIN, cookie }, payload });
    expect(r.statusCode, r.body).toBe(status);
    return r.json();
  };
  return { orgId, call };
}

beforeAll(async () => {
  tdb = await createTestDatabase('alerts');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000' });
  app = await buildApp({ config, pool, mailer: new MemoryMailer() }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('daily expiry alerts', () => {
  it('emails managers and the pilot once per threshold, tightest threshold only, per org', async () => {
    const a = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
    const b = await signUp('Bea Other', 'bea@example.com', 'Quiet Co');
    // Org A: a pilot with an email whose certificate registration lapses in 5 days, and an aircraft whose registration lapsed.
    const p = await a.call('POST', '/pilots', { displayName: 'Dana Reyes', email: 'dana@example.com' });
    await a.call('POST', `/pilots/${p.id}/credentials`, { credentialType: 'part107_certificate', issuedOn: '2024-01-10' });
    await a.call('POST', `/pilots/${p.id}/credentials`, { credentialType: 'part107_recurrent', issuedOn: '2024-06-01', expiresOn: days(5) });
    await a.call('POST', '/aircraft', { nickname: 'Falcon 1', make: 'DJI', model: 'M30T', serialNumber: 'S1', registrationNumber: 'FA3X', registrationExpiresOn: days(-2) });
    // Org B: everything far in the future — nothing to send.
    await b.call('POST', '/aircraft', { make: 'DJI', model: 'M30T', serialNumber: 'S2', registrationNumber: 'FA3Y', registrationExpiresOn: days(400) });

    const mailer = new MemoryMailer();
    const first = await runExpiryAlerts({ pool, mailer, publicUrl: 'https://example.com/certa' });
    expect(first.failures).toBe(0);

    const to = mailer.sent.map((m) => m.to).sort();
    // Owner gets everything; Dana gets only her own credential; nobody in Quiet Co is mailed.
    expect(to).toEqual(['dana@example.com', 'olivia@example.com']);
    const owner = mailer.sent.find((m) => m.to === 'olivia@example.com')!;
    expect(owner.subject).toBe('Skyline Aerial: 1 item overdue, 1 coming due');
    expect(owner.text).toContain('Falcon 1 — Registration');
    expect(owner.text).toContain('Dana Reyes — Recurrent training');
    expect(owner.text).toContain('due in 5 days');
    expect(owner.text).toMatch(/https:\/\/example\.com\/certa\/aircraft\/[0-9a-f-]{36}/);
    const dana = mailer.sent.find((m) => m.to === 'dana@example.com')!;
    expect(dana.text).toContain('Recurrent training');
    expect(dana.text).not.toContain('Falcon 1');

    // Same day again: nothing new.
    const again = new MemoryMailer();
    await runExpiryAlerts({ pool, mailer: again, publicUrl: 'https://example.com/certa' });
    expect(again.sent).toHaveLength(0);

    // Four days later the recurrent training crosses nothing tighter than 7, but two days after
    // that it's overdue: a new (threshold 0) alert goes out, the old aircraft one does not repeat.
    const later = new MemoryMailer();
    await runExpiryAlerts({ pool, mailer: later, publicUrl: 'https://example.com/certa', now: new Date(Date.now() + 7 * 86400_000) });
    const ownerLater = later.sent.find((m) => m.to === 'olivia@example.com')!;
    expect(ownerLater.subject).toBe('Skyline Aerial: 1 item overdue');
    expect(ownerLater.text).toContain('Recurrent training');
    expect(ownerLater.text).not.toContain('Falcon 1');
  });

  it('reminds managers before a waiver or authorization ends', async () => {
    const w = await signUp('Wes Waiver', 'wes@example.com', 'Waiver Co');
    const ends = new Date(Date.now() + 6 * 86400_000).toISOString();
    await w.call('POST', '/authorizations', { kind: 'waiver', reference: '107W-2026-01234', title: 'Night ops over people', validTo: ends });
    await w.call('POST', '/authorizations', { kind: 'coa', reference: 'COA-OPEN', title: 'No end date' });
    const m = new MemoryMailer();
    await runExpiryAlerts({ pool, mailer: m, publicUrl: 'https://example.com/certa' });
    const mail = m.sent.find((x) => x.to === 'wes@example.com')!;
    expect(mail.text).toMatch(/Part 107 waiver 107W-2026-01234 \(Night ops over people\): due in [56] days/);
    expect(mail.text).not.toMatch(/No end date/);
    // Once per threshold.
    const again = new MemoryMailer();
    await runExpiryAlerts({ pool, mailer: again, publicUrl: 'https://example.com/certa' });
    expect(again.sent.find((x) => x.to === 'wes@example.com')).toBeUndefined();
  });

  it('does not record a delivery when the email fails, so it retries next run', async () => {
    const c = await signUp('Cara Chief', 'cara@example.com', 'Retry Co');
    await c.call('POST', '/aircraft', { make: 'Autel', model: 'EVO', serialNumber: 'S3', registrationNumber: 'FA3Z', registrationExpiresOn: days(3) });
    const failing = { send: async () => { throw new Error('smtp down'); } };
    const res = await runExpiryAlerts({ pool, mailer: failing, publicUrl: 'https://example.com/certa' });
    expect(res.failures).toBeGreaterThan(0);
    const ok = new MemoryMailer();
    await runExpiryAlerts({ pool, mailer: ok, publicUrl: 'https://example.com/certa' });
    expect(ok.sent.map((m) => m.to)).toContain('cara@example.com');
  });
});
