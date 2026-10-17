/**
 * Mission readiness: can this crew fly these aircraft under these authorizations, at this place
 * and time? Credentials and maintenance are evaluated on the mission's date, so a certificate
 * that lapses before a mission next month shows up today. Advisory, like go/no-go: it never
 * blocks logging.
 */
import type { ReadinessLevel } from '../domain/enums.js';
import { dateInZone } from '../format/dates.js';
import { worstLevel } from '../readiness/readiness.js';
import type { MapContext } from '../viewmodels/mappers.js';
import { fleetReadiness, type FleetSnapshot, type GoNoGoCheck } from './fleet.js';

/** Part 107.51(b): 400 ft AGL unless within 400 ft of a structure, or under a waiver. */
export const PART107_MAX_AGL_M = 121.92;

export interface MissionPlan {
  plannedStart: string | null;
  plannedEnd: string | null;
  status: 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  crew: { pilotId: string; role: 'pic' | 'observer' }[];
  aircraftIds: string[];
  authorizationIds: string[];
  location: { lat: number; lon: number } | null;
  maxAltitudeAglM: number | null;
}

export interface MissionAuthorization {
  id: string;
  kind: 'laanc' | 'airspace_authorization' | 'waiver' | 'coa' | 'other';
  reference: string;
  validFrom: string | null;
  validTo: string | null;
  pilotId: string | null;
  deletedAt: string | null;
}

export interface MissionReadiness {
  level: ReadinessLevel;
  label: string;
  checks: GoNoGoCheck[];
}

const LABEL: Record<ReadinessLevel, string> = { green: 'Ready', amber: 'Check before flying', red: 'Not ready' };

export function missionReadiness(s: FleetSnapshot, m: MissionPlan, auths: MissionAuthorization[], ctx: MapContext): MissionReadiness {
  // Credentials and maintenance as they will stand on the day (today for missions under way or past).
  const day = m.plannedStart ? dateInZone(m.plannedStart, ctx.orgTimeZone) : ctx.today;
  const on = day > ctx.today ? day : ctx.today;
  const r = fleetReadiness(s, { ...ctx, today: on });
  const checks: GoNoGoCheck[] = [];
  const t = ctx.now.getTime();
  const open = m.status === 'draft' || m.status === 'planned';

  if (!m.plannedStart || !m.plannedEnd) checks.push({ key: 'window', label: 'When', level: 'amber', detail: 'No date and time set' });
  else if (open && Date.parse(m.plannedEnd) < t) checks.push({ key: 'window', label: 'When', level: 'amber', detail: 'The planned window has passed' });

  const pic = m.crew.find((c) => c.role === 'pic');
  if (!pic) checks.push({ key: 'pic', label: 'Pilot in command', level: 'red', detail: 'No pilot in command assigned' });
  for (const c of m.crew) {
    const p = s.pilots.find((x) => x.id === c.pilotId && !x.deletedAt);
    const sum = r.pilots.get(c.pilotId);
    const role = c.role === 'pic' ? 'Pilot in command' : 'Visual observer';
    if (!p || !sum || !p.active) {
      checks.push({ key: `crew:${c.pilotId}`, label: role, level: 'red', detail: p ? `${p.displayName} is inactive` : 'Pilot not found' });
      continue;
    }
    // Observers need no certificate under Part 107; only the pilot in command's credentials count.
    if (c.role === 'observer') {
      checks.push({ key: `crew:${c.pilotId}`, label: `${role} · ${p.displayName}`, level: 'green', detail: 'On the crew' });
      continue;
    }
    checks.push({ key: `crew:${c.pilotId}`, label: `${role} · ${p.displayName}`, level: sum.level, detail: sum.reasons[0]?.reason ?? (on > ctx.today ? 'Current on the mission date' : 'Certificate and recurrent training current') });
  }

  if (!m.aircraftIds.length) checks.push({ key: 'aircraft', label: 'Aircraft', level: 'red', detail: 'No aircraft assigned' });
  for (const id of m.aircraftIds) {
    const a = s.aircraft.find((x) => x.id === id && !x.deletedAt);
    const sum = r.aircraft.get(id);
    if (!a || !sum) {
      checks.push({ key: `aircraft:${id}`, label: 'Aircraft', level: 'red', detail: a?.status === 'retired' ? `${a.nickname ?? a.model} is retired` : 'Aircraft not found' });
      continue;
    }
    checks.push({ key: `aircraft:${id}`, label: `Aircraft · ${a.nickname ?? `${a.make} ${a.model}`}`, level: sum.level, detail: sum.reasons[0]?.reason ?? 'Registered, airworthy, and maintenance current' });
  }

  const crewIds = new Set(m.crew.map((c) => c.pilotId));
  for (const id of m.authorizationIds) {
    const a = auths.find((x) => x.id === id);
    if (!a || a.deletedAt) {
      checks.push({ key: `auth:${id}`, label: 'Authorization', level: 'red', detail: 'Authorization was deleted' });
      continue;
    }
    const label = `Authorization · ${a.reference}`;
    const start = m.plannedStart ? Date.parse(m.plannedStart) : t;
    const end = m.plannedEnd ? Date.parse(m.plannedEnd) : start;
    if (a.validTo && Date.parse(a.validTo) < end) checks.push({ key: `auth:${id}`, label, level: 'red', detail: Date.parse(a.validTo) <= t ? 'Expired' : 'Expires before the mission ends' });
    else if (a.validFrom && Date.parse(a.validFrom) > start) checks.push({ key: `auth:${id}`, label, level: 'red', detail: 'Not valid yet when the mission starts' });
    else if (a.pilotId && !crewIds.has(a.pilotId)) checks.push({ key: `auth:${id}`, label, level: 'amber', detail: 'Issued to a pilot who is not on the crew' });
    else checks.push({ key: `auth:${id}`, label, level: 'green', detail: 'Covers the planned window' });
  }

  if (m.maxAltitudeAglM != null && m.maxAltitudeAglM > PART107_MAX_AGL_M + 0.5) {
    const waiver = m.authorizationIds.some((id) => ['waiver', 'coa'].includes(auths.find((a) => a.id === id && !a.deletedAt)?.kind ?? ''));
    checks.push(
      waiver
        ? { key: 'altitude', label: 'Altitude', level: 'green', detail: 'Above 400 ft AGL under the attached waiver or COA' }
        : { key: 'altitude', label: 'Altitude', level: 'amber', detail: 'Above 400 ft AGL: only within 400 ft of a structure, or attach a waiver' },
    );
  }

  if (!m.location) checks.push({ key: 'location', label: 'Location', level: 'amber', detail: 'No location set, so airspace and weather can’t be checked' });

  const level = worstLevel(checks.map((c) => c.level));
  return { level, label: LABEL[level], checks };
}
