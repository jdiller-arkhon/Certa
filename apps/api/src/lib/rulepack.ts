import { resolveRulePack, validateRulePack, type ResolvedRulePack, type RuleOverride, type RulePack } from '@certa/core';
import { and, eq, isNull, orgRuleOverrides, rulePacks, type Db } from '@certa/db';

export type PackRow = typeof rulePacks.$inferSelect;

const cmp = (a: string, b: string) => {
  const [pa, pb] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
};

/** Newest active pack per jurisdiction. Pack versions are semver and loaded in order. */
export async function latestPackRow(db: Db, jurisdiction: string): Promise<PackRow | undefined> {
  const rows = await db.select().from(rulePacks).where(and(eq(rulePacks.jurisdiction, jurisdiction), eq(rulePacks.active, true)));
  return rows.sort((a, b) => cmp(b.version, a.version))[0];
}

/** The org's current pack for a jurisdiction plus its overrides (inside the org's RLS context). */
export async function loadRuleInputs(db: Db, jurisdiction: string): Promise<{ row: PackRow; pack: RulePack; overrides: RuleOverride[] } | null> {
  const row = await latestPackRow(db, jurisdiction);
  if (!row) return null;
  const overrides = await db
    .select({ ruleId: orgRuleOverrides.ruleId, value: orgRuleOverrides.value, reason: orgRuleOverrides.reason })
    .from(orgRuleOverrides)
    .where(and(eq(orgRuleOverrides.jurisdiction, jurisdiction), isNull(orgRuleOverrides.deletedAt)));
  return { row, pack: validateRulePack(row.document), overrides };
}

export function resolveInputs(i: { pack: RulePack; overrides: RuleOverride[] }): ResolvedRulePack {
  return resolveRulePack(i.pack, i.overrides);
}
