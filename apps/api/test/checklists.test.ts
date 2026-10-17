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
  tdb = await createTestDatabase('checklists');
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

describe('pre-flight checklists', () => {
  let pilotId: string;
  let aircraftId: string;
  let template: { id: string; version: number; sections: { items: { id: string; required: boolean }[] }[] };
  const flight = (extra: object) => {
    const takeoff = new Date(Date.now() - 3600_000).toISOString();
    const landing = new Date(Date.now() - 2400_000).toISOString();
    return { pilotInCommandId: pilotId, aircraftId, takeoffAt: takeoff, landingAt: landing, localTimeZone: 'America/Denver', ...extra };
  };

  it('seeds the standard pre-flight checklist on first use', async () => {
    pilotId = (await ok(call(owner, 'POST', '/pilots', { displayName: 'Dana Reyes' }), 201)).id;
    aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'Skydio', model: 'X10', serialNumber: 'SKX-1' }), 201)).id;
    const { templates } = await ok(call(owner, 'GET', '/checklists/templates'));
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ name: 'Standard pre-flight', kind: 'preflight', isDefault: true, version: 1 });
    template = templates[0];
    // Listing again does not seed a second copy.
    expect((await ok(call(owner, 'GET', '/checklists/templates'))).templates).toHaveLength(1);
  });

  it('stores a signed run with the flight and marks it complete only when every required item is ticked', async () => {
    const all = template.sections.flatMap((s) => s.items);
    const partial = await ok(call(owner, 'POST', '/flights', flight({ checklist: { templateId: template.id, templateVersion: 1, responses: [{ itemId: all[0]!.id, checked: true }] } })), 201);
    expect(partial.checklist).toMatchObject({ templateName: 'Standard pre-flight', completed: false });
    expect(partial.checklist.signedAt).toBeTruthy();

    const full = await ok(call(owner, 'POST', '/flights', flight({ checklist: { templateId: template.id, templateVersion: 1, responses: all.map((i) => ({ itemId: i.id, checked: true })) } })), 201);
    expect(full.checklist.completed).toBe(true);
    const again = await ok(call(owner, 'GET', `/flights/${full.id}`));
    expect(again.checklist.sections.flatMap((s: { items: { checked: boolean }[] }) => s.items).every((i: { checked: boolean }) => i.checked)).toBe(true);

    // No checklist sent: none stored.
    expect((await ok(call(owner, 'POST', '/flights', flight({})), 201)).checklist).toBeNull();
  });

  it('versions templates by replacement so earlier runs keep their items', async () => {
    const first = await ok(call(owner, 'POST', '/flights', flight({ checklist: { templateId: template.id, templateVersion: 1, responses: [] } })), 201);
    const v2 = await ok(
      call(owner, 'PUT', `/checklists/templates/${template.id}`, {
        name: 'Standard pre-flight',
        isDefault: true,
        sections: [{ id: 'quick', title: 'Quick', items: [{ id: 'props2', text: 'Props checked', required: true, photoRequired: false }] }],
      }),
    );
    expect(v2).toMatchObject({ version: 2, isDefault: true });
    expect(v2.id).not.toBe(template.id);
    const { templates } = await ok(call(owner, 'GET', '/checklists/templates'));
    expect(templates.map((t: { id: string }) => t.id)).toEqual([v2.id]);
    // The old run still shows the version-1 items.
    const old = await ok(call(owner, 'GET', `/flights/${first.id}`));
    expect(old.checklist.templateVersion).toBe(1);
    expect(old.checklist.sections[0].title).toBe('Site and airspace');
    // A mismatched version is rejected.
    await ok(call(owner, 'POST', '/flights', flight({ checklist: { templateId: v2.id, templateVersion: 1, responses: [] } })), 400);
    template = v2;
  });

  it('keeps one default per kind and refuses to delete the last checklist', async () => {
    const extra = await ok(
      call(owner, 'POST', '/checklists/templates', { name: 'Night ops', isDefault: true, sections: [{ id: 'n', title: 'Night', items: [{ id: 'lights', text: 'Anti-collision light on', required: true, photoRequired: false }] }] }),
      201,
    );
    const { templates } = await ok(call(owner, 'GET', '/checklists/templates'));
    expect(templates.filter((t: { isDefault: boolean }) => t.isDefault).map((t: { id: string }) => t.id)).toEqual([extra.id]);
    await ok(call(owner, 'DELETE', `/checklists/templates/${extra.id}`), 204);
    await ok(call(owner, 'DELETE', `/checklists/templates/${template.id}`), 400);
  });

  it('rejects bad templates and keeps orgs apart', async () => {
    await ok(call(owner, 'POST', '/checklists/templates', { name: 'Dupes', sections: [{ id: 'a', title: 'A', items: [{ id: 'x', text: 'one', required: true, photoRequired: false }, { id: 'x', text: 'two', required: true, photoRequired: false }] }] }), 400);
    await ok(call(other, 'PUT', `/checklists/templates/${template.id}`, { name: 'Hijack', sections: [{ id: 'a', title: 'A', items: [{ id: 'x', text: 'one', required: true, photoRequired: false }] }] }), 404);
    // Another org's template can't be attached to a flight.
    const otherPilot = (await ok(call(other, 'POST', '/pilots', { displayName: 'Oz' }), 201)).id;
    const otherAircraft = (await ok(call(other, 'POST', '/aircraft', { make: 'Freefly', model: 'Astro', serialNumber: 'FF-1' }), 201)).id;
    const takeoff = new Date(Date.now() - 3600_000).toISOString();
    await ok(
      call(other, 'POST', '/flights', { pilotInCommandId: otherPilot, aircraftId: otherAircraft, takeoffAt: takeoff, landingAt: new Date().toISOString(), localTimeZone: 'America/Denver', checklist: { templateId: template.id, templateVersion: template.version, responses: [] } }),
      400,
    );
  });
});
