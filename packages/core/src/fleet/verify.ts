/**
 * Pilot / aircraft verification for machine clients (Argus and other integrations): "is this
 * pilot or aircraft legal to fly right now, per records on file?" Same readiness engine as the
 * app, minimal personal data in the answer.
 */
import { z } from 'zod';
import { aircraftName, type MapContext } from '../viewmodels/mappers.js';
import { fleetReadiness, goNoGo, GoNoGoResult, type FleetSnapshot } from './fleet.js';

const Level = z.enum(['green', 'amber', 'red']);

export const VerificationReason = z.object({ level: Level, text: z.string(), dueOn: z.string().nullable() });

export const VerificationResult = z.object({
  subject: z.object({
    type: z.enum(['pilot', 'aircraft']),
    id: z.string(),
    name: z.string(),
    /** Remote pilot certificate number, or aircraft registration. */
    identifier: z.string().nullable(),
  }),
  /** False only when something on file makes it not legal (red). */
  legalToFly: z.boolean(),
  status: Level,
  reasons: z.array(VerificationReason),
  asOf: z.string(),
  checkedAt: z.string(),
  ruleSet: z.string(),
  notice: z.string(),
});
export type VerificationResult = z.infer<typeof VerificationResult>;

export const FlightVerificationResult = z.object({ goNoGo: GoNoGoResult, asOf: z.string(), checkedAt: z.string(), ruleSet: z.string(), notice: z.string() });
export type FlightVerificationResult = z.infer<typeof FlightVerificationResult>;

export const VERIFY_NOTICE = 'Computed from records entered by the operator. Advisory only: the remote pilot in command remains responsible for compliance.';

export function verifySubject(s: FleetSnapshot, subject: { type: 'pilot' | 'aircraft'; id: string }, ctx: MapContext): VerificationResult | null {
  const r = fleetReadiness(s, ctx);
  const base = { asOf: ctx.today, checkedAt: ctx.now.toISOString(), ruleSet: `${s.rulePack.name} v${s.rulePack.version}`, notice: VERIFY_NOTICE };
  if (subject.type === 'pilot') {
    const p = s.pilots.find((x) => x.id === subject.id && !x.deletedAt);
    const sum = p && r.pilots.get(p.id);
    if (!p || !sum) return null;
    return {
      subject: { type: 'pilot', id: p.id, name: p.displayName, identifier: p.certificateNumber },
      legalToFly: sum.level !== 'red' && p.active,
      status: p.active ? sum.level : 'red',
      reasons: [...(p.active ? [] : [{ level: 'red' as const, text: 'Pilot is inactive', dueOn: null }]), ...sum.reasons.map((x) => ({ level: x.level, text: x.reason, dueOn: x.dueOn }))],
      ...base,
    };
  }
  const a = s.aircraft.find((x) => x.id === subject.id && !x.deletedAt);
  if (!a) return null;
  const sum = r.aircraft.get(a.id);
  if (!sum)
    return { subject: { type: 'aircraft', id: a.id, name: aircraftName(a), identifier: a.registrationNumber }, legalToFly: false, status: 'red', reasons: [{ level: 'red', text: 'Aircraft is retired', dueOn: null }], ...base };
  return {
    subject: { type: 'aircraft', id: a.id, name: aircraftName(a), identifier: a.registrationNumber },
    legalToFly: sum.level !== 'red',
    status: sum.level,
    reasons: sum.reasons.map((x) => ({ level: x.level, text: x.reason, dueOn: x.dueOn })),
    ...base,
  };
}

export function verifyFlight(s: FleetSnapshot, input: { pilotId: string; aircraftId: string; batteryIds: string[] }, ctx: MapContext): FlightVerificationResult {
  return { goNoGo: goNoGo(s, input, ctx), asOf: ctx.today, checkedAt: ctx.now.toISOString(), ruleSet: `${s.rulePack.name} v${s.rulePack.version}`, notice: VERIFY_NOTICE };
}
