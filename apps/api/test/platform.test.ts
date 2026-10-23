import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, globalDb, authUsers, eq } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';

const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let local: App; // Certa's own sign-in, to build up records in two organizations
let sso: App; // Arkhon sign-in, where the console lives
const mailer = new MemoryMailer();
let arkhon: Server;

/** Stand-in for Arkhon's session endpoint; `role` can change mid-test to model a revoked admin. */
const USERS: Record<string, { id: string; name: string; email: string; emailVerified: boolean; role: string; status: string }> = {
  admin: { id: 'ark-admin-1', name: 'Olivia Owner', email: 'olivia@example.com', emailVerified: true, role: 'admin', status: 'active' },
  pilot: { id: 'ark-pilot-1', name: 'Paula Pilot', email: 'paula@example.com', emailVerified: true, role: 'pilot', status: 'active' },
};

const days = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const cookieFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  return (Array.isArray(raw) ? raw : raw ? [raw as string] : []).map((c: string) => c.split(';')[0]).join('; ');
};
const configFor = (overrides: Record<string, string>) =>
  loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000', ...overrides });

async function signUp(name: string, email: string, org: string) {
  const res = await local.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' } });
  expect(res.statusCode, res.body).toBe(201);
  const orgId: string = res.json().memberships[0].orgId;
  const cookie = cookieFrom(res);
  const call = async (method: 'GET' | 'POST', path: string, payload?: object, status = 201) => {
    const r = await local.inject({ method, url: `/api/v1/orgs/${orgId}${path}`, headers: { origin: ORIGIN, cookie }, payload });
    expect(r.statusCode, r.body).toBe(status);
    return r.json();
  };
  return { orgId, call };
}

/** Signs in to the SSO app through Arkhon; requests carry both Certa's and Arkhon's cookies. */
async function arkhonSession(token: string) {
  const res = await sso.inject({ method: 'POST', url: '/api/auth/arkhon/exchange', headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: `__Secure-better-auth.session_token=${token}` }, payload: {} });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = `${cookieFrom(res)}; __Secure-better-auth.session_token=${token}`;
  return (method: 'GET' | 'POST', path: string, payload?: object) => sso.inject({ method, url: `/api/v1${path}`, headers: { origin: ORIGIN, cookie }, ...(payload ? { payload } : {}) });
}

let arkhonOrgId: string;
let dana: string; // overdue recurrent, flies
let ivan: string; // invited, never signed in
let skyOrgId: string;
let sam: string;

beforeAll(async () => {
  arkhon = createServer((req, res) => {
    const token = /better-auth\.session_token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    const user = token ? USERS[token] : undefined;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(user ? { session: { id: 's' }, user } : null));
  });
  await new Promise<void>((r) => arkhon.listen(0, '127.0.0.1', r));
  const arkhonOrigin = `http://127.0.0.1:${(arkhon.address() as AddressInfo).port}`;
  tdb = await createTestDatabase('platform');
  pool = createPool(tdb.appUrl);
  local = await buildApp({ config: configFor({}), pool, mailer: new MemoryMailer() }, { logger: false });

  // Arkhon Industries: Dana's recurrent training lapsed; Ivan was invited and never signed in.
  const a = await signUp('Olivia Owner', 'olivia@example.com', 'Arkhon Industries');
  arkhonOrgId = a.orgId;
  dana = (await a.call('POST', '/pilots', { displayName: 'Dana Reyes', email: 'dana@example.com' })).id;
  await a.call('POST', `/pilots/${dana}/credentials`, { credentialType: 'part107_certificate', issuedOn: '2023-01-10' });
  await a.call('POST', `/pilots/${dana}/credentials`, { credentialType: 'part107_recurrent', issuedOn: '2023-01-10', expiresOn: days(-3) });
  const ac = (await a.call('POST', '/aircraft', { nickname: '=Falcon', make: 'DJI', model: 'M30T', serialNumber: 'S1', registrationNumber: 'FA3X', registrationExpiresOn: days(200) })).id;
  const t0 = new Date(Date.now() - 2 * 86400_000);
  await a.call('POST', '/flights', { pilotInCommandId: dana, aircraftId: ac, takeoffAt: t0.toISOString(), landingAt: new Date(t0.getTime() + 1800_000).toISOString(), localTimeZone: 'America/Denver', locationName: 'Cherry Creek' });
  await a.call('POST', '/members', { name: 'Ivan Invitee', email: 'ivan@example.com', role: 'pilot' });
  const fleet = await a.call('GET', '/fleet', undefined, 200);
  ivan = fleet.pilots.find((p: { displayName: string }) => p.displayName === 'Ivan Invitee').id;

  // A second, independent organization.
  const s = await signUp('Sam Solo', 'sam@example.com', 'Sky Solo');
  skyOrgId = s.orgId;
  sam = (await s.call('GET', '/fleet', undefined, 200)).pilots[0].id;
  await s.call('POST', `/pilots/${sam}/credentials`, { credentialType: 'part107_certificate', issuedOn: '2024-02-01' });
  await s.call('POST', `/pilots/${sam}/credentials`, { credentialType: 'part107_recurrent', issuedOn: '2025-01-15', expiresOn: days(40) });

  sso = await buildApp({ config: configFor({ ARKHON_AUTH_ORIGIN: arkhonOrigin, ARKHON_ORG_ID: arkhonOrgId, LOCAL_AUTH: 'off' }), pool, mailer }, { logger: false });
});

afterAll(async () => {
  await sso?.close();
  await local?.close();
  await pool?.end();
  await tdb?.drop();
  await new Promise((r) => arkhon?.close(r));
});

describe('platform console', () => {
  it('is only for current Arkhon admins, checked live', async () => {
    const pilot = await arkhonSession('pilot');
    expect((await pilot('GET', '/platform/overview')).statusCode).toBe(403);
    expect((await pilot('GET', '/platform/pilots')).statusCode).toBe(403);
    expect((await pilot('POST', '/platform/remind', { pilots: [{ orgId: arkhonOrgId, pilotId: dana }] })).statusCode).toBe(403);

    const adm = await arkhonSession('admin');
    expect((await adm('GET', '/platform/overview')).statusCode).toBe(200);
    // Demoted in Arkhon: the Certa session alone isn't enough any more.
    USERS.admin!.role = 'pilot';
    try {
      expect((await adm('GET', '/platform/overview')).statusCode).toBe(403);
    } finally {
      USERS.admin!.role = 'admin';
    }
    // Certa session without the Arkhon session cookie.
    const certaOnly = (await sso.inject({ method: 'POST', url: '/api/auth/arkhon/exchange', headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: '__Secure-better-auth.session_token=admin' }, payload: {} }));
    expect((await sso.inject({ method: 'GET', url: '/api/v1/platform/overview', headers: { cookie: cookieFrom(certaOnly) } })).statusCode).toBe(403);
  });

  it('lists every pilot in every organization with what they need help with', async () => {
    const adm = await arkhonSession('admin');
    const { pilots } = (await adm('GET', '/platform/pilots')).json();
    const by = (id: string) => pilots.find((p: { pilotId: string }) => p.pilotId === id);
    expect(by(dana)).toMatchObject({ orgName: 'Arkhon Industries', level: 'red', certificateOnFile: true, flights: 1, account: 'no_account', recurrentDueOn: days(-3) });
    expect(by(dana).helpFlags).toEqual(expect.arrayContaining(['recurrent_overdue', 'not_cleared']));
    expect(by(ivan)).toMatchObject({ account: 'invited', email: 'ivan@example.com' });
    expect(by(ivan).helpFlags).toEqual(expect.arrayContaining(['never_signed_in', 'no_certificate']));
    expect(by(sam)).toMatchObject({ orgName: 'Sky Solo', account: 'active', recurrentDueOn: days(40) });
    expect(by(sam).helpFlags).toContain('recurrent_due_soon');
    // Most urgent first.
    expect(pilots[0].pilotId).toBe(dana);
  });

  it('shows platform metrics and a pilot’s detail', async () => {
    const adm = await arkhonSession('admin');
    const o = (await adm('GET', '/platform/overview')).json();
    expect(o.totals).toMatchObject({ organizations: expect.any(Number), activePilots30d: 1 });
    expect(o.totals.organizations).toBeGreaterThanOrEqual(2);
    expect(o.period).toMatchObject({ flights: 1, flightSeconds: 1800, pilotsFlown: 1 });
    expect(o.monthly).toHaveLength(12);
    expect(o.topPilots[0]).toMatchObject({ name: 'Dana Reyes', flightSeconds: 1800 });
    expect(o.pilotsNeedingHelp).toBeGreaterThanOrEqual(3);
    expect((await adm('GET', '/platform/overview?from=2026-05-01&to=2026-04-01')).statusCode).toBe(400);

    const d = (await adm('GET', `/platform/pilots/${arkhonOrgId}/${dana}`)).json();
    expect(d.pilot.name).toBe('Dana Reyes');
    expect(d.items).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Recurrent'), level: 'red' })]));
    expect(d.recentFlights).toEqual([expect.objectContaining({ source: 'certa', durationSeconds: 1800, aircraft: '=Falcon', locationName: 'Cherry Creek' })]);
    expect(d.monthly.at(-1).flightSeconds + d.monthly.at(-2).flightSeconds).toBe(1800);
    expect(d.viewerIsMember).toBe(true);
    expect((await adm('GET', `/platform/pilots/${skyOrgId}/${dana}`)).statusCode).toBe(404);
  });

  it('reminds pilots by email, skips who it can’t reach, and logs it', async () => {
    const adm = await arkhonSession('admin');
    mailer.sent.length = 0;
    const res = (await adm('POST', '/platform/remind', { pilots: [{ orgId: arkhonOrgId, pilotId: dana }, { orgId: skyOrgId, pilotId: sam }, { orgId: skyOrgId, pilotId: dana }], note: 'Please renew before Friday’s job.' })).json();
    expect(res.sent).toBe(2);
    expect(res.skipped).toEqual([expect.objectContaining({ pilotId: dana, reason: 'Pilot not found' })]);
    const mail = mailer.sent.find((m) => m.to === 'dana@example.com')!;
    expect(mail.subject).toMatch(/item/);
    expect(mail.text).toContain('Please renew before Friday’s job.');
    expect(mail.text).toMatch(/Recurrent training \(Part 107\): expired 3 days ago/);
    expect(mailer.sent.find((m) => m.to === 'sam@example.com')!.text).toMatch(/Recurrent training \(Part 107\): due /);

    const { events } = (await adm('GET', '/platform/activity')).json();
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'pilot.remind', actor: 'Olivia Owner', orgName: 'Arkhon Industries', target: 'Dana Reyes' })]));
    const d = (await adm('GET', `/platform/pilots/${arkhonOrgId}/${dana}`)).json();
    expect(d.history[0]).toMatchObject({ action: 'pilot.remind', actor: 'Olivia Owner' });
  });

  it('re-sends sign-in instructions only to pilots who haven’t signed in', async () => {
    const adm = await arkhonSession('admin');
    mailer.sent.length = 0;
    expect((await adm('POST', `/platform/pilots/${arkhonOrgId}/${ivan}/invite`)).json()).toEqual({ sent: 1, skipped: [] });
    expect(mailer.sent[0]).toMatchObject({ to: 'ivan@example.com', subject: expect.stringContaining('Arkhon Industries') });
    expect(mailer.sent[0]!.text).toContain(`${ORIGIN}/sign-in`);
    expect((await adm('POST', `/platform/pilots/${skyOrgId}/${sam}/invite`)).json().skipped[0].reason).toBe('Already signed in');
    expect((await adm('POST', `/platform/pilots/${arkhonOrgId}/${dana}/invite`)).json().skipped[0].reason).toMatch(/No Certa account/);
  });

  it('lists compliance items across organizations', async () => {
    const adm = await arkhonSession('admin');
    const { items } = (await adm('GET', '/platform/compliance?windowDays=60')).json();
    expect(items[0]).toMatchObject({ level: 'red' });
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ orgName: 'Arkhon Industries', subject: 'Dana Reyes', pilotId: dana, daysRemaining: -3 }),
      expect.objectContaining({ orgName: 'Sky Solo', subject: 'Sam Solo', daysRemaining: 40 }),
    ]));
    const narrow = (await adm('GET', '/platform/compliance?windowDays=10')).json().items;
    expect(narrow.find((i: { subject: string; daysRemaining: number }) => i.subject === 'Sam Solo' && i.daysRemaining === 40)).toBeUndefined();
  });

  it('exports metrics as CSV, safe to open in a spreadsheet', async () => {
    const adm = await arkhonSession('admin');
    const res = await adm('GET', `/platform/exports/flights?from=${days(-30)}&to=${days(0)}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="certa-flights-/);
    const lines = res.body.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toMatch(/^"Organization","Flight ID","Source"/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Dana Reyes"');
    expect(lines[1]).toContain(`"'=Falcon"`); // formula neutralized
    for (const ds of ['pilots', 'pilot-hours', 'monthly', 'organizations', 'aircraft', 'compliance']) {
      const r = await adm('GET', `/platform/exports/${ds}`);
      expect(r.statusCode, `${ds}: ${r.body}`).toBe(200);
      expect(r.body.split('\r\n').length, ds).toBeGreaterThan(1);
    }
    expect((await adm('GET', '/platform/exports/secrets')).statusCode).toBe(400);
    // One pilot's logbook.
    const log = await adm('GET', `/platform/exports/flights?from=2000-01-01&orgId=${arkhonOrgId}&pilotId=${dana}`);
    expect(log.headers['content-disposition']).toMatch(/certa-flights-dana-reyes-2000-01-01-to-/);
    expect(log.body.split('\r\n')).toHaveLength(2);
    expect((await adm('GET', `/platform/exports/flights?orgId=${skyOrgId}&pilotId=${dana}`)).statusCode).toBe(404);
    expect((await adm('GET', `/platform/exports/flights?pilotId=${dana}`)).statusCode).toBe(400);
    const { events } = (await adm('GET', '/platform/activity')).json();
    expect(events.filter((e: { action: string }) => e.action === 'export').length).toBeGreaterThanOrEqual(7);
  });

  it('posts announcements to the right people and ends them', async () => {
    const adm = await arkhonSession('admin');
    mailer.sent.length = 0;
    const post = await adm('POST', '/platform/announcements', { title: 'New airspace data', body: 'Facility maps now update daily.', audience: 'managers', email: true });
    expect(post.statusCode, post.body).toBe(201);
    const a = post.json();
    // Managers only: the three owners (Paula owns her own logbook), not Ivan (pilot role).
    expect(a.emailed).toBe(3);
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['olivia@example.com', 'paula@example.com', 'sam@example.com']);
    expect((await adm('GET', '/announcements')).json().announcements).toEqual([expect.objectContaining({ id: a.id, title: 'New airspace data' })]);
    const pilot = await arkhonSession('pilot');
    expect((await pilot('GET', '/announcements')).json().announcements.map((x: { id: string }) => x.id)).toContain(a.id); // Paula owns her own logbook
    expect((await pilot('POST', `/platform/announcements/${a.id}/end`)).statusCode).toBe(403);
    expect((await adm('POST', `/platform/announcements/${a.id}/end`)).statusCode).toBe(200);
    expect((await adm('GET', '/announcements')).json().announcements).toEqual([]);
    expect((await adm('POST', `/platform/announcements/${a.id}/end`)).statusCode).toBe(404);
    expect((await adm('GET', '/platform/announcements')).json().announcements[0]).toMatchObject({ id: a.id, createdBy: 'Olivia Owner', endsAt: expect.any(String) });
    expect((await adm('POST', '/platform/announcements', { title: '', body: 'x', audience: 'everyone' })).statusCode).toBe(400);
  });

  it('without Arkhon (local development), uses the stored Arkhon role', async () => {
    const res = await local.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: ORIGIN }, payload: { email: 'sam@example.com', password: 'correct-horse-battery' } });
    const cookie = cookieFrom(res);
    const get = () => local.inject({ method: 'GET', url: '/api/v1/platform/overview', headers: { cookie } });
    expect((await get()).statusCode).toBe(403);
    await globalDb(pool).update(authUsers).set({ arkhonRole: 'admin' }).where(eq(authUsers.email, 'sam@example.com'));
    expect((await get()).statusCode).toBe(200);
  });
});
