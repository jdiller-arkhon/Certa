/**
 * Expiration & readiness engine: "Is every pilot and aircraft legal to fly today?"
 * Pure functions — the same code runs on the API, the web, and offline on the phone.
 */
import type { ReadinessLevel } from '../domain/enums.js';
import { daysBetween } from '../format/dates.js';
import { credentialExpiry, type CredentialLike } from '../rules/evaluators.js';
import type { ResolvedRulePack } from '../rules/engine.js';

export interface ReadinessPolicy {
  /** Items due within this many days are amber. */
  amberWithinDays: number;
  /** Alert thresholds in days before due, e.g. [90, 30, 7]. */
  alertThresholdsDays: number[];
}

export const DEFAULT_READINESS_POLICY: ReadinessPolicy = {
  amberWithinDays: 30,
  alertThresholdsDays: [90, 30, 7],
};

export type ExpiringItemKind =
  | 'credential'
  | 'credential_missing'
  | 'aircraft_registration'
  | 'authorization'
  | 'insurance'
  | 'maintenance'
  | 'battery'
  | 'grounding';

export interface ExpiringItem {
  kind: ExpiringItemKind;
  subjectType: 'pilot' | 'aircraft' | 'battery' | 'organization';
  subjectId: string;
  /** Stable key used for alert de-duplication. */
  key: string;
  label: string;
  /** Last valid day (inclusive). Null for non-date items (e.g. grounding, missing credential). */
  dueOn: string | null;
  /** Usage-based due items report progress toward a limit (0..1+). */
  usageFraction: number | null;
  /** Hard blockers are red regardless of dates (grounded aircraft, missing required credential). */
  blocking: boolean;
  ruleId: string | null;
}

export interface EvaluatedItem extends ExpiringItem {
  level: ReadinessLevel;
  /** Days until due (negative = overdue), when date-based. */
  daysRemaining: number | null;
  reason: string;
}

const LEVEL_ORDER: Record<ReadinessLevel, number> = { green: 0, amber: 1, red: 2 };

export function worstLevel(levels: ReadinessLevel[]): ReadinessLevel {
  return levels.reduce<ReadinessLevel>((w, l) => (LEVEL_ORDER[l] > LEVEL_ORDER[w] ? l : w), 'green');
}

export function evaluateItem(
  item: ExpiringItem,
  today: string,
  policy: ReadinessPolicy = DEFAULT_READINESS_POLICY,
): EvaluatedItem {
  if (item.blocking) return { ...item, level: 'red', daysRemaining: null, reason: item.label };

  let level: ReadinessLevel = 'green';
  let daysRemaining: number | null = null;
  let reason = item.label;

  if (item.dueOn) {
    daysRemaining = daysBetween(today, item.dueOn);
    if (daysRemaining < 0) {
      level = 'red';
      reason = `${item.label} expired`;
    } else if (daysRemaining <= policy.amberWithinDays) {
      level = 'amber';
      reason = `${item.label} due soon`;
    }
  }
  if (item.usageFraction != null) {
    const usageLevel: ReadinessLevel =
      item.usageFraction >= 1 ? 'red' : item.usageFraction >= 0.9 ? 'amber' : 'green';
    if (LEVEL_ORDER[usageLevel] > LEVEL_ORDER[level]) {
      level = usageLevel;
      reason = usageLevel === 'red' ? `${item.label} limit reached` : `${item.label} nearing limit`;
    }
  }
  return { ...item, level, daysRemaining, reason };
}

export interface ReadinessSummary {
  level: ReadinessLevel;
  items: EvaluatedItem[];
  /** Non-green items, worst first, soonest first. */
  reasons: EvaluatedItem[];
}

export function summarize(
  items: ExpiringItem[],
  today: string,
  policy: ReadinessPolicy = DEFAULT_READINESS_POLICY,
): ReadinessSummary {
  const evaluated = items.map((i) => evaluateItem(i, today, policy));
  const reasons = evaluated
    .filter((e) => e.level !== 'green')
    .sort(
      (a, b) =>
        LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] ||
        (a.daysRemaining ?? -Infinity) - (b.daysRemaining ?? -Infinity),
    );
  return { level: worstLevel(evaluated.map((e) => e.level)), items: evaluated, reasons };
}

/**
 * Builds the expiring items for a pilot's credentials, including "missing" items for every
 * credential type the rule pack marks as required for currency.
 */
export function pilotCredentialItems(
  pilotId: string,
  credentials: (CredentialLike & { id: string })[],
  rules: ResolvedRulePack,
): ExpiringItem[] {
  const items: ExpiringItem[] = [];
  for (const c of credentials) {
    const type = rules.pack.credentialTypes.find((t) => t.id === c.credentialType);
    const exp = credentialExpiry(c, rules);
    items.push({
      kind: 'credential',
      subjectType: 'pilot',
      subjectId: pilotId,
      key: `credential:${c.id}`,
      label: type?.label ?? c.credentialType,
      dueOn: exp.expiresOn,
      usageFraction: null,
      blocking: false,
      ruleId: exp.ruleId,
    });
  }

  for (const type of rules.pack.credentialTypes.filter((t) => t.requiredForCurrency)) {
    const acceptable = new Set([type.id, ...type.satisfiedBy]);
    const held = credentials.filter((c) => acceptable.has(c.credentialType));
    if (held.length === 0) {
      items.push({
        kind: 'credential_missing',
        subjectType: 'pilot',
        subjectId: pilotId,
        key: `credential_missing:${pilotId}:${type.id}`,
        label: `${type.label} not on file`,
        dueOn: null,
        usageFraction: null,
        blocking: true,
        ruleId: type.validityRuleId,
      });
    }
  }
  return collapseSatisfied(items, credentials, rules);
}

/**
 * When several held credentials satisfy the same requirement (e.g. an old recurrent and a new
 * one), only the one with the latest expiry counts toward readiness.
 */
function collapseSatisfied(
  items: ExpiringItem[],
  credentials: (CredentialLike & { id: string })[],
  rules: ResolvedRulePack,
): ExpiringItem[] {
  const groupOf = (credType: string): string => {
    const owner = rules.pack.credentialTypes.find(
      (t) => t.requiredForCurrency && (t.id === credType || t.satisfiedBy.includes(credType)),
    );
    return owner?.id ?? `solo:${credType}`;
  };
  const best = new Map<string, ExpiringItem>();
  const passthrough: ExpiringItem[] = [];
  for (const item of items) {
    if (item.kind !== 'credential') {
      passthrough.push(item);
      continue;
    }
    const cred = credentials.find((c) => `credential:${c.id}` === item.key)!;
    const group = `${groupOf(cred.credentialType)}`;
    const current = best.get(group);
    if (!current || laterOrNever(item.dueOn, current.dueOn)) best.set(group, item);
  }
  return [...best.values(), ...passthrough];
}

function laterOrNever(a: string | null, b: string | null): boolean {
  if (a === null) return true;
  if (b === null) return false;
  return a > b;
}

/** Which alert threshold (if any) an item has crossed today — used to schedule notifications. */
export function crossedThreshold(
  daysRemaining: number,
  policy: ReadinessPolicy = DEFAULT_READINESS_POLICY,
): number | null {
  const sorted = [...policy.alertThresholdsDays].sort((a, b) => a - b);
  for (const t of sorted) if (daysRemaining <= t) return t;
  return null;
}
