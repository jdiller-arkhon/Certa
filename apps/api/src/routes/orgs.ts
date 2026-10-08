import { ACTIONS, api, can, DEFAULT_UNITS_US, Id, newId } from '@certa/core';
import { eq, memberships, organizations, pilots, withTenant } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, requireUser, resolveOrg } from '../lib/context.js';
import { notFound } from '../lib/errors.js';
import { toMembership, toOrganization } from '../lib/mappers.js';
import { slugify } from '../lib/orgs.js';

export const OrgParams = z.object({ orgId: Id });

export const orgRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/orgs',
      {
        schema: {
          tags: ['organizations'],
          summary: 'Create an additional organization owned by the caller',
          body: api.CreateOrganizationRequest,
          response: { 201: api.OrgContextResponse },
        },
      },
      async (req, reply) => {
        const user = requireUser(req);
        const orgId = newId();
        const membershipId = newId();
        await withTenant(ctx.pool, { orgId, userId: user.id, requestId: req.id }, async (db) => {
          await db.insert(organizations).values({
            id: orgId,
            name: req.body.name,
            slug: slugify(req.body.name, orgId),
            timezone: req.body.timezone,
            defaultJurisdiction: req.body.defaultJurisdiction,
            units: req.body.units ?? DEFAULT_UNITS_US,
            createdBy: user.id,
          });
          await db.insert(memberships).values({ id: membershipId, userId: user.id, role: 'owner' });
          await db.insert(pilots).values({ id: newId(), membershipId, displayName: user.name, email: user.email });
        });
        return reply.status(201).send(await orgContext(ctx, req, orgId));
      },
    );

    app.get(
      '/orgs/:orgId',
      {
        schema: {
          tags: ['organizations'],
          summary: 'Organization, caller membership, and caller permissions',
          params: OrgParams,
          response: { 200: api.OrgContextResponse },
        },
      },
      async (req) => orgContext(ctx, req, req.params.orgId),
    );

    app.patch(
      '/orgs/:orgId',
      {
        schema: {
          tags: ['organizations'],
          params: OrgParams,
          body: api.UpdateOrganizationRequest,
          response: { 200: api.OrgContextResponse },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, req.body.planTier ? 'org.billing' : 'org.update');
        await inOrg(ctx.pool, req, oc, (db) =>
          db.update(organizations).set(req.body).where(eq(organizations.id, oc.orgId)),
        );
        return orgContext(ctx, req, oc.orgId);
      },
    );
  };

async function orgContext(ctx: AppContext, req: Parameters<typeof resolveOrg>[1], orgId: string) {
  const oc = await resolveOrg(ctx.pool, req, orgId);
  return inOrg(ctx.pool, req, oc, async (db) => {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const [m] = await db.select().from(memberships).where(eq(memberships.id, oc.membershipId));
    if (!org || !m) throw notFound('Organization');
    return {
      organization: toOrganization(org),
      membership: toMembership(m),
      permissions: ACTIONS.filter((a) => can(oc.role, a)),
    };
  });
}
