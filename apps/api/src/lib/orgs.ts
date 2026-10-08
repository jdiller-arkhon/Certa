import type { api } from '@certa/core';
import { and, asc, eq, isNull, memberships, organizations, withTenant } from '@certa/db';
import type pg from 'pg';
import { iso } from './mappers.js';

export function slugify(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'org';
  return `${base}-${id.replace(/-/g, '').slice(-6)}`;
}

/** Every active membership of a user, across orgs (RLS allows a user to see their own). */
export async function listMemberships(pool: pg.Pool, userId: string, requestId: string): Promise<api.MembershipSummary[]> {
  return withTenant(pool, { orgId: null, userId, requestId }, async (db) => {
    const rows = await db
      .select({
        membershipId: memberships.id,
        orgId: organizations.id,
        orgName: organizations.name,
        role: memberships.role,
        expiresAt: memberships.expiresAt,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt), isNull(organizations.deletedAt)))
      .orderBy(asc(organizations.name));
    return rows
      .filter((r) => !r.expiresAt || new Date(r.expiresAt) > new Date())
      .map((r) => ({ ...r, expiresAt: iso(r.expiresAt) }));
  });
}
