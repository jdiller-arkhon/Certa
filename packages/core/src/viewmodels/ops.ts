/**
 * Ops-console builders: the Today action queue (what needs doing, with the quickest fix) and
 * global search. Pure, like the other builders: the web app, offline mode, and fixtures share them.
 */
import { can } from '../domain/permissions.js';
import type { Flight } from '../domain/entities.js';
import { fleetReadiness, type FleetSnapshot } from '../fleet/fleet.js';
import { displayDate, displayInstant } from '../format/dates.js';
import type { EvaluatedItem } from '../readiness/readiness.js';
import type { BuildInput } from './builders.js';
import type { SearchResult } from './common.js';
import { aircraftName } from './mappers.js';
import type { ActionFix, ActionQueueItem } from './screens.js';

const LEVEL_RANK = { red: 0, amber: 1, green: 2 } as const;

function fixFor(item: EvaluatedItem, s: FleetSnapshot): { fix: ActionFix; actionLabel: string } {
  const [kind, a, b] = item.key.split(':');
  const types = s.rulePack.credentialTypes;
  switch (kind) {
    case 'credential': {
      const c = s.credentials.find((x) => x.id === a);
      const t = types.find((x) => x.id === c?.credentialType);
      if (c && t) return { actionLabel: 'Renew', fix: { kind: 'renew_credential', pilotId: c.pilotId, credentialType: t.id, typeLabel: t.label, expires: !!t.validityRuleId } };
      break;
    }
    case 'credential_missing': {
      const t = types.find((x) => x.id === b);
      if (a && t) return { actionLabel: 'Add', fix: { kind: 'add_credential', pilotId: a, credentialType: t.id, typeLabel: t.label, expires: !!t.validityRuleId } };
      break;
    }
    case 'registration':
    case 'registration_missing': {
      const ac = s.aircraft.find((x) => x.id === a);
      if (ac) return { actionLabel: kind === 'registration' ? 'Renew' : 'Add', fix: { kind: 'renew_registration', aircraftId: ac.id, registrationNumber: ac.registrationNumber } };
      break;
    }
    case 'remote_id_missing':
      if (a) return { actionLabel: 'Set Remote ID', fix: { kind: 'set_remote_id', aircraftId: a } };
      break;
    case 'maintenance': {
      const m = s.maintenanceSchedules.find((x) => x.id === a);
      if (m) return { actionLabel: 'Log work', fix: { kind: 'log_maintenance', scheduleId: m.id, target: `${m.target.type}:${m.target.id}`, scheduleName: m.name } };
      break;
    }
    case 'insurance': {
      const p = s.insurancePolicies.find((x) => x.id === a);
      if (p) return { actionLabel: 'Renew', fix: { kind: 'renew_insurance', policyId: p.id, carrier: p.carrier, expiresOn: p.expiresOn } };
      break;
    }
    case 'grounded':
      if (a) return { actionLabel: 'Return to service', fix: { kind: 'return_to_service', aircraftId: a } };
      break;
  }
  return { actionLabel: 'Open', fix: { kind: 'open' } };
}

/** Everything not current or coming due, worst first, each with its quickest fix. */
export function buildActionQueue(i: BuildInput): ActionQueueItem[] {
  const r = i.readiness ?? fleetReadiness(i.snapshot, i.ctx);
  const { snapshot: s, ctx } = i;
  const rows: (ActionQueueItem & { sort: [number, number] })[] = [];
  const push = (it: EvaluatedItem, subject: string, subjectKind: 'pilot' | 'aircraft', href: string) => {
    if (it.level === 'green') return;
    const { fix, actionLabel } = fixFor(it, s);
    rows.push({
      id: it.key,
      level: it.level,
      subject,
      subjectKind,
      problem: it.reason,
      due: it.dueOn ? displayDate(it.dueOn, ctx.today) : null,
      href,
      actionLabel,
      fix,
      sort: [LEVEL_RANK[it.level], it.daysRemaining ?? -100000],
    });
  };
  for (const p of s.pilots) {
    const sum = r.pilots.get(p.id);
    if (sum) for (const it of sum.items) push(it, p.displayName, 'pilot', `/pilots/${p.id}`);
  }
  for (const a of s.aircraft) {
    const sum = r.aircraft.get(a.id);
    if (sum) for (const it of sum.items) push(it, aircraftName(a), 'aircraft', `/aircraft/${a.id}`);
  }
  return rows.sort((x, y) => x.sort[0] - y.sort[0] || x.sort[1] - y.sort[1]).map(({ sort: _s, ...row }) => row);
}

/** Whether the role may run each fix kind (the UI shows "Open" otherwise). */
export function canFix(role: BuildInput['role']) {
  return can(role, 'credentials.manage') || can(role, 'aircraft.manage') || can(role, 'maintenance.manage');
}

const norm = (v: string | null | undefined) => (v ?? '').toLowerCase();

/** Global search over the snapshot (and recent flights). Prefix matches rank first. */
export function searchFleet(i: BuildInput, query: string, flights: Flight[] = [], limit = 12): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const r = i.readiness ?? fleetReadiness(i.snapshot, i.ctx);
  const { snapshot: s, ctx } = i;
  const hits: (SearchResult & { score: number })[] = [];
  const score = (...fields: (string | null | undefined)[]) => {
    let best = 0;
    for (const f of fields.map(norm)) {
      if (!f) continue;
      if (f.startsWith(q)) best = Math.max(best, 3);
      else if (f.split(/[\s#\-/]+/).some((w) => w.startsWith(q))) best = Math.max(best, 2);
      else if (f.includes(q)) best = Math.max(best, 1);
    }
    return best;
  };
  for (const p of s.pilots.filter((x) => !x.deletedAt)) {
    const sc = score(p.displayName, p.certificateNumber, p.email);
    if (sc) hits.push({ id: p.id, kind: 'pilot', title: p.displayName, subtitle: p.certificateNumber ? `Certificate ${p.certificateNumber}` : 'Pilot', href: `/pilots/${p.id}`, level: r.pilots.get(p.id)?.level ?? null, score: sc + 0.3 });
  }
  for (const a of s.aircraft.filter((x) => !x.deletedAt)) {
    const sc = score(aircraftName(a), a.make, a.model, a.serialNumber, a.registrationNumber);
    if (sc) hits.push({ id: a.id, kind: 'aircraft', title: aircraftName(a), subtitle: [a.make + ' ' + a.model, a.registrationNumber].filter(Boolean).join(', '), href: `/aircraft/${a.id}`, level: r.aircraft.get(a.id)?.level ?? (a.status === 'retired' ? null : 'green'), score: sc + 0.2 });
  }
  for (const b of s.batteries.filter((x) => !x.deletedAt)) {
    const sc = score(b.label, b.serialNumber);
    if (sc) hits.push({ id: b.id, kind: 'battery', title: b.label ?? b.serialNumber, subtitle: `Battery, ${b.cycleCount} cycles`, href: '/batteries', level: null, score: sc + 0.1 });
  }
  const names = new Map(s.aircraft.map((a) => [a.id, aircraftName(a)]));
  for (const f of flights) {
    const sc = score(f.locationName, f.notes);
    if (sc) hits.push({ id: f.id, kind: 'flight', title: f.locationName ?? 'Flight', subtitle: `${displayInstant(f.takeoffAt, f.localTimeZone, ctx.now).absolute}, ${names.get(f.aircraftId) ?? 'aircraft'}`, href: `/flights/${f.id}`, level: null, score: sc });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit).map(({ score: _s, ...h }) => h);
}
