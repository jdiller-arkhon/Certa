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
const mailer = new MemoryMailer();

interface Session {
  cookie: string;
  userId: string;
  orgId: string;
}

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
  return list.map((c: string) => c.split(';')[0]).join('; ');
}

async function signUp(name: string, email: string, org: string): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/signup',
    headers: { origin: ORIGIN },
    payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json();
  return { cookie: cookieFrom(res), userId: body.user.id, orgId: body.memberships[0].orgId };
}

const get = (s: Session | null, url: string) =>
  app.inject({ method: 'GET', url, headers: { origin: ORIGIN, ...(s ? { cookie: s.cookie } : {}) } });
const send = (s: Session, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { origin: ORIGIN, cookie: s.cookie }, payload: payload as object });

let owner: Session;
let other: Session;

beforeAll(async () => {
  tdb = await createTestDatabase('api');
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
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('health', () => {
  it('reports ready with the database reachable', async () => {
    const res = await get(null, '/readyz');
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.database).toBe('ok');
  });
});

describe('sign-up and sessions', () => {
  it('creates the user, an org they own, and returns a session cookie', async () => {
    const res = await get(owner, '/api/v1/me');
    expect(res.statusCode).toBe(200);
    const me = res.json();
    expect(me.user.email).toBe('olivia@example.com');
    expect(me.memberships).toEqual([
      expect.objectContaining({ orgId: owner.orgId, orgName: 'Skyline Aerial', role: 'owner' }),
    ]);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/signup',
      headers: { origin: ORIGIN },
      payload: { name: 'X', email: 'olivia@example.com', password: 'correct-horse-battery', organizationName: 'X' },
    });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({
      method: 'POST',
      url: '/api/v1/signup',
      headers: { origin: ORIGIN },
      payload: { name: 'X', email: 'new@example.com', password: 'short', organizationName: 'X' },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('validation_failed');
  });

  it('requires a session for /api/v1', async () => {
    const res = await get(null, '/api/v1/me');
    expect(res.statusCode).toBe(401);
  });

  it('signs in with email and password (argon2id)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: { email: 'olivia@example.com', password: 'correct-horse-battery' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookieFrom(res) } });
    expect(me.json().user.email).toBe('olivia@example.com');
    const hash = await pool.query("SELECT password FROM auth_accounts WHERE provider_id = 'credential' LIMIT 1");
    expect(hash.rows[0].password).toMatch(/^\$argon2id\$/);
  });

  it('rejects a wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: { email: 'olivia@example.com', password: 'wrong-password-123' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('organizations and tenant isolation', () => {
  it('returns org context with permissions for the caller role', async () => {
    const res = await get(owner, `/api/v1/orgs/${owner.orgId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.organization.name).toBe('Skyline Aerial');
    expect(body.organization.timezone).toBe('America/Denver');
    expect(body.membership.role).toBe('owner');
    expect(body.permissions).toContain('rules.override');
    expect(body.permissions).toContain('org.billing');
  });

  it("hides other tenants' orgs as not found", async () => {
    const res = await get(other, `/api/v1/orgs/${owner.orgId}`);
    expect(res.statusCode).toBe(404);
    const rules = await get(other, `/api/v1/orgs/${owner.orgId}/rules`);
    expect(rules.statusCode).toBe(404);
  });

  it('updates settings and records it in the audit log', async () => {
    const res = await send(owner, 'PATCH', `/api/v1/orgs/${owner.orgId}`, {
      units: { length: 'm', speed: 'kph', mass: 'kg', temperature: 'C' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().organization.units.length).toBe('m');
  });
});

describe('members and roles', () => {
  let pilot: Session;
  let pilotMembershipId: string;

  it('owner invites a pilot, who receives a magic link and can sign in with it', async () => {
    const res = await send(owner, 'POST', `/api/v1/orgs/${owner.orgId}/members`, {
      email: 'pete@example.com',
      name: 'Pete Pilot',
      role: 'pilot',
    });
    expect(res.statusCode, res.body).toBe(201);
    pilotMembershipId = res.json().membershipId;
    const mail = mailer.sent.find((m) => m.to === 'pete@example.com');
    expect(mail?.subject).toMatch(/sign-in link/);
    const link = /(https?:\/\/\S+)/.exec(mail!.text)![1]!;
    const url = new URL(link);
    const verify = await app.inject({ method: 'GET', url: url.pathname + url.search, headers: { origin: ORIGIN } });
    expect([200, 302], `${verify.statusCode} ${verify.body} ${JSON.stringify(verify.headers)} ${link}`).toContain(verify.statusCode);
    const cookie = cookieFrom(verify);
    expect(cookie).toMatch(/session_token/);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    pilot = { cookie, userId: me.json().user.id, orgId: owner.orgId };
    expect(me.json().memberships[0].role).toBe('pilot');
  });

  it('pilots can read the roster but not manage members or override rules', async () => {
    expect((await get(pilot, `/api/v1/orgs/${owner.orgId}/members`)).statusCode).toBe(200);
    const add = await send(pilot, 'POST', `/api/v1/orgs/${owner.orgId}/members`, {
      email: 'x@example.com',
      name: 'X',
      role: 'viewer',
    });
    expect(add.statusCode).toBe(403);
    const ov = await send(pilot, 'PUT', `/api/v1/orgs/${owner.orgId}/rules/operation.max_altitude_agl/override`, {
      value: 100,
      reason: 'nope',
    });
    expect(ov.statusCode).toBe(403);
    expect((await get(pilot, `/api/v1/orgs/${owner.orgId}/audit`)).statusCode).toBe(403);
  });

  it('auditor access must be time-boxed', async () => {
    const res = await send(owner, 'POST', `/api/v1/orgs/${owner.orgId}/members`, {
      email: 'audrey@example.com',
      name: 'Audrey Auditor',
      role: 'auditor',
    });
    expect(res.statusCode).toBe(400);
  });

  it('cannot remove the last owner', async () => {
    const members = (await get(owner, `/api/v1/orgs/${owner.orgId}/members`)).json().members;
    const self = members.find((m: { role: string }) => m.role === 'owner');
    const res = await send(owner, 'DELETE', `/api/v1/orgs/${owner.orgId}/members/${self.membershipId}`);
    expect(res.statusCode).toBe(409);
  });

  it('removing a member revokes access', async () => {
    const res = await send(owner, 'DELETE', `/api/v1/orgs/${owner.orgId}/members/${pilotMembershipId}`);
    expect(res.statusCode).toBe(204);
    expect((await get(pilot, `/api/v1/orgs/${owner.orgId}`)).statusCode).toBe(404);
  });
});

describe('rule packs', () => {
  it('lists loaded packs with unverified counts', async () => {
    const res = await get(owner, '/api/v1/rule-packs');
    const us = res.json().packs.find((p: { jurisdiction: string }) => p.jurisdiction === 'US-FAA-Part107');
    expect(us.ruleCount).toBeGreaterThan(10);
    expect(us.unverifiedCount).toBe(us.ruleCount);
  });

  it('shows every rule with its source, value, and verification flag', async () => {
    const res = await get(owner, `/api/v1/orgs/${owner.orgId}/rules`);
    expect(res.statusCode).toBe(200);
    const alt = res.json().rules.find((r: { id: string }) => r.id === 'operation.max_altitude_agl');
    expect(alt).toMatchObject({
      value: 121.92,
      unit: 'm',
      statedAs: '400 feet AGL',
      needsVerification: true,
      source: { citation: '14 CFR 107.51(b)' },
      override: null,
    });
  });

  it('owner overrides a value with a reason; invalid values are rejected', async () => {
    const bad = await send(owner, 'PUT', `/api/v1/orgs/${owner.orgId}/rules/operation.max_altitude_agl/override`, {
      value: 'very high',
      reason: 'Company SOP',
    });
    expect(bad.statusCode).toBe(400);

    const ok = await send(owner, 'PUT', `/api/v1/orgs/${owner.orgId}/rules/operation.max_altitude_agl/override`, {
      value: 91.44,
      reason: 'Company SOP caps altitude at 300 ft',
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const alt = ok.json().rules.find((r: { id: string }) => r.id === 'operation.max_altitude_agl');
    expect(alt.value).toBe(91.44);
    expect(alt.packValue).toBe(121.92);
    expect(alt.override).toMatchObject({ reason: 'Company SOP caps altitude at 300 ft', setBy: 'Olivia Owner' });

    // Another tenant is unaffected.
    const theirs = (await get(other, `/api/v1/orgs/${other.orgId}/rules`)).json();
    expect(theirs.rules.find((r: { id: string }) => r.id === 'operation.max_altitude_agl').value).toBe(121.92);
  });

  it('clearing an override restores the pack value', async () => {
    const res = await send(owner, 'DELETE', `/api/v1/orgs/${owner.orgId}/rules/operation.max_altitude_agl/override`, {
      reason: 'Back to regulation value',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().rules.find((r: { id: string }) => r.id === 'operation.max_altitude_agl').value).toBe(121.92);
  });
});

describe('audit log', () => {
  it('shows who changed what, newest first, with before/after', async () => {
    const res = await get(owner, `/api/v1/orgs/${owner.orgId}/audit?table=org_rule_overrides`);
    expect(res.statusCode).toBe(200);
    const events = res.json().events;
    expect(events.map((e: { operation: string }) => e.operation)).toEqual(['UPDATE', 'INSERT']);
    expect(events[0].actorName).toBe('Olivia Owner');
    expect(events[0].after.deleted_at).not.toBeNull();
    expect(events[0].after.reason).toMatch(/Back to regulation value/);
  });

  it('paginates', async () => {
    const first = (await get(owner, `/api/v1/orgs/${owner.orgId}/audit?limit=2`)).json();
    expect(first.events).toHaveLength(2);
    expect(first.nextBefore).not.toBeNull();
    const second = (await get(owner, `/api/v1/orgs/${owner.orgId}/audit?limit=2&before=${first.nextBefore}`)).json();
    expect(second.events[0].id).toBeLessThan(first.events[1].id);
  });

  it("never includes another tenant's events", async () => {
    const events = (await get(other, `/api/v1/orgs/${other.orgId}/audit?limit=200`)).json().events;
    expect(events.every((e: { orgId: string }) => e.orgId === other.orgId)).toBe(true);
  });
});
