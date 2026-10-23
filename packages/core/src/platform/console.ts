/**
 * The Arkhon platform console: read-only figures across every organization on Certa, computed
 * from each org's fleet snapshot with the same readiness rules the org itself sees. The API
 * loads one `OrgBundle` per organization; everything here is pure so it can be unit tested and
 * reused for the CSV exports.
 */
import type {
  PlatformComplianceItem,
  PlatformMonth,
  PlatformOverviewResponse,
  PlatformPilotRow,
  PilotHelpFlag,
} from '../api/schemas.js';
import type { ReadinessLevel, Role } from '../domain/enums.js';
import { fleetReadiness, type FleetReadiness, type FleetSnapshot } from '../fleet/fleet.js';
import { addDays, addMonths, daysBetween } from '../format/dates.js';
import type { EvaluatedItem } from '../readiness/readiness.js';
import { credentialExpiry } from '../rules/evaluators.js';
import type { MapContext } from '../viewmodels/mappers.js';

export interface PlatformFlight {
  id: string;
  source: 'certa' | 'argus';
  pilotId: string;
  aircraftId: string | null;
  takeoffAt: string;
  landingAt: string;
  durationSeconds: number;
  locationName: string | null;
  operationType: string | null;
}

export interface PlatformMember {
  membershipId: string;
  userId: string;
  role: Role;
  email: string;
  arkhonUserId: string | null;
  lastSignInAt: string | null;
}

export interface OrgBundle {
  org: { id: string; name: string; createdAt: string };
  snapshot: FleetSnapshot;
  ctx: MapContext;
  /** Certa flights and Argus flights not yet turned into Certa flights, from the loaded window on. */
  flights: PlatformFlight[];
  members: PlatformMember[];
  discordPilotIds: string[];
  /** Waivers and authorizations with an end date, evaluated like any other expiring item. */
  authorizations: { item: EvaluatedItem; pilotId: string | null }[];
}

/** Inclusive UTC date range. */
export interface PlatformPeriod {
  from: string;
  to: string;
}

/** Recurrent training within this many days counts as "due soon". */
export const RECURRENT_SOON_DAYS = 60;


/** Help flags, most urgent first; the order is the directory's default sort. */
export const HELP_FLAG_ORDER: PilotHelpFlag[] = ['recurrent_overdue', 'no_certificate', 'not_cleared', 'recurrent_due_soon', 'never_signed_in', 'argus_waiting', 'inactive_90d'];

export const HELP_FLAG_LABEL: Record<PilotHelpFlag, string> = {
  recurrent_overdue: 'Recurrent training overdue',
  not_cleared: 'Not cleared to fly',
  no_certificate: 'No pilot certificate on file',
  recurrent_due_soon: `Recurrent due within ${RECURRENT_SOON_DAYS} days`,
  never_signed_in: 'Invited, never signed in',
  argus_waiting: 'Argus flights need an aircraft',
  inactive_90d: 'No flights in 90 days',
};

const LEVEL_RANK: Record<ReadinessLevel, number> = { red: 0, amber: 1, green: 2 };
const utcDate = (iso: string) => iso.slice(0, 10);
const inPeriod = (iso: string, p: PlatformPeriod) => {
  const d = utcDate(iso);
  return d >= p.from && d <= p.to;
};

const readinessCache = new WeakMap<OrgBundle, FleetReadiness>();
export function bundleReadiness(b: OrgBundle): FleetReadiness {
  let r = readinessCache.get(b);
  if (!r) readinessCache.set(b, (r = fleetReadiness(b.snapshot, b.ctx)));
  return r;
}

/**
 * From the rule pack: the certificate is a credential required for currency that never expires
 * (Part 107's remote pilot certificate); recurrent training is one required for currency with a
 * validity rule. Each also counts the credentials that satisfy it (e.g. the initial test).
 */
function credentialRoles(r: FleetReadiness) {
  const ids = (expiring: boolean) => new Set(r.rules.pack.credentialTypes.filter((t) => t.requiredForCurrency && !!t.validityRuleId === expiring).flatMap((t) => [t.id, ...t.satisfiedBy]));
  return { certificate: ids(false), recurrent: ids(true) };
}

/** Latest last-valid-day of the pilot's recurrent training (or what satisfies it), if any is on file. */
function recurrentDueOn(b: OrgBundle, pilotId: string, r: FleetReadiness): string | null {
  const { recurrent } = credentialRoles(r);
  const due = b.snapshot.credentials
    .filter((c) => c.pilotId === pilotId && recurrent.has(c.credentialType))
    .map((c) => credentialExpiry(c, r.rules).expiresOn)
    .filter((d): d is string => !!d)
    .sort();
  return due.at(-1) ?? null;
}

export function platformPilotRows(bundles: OrgBundle[], opts: { arkhonAdminBase?: string | null } = {}): PlatformPilotRow[] {
  const rows: PlatformPilotRow[] = [];
  for (const b of bundles) {
    const r = bundleReadiness(b);
    const today = b.ctx.today;
    const discord = new Set(b.discordPilotIds);
    for (const p of b.snapshot.pilots) {
      const member = p.membershipId ? b.members.find((m) => m.membershipId === p.membershipId) : undefined;
      const summary = r.pilots.get(p.id);
      const totals = b.snapshot.pilotTotals[p.id];
      const level = summary?.level ?? 'green';
      const due = recurrentDueOn(b, p.id, r);
      const { certificate } = credentialRoles(r);
      const certificateOnFile = !certificate.size || b.snapshot.credentials.some((c) => c.pilotId === p.id && certificate.has(c.credentialType));
      const argusWaiting = b.snapshot.externalFlights.filter((e) => e.pilotId === p.id).length;
      const account = !member ? 'no_account' : member.lastSignInAt ? 'active' : 'invited';
      const flags = new Set<PilotHelpFlag>();
      if (p.active) {
        if (due && due < today) flags.add('recurrent_overdue');
        if (level === 'red') flags.add('not_cleared');
        if (!certificateOnFile) flags.add('no_certificate');
        if (due && due >= today && daysBetween(today, due) <= RECURRENT_SOON_DAYS) flags.add('recurrent_due_soon');
        if (account === 'invited') flags.add('never_signed_in');
        if (argusWaiting) flags.add('argus_waiting');
        if ((totals?.last90DaysFlights ?? 0) === 0) flags.add('inactive_90d');
      }
      rows.push({
        orgId: b.org.id,
        orgName: b.org.name,
        pilotId: p.id,
        name: p.displayName,
        email: member?.email ?? p.email,
        role: member?.role ?? null,
        active: p.active,
        level,
        reason: summary?.reasons[0]?.reason ?? null,
        certificateOnFile,
        recurrentDueOn: due,
        flights: totals?.flights ?? 0,
        flightSeconds: totals?.flightSeconds ?? 0,
        last90DaysFlights: totals?.last90DaysFlights ?? 0,
        lastFlightAt: totals?.lastFlightAt ?? null,
        argusWaiting,
        account,
        lastSignInAt: member?.lastSignInAt ?? null,
        arkhonLinked: !!member?.arkhonUserId,
        arkhonAdminUrl: member?.arkhonUserId && opts.arkhonAdminBase ? `${opts.arkhonAdminBase}/app/admin/users/${encodeURIComponent(member.arkhonUserId)}` : null,
        discordLinked: discord.has(p.id),
        helpFlags: HELP_FLAG_ORDER.filter((f) => flags.has(f)),
      });
    }
  }
  // Pilots who need a hand first, then by readiness, then by name.
  const urgency = (row: PlatformPilotRow) => (row.helpFlags.length ? HELP_FLAG_ORDER.indexOf(row.helpFlags[0]!) : HELP_FLAG_ORDER.length);
  return rows.sort((a, b) => urgency(a) - urgency(b) || LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.name.localeCompare(b.name));
}

/** Everything not green, or due within `windowDays`, across pilots, aircraft and authorizations. */
export function platformComplianceItems(bundles: OrgBundle[], windowDays: number): PlatformComplianceItem[] {
  const out: PlatformComplianceItem[] = [];
  const keep = (i: EvaluatedItem) => i.level !== 'green' || (i.daysRemaining != null && i.daysRemaining <= windowDays);
  for (const b of bundles) {
    const r = bundleReadiness(b);
    const base = { orgId: b.org.id, orgName: b.org.name };
    const push = (i: EvaluatedItem, subjectType: PlatformComplianceItem['subjectType'], subjectId: string, subject: string, pilotId: string | null) =>
      out.push({ ...base, subjectType, subjectId, subject, pilotId, kind: i.kind, label: i.label, dueOn: i.dueOn, daysRemaining: i.daysRemaining, level: i.level, reason: i.reason });
    for (const p of b.snapshot.pilots.filter((x) => x.active)) {
      for (const i of r.pilots.get(p.id)?.items.filter(keep) ?? []) push(i, 'pilot', p.id, p.displayName, p.id);
    }
    for (const a of b.snapshot.aircraft.filter((x) => x.status !== 'retired')) {
      for (const i of r.aircraft.get(a.id)?.items.filter(keep) ?? []) push(i, 'aircraft', a.id, a.nickname ?? `${a.make} ${a.model}`, null);
    }
    for (const { item, pilotId } of b.authorizations.filter((x) => keep(x.item))) {
      const pilot = pilotId ? b.snapshot.pilots.find((p) => p.id === pilotId) : undefined;
      push(item, pilot ? 'pilot' : 'organization', pilot?.id ?? b.org.id, pilot?.displayName ?? b.org.name, pilot?.id ?? null);
    }
  }
  // Overdue and blocking first, then soonest due.
  const sortKey = (i: PlatformComplianceItem) => (i.daysRemaining == null ? (i.level === 'red' ? -100000 : 100000) : i.daysRemaining);
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || sortKey(a) - sortKey(b) || a.subject.localeCompare(b.subject));
}

/** The `count` calendar months (UTC) ending with the month containing `to`, oldest first. */
export function monthsEnding(to: string, count: number): string[] {
  const first = `${to.slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, i) => addMonths(first, i - count + 1).slice(0, 7));
}

export function platformMonthlySeries(bundles: OrgBundle[], months: string[], filter?: (b: OrgBundle, f: PlatformFlight) => boolean): PlatformMonth[] {
  const by = new Map(months.map((m) => [m, { month: m, flights: 0, flightSeconds: 0, pilots: new Set<string>(), argusFlights: 0, newPilots: 0 }]));
  for (const b of bundles) {
    for (const f of b.flights) {
      if (filter && !filter(b, f)) continue;
      const m = by.get(f.takeoffAt.slice(0, 7));
      if (!m) continue;
      m.flights += 1;
      m.flightSeconds += f.durationSeconds;
      m.pilots.add(f.pilotId);
      if (f.source === 'argus') m.argusFlights += 1;
    }
    if (!filter) for (const p of b.snapshot.pilots) {
      const m = by.get(p.createdAt.slice(0, 7));
      if (m) m.newPilots += 1;
    }
  }
  return [...by.values()].map(({ pilots, ...m }) => ({ ...m, pilotsFlown: pilots.size }));
}

/** Default period: the last 30 days, ending today (UTC). */
export function defaultPlatformPeriod(now: Date): PlatformPeriod {
  const to = now.toISOString().slice(0, 10);
  return { from: addDays(to, -29), to };
}

export function platformOverview(bundles: OrgBundle[], period: PlatformPeriod, now: Date): PlatformOverviewResponse {
  const rows = platformPilotRows(bundles);
  const active = rows.filter((r) => r.active);
  const thirtyAgo = addDays(now.toISOString().slice(0, 10), -29);
  const periodFlights = bundles.flatMap((b) => b.flights.filter((f) => inPeriod(f.takeoffAt, period)).map((f) => ({ b, f })));
  const byPilot = new Map<string, { b: OrgBundle; flights: number; seconds: number }>();
  for (const { b, f } of periodFlights) {
    const key = `${b.org.id}:${f.pilotId}`;
    const t = byPilot.get(key) ?? { b, flights: 0, seconds: 0 };
    t.flights += 1;
    t.seconds += f.durationSeconds;
    byPilot.set(key, t);
  }
  const level = (rs: PlatformPilotRow[]) => ({ green: rs.filter((r) => r.level === 'green').length, amber: rs.filter((r) => r.level === 'amber').length, red: rs.filter((r) => r.level === 'red').length });
  return {
    generatedAt: now.toISOString(),
    period: {
      ...period,
      flights: periodFlights.length,
      flightSeconds: periodFlights.reduce((s, x) => s + x.f.durationSeconds, 0),
      pilotsFlown: byPilot.size,
      argusFlights: periodFlights.filter((x) => x.f.source === 'argus').length,
      newPilots: bundles.reduce((s, b) => s + b.snapshot.pilots.filter((p) => inPeriod(p.createdAt, period)).length, 0),
    },
    totals: {
      organizations: bundles.length,
      pilots: active.length,
      activePilots30d: new Set(bundles.flatMap((b) => b.flights.filter((f) => utcDate(f.takeoffAt) >= thirtyAgo).map((f) => `${b.org.id}:${f.pilotId}`))).size,
      aircraft: bundles.reduce((s, b) => s + b.snapshot.aircraft.filter((a) => a.status !== 'retired').length, 0),
      flights: active.reduce((s, r) => s + r.flights, 0),
      flightSeconds: active.reduce((s, r) => s + r.flightSeconds, 0),
      arkhonLinked: active.filter((r) => r.arkhonLinked).length,
      discordLinked: active.filter((r) => r.discordLinked).length,
      neverSignedIn: active.filter((r) => r.account === 'invited').length,
    },
    readiness: level(active),
    pilotsNeedingHelp: active.filter((r) => r.helpFlags.length).length,
    dueIn30Days: platformComplianceItems(bundles, 30).length,
    monthly: platformMonthlySeries(bundles, monthsEnding(period.to, 12)),
    topPilots: [...byPilot.entries()]
      .sort((a, b) => b[1].seconds - a[1].seconds || b[1].flights - a[1].flights)
      .slice(0, 5)
      .map(([key, t]) => {
        const pilotId = key.split(':')[1]!;
        return { orgId: t.b.org.id, pilotId, name: t.b.snapshot.pilots.find((p) => p.id === pilotId)?.displayName ?? 'Pilot', orgName: t.b.org.name, flights: t.flights, flightSeconds: t.seconds };
      }),
    organizations: bundles
      .map((b) => {
        const mine = active.filter((r) => r.orgId === b.org.id);
        const flights = periodFlights.filter((x) => x.b === b);
        return {
          orgId: b.org.id,
          name: b.org.name,
          pilots: mine.length,
          aircraft: b.snapshot.aircraft.filter((a) => a.status !== 'retired').length,
          flights: flights.length,
          flightSeconds: flights.reduce((s, x) => s + x.f.durationSeconds, 0),
          readiness: level(mine),
        };
      })
      .sort((a, b) => b.flightSeconds - a.flightSeconds || b.pilots - a.pilots || a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------- CSV exports

const hours = (seconds: number) => (seconds / 3600).toFixed(2);
const aircraftName = (b: OrgBundle, id: string | null) => {
  const a = id ? b.snapshot.aircraft.find((x) => x.id === id) : undefined;
  return a ? (a.nickname ?? `${a.make} ${a.model}`) : '';
};
const pilotName = (b: OrgBundle, id: string) => b.snapshot.pilots.find((p) => p.id === id)?.displayName ?? '';

export const PLATFORM_EXPORT_INFO: Record<string, { title: string; description: string; usesPeriod: boolean }> = {
  flights: { title: 'Flights', description: 'Every flight in the period, Certa and Argus, with pilot, aircraft and duration.', usesPeriod: true },
  pilots: { title: 'Pilot directory', description: 'Every pilot with readiness, recurrent due date, totals, account and help flags.', usesPeriod: false },
  'pilot-hours': { title: 'Pilot hours by month', description: 'Flight hours per pilot for each month in the period.', usesPeriod: true },
  monthly: { title: 'Monthly summary', description: 'Flights, hours, pilots flown, Argus flights and new pilots per month.', usesPeriod: true },
  organizations: { title: 'Organizations', description: 'Each organization’s pilots, aircraft, readiness and activity in the period.', usesPeriod: true },
  aircraft: { title: 'Aircraft', description: 'Every aircraft with registration, status, hours and readiness.', usesPeriod: false },
  compliance: { title: 'Compliance due', description: 'Everything overdue or due in the next 90 days, across all organizations.', usesPeriod: false },
};

/** Rows for one CSV export (first row is the header). Months in the period are UTC months. */
export function platformExportRows(dataset: string, bundles: OrgBundle[], period: PlatformPeriod, now: Date): unknown[][] {
  switch (dataset) {
    case 'flights':
      return [
        ['Organization', 'Flight ID', 'Source', 'Date (UTC)', 'Takeoff (UTC)', 'Landing (UTC)', 'Duration (min)', 'Pilot', 'Aircraft', 'Location', 'Operation'],
        ...bundles
          .flatMap((b) => b.flights.filter((f) => inPeriod(f.takeoffAt, period)).map((f) => ({ b, f })))
          .sort((x, y) => y.f.takeoffAt.localeCompare(x.f.takeoffAt))
          .map(({ b, f }) => [b.org.name, f.id, f.source === 'argus' ? 'Argus' : 'Certa', utcDate(f.takeoffAt), f.takeoffAt, f.landingAt, Math.round(f.durationSeconds / 60), pilotName(b, f.pilotId), aircraftName(b, f.aircraftId), f.locationName ?? '', f.operationType ?? '']),
      ];
    case 'pilots':
      return [
        ['Organization', 'Pilot', 'Email', 'Role', 'Active', 'Readiness', 'Reason', 'Part 107 on file', 'Recurrent due', 'Flights', 'Hours', 'Flights (90 days)', 'Last flight', 'Argus flights waiting', 'Account', 'Last sign-in', 'Arkhon linked', 'Discord linked', 'Needs a hand'],
        ...platformPilotRows(bundles).map((r) => [r.orgName, r.name, r.email ?? '', r.role ?? '', r.active ? 'yes' : 'no', r.level, r.reason ?? '', r.certificateOnFile ? 'yes' : 'no', r.recurrentDueOn ?? '', r.flights, hours(r.flightSeconds), r.last90DaysFlights, r.lastFlightAt ?? '', r.argusWaiting, r.account, r.lastSignInAt ?? '', r.arkhonLinked ? 'yes' : 'no', r.discordLinked ? 'yes' : 'no', r.helpFlags.map((f) => HELP_FLAG_LABEL[f]).join('; ')]),
      ];
    case 'pilot-hours': {
      const months = monthsBetween(period);
      const rows: unknown[][] = [['Organization', 'Pilot', ...months, 'Total']];
      for (const b of bundles) {
        for (const p of b.snapshot.pilots) {
          const secs = months.map((m) => b.flights.filter((f) => f.pilotId === p.id && f.takeoffAt.startsWith(m) && inPeriod(f.takeoffAt, period)).reduce((s, f) => s + f.durationSeconds, 0));
          const total = secs.reduce((s, x) => s + x, 0);
          if (total || p.active) rows.push([b.org.name, p.displayName, ...secs.map(hours), hours(total)]);
        }
      }
      return rows;
    }
    case 'monthly':
      return [
        ['Month (UTC)', 'Flights', 'Hours', 'Pilots flown', 'Argus flights', 'New pilots'],
        ...platformMonthlySeries(bundles, monthsBetween(period)).map((m) => [m.month, m.flights, hours(m.flightSeconds), m.pilotsFlown, m.argusFlights, m.newPilots]),
      ];
    case 'organizations':
      return [
        ['Organization', 'Pilots', 'Aircraft', 'Ready', 'Attention', 'Not cleared', `Flights ${period.from} to ${period.to}`, 'Hours in period'],
        ...platformOverview(bundles, period, now).organizations.map((o) => [o.name, o.pilots, o.aircraft, o.readiness.green, o.readiness.amber, o.readiness.red, o.flights, hours(o.flightSeconds)]),
      ];
    case 'aircraft':
      return [
        ['Organization', 'Aircraft', 'Make', 'Model', 'Serial', 'Registration', 'Registration expires', 'Status', 'Flights', 'Hours', 'Readiness', 'Reason'],
        ...bundles.flatMap((b) => {
          const r = bundleReadiness(b);
          return b.snapshot.aircraft.map((a) => {
            const s = r.aircraft.get(a.id);
            return [b.org.name, a.nickname ?? '', a.make, a.model, a.serialNumber, a.registrationNumber ?? '', a.registrationExpiresOn ?? '', a.status, a.totalFlights, hours(a.totalFlightSeconds), s?.level ?? '', s?.reasons[0]?.reason ?? ''];
          });
        }),
      ];
    case 'compliance':
      return [
        ['Organization', 'Subject', 'Type', 'Item', 'Due', 'Days remaining', 'Status', 'Detail'],
        ...platformComplianceItems(bundles, 90).map((i) => [i.orgName, i.subject, i.subjectType, i.label, i.dueOn ?? '', i.daysRemaining ?? '', i.level, i.reason]),
      ];
    default:
      throw new Error(`Unknown export ${dataset}`);
  }
}

/** Every UTC month touching the period, oldest first. */
export function monthsBetween(p: PlatformPeriod): string[] {
  const out: string[] = [];
  for (let m = `${p.from.slice(0, 7)}-01`; m.slice(0, 7) <= p.to.slice(0, 7) && out.length < 120; m = addMonths(m, 1)) out.push(m.slice(0, 7));
  return out;
}
