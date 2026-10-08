import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@certa/core';
import pg from 'pg';
import { aircraft, auditEvents, createPool, eq, memberships, organizations, sql, withTenant } from '../src/index.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';

let tdb: TestDatabase;
let pool: pg.Pool;
const userA = newId();
const userB = newId();
const orgA = newId();
const orgB = newId();

async function seedOrg(orgId: string, userId: string, name: string) {
  await withTenant(pool, { orgId, userId }, async (db) => {
    await db.insert(organizations).values({
      id: orgId,
      name,
      slug: `${name}-${orgId.slice(-6)}`,
      timezone: 'UTC',
      units: { length: 'ft', speed: 'mph', mass: 'lb', temperature: 'F' },
    });
    await db.insert(memberships).values({ id: newId(), userId, role: 'owner' });
    await db.insert(aircraft).values({ id: newId(), make: 'DJI', model: 'M30T', serialNumber: `SN-${name}` });
  });
}

async function asAdmin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: tdb.adminUrl });
  await admin.connect();
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

beforeAll(async () => {
  tdb = await createTestDatabase('db_security');
  await asAdmin(async (c) => {
    for (const [id, email] of [[userA, 'a@example.com'], [userB, 'b@example.com']])
      await c.query('INSERT INTO auth_users (id, name, email) VALUES ($1, $2, $2)', [id, email]);
  });
  pool = createPool(tdb.appUrl);
  await seedOrg(orgA, userA, 'alpha');
  await seedOrg(orgB, userB, 'bravo');
});

afterAll(async () => {
  await pool?.end();
  await tdb?.drop();
});

describe('row-level security', () => {
  it('app role is not a superuser and cannot bypass RLS', async () => {
    const { rows } = await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('a query without a WHERE org_id only sees the current tenant', async () => {
    const rows = await withTenant(pool, { orgId: orgA, userId: userA }, (db) => db.select().from(aircraft));
    expect(rows.map((r) => r.serialNumber)).toEqual(['SN-alpha']);
  });

  it('no tenant context means no tenant rows', async () => {
    const rows = await withTenant(pool, { orgId: null, userId: null }, (db) => db.select().from(aircraft));
    expect(rows).toHaveLength(0);
  });

  it('cannot insert into another tenant', async () => {
    await expect(
      withTenant(pool, { orgId: orgA, userId: userA }, (db) =>
        db.insert(aircraft).values({ id: newId(), orgId: orgB, make: 'X', model: 'Y', serialNumber: 'evil' }),
      ),
    ).rejects.toThrow();
  });

  it('cannot update another tenant rows (matches nothing)', async () => {
    const updated = await withTenant(pool, { orgId: orgA, userId: userA }, (db) =>
      db.update(aircraft).set({ model: 'pwned' }).where(eq(aircraft.serialNumber, 'SN-bravo')).returning(),
    );
    expect(updated).toHaveLength(0);
    const bravo = await withTenant(pool, { orgId: orgB, userId: userB }, (db) => db.select().from(aircraft));
    expect(bravo[0]!.model).toBe('M30T');
  });

  it('cannot move a row to another tenant', async () => {
    await expect(
      withTenant(pool, { orgId: orgA, userId: userA }, (db) => db.update(aircraft).set({ orgId: orgB })),
    ).rejects.toThrow();
  });

  it('a user sees their own memberships across orgs but not other users', async () => {
    const rows = await withTenant(pool, { orgId: null, userId: userA }, (db) => db.select().from(memberships));
    expect(rows.map((r) => r.orgId)).toEqual([orgA]);
    const orgs = await withTenant(pool, { orgId: null, userId: userA }, (db) => db.select().from(organizations));
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
  });

  it('context does not leak between pooled transactions', async () => {
    await withTenant(pool, { orgId: orgA, userId: userA }, async () => {});
    const { rows } = await pool.query("SELECT coalesce(current_setting('app.org_id', true), '') AS org");
    expect(rows[0].org).toBe('');
  });
});

describe('audit trail', () => {
  it('records inserts and updates with actor, request id, and before/after', async () => {
    await withTenant(pool, { orgId: orgA, userId: userA, requestId: 'req-1' }, (db) =>
      db.update(aircraft).set({ firmwareVersion: '07.01' }).where(eq(aircraft.serialNumber, 'SN-alpha')),
    );
    const events = await withTenant(pool, { orgId: orgA, userId: userA }, (db) =>
      db.select().from(auditEvents).where(eq(auditEvents.tableName, 'aircraft')).orderBy(auditEvents.id),
    );
    expect(events.map((e) => e.operation)).toEqual(['INSERT', 'UPDATE']);
    const upd = events[1]!;
    expect(upd.actorUserId).toBe(userA);
    expect(upd.requestId).toBe('req-1');
    expect((upd.before as Record<string, unknown>).firmware_version).toBeNull();
    expect((upd.after as Record<string, unknown>).firmware_version).toBe('07.01');
    expect((upd.after as Record<string, unknown>).version).toBe(2);
  });

  it('tenants only see their own audit events', async () => {
    const events = await withTenant(pool, { orgId: orgB, userId: userB }, (db) => db.select().from(auditEvents));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.orgId === orgB)).toBe(true);
  });

  it('the app role cannot write or delete audit events', async () => {
    await expect(
      withTenant(pool, { orgId: orgA, userId: userA }, (db) =>
        db.insert(auditEvents).values({ orgId: orgA, dbRole: 'x', tableName: 'x', rowId: 'x', operation: 'INSERT' }),
      ),
    ).rejects.toThrow();
    await expect(withTenant(pool, { orgId: orgA, userId: userA }, (db) => db.delete(auditEvents))).rejects.toThrow();
  });

  it('even the database owner cannot rewrite audit history', async () => {
    await asAdmin(async (c) => {
      await expect(c.query('UPDATE audit_events SET actor_user_id = NULL')).rejects.toThrow(/append-only/);
      await expect(c.query('DELETE FROM audit_events')).rejects.toThrow(/append-only/);
      await expect(c.query('TRUNCATE audit_events')).rejects.toThrow(/append-only/);
    });
  });

  it('direct database edits are still audited, flagged by role and missing actor', async () => {
    await asAdmin((c) => c.query("UPDATE aircraft SET model = 'tampered' WHERE serial_number = 'SN-alpha'"));
    const [last] = await withTenant(pool, { orgId: orgA, userId: userA }, (db) =>
      db.select().from(auditEvents).where(eq(auditEvents.tableName, 'aircraft')).orderBy(sql`id desc`).limit(1),
    );
    expect(last!.actorUserId).toBeNull();
    expect(last!.dbRole).toBe('postgres');
    expect((last!.after as Record<string, unknown>).model).toBe('tampered');
  });

  it('identity columns are immutable', async () => {
    await expect(
      withTenant(pool, { orgId: orgA, userId: userA }, (db) =>
        db.update(aircraft).set({ createdAt: '2000-01-01T00:00:00Z' }),
      ),
    ).rejects.toThrow();
  });
});

describe('rule packs', () => {
  it('are readable but not writable by the app', async () => {
    const { rows } = await pool.query('SELECT jurisdiction, version FROM rule_packs');
    expect(rows).toContainEqual({ jurisdiction: 'US-FAA-Part107', version: '1.0.0' });
    await expect(pool.query("UPDATE rule_packs SET name = 'x'")).rejects.toThrow(/permission denied/);
  });
});
