/**
 * The fleet snapshot: everything needed to answer "is every pilot and aircraft legal to fly
 * today?" for one organization. The API serves it (GET /orgs/{orgId}/fleet); the web, the
 * offline app, alerts, the inspector packet, and the Argus verification endpoint all compute
 * readiness from it with these same pure functions.
 */
import { z } from 'zod';
import { Aircraft, Battery, Credential, Flight, Id, IsoDateTime, InsurancePolicy, MaintenanceSchedule, Pilot } from '../domain/entities.js';
import { JurisdictionId, UnitsPreference, type ReadinessLevel } from '../domain/enums.js';
import { addDays, daysBetween } from '../format/dates.js';
import { DEFAULT_READINESS_POLICY, pilotCredentialItems, summarize, worstLevel, type ExpiringItem, type ReadinessSummary } from '../readiness/readiness.js';
import { findRule, resolveRulePack, type ResolvedRulePack } from '../rules/engine.js';
import { RuleOverride, RulePack } from '../rules/schema.js';
import { aircraftItems, type MapContext } from '../viewmodels/mappers.js';

export const PilotTotals = z.object({
  flights: z.number().int().nonnegative(),
  flightSeconds: z.number().int().nonnegative(),
  lastFlightAt: IsoDateTime.nullable(),
  last90DaysFlights: z.number().int().nonnegative(),
});
export type PilotTotals = z.infer<typeof PilotTotals>;

export const FleetSnapshot = z.object({
  organization: z.object({
    id: Id,
    name: z.string(),
    timezone: z.string(),
    units: UnitsPreference,
    defaultJurisdiction: JurisdictionId,
  }),
  rulePack: RulePack,
  overrides: z.array(RuleOverride),
  pilots: z.array(Pilot),
  credentials: z.array(Credential),
  aircraft: z.array(Aircraft),
  batteries: z.array(Battery),
  insurancePolicies: z.array(InsurancePolicy),
  maintenanceSchedules: z.array(MaintenanceSchedule),
  pilotTotals: z.record(z.string(), PilotTotals),
  batteryLastUsed: z.record(z.string(), IsoDateTime.nullable()),
  /** Most recent flight, for "same as last" defaults when logging. */
  lastFlight: Flight.nullable(),
  /** Recently used location names, most recent first. */
  recentLocations: z.array(z.string()),
  /** Flights with takeoff in the last 7 and 30 days (org-wide). */
  recentFlightCounts: z.object({ last7: z.number().int().nonnegative(), last30: z.number().int().nonnegative() }).default({ last7: 0, last30: 0 }),
  /** Snapshot time; the client's offline cache is stamped with it. */
  generatedAt: IsoDateTime,
});
export type FleetSnapshot = z.infer<typeof FleetSnapshot>;

export function resolvedRules(s: Pick<FleetSnapshot, 'rulePack' | 'overrides'>): ResolvedRulePack {
  return resolveRulePack(s.rulePack, s.overrides);
}

// ---------------------------------------------------------------- aircraft checks beyond registration/grounding

/** Remote ID: an aircraft with no Remote ID method can't fly where the rule requires it. */
export function remoteIdItems(a: Aircraft, rules: ResolvedRulePack): ExpiringItem[] {
  const required = findRule(rules, 'aircraft.remote_id.required', 'boolean');
  if (!required?.value || a.status === 'retired') return [];
  if (a.remoteIdMethod === 'none')
    return [{ kind: 'remote_id', subjectType: 'aircraft', subjectId: a.id, key: `remote_id_missing:${a.id}`, label: 'No Remote ID', dueOn: null, usageFraction: null, blocking: true, ruleId: required.id }];
  return [];
}

/** Takeoff mass above the pack's limit (55 lb under Part 107) needs an exemption. */
export function massItems(a: Aircraft, rules: ResolvedRulePack): ExpiringItem[] {
  const limit = findRule(rules, 'aircraft.max_takeoff_mass', 'mass');
  if (!limit || a.takeoffMassKg == null || a.takeoffMassKg < (limit.value as number)) return [];
  return [{ kind: 'mass_limit', subjectType: 'aircraft', subjectId: a.id, key: `over_mass:${a.id}`, label: 'Over the takeoff mass limit', dueOn: null, usageFraction: null, blocking: true, ruleId: limit.id }];
}

/** Insurance: each policy covering the aircraft is tracked to its expiry date. */
export function insuranceItems(a: Aircraft, policies: FleetSnapshot['insurancePolicies']): ExpiringItem[] {
  const covering = policies.filter((p) => !p.deletedAt && p.coveredAircraftIds.includes(a.id));
  if (!covering.length) return [];
  // Several policies may cover one aircraft; the one lasting longest counts.
  const best = covering.reduce((x, y) => (y.expiresOn > x.expiresOn ? y : x));
  return [{ kind: 'insurance', subjectType: 'aircraft', subjectId: a.id, key: `insurance:${best.id}:${a.id}`, label: `Insurance (${best.carrier})`, dueOn: best.expiresOn, usageFraction: null, blocking: false, ruleId: null }];
}

/** Maintenance due by flight time, flights, or calendar days, whichever comes first. */
export function maintenanceItems(
  target: { type: 'aircraft' | 'battery' | 'component'; id: string; flightSeconds: number; flights: number },
  schedules: FleetSnapshot['maintenanceSchedules'],
): ExpiringItem[] {
  return schedules
    .filter((s) => !s.deletedAt && s.target.type === target.type && s.target.id === target.id)
    .map((s) => {
      const fractions: number[] = [];
      if (s.everyFlightSeconds) fractions.push((target.flightSeconds - (s.lastDoneFlightSeconds ?? 0)) / s.everyFlightSeconds);
      if (s.everyFlights) fractions.push((target.flights - (s.lastDoneFlights ?? 0)) / s.everyFlights);
      const dueOn = s.everyDays ? addDays((s.lastDoneAt ?? s.createdAt).slice(0, 10), s.everyDays) : null;
      const usage = fractions.length ? Math.max(...fractions) : null;
      return {
        kind: 'maintenance' as const,
        subjectType: target.type === 'battery' ? ('battery' as const) : ('aircraft' as const),
        subjectId: target.id,
        key: `maintenance:${s.id}`,
        label: s.name,
        dueOn,
        usageFraction: usage,
        // Overdue maintenance on a schedule that grounds blocks flight outright.
        blocking: s.groundsWhenOverdue && usage != null && usage >= 1,
        ruleId: null,
      };
    });
}

export function fullAircraftItems(a: Aircraft, s: FleetSnapshot, rules: ResolvedRulePack): ExpiringItem[] {
  return [
    ...aircraftItems(a),
    ...remoteIdItems(a, rules),
    ...massItems(a, rules),
    ...insuranceItems(a, s.insurancePolicies),
    ...maintenanceItems({ type: 'aircraft', id: a.id, flightSeconds: a.totalFlightSeconds, flights: a.totalFlights }, s.maintenanceSchedules),
  ];
}

export interface FleetReadiness {
  rules: ResolvedRulePack;
  pilots: Map<string, ReadinessSummary>;
  aircraft: Map<string, ReadinessSummary>;
  counts: Record<ReadinessLevel, number>;
  overall: ReadinessLevel;
}

export function fleetReadiness(s: FleetSnapshot, ctx: MapContext): FleetReadiness {
  const rules = resolvedRules(s);
  const policy = ctx.policy ?? DEFAULT_READINESS_POLICY;
  const pilots = new Map(
    s.pilots
      .filter((p) => !p.deletedAt)
      .map((p) => [p.id, summarize(pilotCredentialItems(p.id, s.credentials.filter((c) => c.pilotId === p.id && !c.deletedAt), rules), ctx.today, policy)] as const),
  );
  const aircraft = new Map(
    s.aircraft
      .filter((a) => !a.deletedAt && a.status !== 'retired')
      .map((a) => [a.id, summarize(fullAircraftItems(a, s, rules), ctx.today, policy)] as const),
  );
  const levels = [...pilots.values(), ...aircraft.values()].map((x) => x.level);
  const counts = { green: 0, amber: 0, red: 0 } as Record<ReadinessLevel, number>;
  for (const l of levels) counts[l] += 1;
  return { rules, pilots, aircraft, counts, overall: worstLevel(levels) };
}

// ---------------------------------------------------------------- pre-flight go / no-go

export const GoNoGoCheck = z.object({
  key: z.string(),
  label: z.string(),
  level: z.enum(['green', 'amber', 'red']),
  detail: z.string(),
});
export type GoNoGoCheck = z.infer<typeof GoNoGoCheck>;

export const GoNoGoResult = z.object({
  decision: z.enum(['go', 'caution', 'no_go']),
  checks: z.array(GoNoGoCheck),
});
export type GoNoGoResult = z.infer<typeof GoNoGoResult>;

/**
 * Pre-flight go / no-go from records on file. Advisory: the pilot in command remains
 * responsible, and logging a flight is never blocked by it.
 */
export function goNoGo(
  s: FleetSnapshot,
  input: { pilotId: string; aircraftId: string; batteryIds: string[] },
  ctx: MapContext,
): GoNoGoResult {
  const r = fleetReadiness(s, ctx);
  const checks: GoNoGoCheck[] = [];
  const pilot = s.pilots.find((p) => p.id === input.pilotId);
  const ps = r.pilots.get(input.pilotId);
  checks.push(
    !pilot || !ps
      ? { key: 'pilot', label: 'Pilot', level: 'red', detail: 'Pilot not found' }
      : { key: 'pilot', label: `Pilot · ${pilot.displayName}`, level: ps.level, detail: ps.reasons[0]?.reason ?? 'Certificate and recurrent training current' },
  );
  const ac = s.aircraft.find((a) => a.id === input.aircraftId);
  const as = r.aircraft.get(input.aircraftId);
  checks.push(
    !ac || !as
      ? { key: 'aircraft', label: 'Aircraft', level: 'red', detail: ac?.status === 'retired' ? 'Aircraft is retired' : 'Aircraft not found' }
      : { key: 'aircraft', label: `Aircraft · ${ac.nickname ?? `${ac.make} ${ac.model}`}`, level: as.level, detail: as.reasons[0]?.reason ?? 'Registered, airworthy, and maintenance current' },
  );
  for (const id of input.batteryIds) {
    const b = s.batteries.find((x) => x.id === id);
    if (!b) {
      checks.push({ key: `battery:${id}`, label: 'Battery', level: 'red', detail: 'Battery not found' });
      continue;
    }
    const limit = b.thresholds.maxCycles;
    const frac = limit ? b.cycleCount / limit : 0;
    const level: ReadinessLevel = b.status === 'retired' || frac >= 1 ? 'red' : b.status === 'watch' || frac >= 0.9 ? 'amber' : 'green';
    checks.push({
      key: `battery:${id}`,
      label: `Battery · ${b.label ?? b.serialNumber}`,
      level,
      detail: b.status === 'retired' ? 'Retired' : limit ? `${b.cycleCount} of ${limit} cycles` : `${b.cycleCount} cycles`,
    });
  }
  const worst = worstLevel(checks.map((c) => c.level));
  return { decision: worst === 'red' ? 'no_go' : worst === 'amber' ? 'caution' : 'go', checks };
}

/** Days until an ISO date from today (negative = past). Re-exported for builders. */
export const daysUntil = (today: string, date: string) => daysBetween(today, date);
