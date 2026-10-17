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
  tdb = await createTestDatabase('authorizations');
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

describe('authorizations', () => {
  let pilotId: string;
  let aircraftId: string;
  let waiverId: string;
  const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();

  it('records waivers and LAANC approvals, validates dates and pilots', async () => {
    pilotId = (await ok(call(owner, 'POST', '/pilots', { displayName: 'Dana Reyes' }), 201)).id;
    aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'Skydio', model: 'X10', serialNumber: 'SKX-1' }), 201)).id;
    const waiver = await ok(call(owner, 'POST', '/authorizations', { kind: 'waiver', reference: '107W-2026-01234', title: 'Night ops over people', validFrom: inDays(-30), validTo: inDays(700) }), 201);
    expect(waiver).toMatchObject({ kind: 'waiver', reference: '107W-2026-01234', pilotId: null });
    waiverId = waiver.id;
    const laanc = await ok(call(owner, 'POST', '/authorizations', { kind: 'laanc', reference: 'LAANC-7F3K2', pilotId, validFrom: inDays(0), validTo: inDays(0.2) }), 201);
    expect(laanc.pilotId).toBe(pilotId);
    await ok(call(owner, 'POST', '/authorizations', { kind: 'laanc', reference: 'BAD', validFrom: inDays(1), validTo: inDays(0) }), 400);
    await ok(call(owner, 'POST', '/authorizations', { kind: 'laanc', reference: 'X', pilotId: '01a14820-2044-70e3-b6db-c4feaac3b630' }), 400);
    const { authorizations } = await ok(call(owner, 'GET', '/authorizations'));
    expect(authorizations.map((a: { reference: string }) => a.reference).sort()).toEqual(['107W-2026-01234', 'LAANC-7F3K2']);
  });

  it('edits, rejects an inverted range on edit, and soft-deletes', async () => {
    const edited = await ok(call(owner, 'PATCH', `/authorizations/${waiverId}`, { conditions: 'Anti-collision lighting; VO required' }));
    expect(edited.conditions).toBe('Anti-collision lighting; VO required');
    await ok(call(owner, 'PATCH', `/authorizations/${waiverId}`, { validTo: inDays(-60) }), 400);
  });

  it('attaches to flights, refuses unknown ones, and keeps orgs apart', async () => {
    const takeoff = new Date(Date.now() - 3600_000).toISOString();
    const base = { pilotInCommandId: pilotId, aircraftId, takeoffAt: takeoff, landingAt: new Date(Date.now() - 2400_000).toISOString(), localTimeZone: 'America/Denver' };
    const f = await ok(call(owner, 'POST', '/flights', { ...base, authorizationId: waiverId }), 201);
    expect(f.authorizationId).toBe(waiverId);
    await ok(call(owner, 'POST', '/flights', { ...base, authorizationId: '01a14820-2044-70e3-b6db-c4feaac3b630' }), 400);
    const cleared = await ok(call(owner, 'PATCH', `/flights/${f.id}`, { authorizationId: null }));
    expect(cleared.authorizationId).toBeNull();
    // Another org can't read, edit, or attach it.
    expect((await ok(call(other, 'GET', '/authorizations'))).authorizations).toEqual([]);
    await ok(call(other, 'PATCH', `/authorizations/${waiverId}`, { reference: 'HIJACK' }), 404);
    await ok(call(other, 'DELETE', `/authorizations/${waiverId}`), 404);
    // Deleting keeps the flight readable; it can no longer be attached.
    await ok(call(owner, 'PATCH', `/flights/${f.id}`, { authorizationId: waiverId }));
    await ok(call(owner, 'DELETE', `/authorizations/${waiverId}`), 204);
    const kept = await ok(call(owner, 'GET', `/flights/${f.id}`));
    expect(kept.authorizationId).toBe(waiverId);
    expect(kept.authorization).toMatchObject({ kind: 'waiver', reference: '107W-2026-01234' });
    await ok(call(owner, 'POST', '/flights', { ...base, authorizationId: waiverId }), 400);
  });
});
