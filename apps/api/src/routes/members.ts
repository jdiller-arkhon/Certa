import { api, Id, newId } from '@certa/core';
import { and, asc, authUsers, eq, globalDb, isNull, memberships, pilots, sql } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg, type OrgContext } from '../lib/context.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const MemberParams = OrgParams.extend({ membershipId: Id });

/** Only owners may create, promote to, demote, or remove owners. */
function guardOwnerChange(oc: OrgContext, fromRole: string | null, toRole: string | null) {
  if ((fromRole === 'owner' || toRole === 'owner') && oc.role !== 'owner')
    throw forbidden('Only an owner can grant or change owner access');
}

export const memberRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const listMembers = async (oc: OrgContext, req: Parameters<typeof inOrg>[1]) =>
      inOrg(ctx.pool, req, oc, async (db) => {
        // auth_users is global (no RLS); the join is constrained by the RLS-filtered memberships.
        const rows = await db
          .select({
            membershipId: memberships.id,
            userId: memberships.userId,
            name: authUsers.name,
            email: authUsers.email,
            role: memberships.role,
            expiresAt: memberships.expiresAt,
            createdAt: memberships.createdAt,
          })
          .from(memberships)
          .innerJoin(authUsers, eq(authUsers.id, memberships.userId))
          .where(and(eq(memberships.orgId, oc.orgId), isNull(memberships.deletedAt)))
          .orderBy(asc(authUsers.name));
        return rows.map((r) => ({ ...r, expiresAt: iso(r.expiresAt), createdAt: iso(r.createdAt) }));
      });

    app.get(
      '/orgs/:orgId/members',
      { schema: { tags: ['members'], params: OrgParams, response: { 200: api.MemberListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'members.read');
        return { members: await listMembers(oc, req) };
      },
    );

    app.post(
      '/orgs/:orgId/members',
      {
        schema: {
          tags: ['members'],
          summary: 'Add a member (creates the user if needed and emails a sign-in link)',
          params: OrgParams,
          body: api.AddMemberRequest,
          response: { 201: api.MemberRow, 409: api.ErrorResponse },
        },
      },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'members.manage');
        guardOwnerChange(oc, null, req.body.role);
        if (req.body.role === 'auditor' && !req.body.expiresAt)
          throw badRequest('Auditor access must have an expiry date');

        const email = req.body.email.toLowerCase();
        const gdb = globalDb(ctx.pool);
        let [user] = await gdb.select().from(authUsers).where(eq(authUsers.email, email));
        if (!user) {
          [user] = await gdb.insert(authUsers).values({ id: newId(), name: req.body.name, email }).returning();
        }
        const membershipId = newId();
        await inOrg(ctx.pool, req, oc, async (db) => {
          const existing = await db
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.orgId, oc.orgId), eq(memberships.userId, user!.id), isNull(memberships.deletedAt)));
          if (existing.length) throw conflict('That person is already a member');
          await db.insert(memberships).values({
            id: membershipId,
            userId: user!.id,
            role: req.body.role,
            expiresAt: req.body.expiresAt ?? null,
          });
          if (['owner', 'admin', 'chief_pilot', 'pilot'].includes(req.body.role)) {
            await db.insert(pilots).values({ id: newId(), membershipId, displayName: user!.name, email });
          }
        });
        await ctx.auth.api
          .signInMagicLink({ body: { email, callbackURL: `/orgs/${oc.orgId}` }, headers: new Headers() })
          .catch((err: unknown) => req.log.warn({ err }, 'invite email failed'));
        const row = (await listMembers(oc, req)).find((m) => m.membershipId === membershipId)!;
        return reply.status(201).send(row);
      },
    );

    app.patch(
      '/orgs/:orgId/members/:membershipId',
      {
        schema: { tags: ['members'], params: MemberParams, body: api.UpdateMemberRequest, response: { 200: api.MemberRow } },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'members.manage');
        await inOrg(ctx.pool, req, oc, async (db) => {
          const [m] = await db.select().from(memberships).where(and(eq(memberships.id, req.params.membershipId), isNull(memberships.deletedAt)));
          if (!m) throw notFound('Member');
          guardOwnerChange(oc, m.role, req.body.role ?? null);
          if (m.role === 'owner' && req.body.role && req.body.role !== 'owner') await assertAnotherOwner(db, oc.orgId, m.id);
          const nextRole = req.body.role ?? m.role;
          const nextExpiry = req.body.expiresAt === undefined ? m.expiresAt : req.body.expiresAt;
          if (nextRole === 'auditor' && !nextExpiry) throw badRequest('Auditor access must have an expiry date');
          await db.update(memberships).set({ role: nextRole, expiresAt: nextExpiry }).where(eq(memberships.id, m.id));
        });
        const row = (await listMembers(oc, req)).find((m) => m.membershipId === req.params.membershipId);
        if (!row) throw notFound('Member');
        return row;
      },
    );

    app.delete(
      '/orgs/:orgId/members/:membershipId',
      { schema: { tags: ['members'], params: MemberParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'members.manage');
        await inOrg(ctx.pool, req, oc, async (db) => {
          const [m] = await db.select().from(memberships).where(and(eq(memberships.id, req.params.membershipId), isNull(memberships.deletedAt)));
          if (!m) throw notFound('Member');
          guardOwnerChange(oc, m.role, null);
          if (m.role === 'owner') await assertAnotherOwner(db, oc.orgId, m.id);
          await db.update(memberships).set({ deletedAt: sql`now()` }).where(eq(memberships.id, m.id));
          await db.update(pilots).set({ membershipId: null }).where(eq(pilots.membershipId, m.id));
        });
        return reply.status(204).send(null);
      },
    );
  };

async function assertAnotherOwner(db: Parameters<Parameters<typeof inOrg>[3]>[0], orgId: string, excludingId: string) {
  const owners = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner'), isNull(memberships.deletedAt)));
  if (!owners.some((o) => o.id !== excludingId)) throw conflict('An organization must keep at least one owner');
}
