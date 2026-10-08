import { can, type Action, type Role } from '@certa/core';
import { and, auditAccess, eq, isNull, memberships, pilots, withTenant, type Db, type TenantContext } from '@certa/db';
import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { forbidden, notFound, unauthorized } from './errors.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface OrgContext {
  orgId: string;
  userId: string;
  membershipId: string;
  role: Role;
  pilotId: string | null;
}

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/**
 * Resolves the caller's membership in `orgId`. A missing, deleted, or expired membership is
 * reported as "not found" so org ids can't be probed. Auditor reads are logged.
 */
export async function resolveOrg(pool: pg.Pool, req: FastifyRequest, orgId: string): Promise<OrgContext> {
  const user = requireUser(req);
  const ctx: TenantContext = { orgId, userId: user.id, requestId: req.id };
  return withTenant(pool, ctx, async (db) => {
    const [m] = await db
      .select({ id: memberships.id, role: memberships.role, expiresAt: memberships.expiresAt, pilotId: pilots.id })
      .from(memberships)
      .leftJoin(pilots, and(eq(pilots.membershipId, memberships.id), isNull(pilots.deletedAt)))
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, user.id), isNull(memberships.deletedAt)))
      .limit(1);
    if (!m || (m.expiresAt && new Date(m.expiresAt) <= new Date())) throw notFound('Organization');
    if (m.role === 'auditor') {
      await db.insert(auditAccess).values({
        membershipId: m.id,
        userId: user.id,
        method: req.method,
        path: req.url,
        requestId: req.id,
      });
    }
    return { orgId, userId: user.id, membershipId: m.id, role: m.role, pilotId: m.pilotId ?? null };
  });
}

export function authorize(ctx: OrgContext, action: Action, resourcePilotId?: string | null) {
  const allowed = can(ctx.role, action, resourcePilotId === undefined ? {} : { actorPilotId: ctx.pilotId, resourcePilotId });
  if (!allowed) throw forbidden();
}

/** Runs `fn` inside the org's RLS context. */
export function inOrg<T>(pool: pg.Pool, req: FastifyRequest, ctx: OrgContext, fn: (db: Db) => Promise<T>) {
  return withTenant(pool, { orgId: ctx.orgId, userId: ctx.userId, requestId: req.id }, (db) => fn(db));
}
