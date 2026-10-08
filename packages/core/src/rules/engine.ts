import { addDays, addMonths, endOfMonth } from '../format/dates.js';
import {
  DurationValue,
  Rule,
  type RuleKind,
  type RuleOverride,
  type RulePack,
} from './schema.js';

export interface AppliedOverride {
  value: unknown;
  reason: string;
}

export type ResolvedRule = Rule & {
  /** The value shipped in the pack, before any org override. */
  packValue: Rule['value'];
  override: AppliedOverride | null;
};

export interface ResolvedRulePack {
  jurisdiction: string;
  version: string;
  pack: RulePack;
  rules: Map<string, ResolvedRule>;
}

/**
 * Applies org overrides to a pack. An override whose value does not match the rule's kind is
 * rejected (thrown) — invalid overrides must never be silently ignored.
 */
export function resolveRulePack(pack: RulePack, overrides: RuleOverride[] = []): ResolvedRulePack {
  const rules = new Map<string, ResolvedRule>();
  for (const r of pack.rules) rules.set(r.id, { ...r, packValue: r.value, override: null });
  for (const o of overrides) {
    const base = rules.get(o.ruleId);
    if (!base) throw new Error(`Override references unknown rule ${o.ruleId}`);
    const candidate = Rule.safeParse({ ...stripResolved(base), value: o.value });
    if (!candidate.success)
      throw new Error(`Override for ${o.ruleId} is not a valid ${base.kind}: ${candidate.error.message}`);
    rules.set(o.ruleId, {
      ...candidate.data,
      packValue: base.packValue,
      override: { value: o.value, reason: o.reason },
    } as ResolvedRule);
  }
  return { jurisdiction: pack.jurisdiction, version: pack.version, pack, rules };
}

function stripResolved(r: ResolvedRule): Rule {
  const { packValue: _p, override: _o, ...rest } = r;
  return rest as Rule;
}

type RuleOfKind<K extends RuleKind> = Extract<ResolvedRule, { kind: K }>;

export function getRule<K extends RuleKind>(
  resolved: ResolvedRulePack,
  id: string,
  kind: K,
): RuleOfKind<K> {
  const rule = resolved.rules.get(id);
  if (!rule) throw new Error(`Rule ${id} not found in ${resolved.jurisdiction}@${resolved.version}`);
  if (rule.kind !== kind) throw new Error(`Rule ${id} is kind ${rule.kind}, expected ${kind}`);
  return rule as RuleOfKind<K>;
}

export function findRule<K extends RuleKind>(
  resolved: ResolvedRulePack,
  id: string,
  kind: K,
): RuleOfKind<K> | null {
  const rule = resolved.rules.get(id);
  return rule && rule.kind === kind ? (rule as RuleOfKind<K>) : null;
}

/**
 * Applies a duration to a start date. Returns the *last valid day* (inclusive).
 * - days:   start + N days
 * - months: start + N months; with end_of_month, the last day of that month
 *   ("24 calendar months" = through the end of the 24th month after the month of issue).
 */
export function applyDuration(start: string, duration: DurationValue): string {
  const d = DurationValue.parse(duration);
  if (d.unit === 'days') return addDays(start, d.amount);
  const months = d.unit === 'years' ? d.amount * 12 : d.amount;
  const shifted = addMonths(start, months);
  return d.roundTo === 'end_of_month' ? endOfMonth(shifted) : shifted;
}
