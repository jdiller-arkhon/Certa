/**
 * Typed evaluators that give rule ids their meaning. Each evaluator documents which rule ids
 * it reads, so a jurisdiction that wants to reuse it must supply those ids.
 */
import type { IncidentFacts } from '../domain/entities.js';
import { applyDuration, findRule, getRule, type ResolvedRulePack } from './engine.js';

export interface CredentialLike {
  credentialType: string;
  issuedOn: string | null;
  expiresOn: string | null;
}

export interface CredentialExpiry {
  /** Last valid day, inclusive. Null = does not expire (or cannot be computed). */
  expiresOn: string | null;
  basis: 'explicit' | 'rule' | 'non_expiring' | 'unknown';
  ruleId: string | null;
}

/** Reads: credentialTypes[].validityRuleId. */
export function credentialExpiry(cred: CredentialLike, rules: ResolvedRulePack): CredentialExpiry {
  if (cred.expiresOn) return { expiresOn: cred.expiresOn, basis: 'explicit', ruleId: null };
  const type = rules.pack.credentialTypes.find((t) => t.id === cred.credentialType);
  if (!type) return { expiresOn: null, basis: 'unknown', ruleId: null };
  if (!type.validityRuleId) return { expiresOn: null, basis: 'non_expiring', ruleId: null };
  if (!cred.issuedOn) return { expiresOn: null, basis: 'unknown', ruleId: type.validityRuleId };
  const rule = getRule(rules, type.validityRuleId, 'duration');
  return { expiresOn: applyDuration(cred.issuedOn, rule.value), basis: 'rule', ruleId: rule.id };
}

/** Reads: aircraft.registration.validity (duration). */
export function suggestedRegistrationExpiry(
  registeredOn: string,
  rules: ResolvedRulePack,
): string | null {
  const rule = findRule(rules, 'aircraft.registration.validity', 'duration');
  return rule ? applyDuration(registeredOn, rule.value) : null;
}

export type Reportability = 'reportable' | 'not_reportable' | 'insufficient_information';

export interface ReportabilityResult {
  status: Reportability;
  /** Rule ids whose thresholds were met. */
  triggeredRuleIds: string[];
  /** Facts that must be filled in before a determination is possible. */
  missingFacts: (keyof IncidentFacts)[];
  /** Last day to report (inclusive, UTC date), if reportable. */
  deadline: string | null;
  deadlineRuleId: string | null;
  /** Always shown: this is guidance, not a legal determination. */
  advisory: string;
}

const REPORTABILITY_ADVISORY =
  'This is a record-keeping aid, not a legal determination. Verify reporting obligations with the regulator.';

/**
 * Reads (all optional — a jurisdiction without a rule simply never triggers on it):
 * - incident.report.deadline                 (duration)
 * - incident.report.injury_min_ais_level     (integer)
 * - incident.report.loss_of_consciousness    (boolean)
 * - incident.report.property_damage_min      (money, exclusive threshold: "more than")
 */
export function incidentReportability(
  facts: IncidentFacts,
  occurredOn: string,
  rules: ResolvedRulePack,
): ReportabilityResult {
  const triggered: string[] = [];
  const missing: (keyof IncidentFacts)[] = [];

  const ais = findRule(rules, 'incident.report.injury_min_ais_level', 'integer');
  if (ais) {
    if (facts.maxInjuryAisLevel == null) missing.push('maxInjuryAisLevel');
    else if (facts.maxInjuryAisLevel >= ais.value) triggered.push(ais.id);
  }

  const loc = findRule(rules, 'incident.report.loss_of_consciousness', 'boolean');
  if (loc?.value) {
    if (facts.lossOfConsciousness == null) missing.push('lossOfConsciousness');
    else if (facts.lossOfConsciousness) triggered.push(loc.id);
  }

  const dmg = findRule(rules, 'incident.report.property_damage_min', 'money');
  if (dmg) {
    if (facts.thirdPartyPropertyDamageCents == null) missing.push('thirdPartyPropertyDamageCents');
    else if (facts.thirdPartyPropertyDamageCents > dmg.value) triggered.push(dmg.id);
  }

  const deadlineRule = findRule(rules, 'incident.report.deadline', 'duration');
  const status: Reportability =
    triggered.length > 0 ? 'reportable' : missing.length > 0 ? 'insufficient_information' : 'not_reportable';
  const deadline =
    status === 'reportable' && deadlineRule ? applyDuration(occurredOn, deadlineRule.value) : null;

  return {
    status,
    triggeredRuleIds: triggered,
    missingFacts: missing,
    deadline,
    deadlineRuleId: deadline ? deadlineRule!.id : null,
    advisory: REPORTABILITY_ADVISORY,
  };
}
