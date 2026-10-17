import { api, Id, newId } from '@certa/core';
import { and, asc, authorizations, eq, isNull, pilots, sql, type Db } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const AuthParams = OrgParams.extend({ authorizationId: Id });

export function toAuthorization(r: typeof authorizations.$inferSelect): api.AuthorizationRecord {
  return {
    id: r.id,
    orgId: r.orgId,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy,
    deletedAt: iso(r.deletedAt),
    kind: r.kind,
    reference: r.reference,
    title: r.title,
    scope: r.scope,
    conditions: r.conditions,
    validFrom: iso(r.validFrom),
    validTo: iso(r.validTo),
    pilotId: r.pilotId,
  };
}

async function checkPilot(db: Db, pilotId: string | null | undefined) {
  if (!pilotId) return;
  const [p] = await db.select({ id: pilots.id }).from(pilots).where(and(eq(pilots.id, pilotId), isNull(pilots.deletedAt)));
  if (!p) throw badRequest('Unknown pilot');
}

/**
 * LAANC approvals, airspace authorizations, Part 107 waivers, and COAs. Managers record any;
 * a pilot records the ones issued to them. A flight can name the one it operated under.
 */
export const authorizationRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/orgs/:orgId/authorizations',
      { schema: { tags: ['authorizations'], params: OrgParams, response: { 200: api.AuthorizationListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'authorizations.read');
        return inOrg(ctx.pool, req, oc, async (db) => ({
          authorizations: (await db.select().from(authorizations).where(isNull(authorizations.deletedAt)).orderBy(asc(authorizations.validTo), asc(authorizations.reference))).map(toAuthorization),
        }));
      },
    );

    app.post(
      '/orgs/:orgId/authorizations',
      { schema: { tags: ['authorizations'], params: OrgParams, body: api.CreateAuthorizationRequest, response: { 201: api.AuthorizationRecord } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const b = req.body;
        authorize(oc, 'authorizations.manage', b.pilotId ?? null);
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          await checkPilot(db, b.pilotId);
          const [r] = await db
            .insert(authorizations)
            .values({ id: newId(), kind: b.kind, reference: b.reference, title: b.title ?? null, scope: b.scope ?? null, conditions: b.conditions ?? null, validFrom: b.validFrom ?? null, validTo: b.validTo ?? null, pilotId: b.pilotId ?? null })
            .returning();
          return r!;
        });
        return reply.status(201).send(toAuthorization(row));
      },
    );

    app.patch(
      '/orgs/:orgId/authorizations/:authorizationId',
      { schema: { tags: ['authorizations'], params: AuthParams, body: api.UpdateAuthorizationRequest, response: { 200: api.AuthorizationRecord } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const b = req.body;
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          const [cur] = await db.select().from(authorizations).where(and(eq(authorizations.id, req.params.authorizationId), isNull(authorizations.deletedAt)));
          if (!cur) throw notFound('Authorization');
          // Both the current holder and any new one must be within the caller's reach.
          authorize(oc, 'authorizations.manage', cur.pilotId);
          if (b.pilotId !== undefined) authorize(oc, 'authorizations.manage', b.pilotId);
          await checkPilot(db, b.pilotId);
          const validFrom = b.validFrom === undefined ? cur.validFrom : b.validFrom;
          const validTo = b.validTo === undefined ? cur.validTo : b.validTo;
          if (validFrom && validTo && Date.parse(validTo) <= Date.parse(validFrom)) throw badRequest('Valid until must be after valid from');
          const set: Partial<typeof authorizations.$inferInsert> = {};
          for (const k of ['kind', 'reference', 'title', 'scope', 'conditions', 'validFrom', 'validTo', 'pilotId'] as const) if (b[k] !== undefined) (set as Record<string, unknown>)[k] = b[k];
          const [r] = Object.keys(set).length ? await db.update(authorizations).set(set).where(eq(authorizations.id, cur.id)).returning() : [cur];
          return r!;
        });
        return toAuthorization(row);
      },
    );

    app.delete(
      '/orgs/:orgId/authorizations/:authorizationId',
      { schema: { tags: ['authorizations'], params: AuthParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        await inOrg(ctx.pool, req, oc, async (db) => {
          const [cur] = await db.select({ pilotId: authorizations.pilotId }).from(authorizations).where(and(eq(authorizations.id, req.params.authorizationId), isNull(authorizations.deletedAt)));
          if (!cur) throw notFound('Authorization');
          authorize(oc, 'authorizations.manage', cur.pilotId);
          // Flights keep pointing at it; a soft delete keeps their records readable.
          await db.update(authorizations).set({ deletedAt: sql`now()` }).where(eq(authorizations.id, req.params.authorizationId));
        });
        return reply.status(204).send(null);
      },
    );
  };
