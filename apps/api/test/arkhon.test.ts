import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { arkhonCookies } from '../src/lib/arkhon.js';
import { MemoryMailer } from '../src/lib/mailer.js';

const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let local: App; // Certa's own sign-up on, to create an existing account and Arkhon's org
let sso: App; // Arkhon sign-in only
const ssoMailer = new MemoryMailer();
let arkhon: Server;
let seen: IncomingHttpHeaders[] = [];

/** Stand-in for Arkhon's GET /api/auth/get-session: the session token picks the user. */
const USERS: Record<string, unknown> = {
  pilot: { id: 'ark-pilot-1', name: 'Paula Pilot', email: 'paula@example.com', emailVerified: true, role: 'pilot', status: 'active' },
  admin: { id: 'ark-admin-1', name: 'Olivia Owner', email: 'olivia@example.com', emailVerified: true, role: 'admin', status: 'active', adminLevel: 'superadmin' },
  client: { id: 'ark-client-1', name: 'Cal Client', email: 'cal@example.com', emailVerified: true, role: 'client', status: 'active' },
  suspended: { id: 'ark-s', name: 'Sus', email: 'sus@example.com', emailVerified: true, role: 'pilot', status: 'suspended_temporary' },
  unverified: { id: 'ark-u', name: 'Unv', email: 'unv@example.com', emailVerified: false, role: 'pilot', status: 'active' },
  thief: { id: 'ark-thief', name: 'Not Paula', email: 'paula@example.com', emailVerified: true, role: 'pilot', status: 'active' },
  invitee: { id: 'ark-ivan', name: 'Ivan Invitee', email: 'ivan@example.com', emailVerified: true, role: 'pilot', status: 'active' },
};

const cookieFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
  return list.map((c: string) => c.split(';')[0]).join('; ');
};

const exchange = (app: App, arkhonToken?: string, extraCookie = '') =>
  app.inject({
    method: 'POST',
    url: '/api/auth/arkhon/exchange',
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: [arkhonToken && `__Secure-better-auth.session_token=${arkhonToken}`, extraCookie].filter(Boolean).join('; ') },
    payload: {},
  });
const me = async (app: App, cookie: string) => (await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json();

const configFor = (overrides: Record<string, string>) =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
    ...overrides,
  });

let arkhonOrgId: string;

beforeAll(async () => {
  arkhon = createServer((req, res) => {
    seen.push(req.headers);
    const token = /better-auth\.session_token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    const user = token ? USERS[token] : undefined;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(user ? { session: { id: 's' }, user } : null));
  });
  await new Promise<void>((r) => arkhon.listen(0, '127.0.0.1', r));
  const arkhonOrigin = `http://127.0.0.1:${(arkhon.address() as AddressInfo).port}`;

  tdb = await createTestDatabase('arkhon');
  pool = createPool(tdb.appUrl);
  local = await buildApp({ config: configFor({}), pool, mailer: new MemoryMailer() }, { logger: false });
  // Arkhon Industries' own org, created by Olivia with a Certa password account before SSO.
  const res = await local.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name: 'Olivia Owner', email: 'olivia@example.com', password: 'correct-horse-battery', organizationName: 'Arkhon Industries', timezone: 'America/Denver' } });
  expect(res.statusCode, res.body).toBe(201);
  arkhonOrgId = res.json().memberships[0].orgId;
  sso = await buildApp({ config: configFor({ ARKHON_AUTH_ORIGIN: arkhonOrigin, ARKHON_ORG_ID: arkhonOrgId, LOCAL_AUTH: 'off' }), pool, mailer: ssoMailer }, { logger: false });
});

afterAll(async () => {
  await sso?.close();
  await local?.close();
  await pool?.end();
  await tdb?.drop();
  await new Promise((r) => arkhon?.close(r));
});

describe('Arkhon sign-in', () => {
  it('advertises Arkhon sign-in and closes Certa’s own sign-up and password sign-in', async () => {
    const cfg = (await sso.inject({ method: 'GET', url: '/api/v1/auth/config' })).json();
    expect(cfg.local).toBe(false);
    expect(cfg.arkhon.loginUrl).toMatch(/\/login\?next=%2Fsign-in%3Farkhon%3D1$/);
    expect((await sso.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name: 'X', email: 'x@example.com', password: 'correct-horse-battery', organizationName: 'X', timezone: 'America/Denver' } })).statusCode).toBe(403);
    expect((await sso.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: ORIGIN }, payload: { email: 'olivia@example.com', password: 'correct-horse-battery' } })).statusCode).toBe(403);
    expect((await sso.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', headers: { origin: ORIGIN }, payload: { email: 'olivia@example.com' } })).statusCode).toBe(403);
  });

  it('needs a usable Arkhon session', async () => {
    expect((await exchange(sso)).statusCode).toBe(401);
    expect((await exchange(sso, 'nobody')).statusCode).toBe(401);
    expect((await exchange(sso, 'suspended')).statusCode).toBe(401);
    expect((await exchange(sso, 'unverified')).statusCode).toBe(401);
  });

  it('gives a new Arkhon pilot their own logbook, once', async () => {
    seen = [];
    const res = await exchange(sso, 'pilot', 'certa.session_token=should-not-be-forwarded');
    expect(res.statusCode, res.body).toBe(200);
    // Only Arkhon's cookies go to Arkhon.
    expect(seen[0]!.cookie).toBe('__Secure-better-auth.session_token=pilot');
    const cookie = cookieFrom(res);
    const m = await me(sso, cookie);
    expect(m.user).toMatchObject({ email: 'paula@example.com', name: 'Paula Pilot', emailVerified: true });
    expect(m.arkhon).toEqual({ role: 'pilot', platformAdmin: false });
    expect(m.memberships).toEqual([expect.objectContaining({ orgName: 'Paula Pilot', role: 'owner' })]);
    const fleet = (await sso.inject({ method: 'GET', url: `/api/v1/orgs/${m.memberships[0].orgId}/fleet`, headers: { cookie } })).json();
    expect(fleet.pilots).toEqual([expect.objectContaining({ displayName: 'Paula Pilot', email: 'paula@example.com' })]);

    const again = await exchange(sso, 'pilot');
    expect(again.statusCode).toBe(200);
    expect((await me(sso, cookieFrom(again))).memberships).toHaveLength(1);
  });

  it('links an existing Certa account by its verified email and makes Arkhon admins platform admins', async () => {
    const res = await exchange(sso, 'admin');
    expect(res.statusCode, res.body).toBe(200);
    const m = await me(sso, cookieFrom(res));
    expect(m.arkhon).toEqual({ role: 'admin', platformAdmin: true });
    // Same account as the password sign-up: still owner of Arkhon Industries, no second org.
    expect(m.memberships).toEqual([expect.objectContaining({ orgId: arkhonOrgId, orgName: 'Arkhon Industries', role: 'owner' })]);
  });

  it('gives Arkhon clients an account without an organization', async () => {
    const res = await exchange(sso, 'client');
    expect(res.statusCode).toBe(200);
    const m = await me(sso, cookieFrom(res));
    expect(m.arkhon).toEqual({ role: 'client', platformAdmin: false });
    expect(m.memberships).toEqual([]);
  });

  it('invites people to sign in with Arkhon, and links the invite on their first sign-in', async () => {
    const admin = cookieFrom(await exchange(sso, 'admin'));
    const res = await sso.inject({ method: 'POST', url: `/api/v1/orgs/${arkhonOrgId}/members`, headers: { origin: ORIGIN, cookie: admin }, payload: { email: 'ivan@example.com', name: 'Ivan', role: 'pilot' } });
    expect(res.statusCode, res.body).toBe(201);
    const mail = ssoMailer.sent.find((m) => m.to === 'ivan@example.com')!;
    expect(mail.subject).toBe('You’ve been added to Arkhon Industries on Certa'.replace('’', "'"));
    expect(mail.text).toContain(`${ORIGIN}/sign-in`);
    expect(mail.text).not.toMatch(/magic-link|token=/);

    const ivan = await exchange(sso, 'invitee');
    expect(ivan.statusCode, ivan.body).toBe(200);
    // The invite, not a logbook of their own.
    expect((await me(sso, cookieFrom(ivan))).memberships).toEqual([expect.objectContaining({ orgId: arkhonOrgId, role: 'pilot' })]);
  });

  it('never hands one person’s account to another Arkhon account with the same email', async () => {
    expect((await exchange(sso, 'thief')).statusCode).toBe(409);
  });

  it('fails closed with 503 when Arkhon can’t be reached', async () => {
    const down = await buildApp({ config: configFor({ ARKHON_AUTH_ORIGIN: 'http://127.0.0.1:9', LOCAL_AUTH: 'off' }), pool, mailer: new MemoryMailer() }, { logger: false });
    expect((await exchange(down, 'pilot')).statusCode).toBe(503);
    await down.close();
  });
});

describe('arkhonCookies', () => {
  it('keeps only Arkhon session cookies', () => {
    expect(arkhonCookies('certa.session_token=a; __Secure-better-auth.session_token=b; better-auth.session_data=c; other=d; __Secure-certa.x=e')).toBe('__Secure-better-auth.session_token=b; better-auth.session_data=c');
    expect(arkhonCookies(undefined)).toBe('');
    expect(arkhonCookies('nothing-here')).toBe('');
  });
});
