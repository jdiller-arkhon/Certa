import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentHash } from '@certa/core';
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
const days = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

async function signUp(name: string, email: string, org: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' } });
  expect(res.statusCode, res.body).toBe(201);
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw as string]).map((c) => c.split(';')[0]).join('; ');
  const orgId: string = res.json().memberships[0].orgId;
  const call = (method: 'GET' | 'POST', path: string, payload?: object) => app.inject({ method, url: `/api/v1/orgs/${orgId}${path}`, headers: { origin: ORIGIN, cookie }, payload });
  return { orgId, call };
}

beforeAll(async () => {
  tdb = await createTestDatabase('share');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000' });
  app = await buildApp({ config, pool, mailer: new MemoryMailer() }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('inspector packet share links', () => {
  it('shares one aircraft, read-only, without an account; revocable; tokens never stored', async () => {
    const a = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
    const b = await signUp('Bea Other', 'bea@example.com', 'Other Co');
    const ac = (await a.call('POST', '/aircraft', { nickname: 'Falcon 1', make: 'DJI', model: 'M30T', serialNumber: 'SN-1', registrationNumber: 'FA3ABC', registrationExpiresOn: days(20) })).json();
    await a.call('POST', '/insurance', { carrier: 'Skyward', policyNumber: 'P-1', effectiveOn: days(-100), expiresOn: days(200), coveredAircraftIds: [ac.id] });

    // Another org can't share this aircraft (looks like it doesn't exist).
    expect((await b.call('POST', '/share-links', { subjectType: 'aircraft', subjectId: ac.id })).statusCode).toBe(404);

    const created = await a.call('POST', '/share-links', { subjectType: 'aircraft', subjectId: ac.id, expiresInDays: 3 });
    expect(created.statusCode, created.body).toBe(201);
    const link = created.json();
    expect(link.url).toMatch(/^http:\/\/localhost:8080\/share\/[A-Za-z0-9_-]{43}$/);
    const token = link.url.split('/').pop();

    // The token is stored only as a hash.
    const admin = new pg.Client({ connectionString: tdb.adminUrl });
    await admin.connect();
    const stored = await admin.query('SELECT token_hash FROM share_links WHERE id = $1', [link.id]);
    expect(stored.rows[0].token_hash).not.toContain(token);
    expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);

    // Public view: no cookie, no-store, sealed.
    const view = await app.inject({ method: 'GET', url: `/api/v1/public/share/${token}` });
    expect(view.statusCode, view.body).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.headers['x-robots-tag']).toContain('noindex');
    const body = view.json();
    expect(body.packet.subject.name).toBe('Falcon 1');
    expect(body.packet.organization).toBe('Skyline Aerial');
    expect(body.packet.records.map((r: { label: string }) => r.label)).toEqual(expect.arrayContaining(['Registration', 'Insurance (Skyward)']));
    expect(body.packet.status.level).toBe('amber'); // registration within 30 days
    expect(body.seal).toBe(contentHash(body.packet));

    const pdf = await app.inject({ method: 'GET', url: `/api/v1/public/share/${token}/packet.pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.rawPayload.length).toBeGreaterThan(1500);

    const list = (await a.call('GET', '/share-links')).json();
    expect(list.links[0].viewCount).toBe(2);
    expect(JSON.stringify(list)).not.toContain(token);

    // Wrong or malformed tokens look the same as revoked ones.
    expect((await app.inject({ method: 'GET', url: `/api/v1/public/share/${'A'.repeat(43)}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/public/share/short' })).statusCode).toBe(400);

    expect((await a.call('POST', `/share-links/${link.id}/revoke`)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/public/share/${token}` })).statusCode).toBe(404);

    // Expired links stop working.
    const second = (await a.call('POST', '/share-links', { subjectType: 'aircraft', subjectId: ac.id })).json();
    await admin.query(`UPDATE share_links SET expires_at = now() - interval '1 minute' WHERE id = $1`, [second.id]);
    expect((await app.inject({ method: 'GET', url: `/api/v1/public/share/${second.url.split('/').pop()}` })).statusCode).toBe(404);
    await admin.end();
  });

  it('builds a pilot packet with credentials and flight activity', async () => {
    const a = await signUp('Paula Pilot', 'paula@example.com', 'Paula Aerial');
    const pilot = (await a.call('POST', '/pilots', { displayName: 'Dana Reyes', certificateNumber: '4123456' })).json();
    await a.call('POST', `/pilots/${pilot.id}/credentials`, { credentialType: 'part107_certificate', identifier: '4123456', issuedOn: '2023-01-10' });
    await a.call('POST', `/pilots/${pilot.id}/credentials`, { credentialType: 'part107_recurrent', issuedOn: days(-40) });
    const ac = (await a.call('POST', '/aircraft', { make: 'Skydio', model: 'X10', serialNumber: 'SX', registrationNumber: 'FA3S', registrationExpiresOn: days(500) })).json();
    const t0 = new Date(Date.now() - 2 * 86400_000);
    const f = await a.call('POST', '/flights', { pilotInCommandId: pilot.id, aircraftId: ac.id, takeoffAt: t0.toISOString(), landingAt: new Date(t0.getTime() + 25 * 60_000).toISOString(), localTimeZone: 'America/Denver', locationName: 'Henderson Solar Farm' });
    expect(f.statusCode, f.body).toBe(201);
    const link = (await a.call('POST', '/share-links', { subjectType: 'pilot', subjectId: pilot.id })).json();
    const body = (await app.inject({ method: 'GET', url: `/api/v1/public/share/${link.url.split('/').pop()}` })).json();
    expect(body.packet.status).toEqual({ level: 'green', label: 'Current — legal to fly' });
    expect(body.packet.subject.facts).toContainEqual(['Remote pilot certificate', '4123456']);
    expect(body.packet.activity.last90Flights).toBe(1);
    expect(body.packet.recentFlights[0]).toMatchObject({ duration: '25m 00s', with: 'Skydio X10', location: 'Henderson Solar Farm' });
  });
});
