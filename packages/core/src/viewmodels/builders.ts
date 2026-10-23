/**
 * Screen builders: fleet snapshot (+ flights) → screen view-models. The web containers, the
 * offline app, and the contract fixtures all use these, so a screen renders real data exactly
 * the way it renders the fixtures. Builders return the data half of each screen's props; the
 * container adds the callbacks.
 */
import { can } from '../domain/permissions.js';
import { buildGettingStarted } from './help.js';
import type { ChecklistTemplate, Flight, MaintenanceEvent, WeatherSnapshot } from '../domain/entities.js';
import type { AuthorizationRecord, FlightChecklist, MissionRecord } from '../api/schemas.js';
import { missionReadiness } from '../fleet/mission.js';
import type { Role, UnitsPreference } from '../domain/enums.js';
import { fleetReadiness, maintenanceItems, type FleetReadiness, type FleetSnapshot, type GoNoGoResult } from '../fleet/fleet.js';
import { addDays, dateInZone, displayDate, displayInstant } from '../format/dates.js';
import { formatDuration, formatLength, formatMass, formatSpeed, formatTemperature, metresTo } from '../format/units.js';
import { DEFAULT_READINESS_POLICY, evaluateItem, type ReadinessSummary } from '../readiness/readiness.js';
import type { EmptyState, Paged, StatusBadge } from './common.js';
import { buildActionQueue, canFix } from './ops.js';
import {
  aircraftName,
  airframeOf,
  badgeFromSummary,
  reasonFromItem,
  toAircraftReadinessRow,
  toAircraftRow,
  toBatteryRow,
  toCredentialViewModel,
  toFlightRow,
  toPilotReadinessRow,
  toPilotRow,
  userChip,
  type MapContext,
} from './mappers.js';
import type {
  AircraftDetailScreenProps,
  AircraftListScreenProps,
  BatteryListScreenProps,
  FlightDetailScreenProps,
  FlightChecklistViewModel,
  ChecklistViewModel,
  ChecklistsAdminScreenProps,
  AuthorizationsScreenProps,
  AuthorizationRowViewModel,
  MissionDetailScreenProps,
  MissionFormScreenProps,
  MissionRowViewModel,
  MissionsScreenProps,
  FlightListScreenProps,
  FlightRowViewModel,
  InsuranceScreenProps,
  LogFlightScreenProps,
  MaintenanceScreenProps,
  PilotDetailScreenProps,
  PilotListScreenProps,
  ReadinessDashboardScreenProps,
} from './screens.js';

/** The data half of a screen's props (everything except `on…` callbacks). */
export type ScreenData<T> = { [K in keyof T as K extends `on${string}` ? never : K]: T[K] };

export interface BuildInput {
  snapshot: FleetSnapshot;
  ctx: MapContext;
  role: Role;
  /** Pass a precomputed readiness when building several screens from one snapshot. */
  readiness?: FleetReadiness;
}

const OK = { loading: false, error: null } as const;
const empty = (title: string, body: string, actionLabel: string | null): EmptyState => ({ title, body, actionLabel });

const emptyShare = (role: Role) => ({ canShare: can(role, 'exports.create'), links: [], createdUrl: null, creating: false });

const readinessOf = (i: BuildInput) => i.readiness ?? fleetReadiness(i.snapshot, i.ctx);

export function fleetNames(s: FleetSnapshot) {
  const pilots = new Map(s.pilots.map((p) => [p.id, p.displayName]));
  const aircraft = new Map(s.aircraft.map((a) => [a.id, aircraftName(a)]));
  return {
    pilot: (id: string) => pilots.get(id) ?? 'Unknown pilot',
    aircraft: (id: string) => aircraft.get(id) ?? 'Unknown aircraft',
  };
}

export function flightRows(i: BuildInput, flights: (Flight & { pendingSync?: boolean })[]): FlightRowViewModel[] {
  const n = fleetNames(i.snapshot);
  return flights.map((f) => toFlightRow(f, { pilot: n.pilot(f.pilotInCommandId), aircraft: n.aircraft(f.aircraftId) }, i.ctx, !!f.pendingSync));
}

export const OVERALL_LABEL = {
  green: 'Everyone is legal to fly',
  amber: 'Attention needed soon',
  red: 'Some pilots or aircraft are not legal to fly',
} as const;

export function buildReadinessDashboard(i: BuildInput, opts: { ownPilotId?: string | null } = {}): ScreenData<ReadinessDashboardScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const n = fleetNames(s);
  const aircraft = s.aircraft.filter((a) => r.aircraft.has(a.id));
  // Until anything is tracked (no aircraft, no credentials), show first-run onboarding rather
  // than flagging the owner's auto-created pilot record as not current.
  const nothingTracked = aircraft.length === 0 && !s.credentials.some((c) => !c.deletedAt);
  const pilots = nothingTracked ? [] : s.pilots.filter((p) => r.pilots.has(p.id));
  const upcoming = [
    ...pilots.flatMap((p) => r.pilots.get(p.id)!.items.map((it) => ({ it, subject: n.pilot(p.id), href: `/pilots/${p.id}` }))),
    ...aircraft.flatMap((a) => r.aircraft.get(a.id)!.items.map((it) => ({ it, subject: n.aircraft(a.id), href: `/aircraft/${a.id}` }))),
  ]
    .filter(({ it }) => it.dueOn && it.daysRemaining! <= 90)
    .sort((a, b) => a.it.dueOn!.localeCompare(b.it.dueOn!))
    .map(({ it, subject, href }) => ({ label: it.label, subject, due: displayDate(it.dueOn!, ctx.today), level: it.level, href }));
  return {
    ...OK,
    asOf: displayDate(ctx.today, ctx.today),
    overall: nothingTracked ? { level: 'green', label: 'Nothing tracked yet' } : { level: r.overall, label: OVERALL_LABEL[r.overall] },
    counts: nothingTracked ? { green: 0, amber: 0, red: 0 } : r.counts,
    pilots: pilots.map((p) => toPilotReadinessRow(p, r.pilots.get(p.id)!, ctx)),
    aircraft: aircraft.map((a) => toAircraftReadinessRow(a, r.aircraft.get(a.id)!, ctx)),
    upcoming,
    actions: nothingTracked ? [] : buildActionQueue({ ...i, readiness: r }),
    fixing: [],
    activity: {
      last7: s.recentFlightCounts.last7,
      last30: s.recentFlightCounts.last30,
      lastFlight: s.lastFlight
        ? { label: [n.aircraft(s.lastFlight.aircraftId), s.lastFlight.locationName].filter(Boolean).join(', '), when: displayInstant(s.lastFlight.takeoffAt, s.lastFlight.localTimeZone, ctx.now), href: `/flights/${s.lastFlight.id}` }
        : null,
    },
    canFix: canFix(i.role),
    empty: opts.ownPilotId
      ? empty('Let’s get you ready to fly', 'Certa keeps your drone records in one place and tells you, before every flight, whether you and your drone are good to go. Four quick steps to set up.', 'Add your drone')
      : empty('Add your first pilot and aircraft', 'Certa tracks certificates, registrations, and maintenance so you know who and what is legal to fly today.', 'Add aircraft'),
    gettingStarted: (() => {
      const g = buildGettingStarted(s, opts.ownPilotId ?? null);
      return g && !g.complete ? g : null;
    })(),
  };
}

const matches = (q: string, ...fields: (string | null | undefined)[]) => {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle));
};

const totalsOf = (s: FleetSnapshot, pilotId: string) =>
  s.pilotTotals[pilotId] ?? { flights: 0, flightSeconds: 0, lastFlightAt: null, last90DaysFlights: 0, missions: 0 };

/** Prior-experience entries for a pilot (newest first) and their sums. */
const priorOf = (s: FleetSnapshot, pilotId: string) => {
  const entries = (s.priorExperience ?? []).filter((x) => x.pilotId === pilotId && !x.deletedAt).sort((a, b) => b.asOf.localeCompare(a.asOf));
  return {
    entries,
    flights: entries.reduce((n, x) => n + x.flights, 0),
    missions: entries.reduce((n, x) => n + x.missions, 0),
    seconds: entries.reduce((n, x) => n + x.flightSeconds, 0),
  };
};

export function buildPilotList(i: BuildInput, search = ''): ScreenData<PilotListScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  return {
    ...OK,
    pilots: s.pilots
      .filter((p) => r.pilots.has(p.id) && matches(search, p.displayName, p.certificateNumber, p.email))
      .map((p) => {
        const t = totalsOf(s, p.id);
        return toPilotRow(p, r.pilots.get(p.id)!, { flightSeconds: t.flightSeconds + priorOf(s, p.id).seconds, lastFlightAt: t.lastFlightAt }, ctx);
      }),
    search,
    canManage: can(i.role, 'pilots.manage'),
    empty: empty('No pilots yet', 'Add pilots to track their certificates, recurrent training, and flight time.', 'Add pilot'),
  };
}

export function buildPilotDetail(i: BuildInput, pilotId: string, recentFlights: Flight[], opts: { ownPilotId?: string | null } = {}): ScreenData<PilotDetailScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const p = s.pilots.find((x) => x.id === pilotId && !x.deletedAt);
  const summary = p ? r.pilots.get(p.id) : undefined;
  const t = totalsOf(s, pilotId);
  const prior = priorOf(s, pilotId);
  // Argus mission flights still waiting for the drone; already counted in the pilot's totals.
  const argus = (s.externalFlights ?? []).filter((x) => x.pilotId === pilotId && !x.deletedAt).sort((a, b) => b.takeoffAt.localeCompare(a.takeoffAt));
  const argusSeconds = argus.reduce((n, x) => n + x.durationSeconds, 0);
  return {
    ...OK,
    pilot:
      p && summary
        ? {
            id: p.id,
            name: p.displayName,
            email: p.email,
            phone: p.phone,
            certificateNumber: p.certificateNumber,
            status: badgeFromSummary(summary),
            reasons: summary.reasons.map((x) => reasonFromItem(x, ctx.today, `/pilots/${p.id}`)),
            totals: {
              flights: t.flights + prior.flights,
              missions: t.missions + prior.missions,
              flightTime: formatDuration(t.flightSeconds + prior.seconds),
              last90DaysFlights: t.last90DaysFlights,
            },
            logged: { flights: t.flights, missions: t.missions, flightTime: formatDuration(t.flightSeconds) },
            prior: prior.entries.length ? { flights: prior.flights, missions: prior.missions, flightTime: formatDuration(prior.seconds) } : null,
            argus: argus.length ? { flights: argus.length, flightTime: formatDuration(argusSeconds) } : null,
          }
        : null,
    credentials: s.credentials.filter((c) => c.pilotId === pilotId && !c.deletedAt).map((c) => toCredentialViewModel(c, r.rules, ctx)),
    priorExperience: prior.entries.map((x) => ({
      id: x.id,
      source: x.source,
      flights: x.flights,
      missions: x.missions,
      flightTime: formatDuration(x.flightSeconds),
      flightSeconds: x.flightSeconds,
      asOf: displayDate(x.asOf, ctx.today),
      notes: x.notes,
    })),
    argusFlights: argus.map((x) => ({
      id: x.id,
      reference: x.reference ?? 'Argus mission',
      date: displayDate(x.takeoffAt.slice(0, 10), ctx.today),
      flightTime: formatDuration(x.durationSeconds),
      location: x.locationName,
    })),
    aircraftOptions: s.aircraft.filter((a) => !a.deletedAt && a.status !== 'retired').map((a) => ({ value: a.id, label: aircraftName(a) })),
    canConvertArgus: can(i.role, 'flights.log', { actorPilotId: opts.ownPilotId ?? null, resourcePilotId: pilotId }),
    recentFlights: flightRows(i, recentFlights.filter((f) => f.pilotInCommandId === pilotId).slice(0, 10)),
    credentialTypeOptions: r.rules.pack.credentialTypes.map((ct) => ({ value: ct.id, label: ct.label, expires: ct.validityRuleId !== null })),
    canEdit: can(i.role, 'credentials.manage'),
    share: emptyShare(i.role),
  };
}

export function buildAircraftList(i: BuildInput, search = '', statusFilter: AircraftListScreenProps['statusFilter'] = 'all'): ScreenData<AircraftListScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s } = i;
  const retiredSummary: ReadinessSummary = { level: 'green', items: [], reasons: [] };
  return {
    ...OK,
    aircraft: s.aircraft
      .filter((a) => !a.deletedAt && (statusFilter === 'all' || a.status === statusFilter) && matches(search, a.nickname, a.make, a.model, a.serialNumber, a.registrationNumber))
      .map((a) => toAircraftRow(a, r.aircraft.get(a.id) ?? retiredSummary)),
    search,
    statusFilter,
    insuranceOptions: s.insurancePolicies.filter((p) => !p.deletedAt).map((p) => ({ value: p.id, label: `${p.carrier} · ${p.policyNumber}` })),
    canManage: can(i.role, 'aircraft.manage'),
    empty: empty('No aircraft yet', 'Add an aircraft to track its registration, Remote ID, flight hours, and maintenance.', 'Add aircraft'),
  };
}

export const REMOTE_ID_LABEL: Record<string, string> = {
  standard: 'Standard Remote ID',
  broadcast_module: 'Broadcast module',
  fria: 'FRIA only (no Remote ID equipment)',
  none: 'None',
};

export function buildAircraftDetail(i: BuildInput, aircraftId: string, recentFlights: Flight[], maintenanceEvents: MaintenanceEvent[] = []): ScreenData<AircraftDetailScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const a = s.aircraft.find((x) => x.id === aircraftId && !x.deletedAt);
  const summary: ReadinessSummary = (a && r.aircraft.get(a.id)) ?? { level: 'green', items: [], reasons: [] };
  return {
    ...OK,
    aircraft: a
      ? {
          id: a.id,
          name: aircraftName(a),
          makeModel: `${a.make} ${a.model}`,
          serialNumber: a.serialNumber,
          registrationNumber: a.registrationNumber,
          registrationExpires: a.registrationExpiresOn ? displayDate(a.registrationExpiresOn, ctx.today) : null,
          remoteId: `${REMOTE_ID_LABEL[a.remoteIdMethod] ?? a.remoteIdMethod}${a.remoteIdSerial ? ` · ${a.remoteIdSerial}` : ''}`,
          takeoffMass: a.takeoffMassKg ? formatMass(a.takeoffMassKg, ctx.units) : null,
          firmwareVersion: a.firmwareVersion,
          status: a.status === 'retired' ? { level: 'amber', label: 'Retired' } : toAircraftRow(a, summary).status,
          groundedReason: a.groundedReason,
          reasons: summary.reasons.map((x) => reasonFromItem(x, ctx.today, `/aircraft/${a.id}`)),
          totals: { flights: a.totalFlights, flightTime: formatDuration(a.totalFlightSeconds) },
        }
      : null,
    recentFlights: flightRows(i, recentFlights.filter((f) => f.aircraftId === aircraftId).slice(0, 10)),
    batteries: a ? s.batteries.filter((b) => !b.deletedAt && b.aircraftModel === a.model).map((b) => toBatteryRow(b, s.batteryLastUsed[b.id] ?? null, ctx)) : [],
    canEdit: can(i.role, 'aircraft.manage'),
    canGround: can(i.role, 'aircraft.ground'),
    maintenance: (() => {
      const key = `aircraft:${aircraftId}`;
      const m = buildMaintenance(i, maintenanceEvents.filter((e) => `${e.target.type}:${e.target.id}` === key));
      return { due: m.due.filter((d) => d.targetKey === key), history: m.history, canManage: m.canManage, saving: false };
    })(),
    model: {
      custom: !!a?.modelDocumentId,
      uploading: false,
      error: null,
      airframe: a ? airframeOf(a) : 'quad',
      url: a?.modelDocumentId ? `/api/v1/orgs/${a.orgId}/aircraft/${a.id}/model?v=${a.modelDocumentId}` : null,
    },
    share: emptyShare(i.role),
  };
}

export function buildBatteryList(i: BuildInput): ScreenData<BatteryListScreenProps> {
  const { snapshot: s, ctx } = i;
  return {
    ...OK,
    batteries: s.batteries.filter((b) => !b.deletedAt).map((b) => toBatteryRow(b, s.batteryLastUsed[b.id] ?? null, ctx)),
    canManage: can(i.role, 'batteries.manage'),
    aircraftModelOptions: [...new Set(s.aircraft.filter((a) => !a.deletedAt && a.status !== 'retired').map((a) => a.model))].sort().map((m) => ({ value: m, label: m })),
    saving: false,
    fieldErrors: {},
    empty: empty('No batteries yet', 'Add batteries to track cycle counts automatically from your flights and get retirement warnings.', 'Add battery'),
  };
}

export function buildFlightList(
  i: BuildInput,
  page: Paged<Flight & { pendingSync?: boolean }>,
  filter: FlightListScreenProps['filter'],
  totals: { flights: number; flightSeconds: number },
): ScreenData<FlightListScreenProps> {
  const { snapshot: s } = i;
  return {
    ...OK,
    flights: { items: flightRows(i, page.items), total: page.total, nextCursor: page.nextCursor },
    filter,
    pilotOptions: s.pilots.filter((p) => !p.deletedAt).map((p) => ({ value: p.id, label: p.displayName })),
    aircraftOptions: s.aircraft.filter((a) => !a.deletedAt).map((a) => ({ value: a.id, label: aircraftName(a) })),
    totals: { flights: totals.flights, flightTime: formatDuration(totals.flightSeconds) },
    canLog: can(i.role, 'flights.log'),
    empty: empty('No flights logged', 'Log a flight in seconds, or import logs from your flight controller to fill your logbook automatically.', 'Log a flight'),
  };
}

export const OPERATION_TYPE_LABEL: Record<string, string> = {
  commercial: 'Commercial (Part 107)',
  training: 'Training',
  public_safety: 'Public safety',
  maintenance_test: 'Maintenance test flight',
  recreational: 'Recreational',
  other: 'Other',
};

export function weatherSummary(w: WeatherSnapshot | null, units: UnitsPreference): string | null {
  if (!w) return null;
  const parts: string[] = [];
  if (w.summary) parts.push(w.summary);
  if (w.temperatureC != null) parts.push(formatTemperature(w.temperatureC, units).display);
  if (w.windSpeedMps != null) {
    let wind = `wind ${formatSpeed(w.windSpeedMps, units).display}`;
    if (w.windGustMps != null) wind += ` gusting ${formatSpeed(w.windGustMps, units).display}`;
    if (w.windDirectionDeg != null) wind += ` from ${Math.round(w.windDirectionDeg)}°`;
    parts.push(wind);
  }
  return parts.length ? parts.join(', ') : null;
}

export function buildFlightDetail(
  i: BuildInput,
  f: Flight | null,
  extra: { path?: unknown | null; altitudeProfile?: { t: number; altitude: number }[]; integrity?: { contentHash: string; verified: boolean | null } | null; preflight?: GoNoGoResult | null; checklist?: FlightChecklist | null; authorization?: Pick<AuthorizationRecord, 'kind' | 'reference'> | null } = {},
): ScreenData<FlightDetailScreenProps> {
  const { snapshot: s, ctx } = i;
  const n = fleetNames(s);
  return {
    ...OK,
    flight: f
      ? {
          id: f.id,
          takeoff: displayInstant(f.takeoffAt, f.localTimeZone, ctx.now),
          landing: displayInstant(f.landingAt, f.localTimeZone, ctx.now),
          duration: formatDuration(f.durationSeconds),
          pilot: userChip(f.pilotInCommandId, n.pilot(f.pilotInCommandId)),
          observers: f.visualObserverIds.map((id) => userChip(id, n.pilot(id))),
          aircraft: { id: f.aircraftId, name: n.aircraft(f.aircraftId) },
          batteries: f.batteries.map((b) => ({ id: b.batteryId, label: s.batteries.find((x) => x.id === b.batteryId)?.label ?? 'Battery', startPct: b.startPct, endPct: b.endPct })),
          locationName: f.locationName,
          maxAltitude: f.maxAltitudeAglM == null ? null : formatLength(f.maxAltitudeAglM, ctx.units),
          maxDistance: f.maxDistanceM == null ? null : formatLength(f.maxDistanceM, ctx.units),
          operationType: OPERATION_TYPE_LABEL[f.operationType] ?? f.operationType,
          airspaceClass: f.airspaceClass ? `Class ${f.airspaceClass}` : null,
          authorizationRef: extra.authorization ? `${AUTHORIZATION_KIND_LABEL[extra.authorization.kind]} ${extra.authorization.reference}` : null,
          weatherSummary: weatherSummary(f.weather, ctx.units),
          notes: f.notes,
          source: f.source === 'manual' ? 'Logged manually' : `Imported${f.importParser ? ` (${f.importParser})` : ''}`,
          integrity: extra.integrity ?? null,
        }
      : null,
    path: extra.path ?? null,
    altitudeProfile: extra.altitudeProfile ?? [],
    preflight: extra.preflight ?? null,
    checklist: extra.checklist ? toFlightChecklist(extra.checklist, ctx) : null,
    canEdit: can(i.role, 'flights.edit'),
  };
}

/** A stored checklist run as the flight page shows it. */
export function toFlightChecklist(c: FlightChecklist, ctx: BuildInput['ctx']): FlightChecklistViewModel {
  const items = c.sections.flatMap((x) => x.items);
  const missing = items.filter((x) => x.required && !x.checked).length;
  const ticked = items.filter((x) => x.checked).length;
  return {
    name: c.templateName,
    version: c.templateVersion,
    completed: c.completed,
    signed: c.signedAt ? displayInstant(c.signedAt, ctx.orgTimeZone, ctx.now) : null,
    summary: `${ticked} of ${items.length} items${missing ? ` · ${missing} required ${missing === 1 ? 'item' : 'items'} not ticked` : ''}`,
    sections: c.sections,
  };
}

/** The template a pilot ticks while logging. */
export function toChecklistViewModel(t: ChecklistTemplate): ChecklistViewModel {
  return {
    templateId: t.id,
    templateVersion: t.version,
    name: t.name,
    sections: t.sections.map((x) => ({ id: x.id, title: x.title, items: x.items.map((it) => ({ id: it.id, text: it.text, required: it.required })) })),
  };
}

export function buildLogFlight(i: BuildInput, opts: { currentPilotId: string | null; now: Date; checklist?: ChecklistTemplate | null; authorizations?: AuthorizationRecord[] }): ScreenData<LogFlightScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const last = s.lastFlight;
  const activePilots = s.pilots.filter((p) => r.pilots.has(p.id) && p.active);
  const pilotId = opts.currentPilotId && activePilots.some((p) => p.id === opts.currentPilotId) ? opts.currentPilotId : (last?.pilotInCommandId ?? activePilots[0]?.id ?? '');
  const flyable = s.aircraft.filter((a) => !a.deletedAt && a.status !== 'retired');
  const recentAircraft = new Set([last?.aircraftId].filter(Boolean));
  const ps = r.pilots.get(pilotId);
  // Round "now" down to 5 minutes for a tidy default takeoff time.
  const takeoff = new Date(Math.floor(opts.now.getTime() / 300_000) * 300_000);
  return {
    ...OK,
    defaults: {
      pilotId,
      aircraftId: last?.aircraftId ?? flyable[0]?.id ?? null,
      batteryIds: last?.batteries.map((b) => b.batteryId) ?? [],
      siteId: null,
      operationType: last?.operationType ?? 'commercial',
      takeoffAt: takeoff.toISOString(),
      durationMinutes: last ? Math.round(last.durationSeconds / 60) : null,
      locationName: null,
      maxAltitude: null,
      notes: null,
      authorizationId: null,
    },
    hasLastFlight: !!last,
    pilotOptions: activePilots.map((p) => ({ value: p.id, label: p.displayName, status: badgeFromSummary(r.pilots.get(p.id)!) })),
    aircraftOptions: flyable.map((a) => ({ value: a.id, label: aircraftName(a), status: toAircraftRow(a, r.aircraft.get(a.id) ?? { level: 'green', items: [], reasons: [] }).status, recent: recentAircraft.has(a.id), model: a.model })),
    batteryOptions: s.batteries.filter((b) => !b.deletedAt && b.status !== 'retired').map((b) => ({ value: b.id, label: b.label ?? b.serialNumber, status: toBatteryRow(b, null, ctx).status, aircraftModel: b.aircraftModel ?? null })),
    siteOptions: s.recentLocations.slice(0, 8).map((name, idx) => ({ value: name, label: name, recent: idx < 3 })),
    operationTypeOptions: ['commercial', 'training', 'public_safety', 'maintenance_test', 'other'].map((v) => ({ value: v, label: OPERATION_TYPE_LABEL[v]! })),
    warnings: ps ? ps.reasons.map((x) => reasonFromItem(x, ctx.today, `/pilots/${pilotId}`)) : [],
    altitudeUnitLabel: ctx.units.length,
    preflight: null,
    checklist: opts.checklist ? toChecklistViewModel(opts.checklist) : null,
    authorizationOptions: authorizationOptions(opts.authorizations ?? [], opts.now),
    mission: null,
    conditions: { status: 'idle', advisories: [], weatherSummary: null, checkedAt: null, error: null },
    fieldErrors: {},
    saving: false,
  };
}

const LEVEL_RANK = { red: 0, amber: 1, green: 2 } as const;

function hours(seconds: number): string {
  const h = seconds / 3600;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`;
}

/** Maintenance targets in the fleet (aircraft and batteries), keyed `${type}:${id}`. */
function maintenanceTargets(s: FleetSnapshot) {
  const out = new Map<string, { label: string; href: string; flightSeconds: number; flights: number }>();
  for (const a of s.aircraft.filter((x) => !x.deletedAt))
    out.set(`aircraft:${a.id}`, { label: aircraftName(a), href: `/aircraft/${a.id}`, flightSeconds: a.totalFlightSeconds, flights: a.totalFlights });
  for (const b of s.batteries.filter((x) => !x.deletedAt))
    out.set(`battery:${b.id}`, { label: `Battery ${b.label ?? b.serialNumber}`, href: '/batteries', flightSeconds: 0, flights: b.cycleCount });
  return out;
}

export function buildMaintenance(i: BuildInput, events: MaintenanceEvent[]): ScreenData<MaintenanceScreenProps> {
  const { snapshot: s, ctx } = i;
  const targets = maintenanceTargets(s);
  const policy = ctx.policy ?? DEFAULT_READINESS_POLICY;
  const scheduleNames = new Map(s.maintenanceSchedules.map((m) => [m.id, m.name]));
  const due = s.maintenanceSchedules
    .filter((m) => !m.deletedAt && targets.has(`${m.target.type}:${m.target.id}`))
    .map((m) => {
      const t = targets.get(`${m.target.type}:${m.target.id}`)!;
      const item = evaluateItem(maintenanceItems({ type: m.target.type, id: m.target.id, flightSeconds: t.flightSeconds, flights: t.flights }, [m])[0]!, ctx.today, policy);
      const interval = [m.everyFlightSeconds && hours(m.everyFlightSeconds), m.everyFlights && `${m.everyFlights} ${m.target.type === 'battery' ? 'cycles' : 'flights'}`, m.everyDays && `${m.everyDays} days`].filter(Boolean).join(' · ');
      const usage = [
        m.everyFlightSeconds && `${hours(Math.max(0, t.flightSeconds - (m.lastDoneFlightSeconds ?? 0)))} of ${hours(m.everyFlightSeconds)}`,
        m.everyFlights && `${Math.max(0, t.flights - (m.lastDoneFlights ?? 0))} of ${m.everyFlights} ${m.target.type === 'battery' ? 'cycles' : 'flights'}`,
      ].filter(Boolean).join(' · ');
      const label =
        item.level === 'green' ? 'Current' : item.blocking ? 'Overdue — grounds aircraft' : item.daysRemaining != null && item.daysRemaining < 0 ? 'Overdue' : (item.usageFraction ?? 0) >= 1 ? 'Overdue' : 'Due soon';
      return {
        row: {
          id: m.id,
          target: t.label,
          targetKey: `${m.target.type}:${m.target.id}`,
          targetHref: t.href,
          name: m.name,
          interval: interval ? `Every ${interval}` : 'No interval',
          due: item.dueOn ? displayDate(item.dueOn, ctx.today) : null,
          usage: usage || null,
          status: { level: item.level, label },
          grounds: m.groundsWhenOverdue,
        },
        sortKey: [LEVEL_RANK[item.level], -(item.usageFraction ?? 0), item.daysRemaining ?? Infinity] as const,
      };
    })
    .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2])
    .map((x) => x.row);
  return {
    ...OK,
    due,
    history: events
      .filter((e) => !e.deletedAt)
      .map((e) => {
        const t = targets.get(`${e.target.type}:${e.target.id}`);
        return {
          id: e.id,
          target: t?.label ?? 'Component',
          targetHref: t?.href ?? '/maintenance',
          performed: displayInstant(e.performedAt, ctx.orgTimeZone, ctx.now),
          kind: e.kind === 'scheduled' ? ('Scheduled' as const) : ('Unscheduled' as const),
          scheduleName: e.scheduleId ? (scheduleNames.get(e.scheduleId) ?? null) : null,
          description: e.description,
          performedBy: e.performedBy,
          signedOff: !!e.signedOffAt,
        };
      }),
    targetOptions: [...targets.entries()].filter(([k]) => !k.startsWith('aircraft:') || s.aircraft.find((a) => `aircraft:${a.id}` === k)?.status !== 'retired').map(([value, t]) => ({ value, label: t.label })),
    canManage: can(i.role, 'maintenance.manage'),
    saving: false,
    empty: empty('No maintenance schedules', 'Add schedules by flight hours, flights, or calendar days. Certa counts usage from your logbook and warns before anything is due.', 'Add schedule'),
  };
}

function money(cents: number | null): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export function buildInsurance(i: BuildInput): ScreenData<InsuranceScreenProps> {
  const { snapshot: s, ctx } = i;
  const policy = ctx.policy ?? DEFAULT_READINESS_POLICY;
  const names = new Map(s.aircraft.map((a) => [a.id, aircraftName(a)]));
  const policies = s.insurancePolicies
    .filter((p) => !p.deletedAt)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))
    .map((p) => {
      const ev = evaluateItem({ kind: 'insurance', subjectType: 'aircraft', subjectId: p.id, key: p.id, label: 'Policy', dueOn: p.expiresOn, usageFraction: null, blocking: false, ruleId: null }, ctx.today, policy);
      const notYet = p.effectiveOn > ctx.today;
      const label = notYet ? `Starts ${displayDate(p.effectiveOn, ctx.today).relative}` : ev.level === 'green' ? 'In force' : ev.daysRemaining! < 0 ? 'Expired' : `Expires ${displayDate(p.expiresOn, ctx.today).relative}`;
      return {
        id: p.id,
        carrier: p.carrier,
        policyNumber: p.policyNumber,
        coverageSummary: p.coverageSummary,
        liabilityLimit: money(p.liabilityLimitCents),
        effective: displayDate(p.effectiveOn, ctx.today),
        expires: displayDate(p.expiresOn, ctx.today),
        status: { level: notYet ? ('amber' as const) : ev.level, label },
        coveredAircraft: p.coveredAircraftIds.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
      };
    });
  const covered = new Set(s.insurancePolicies.filter((p) => !p.deletedAt && p.effectiveOn <= ctx.today && p.expiresOn >= ctx.today).flatMap((p) => p.coveredAircraftIds));
  const active = s.aircraft.filter((a) => !a.deletedAt && a.status !== 'retired');
  return {
    ...OK,
    policies,
    uncoveredAircraft: active.filter((a) => !covered.has(a.id)).map((a) => ({ id: a.id, name: aircraftName(a) })),
    aircraftOptions: active.map((a) => ({ value: a.id, label: aircraftName(a) })),
    canManage: can(i.role, 'aircraft.manage'),
    saving: false,
    empty: empty('No insurance on file', 'Add your liability and hull policies. Certa links them to aircraft and warns 30 days before they lapse.', 'Add policy'),
  };
}

/** Helper for callers that need a 90-day window start (e.g. pilot totals). */
export const daysAgo = (today: string, n: number) => addDays(today, -n);

const CHECKLIST_KIND_LABEL = { preflight: 'Pre-flight', postflight: 'Post-flight', emergency: 'Emergency', other: 'Other' } as const;

export function buildChecklistsAdmin(i: BuildInput, templates: ChecklistTemplate[]): ScreenData<ChecklistsAdminScreenProps> {
  const { ctx } = i;
  return {
    ...OK,
    templates: templates.map((t) => {
      const items = t.sections.flatMap((x) => x.items);
      const req = items.filter((x) => x.required).length;
      return {
        id: t.id,
        name: t.name,
        kind: t.kind,
        kindLabel: CHECKLIST_KIND_LABEL[t.kind],
        version: t.version,
        isDefault: t.isDefault,
        summary: `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${req} required`,
        updated: displayInstant(t.updatedAt, ctx.orgTimeZone, ctx.now),
        sections: t.sections.map((x) => ({ id: x.id, title: x.title, items: x.items.map((it) => ({ id: it.id, text: it.text, required: it.required })) })),
      };
    }),
    canManage: can(i.role, 'checklists.manage_templates'),
    saving: false,
  };
}

export const AUTHORIZATION_KIND_LABEL: Record<AuthorizationRowViewModel['kind'], string> = {
  laanc: 'LAANC',
  airspace_authorization: 'Airspace authorization',
  waiver: 'Part 107 waiver',
  coa: 'COA',
  other: 'Other',
};

const authLevel = (a: AuthorizationRecord, now: Date): { rank: number; status: { level: 'green' | 'amber' | 'red'; label: string } } => {
  const t = now.getTime();
  if (a.validTo && Date.parse(a.validTo) <= t) return { rank: 0, status: { level: 'red', label: 'Expired' } };
  if (a.validFrom && Date.parse(a.validFrom) > t) return { rank: 3, status: { level: 'amber', label: 'Not yet valid' } };
  const days = a.validTo ? (Date.parse(a.validTo) - t) / 86400_000 : Infinity;
  // A LAANC approval lasts hours; only longer-lived authorizations get a 30-day warning.
  if (a.kind !== 'laanc' && days <= 30) return { rank: 1, status: { level: 'amber', label: `Expires in ${Math.max(1, Math.ceil(days))} ${Math.ceil(days) === 1 ? 'day' : 'days'}` } };
  return { rank: 2, status: { level: 'green', label: 'Current' } };
};

export function buildAuthorizations(i: BuildInput, list: AuthorizationRecord[], opts: { ownPilotId: string | null }): ScreenData<AuthorizationsScreenProps> {
  const { snapshot: s, ctx } = i;
  const n = fleetNames(s);
  const manageAll = can(i.role, 'authorizations.manage', { actorPilotId: opts.ownPilotId, resourcePilotId: null });
  const rows = list
    .filter((a) => !a.deletedAt)
    .map((a) => {
      const l = authLevel(a, ctx.now);
      return {
        rank: l.rank,
        row: {
          id: a.id,
          kind: a.kind,
          kindLabel: AUTHORIZATION_KIND_LABEL[a.kind],
          reference: a.reference,
          title: a.title,
          pilot: a.pilotId ? { id: a.pilotId, name: n.pilot(a.pilotId) } : null,
          validFrom: a.validFrom ? displayInstant(a.validFrom, ctx.orgTimeZone, ctx.now) : null,
          validTo: a.validTo ? displayInstant(a.validTo, ctx.orgTimeZone, ctx.now) : null,
          status: l.status,
          scope: a.scope,
          conditions: a.conditions,
          canEdit: can(i.role, 'authorizations.manage', { actorPilotId: opts.ownPilotId, resourcePilotId: a.pilotId }),
        } satisfies AuthorizationRowViewModel,
      };
    })
    .sort((a, b) => a.rank - b.rank || (a.row.validTo?.iso ?? '9').localeCompare(b.row.validTo?.iso ?? '9'))
    .map((x) => x.row);
  return {
    ...OK,
    authorizations: rows,
    pilotOptions: s.pilots.filter((p) => !p.deletedAt && p.active).map((p) => ({ value: p.id, label: p.displayName })),
    canCreate: manageAll || (!!opts.ownPilotId && can(i.role, 'authorizations.manage', { actorPilotId: opts.ownPilotId, resourcePilotId: opts.ownPilotId })),
    ownPilotId: manageAll ? null : opts.ownPilotId,
    saving: false,
    fieldErrors: {},
  };
}

/** Authorizations a pilot can attach to a flight now: current or starting today, never expired. */
export function authorizationOptions(list: AuthorizationRecord[], now: Date): { value: string; label: string }[] {
  return list
    .filter((a) => !a.deletedAt && authLevel(a, now).status.label !== 'Expired')
    .map((a) => ({ value: a.id, label: `${AUTHORIZATION_KIND_LABEL[a.kind]} ${a.reference}${a.title ? ` — ${a.title}` : ''}` }));
}

// ---------- Missions ----------

type MissionStatusValue = MissionRowViewModel['status']['value'];

export const MISSION_STATUS: Record<MissionStatusValue, StatusBadge> = {
  draft: { level: 'amber', label: 'Draft' },
  planned: { level: 'green', label: 'Planned' },
  in_progress: { level: 'green', label: 'In progress' },
  completed: { level: 'green', label: 'Completed' },
  cancelled: { level: 'amber', label: 'Cancelled' },
};

const STATUS_ACTIONS: Record<MissionStatusValue, { status: MissionStatusValue; label: string }[]> = {
  draft: [{ status: 'planned', label: 'Mark as planned' }, { status: 'cancelled', label: 'Cancel mission' }],
  planned: [{ status: 'in_progress', label: 'Start mission' }, { status: 'completed', label: 'Mark completed' }, { status: 'cancelled', label: 'Cancel mission' }],
  in_progress: [{ status: 'completed', label: 'Mark completed' }, { status: 'cancelled', label: 'Cancel mission' }],
  completed: [{ status: 'in_progress', label: 'Reopen' }],
  cancelled: [{ status: 'planned', label: 'Reinstate' }],
};

const isOpen = (s: MissionStatusValue) => s === 'draft' || s === 'planned' || s === 'in_progress';

/** "Thu, Oct 22 · 9:00–11:30 AM MDT", or both dates when the window spans midnight. */
export function missionWindow(start: string | null, end: string | null, timeZone: string, locale = 'en-US'): string | null {
  if (!start) return null;
  const day = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
  const time = (zone: boolean) => new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit', ...(zone ? { timeZoneName: 'short' } : {}) });
  const s = new Date(start);
  if (!end) return `${day.format(s)} · ${time(true).format(s)}`;
  const e = new Date(end);
  if (dateInZone(s, timeZone) !== dateInZone(e, timeZone)) return `${day.format(s)}, ${time(false).format(s)} – ${day.format(e)}, ${time(true).format(e)}`;
  return `${day.format(s)} · ${time(false).format(s)}–${time(true).format(e)}`;
}

function missionRow(i: BuildInput, m: MissionRecord, auths: AuthorizationRecord[]): MissionRowViewModel {
  const { snapshot: s, ctx } = i;
  const n = fleetNames(s);
  const pic = m.crew.find((c) => c.role === 'pic');
  return {
    id: m.id,
    name: m.name,
    starts: m.plannedStart ? displayInstant(m.plannedStart, ctx.orgTimeZone, ctx.now) : null,
    window: missionWindow(m.plannedStart, m.plannedEnd, ctx.orgTimeZone),
    locationName: m.locationName,
    pilotInCommand: pic ? n.pilot(pic.pilotId) : null,
    aircraft: m.aircraftIds.map(n.aircraft),
    status: { ...MISSION_STATUS[m.status], value: m.status },
    readiness: isOpen(m.status) ? (({ level, label }) => ({ level, label }))(missionReadiness(s, m, auths, ctx)) : null,
    flightCount: m.flightCount,
    open: isOpen(m.status),
  };
}

export function buildMissions(i: BuildInput, missions: MissionRecord[], auths: AuthorizationRecord[]): ScreenData<MissionsScreenProps> {
  const live = missions.filter((m) => !m.deletedAt);
  const open = live.filter((m) => isOpen(m.status)).sort((a, b) => (a.plannedStart ?? '9').localeCompare(b.plannedStart ?? '9'));
  const closed = live.filter((m) => !isOpen(m.status)).sort((a, b) => (b.plannedStart ?? '').localeCompare(a.plannedStart ?? ''));
  const canPlan = can(i.role, 'missions.manage');
  return {
    ...OK,
    missions: [...open, ...closed].map((m) => missionRow(i, m, auths)),
    canPlan,
    empty: empty('No missions yet', 'Plan a job ahead: who flies, which aircraft, where, and under which authorization. Certa checks the crew and aircraft will be legal on the day.', canPlan ? 'Plan a mission' : null),
  };
}

export function buildMissionDetail(
  i: BuildInput,
  m: MissionRecord | null,
  opts: { authorizations: AuthorizationRecord[]; flights: Flight[]; ownPilotId: string | null },
): ScreenData<MissionDetailScreenProps> {
  const { snapshot: s, ctx } = i;
  const n = fleetNames(s);
  const conditions: MissionDetailScreenProps['conditions'] = { status: 'idle', advisories: [], weatherSummary: null, checkedAt: null, error: null };
  if (!m) return { ...OK, mission: null, readiness: null, flights: [], conditions, canEdit: false, canLogFlight: false, statusActions: [], busy: false };
  const canEdit = can(i.role, 'missions.manage');
  const onCrew = !!opts.ownPilotId && m.crew.some((c) => c.pilotId === opts.ownPilotId);
  const r = missionReadiness(s, m, opts.authorizations, ctx);
  return {
    ...OK,
    mission: {
      id: m.id,
      name: m.name,
      purpose: m.purpose,
      deliverables: m.deliverables,
      status: { ...MISSION_STATUS[m.status], value: m.status },
      window: missionWindow(m.plannedStart, m.plannedEnd, ctx.orgTimeZone),
      starts: m.plannedStart ? displayInstant(m.plannedStart, ctx.orgTimeZone, ctx.now) : null,
      ends: m.plannedEnd ? displayInstant(m.plannedEnd, ctx.orgTimeZone, ctx.now) : null,
      locationName: m.locationName,
      location: m.location ? { lat: m.location.lat, lon: m.location.lon } : null,
      maxAltitude: m.maxAltitudeAglM == null ? null : `${formatLength(m.maxAltitudeAglM, ctx.units).display} AGL`,
      operationType: OPERATION_TYPE_LABEL[m.operationType] ?? m.operationType,
      crew: [...m.crew].sort((a, b) => (a.role === 'pic' ? -1 : b.role === 'pic' ? 1 : 0)).map((c) => ({ pilotId: c.pilotId, name: n.pilot(c.pilotId), role: c.role === 'pic' ? 'Pilot in command' : 'Visual observer', href: `/pilots/${c.pilotId}` })),
      aircraft: m.aircraftIds.map((id) => ({ id, name: n.aircraft(id), href: `/aircraft/${id}` })),
      authorizations: m.authorizationIds.map((id) => {
        const a = opts.authorizations.find((x) => x.id === id);
        return { id, label: a ? a.reference : 'Deleted authorization', detail: a ? [AUTHORIZATION_KIND_LABEL[a.kind], a.title, a.conditions].filter(Boolean).join(' · ') : null };
      }),
      flights: { count: m.flightCount, total: formatDuration(m.flightSeconds).display },
    },
    readiness: isOpen(m.status) ? r : null,
    flights: flightRows(i, opts.flights),
    conditions,
    canEdit,
    // Anyone who may log flights for a crew member; a pilot logs their own.
    canLogFlight: isOpen(m.status) && (can(i.role, 'flights.log', { actorPilotId: opts.ownPilotId, resourcePilotId: null }) || onCrew),
    statusActions: canEdit ? STATUS_ACTIONS[m.status] : [],
    busy: false,
  };
}

export function buildMissionForm(i: BuildInput, m: MissionRecord | null, opts: { authorizations: AuthorizationRecord[] }): ScreenData<MissionFormScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const keep = new Set([...(m?.crew.map((c) => c.pilotId) ?? []), ...(m?.aircraftIds ?? []), ...(m?.authorizationIds ?? [])]);
  const now = ctx.now.getTime();
  return {
    ...OK,
    mode: m ? 'edit' : 'create',
    defaults: {
      name: m?.name ?? '',
      purpose: m?.purpose ?? null,
      plannedStart: m?.plannedStart ?? null,
      plannedEnd: m?.plannedEnd ?? null,
      locationName: m?.locationName ?? null,
      location: m?.location ? { lat: m.location.lat, lon: m.location.lon } : null,
      maxAltitude: m?.maxAltitudeAglM == null ? null : Math.round(metresTo(m.maxAltitudeAglM, ctx.units.length)),
      operationType: m?.operationType ?? 'commercial',
      deliverables: m?.deliverables ?? null,
      picId: m?.crew.find((c) => c.role === 'pic')?.pilotId ?? null,
      observerIds: m?.crew.filter((c) => c.role === 'observer').map((c) => c.pilotId) ?? [],
      aircraftIds: m?.aircraftIds ?? [],
      authorizationIds: m?.authorizationIds ?? [],
    },
    pilotOptions: s.pilots.filter((p) => !p.deletedAt && (p.active || keep.has(p.id))).map((p) => ({ value: p.id, label: p.displayName, status: r.pilots.get(p.id) ? badgeFromSummary(r.pilots.get(p.id)!) : { level: 'red', label: 'Inactive' } })),
    aircraftOptions: s.aircraft
      .filter((a) => !a.deletedAt && (a.status !== 'retired' || keep.has(a.id)))
      .map((a) => ({ value: a.id, label: aircraftName(a), status: toAircraftRow(a, r.aircraft.get(a.id) ?? { level: 'green', items: [], reasons: [] }).status })),
    // Expired ones only if the mission already lists them, so editing never silently drops one.
    authorizationOptions: opts.authorizations
      .filter((a) => !a.deletedAt && (!a.validTo || Date.parse(a.validTo) > now || keep.has(a.id)))
      .map((a) => ({ value: a.id, label: `${AUTHORIZATION_KIND_LABEL[a.kind]} ${a.reference}${a.title ? ` — ${a.title}` : ''}`, status: authLevel(a, ctx.now).status })),
    operationTypeOptions: ['commercial', 'training', 'public_safety', 'maintenance_test', 'other'].map((v) => ({ value: v, label: OPERATION_TYPE_LABEL[v]! })),
    siteOptions: s.recentLocations.slice(0, 8).map((name) => ({ value: name, label: name })),
    altitudeUnitLabel: ctx.units.length,
    fieldErrors: {},
    saving: false,
  };
}

/** Log flight started from a mission: its pilot in command, first aircraft, place, height and authorization. */
export function withMission(d: ScreenData<LogFlightScreenProps>, m: MissionRecord, ctx: MapContext): ScreenData<LogFlightScreenProps> {
  const pic = m.crew.find((c) => c.role === 'pic')?.pilotId;
  const aircraftId = m.aircraftIds.find((id) => d.aircraftOptions.some((o) => o.value === id));
  const authorizationId = m.authorizationIds.find((id) => d.authorizationOptions.some((o) => o.value === id)) ?? null;
  return {
    ...d,
    mission: { id: m.id, name: m.name },
    defaults: {
      ...d.defaults,
      pilotId: pic && d.pilotOptions.some((o) => o.value === pic) ? pic : d.defaults.pilotId,
      aircraftId: aircraftId ?? d.defaults.aircraftId,
      operationType: m.operationType,
      locationName: m.locationName ?? d.defaults.locationName,
      maxAltitude: m.maxAltitudeAglM == null ? d.defaults.maxAltitude : Math.round(metresTo(m.maxAltitudeAglM, ctx.units.length)),
      authorizationId,
    },
  };
}
