/**
 * Rule-pack schema. Regulatory *values* live in versioned pack files (packages/rulepacks);
 * the *meaning* of each rule id lives in typed evaluators (./evaluators.ts).
 */
import { z } from 'zod';
import { JurisdictionId } from '../domain/enums.js';

export const RuleSource = z.object({
  /** Human title of the source, e.g. "14 CFR Part 107". */
  title: z.string().min(1),
  /** Section-level citation, e.g. "14 CFR 107.65". */
  citation: z.string().min(1),
  url: z.url().nullable(),
});
export type RuleSource = z.infer<typeof RuleSource>;

export const DurationValue = z.object({
  amount: z.number().int().positive(),
  unit: z.enum(['days', 'months', 'years']),
  /** "calendar month" semantics: the period ends on the last day of the final month. */
  roundTo: z.enum(['none', 'end_of_month']).default('none'),
});
export type DurationValue = z.infer<typeof DurationValue>;

const common = {
  id: z
    .string()
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'Rule ids are dotted snake_case, e.g. pilot.recurrent.validity'),
  title: z.string().min(1),
  description: z.string().min(1),
  appliesTo: z.enum(['pilot', 'credential', 'aircraft', 'operation', 'incident', 'battery']),
  source: RuleSource,
  /** As the pack author stated it, e.g. "400 feet". Shown next to the SI value. */
  statedAs: z.string().nullable().default(null),
  lastVerifiedOn: z.iso.date().nullable(),
  needsVerification: z.boolean(),
  notes: z.string().nullable().default(null),
};

export const Rule = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('duration'), value: DurationValue }),
  z.object({ ...common, kind: z.literal('length'), value: z.number(), unit: z.literal('m') }),
  z.object({ ...common, kind: z.literal('speed'), value: z.number(), unit: z.literal('m/s') }),
  z.object({ ...common, kind: z.literal('mass'), value: z.number(), unit: z.literal('kg') }),
  z.object({
    ...common,
    kind: z.literal('money'),
    /** Minor units (cents). */
    value: z.number().int(),
    unit: z.string().length(3),
  }),
  z.object({ ...common, kind: z.literal('integer'), value: z.number().int() }),
  z.object({ ...common, kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ ...common, kind: z.literal('date'), value: z.iso.date() }),
  z.object({ ...common, kind: z.literal('text'), value: z.string() }),
]);
export type Rule = z.infer<typeof Rule>;
export type RuleKind = Rule['kind'];

export const CredentialTypeDef = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  description: z.string().min(1),
  /** Rule (kind=duration) that determines expiry from the issue date; null = does not expire. */
  validityRuleId: z.string().nullable(),
  /** Whether an expired/missing credential of this type makes a pilot not current. */
  requiredForCurrency: z.boolean(),
  /** Credential types that also satisfy this requirement (e.g. initial test satisfies recurrent). */
  satisfiedBy: z.array(z.string()).default([]),
});
export type CredentialTypeDef = z.infer<typeof CredentialTypeDef>;

export const RulePack = z.object({
  schemaVersion: z.literal(1),
  jurisdiction: JurisdictionId,
  /** Semver of the pack content. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  authority: z.string().min(1),
  effectiveFrom: z.iso.date(),
  disclaimer: z.string().min(1),
  credentialTypes: z.array(CredentialTypeDef),
  rules: z.array(Rule),
});
export type RulePack = z.infer<typeof RulePack>;
export type RulePackInput = z.input<typeof RulePack>;

/** Organization-level override of a single rule value (owner/admin only, audited). */
export const RuleOverride = z.object({
  ruleId: z.string(),
  value: z.unknown(),
  reason: z.string().min(3).max(2000),
});
export type RuleOverride = z.infer<typeof RuleOverride>;

/** Structural checks zod can't express: unique ids, references resolve, durations are durations. */
export function validateRulePack(input: unknown): RulePack {
  const pack = RulePack.parse(input);
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const r of pack.rules) {
    if (ids.has(r.id)) errors.push(`duplicate rule id ${r.id}`);
    ids.add(r.id);
  }
  const credIds = new Set<string>();
  for (const c of pack.credentialTypes) {
    if (credIds.has(c.id)) errors.push(`duplicate credential type ${c.id}`);
    credIds.add(c.id);
    if (c.validityRuleId) {
      const rule = pack.rules.find((r) => r.id === c.validityRuleId);
      if (!rule) errors.push(`credential ${c.id} references missing rule ${c.validityRuleId}`);
      else if (rule.kind !== 'duration')
        errors.push(`credential ${c.id} validity rule ${rule.id} must be kind=duration`);
    }
  }
  for (const c of pack.credentialTypes)
    for (const s of c.satisfiedBy)
      if (!credIds.has(s)) errors.push(`credential ${c.id} satisfiedBy unknown type ${s}`);
  if (errors.length) throw new Error(`Invalid rule pack ${pack.jurisdiction}@${pack.version}: ${errors.join('; ')}`);
  return pack;
}
