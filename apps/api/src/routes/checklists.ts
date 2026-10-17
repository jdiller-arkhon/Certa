import { api, DEFAULT_PREFLIGHT_SECTIONS, Id, newId, type ChecklistTemplate } from '@certa/core';
import { and, asc, checklistTemplates, eq, isNull, sql, type Db } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const TemplateParams = OrgParams.extend({ templateId: Id });

export function toChecklistTemplate(r: typeof checklistTemplates.$inferSelect): ChecklistTemplate {
  return {
    id: r.id,
    orgId: r.orgId,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    createdBy: r.createdBy,
    deletedAt: iso(r.deletedAt),
    name: r.name,
    kind: r.kind,
    version: r.templateVersion,
    isDefault: r.isDefault,
    sections: r.sections,
  };
}

/** Live templates, seeding the built-in pre-flight checklist the first time an org has none. */
export async function liveTemplates(db: Db) {
  const rows = await db.select().from(checklistTemplates).where(isNull(checklistTemplates.deletedAt)).orderBy(asc(checklistTemplates.createdAt));
  if (rows.length) return rows;
  const [seeded] = await db
    .insert(checklistTemplates)
    .values({ id: newId(), name: 'Standard pre-flight', kind: 'preflight', templateVersion: 1, isDefault: true, sections: DEFAULT_PREFLIGHT_SECTIONS })
    .returning();
  return [seeded!];
}

/** Only one default per kind: setting a new default clears the old one. */
async function clearDefault(db: Db, kind: ChecklistTemplate['kind'], except: string) {
  await db
    .update(checklistTemplates)
    .set({ isDefault: false })
    .where(and(eq(checklistTemplates.kind, kind), eq(checklistTemplates.isDefault, true), isNull(checklistTemplates.deletedAt), sql`${checklistTemplates.id} <> ${except}`));
}

/**
 * Checklist templates. Templates are versioned by replacement: editing one retires the row and
 * inserts the next version, so a run always resolves against the exact items the pilot saw.
 */
export const checklistRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/orgs/:orgId/checklists/templates',
      { schema: { tags: ['checklists'], summary: 'Checklist templates (the built-in pre-flight checklist is created on first use).', params: OrgParams, response: { 200: api.ChecklistTemplateListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'checklists.read');
        return inOrg(ctx.pool, req, oc, async (db) => ({ templates: (await liveTemplates(db)).map(toChecklistTemplate) }));
      },
    );

    app.post(
      '/orgs/:orgId/checklists/templates',
      { schema: { tags: ['checklists'], params: OrgParams, body: api.ChecklistTemplateRequest, response: { 201: api.ChecklistTemplateResponse } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'checklists.manage_templates');
        const b = req.body;
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          const id = newId();
          if (b.isDefault) await clearDefault(db, b.kind, id);
          const [r] = await db.insert(checklistTemplates).values({ id, name: b.name, kind: b.kind, templateVersion: 1, isDefault: b.isDefault, sections: b.sections }).returning();
          return r!;
        });
        return reply.status(201).send(toChecklistTemplate(row));
      },
    );

    app.put(
      '/orgs/:orgId/checklists/templates/:templateId',
      {
        schema: {
          tags: ['checklists'],
          summary: 'Publish the next version of a template. Returns the new version (a new id); earlier runs keep pointing at the version they used.',
          params: TemplateParams,
          body: api.ChecklistTemplateRequest,
          response: { 200: api.ChecklistTemplateResponse },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'checklists.manage_templates');
        const b = req.body;
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          const [cur] = await db
            .update(checklistTemplates)
            .set({ deletedAt: sql`now()` })
            .where(and(eq(checklistTemplates.id, req.params.templateId), isNull(checklistTemplates.deletedAt)))
            .returning();
          if (!cur) throw notFound('Checklist template');
          const id = newId();
          if (b.isDefault) await clearDefault(db, b.kind, id);
          const [r] = await db
            .insert(checklistTemplates)
            .values({ id, name: b.name, kind: b.kind, templateVersion: cur.templateVersion + 1, isDefault: b.isDefault, sections: b.sections })
            .returning();
          return r!;
        });
        return toChecklistTemplate(row);
      },
    );

    app.delete(
      '/orgs/:orgId/checklists/templates/:templateId',
      { schema: { tags: ['checklists'], params: TemplateParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'checklists.manage_templates');
        await inOrg(ctx.pool, req, oc, async (db) => {
          // An org always keeps at least one checklist; deleting the last would just re-seed the default.
          if ((await liveTemplates(db)).length <= 1) throw badRequest('Keep at least one checklist. Edit this one instead.');
          const [r] = await db
            .update(checklistTemplates)
            .set({ deletedAt: sql`now()`, isDefault: false })
            .where(and(eq(checklistTemplates.id, req.params.templateId), isNull(checklistTemplates.deletedAt)))
            .returning({ id: checklistTemplates.id });
          if (!r) throw notFound('Checklist template');
        });
        return reply.status(204).send(null);
      },
    );
  };
