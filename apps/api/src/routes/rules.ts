import { api, JurisdictionId, newId, resolveRulePack, validateRulePack, type RuleOverride, type RulePack } from '@certa/core';
import { and, authUsers, eq, globalDb, isNull, orgRuleOverrides, organizations, rulePacks, sql, type Db } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const RuleParams = OrgParams.extend({ ruleId: z.string().min(3).max(200) });
const JurisdictionQuery = z.object({ jurisdiction: JurisdictionId.optional() });

type PackRow = typeof rulePacks.$inferSelect;

function summary(row: PackRow, pack: RulePack): api.RulePackSummary {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    version: row.version,
    name: row.name,
    authority: row.authority,
    effectiveFrom: row.effectiveFrom,
    disclaimer: row.disclaimer,
    ruleCount: pack.rules.length,
    unverifiedCount: pack.rules.filter((r) => r.needsVerification).length,
    active: row.active,
  };
}

/** Newest active pack per jurisdiction. Pack versions are semver and loaded in order. */
async function latestPackRow(db: Db, jurisdiction: string): Promise<PackRow | undefined> {
  const rows = await db.select().from(rulePacks).where(and(eq(rulePacks.jurisdiction, jurisdiction), eq(rulePacks.active, true)));
  return rows.sort((a, b) => cmp(b.version, a.version))[0];
}
const cmp = (a: string, b: string) => {
  const [pa, pb] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
};

export const ruleRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/rule-packs',
      { schema: { tags: ['rules'], summary: 'All loaded rule packs', response: { 200: api.RulePackListResponse } } },
      async () => {
        const rows = await globalDb(ctx.pool).select().from(rulePacks).orderBy(rulePacks.jurisdiction, rulePacks.version);
        return { packs: rows.map((r) => summary(r, validateRulePack(r.document))) };
      },
    );

    const detail = async (req: Parameters<typeof resolveOrg>[1], orgId: string, jurisdiction?: string) => {
      const oc = await resolveOrg(ctx.pool, req, orgId);
      authorize(oc, 'rules.read');
      return inOrg(ctx.pool, req, oc, async (db) => {
        const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
        const j = jurisdiction ?? org!.defaultJurisdiction;
        const row = await latestPackRow(db, j);
        if (!row) throw notFound(`Rule pack for ${j}`);
        const pack = validateRulePack(row.document);
        const overrides = await db
          .select({ o: orgRuleOverrides, setBy: authUsers.name })
          .from(orgRuleOverrides)
          .leftJoin(authUsers, eq(authUsers.id, sql`coalesce(${orgRuleOverrides.updatedBy}, ${orgRuleOverrides.createdBy})`))
          .where(and(eq(orgRuleOverrides.jurisdiction, j), isNull(orgRuleOverrides.deletedAt)));
        const resolved = resolveRulePack(
          pack,
          overrides.map(({ o }) => ({ ruleId: o.ruleId, value: o.value, reason: o.reason })),
        );
        const response: api.RulePackDetailResponse = {
          pack: summary(row, pack),
          credentialTypes: pack.credentialTypes.map((c) => ({
            id: c.id,
            label: c.label,
            description: c.description,
            validityRuleId: c.validityRuleId,
            requiredForCurrency: c.requiredForCurrency,
          })),
          rules: [...resolved.rules.values()].map((r) => {
            const ov = overrides.find(({ o }) => o.ruleId === r.id);
            return {
              id: r.id,
              title: r.title,
              description: r.description,
              kind: r.kind,
              appliesTo: r.appliesTo,
              value: r.value,
              packValue: r.packValue,
              unit: 'unit' in r ? r.unit : null,
              statedAs: r.statedAs,
              source: r.source,
              lastVerifiedOn: r.lastVerifiedOn,
              needsVerification: r.needsVerification,
              notes: r.notes,
              override: ov
                ? { value: ov.o.value, reason: ov.o.reason, setBy: ov.setBy, setAt: iso(ov.o.updatedAt) }
                : null,
            };
          }),
        };
        return response;
      });
    };

    app.get(
      '/orgs/:orgId/rules',
      {
        schema: {
          tags: ['rules'],
          summary: 'Effective rule pack for the organization, with overrides applied',
          params: OrgParams,
          querystring: JurisdictionQuery,
          response: { 200: api.RulePackDetailResponse },
        },
      },
      async (req) => detail(req, req.params.orgId, req.query.jurisdiction),
    );

    app.put(
      '/orgs/:orgId/rules/:ruleId/override',
      {
        schema: {
          tags: ['rules'],
          summary: 'Override a rule value for this organization (owner/admin, audited)',
          params: RuleParams,
          querystring: JurisdictionQuery,
          body: api.SetRuleOverrideRequest,
          response: { 200: api.RulePackDetailResponse },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'rules.override');
        await inOrg(ctx.pool, req, oc, async (db) => {
          const [org] = await db.select().from(organizations).where(eq(organizations.id, oc.orgId));
          const j = req.query.jurisdiction ?? org!.defaultJurisdiction;
          const row = await latestPackRow(db, j);
          if (!row) throw notFound(`Rule pack for ${j}`);
          const override: RuleOverride = { ruleId: req.params.ruleId, value: req.body.value, reason: req.body.reason };
          try {
            resolveRulePack(validateRulePack(row.document), [override]);
          } catch (err) {
            throw badRequest((err as Error).message);
          }
          const [existing] = await db
            .select()
            .from(orgRuleOverrides)
            .where(and(eq(orgRuleOverrides.jurisdiction, j), eq(orgRuleOverrides.ruleId, override.ruleId), isNull(orgRuleOverrides.deletedAt)));
          if (existing)
            await db.update(orgRuleOverrides).set({ value: override.value, reason: override.reason }).where(eq(orgRuleOverrides.id, existing.id));
          else
            await db.insert(orgRuleOverrides).values({
              id: newId(),
              jurisdiction: j,
              ruleId: override.ruleId,
              value: override.value,
              reason: override.reason,
            });
        });
        return detail(req, req.params.orgId, req.query.jurisdiction);
      },
    );

    app.delete(
      '/orgs/:orgId/rules/:ruleId/override',
      {
        schema: {
          tags: ['rules'],
          summary: 'Remove an override, restoring the pack value. A reason is recorded in the audit log.',
          params: RuleParams,
          querystring: JurisdictionQuery,
          body: z.object({ reason: z.string().min(3).max(2000) }),
          response: { 200: api.RulePackDetailResponse },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'rules.override');
        await inOrg(ctx.pool, req, oc, async (db) => {
          const [org] = await db.select().from(organizations).where(eq(organizations.id, oc.orgId));
          const j = req.query.jurisdiction ?? org!.defaultJurisdiction;
          const cleared = await db
            .update(orgRuleOverrides)
            .set({ deletedAt: sql`now()`, reason: `Cleared: ${req.body.reason}` })
            .where(and(eq(orgRuleOverrides.jurisdiction, j), eq(orgRuleOverrides.ruleId, req.params.ruleId), isNull(orgRuleOverrides.deletedAt)))
            .returning();
          if (!cleared.length) throw notFound('Override');
        });
        return detail(req, req.params.orgId, req.query.jurisdiction);
      },
    );
  };

