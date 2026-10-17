import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { runExpiryAlerts } from '../src/jobs/expiry-alerts.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import type { PushMessage, Pusher, PushTarget } from '../src/lib/push.js';

const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;
const sent: { target: PushTarget; message: PushMessage }[] = [];
const gone = new Set<string>();
const pusher: Pusher = {
  publicKey: 'BTestPublicKey',
  async send(target, message) {
    if (gone.has(target.endpoint)) return 'gone';
    sent.push({ target, message });
    return 'sent';
  },
};
// Calendar dates in the test org's zone (America/Denver), so the suite passes at any hour UTC.
const days = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

beforeAll(async () => {
  tdb = await createTestDatabase('push');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000' });
  app = await buildApp({ config, pool, mailer: new MemoryMailer(), pusher }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('web push', () => {
  it('subscribes a browser, rejects non-push endpoints, sends tests and expiry alerts, prunes dead subscriptions', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/push/config' })).json()).toEqual({ publicKey: 'BTestPublicKey' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name: 'Olivia Owner', email: 'olivia@example.com', password: 'correct-horse-battery', organizationName: 'Skyline Aerial', timezone: 'America/Denver' } });
    const raw = res.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw as string]).map((c) => c.split(';')[0]).join('; ');
    const orgId = res.json().memberships[0].orgId;
    const call = (method: 'POST', path: string, payload?: object) => app.inject({ method, url: `/api/v1/orgs/${orgId}${path}`, headers: { origin: ORIGIN, cookie }, payload });
    const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

    expect((await call('POST', '/push-subscriptions', { endpoint: 'https://evil.example.com/collect', keys })).statusCode).toBe(400);
    expect((await call('POST', '/push-subscriptions', { endpoint: 'https://169.254.169.254/latest', keys })).statusCode).toBe(400);
    expect((await call('POST', '/push-subscriptions', { endpoint: FCM, keys })).statusCode).toBe(204);
    // Re-subscribing the same browser doesn't duplicate it.
    expect((await call('POST', '/push-subscriptions', { endpoint: FCM, keys })).statusCode).toBe(204);

    const t = await call('POST', '/push-subscriptions/test');
    expect(t.json()).toEqual({ sent: 1 });

    await call('POST', '/aircraft', { nickname: 'Falcon 1', make: 'DJI', model: 'M30T', serialNumber: 'S1', registrationNumber: 'FA3X', registrationExpiresOn: days(4) });
    sent.length = 0;
    const summary = await runExpiryAlerts({ pool, mailer: new MemoryMailer(), pusher, publicUrl: ORIGIN });
    expect(summary.pushes).toBe(1);
    expect(sent[0]!.message.title).toBe('Skyline Aerial: 1 coming due');
    expect(sent[0]!.message.body).toContain('Falcon 1 — Registration: due in 4 days');
    expect(sent[0]!.message.url).toMatch(/^\/aircraft\//);

    // The browser unsubscribed at the push service: the row is pruned.
    gone.add(FCM);
    expect((await call('POST', '/push-subscriptions/test')).json()).toEqual({ sent: 0 });
    gone.clear();
    expect((await call('POST', '/push-subscriptions/test')).json()).toEqual({ sent: 0 });
  });
});
