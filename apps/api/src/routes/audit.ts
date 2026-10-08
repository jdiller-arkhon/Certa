import { api } from '@certa/core';
import { and, auditEvents, authUsers, desc, eq, lt, type SQL } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

export const auditRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/orgs/:orgId/audit',
      {
        schema: {
          tags: ['audit'],
          summary: 'Append-only audit log, newest first',
          params: OrgParams,
          querystring: api.AuditListQuery,
          response: { 200: api.AuditListResponse },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'audit.read');
        const q = req.query;
        const where: SQL[] = [eq(auditEvents.orgId, oc.orgId)];
        if (q.table) where.push(eq(auditEvents.tableName, q.table));
        if (q.rowId) where.push(eq(auditEvents.rowId, q.rowId));
        if (q.actorUserId) where.push(eq(auditEvents.actorUserId, q.actorUserId));
        if (q.before) where.push(lt(auditEvents.id, q.before));
        const rows = await inOrg(ctx.pool, req, oc, (db) =>
          db
            .select({ e: auditEvents, actorName: authUsers.name })
            .from(auditEvents)
            .leftJoin(authUsers, eq(authUsers.id, auditEvents.actorUserId))
            .where(and(...where))
            .orderBy(desc(auditEvents.id))
            .limit(q.limit + 1),
        );
        const page = rows.slice(0, q.limit);
        return {
          events: page.map(({ e, actorName }) => ({
            id: e.id,
            orgId: e.orgId,
            at: iso(e.at),
            actorUserId: e.actorUserId,
            actorName,
            requestId: e.requestId,
            tableName: e.tableName,
            rowId: e.rowId,
            operation: e.operation,
            before: (e.before as Record<string, unknown> | null) ?? null,
            after: (e.after as Record<string, unknown> | null) ?? null,
          })),
          nextBefore: rows.length > q.limit ? page.at(-1)!.e.id : null,
        };
      },
    );
  };
