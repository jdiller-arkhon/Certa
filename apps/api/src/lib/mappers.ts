import type { Membership, Organization } from '@certa/core';
import type { memberships, organizations } from '@certa/db';

/** Postgres text timestamps → ISO-8601 UTC. */
export function iso(value: string): string;
export function iso(value: string | null): string | null;
export function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function toOrganization(o: typeof organizations.$inferSelect): Organization {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    planTier: o.planTier,
    defaultJurisdiction: o.defaultJurisdiction,
    timezone: o.timezone,
    units: o.units,
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.updatedAt),
  };
}

export function toMembership(m: typeof memberships.$inferSelect): Membership {
  return {
    id: m.id,
    orgId: m.orgId,
    userId: m.userId,
    role: m.role,
    expiresAt: iso(m.expiresAt),
    auditorScope: m.auditorScope ?? null,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
    createdBy: m.createdBy,
    deletedAt: iso(m.deletedAt),
  };
}
