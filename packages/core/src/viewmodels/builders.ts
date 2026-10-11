/**
 * Screen builders: fleet snapshot (+ flights) → screen view-models. The web containers, the
 * offline app, and the contract fixtures all use these, so a screen renders real data exactly
 * the way it renders the fixtures. Builders return the data half of each screen's props; the
 * container adds the callbacks.
 */
import { can } from '../domain/permissions.js';
import type { Flight, WeatherSnapshot } from '../domain/entities.js';
import type { Role, UnitsPreference } from '../domain/enums.js';
import { fleetReadiness, type FleetReadiness, type FleetSnapshot } from '../fleet/fleet.js';
import { addDays, displayDate, displayInstant } from '../format/dates.js';
import { formatDuration, formatLength, formatMass, formatSpeed, formatTemperature } from '../format/units.js';
import type { ReadinessSummary } from '../readiness/readiness.js';
import type { EmptyState, Paged } from './common.js';
import {
  aircraftName,
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
  FlightListScreenProps,
  FlightRowViewModel,
  LogFlightScreenProps,
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

export function buildReadinessDashboard(i: BuildInput): ScreenData<ReadinessDashboardScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const n = fleetNames(s);
  const pilots = s.pilots.filter((p) => r.pilots.has(p.id));
  const aircraft = s.aircraft.filter((a) => r.aircraft.has(a.id));
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
    overall: { level: r.overall, label: OVERALL_LABEL[r.overall] },
    counts: r.counts,
    pilots: pilots.map((p) => toPilotReadinessRow(p, r.pilots.get(p.id)!, ctx)),
    aircraft: aircraft.map((a) => toAircraftReadinessRow(a, r.aircraft.get(a.id)!, ctx)),
    upcoming,
    empty: empty('Add your first pilot and aircraft', 'Certa tracks certificates, registrations, and maintenance so you know who and what is legal to fly today.', 'Add aircraft'),
  };
}

const matches = (q: string, ...fields: (string | null | undefined)[]) => {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle));
};

const totalsOf = (s: FleetSnapshot, pilotId: string) =>
  s.pilotTotals[pilotId] ?? { flights: 0, flightSeconds: 0, lastFlightAt: null, last90DaysFlights: 0 };

export function buildPilotList(i: BuildInput, search = ''): ScreenData<PilotListScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  return {
    ...OK,
    pilots: s.pilots
      .filter((p) => r.pilots.has(p.id) && matches(search, p.displayName, p.certificateNumber, p.email))
      .map((p) => {
        const t = totalsOf(s, p.id);
        return toPilotRow(p, r.pilots.get(p.id)!, { flightSeconds: t.flightSeconds, lastFlightAt: t.lastFlightAt }, ctx);
      }),
    search,
    canManage: can(i.role, 'pilots.manage'),
    empty: empty('No pilots yet', 'Add pilots to track their certificates, recurrent training, and flight time.', 'Add pilot'),
  };
}

export function buildPilotDetail(i: BuildInput, pilotId: string, recentFlights: Flight[]): ScreenData<PilotDetailScreenProps> {
  const r = readinessOf(i);
  const { snapshot: s, ctx } = i;
  const p = s.pilots.find((x) => x.id === pilotId && !x.deletedAt);
  const summary = p ? r.pilots.get(p.id) : undefined;
  const t = totalsOf(s, pilotId);
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
            totals: { flights: t.flights, flightTime: formatDuration(t.flightSeconds), last90DaysFlights: t.last90DaysFlights },
          }
        : null,
    credentials: s.credentials.filter((c) => c.pilotId === pilotId && !c.deletedAt).map((c) => toCredentialViewModel(c, r.rules, ctx)),
    recentFlights: flightRows(i, recentFlights.filter((f) => f.pilotInCommandId === pilotId).slice(0, 10)),
    credentialTypeOptions: r.rules.pack.credentialTypes.map((ct) => ({ value: ct.id, label: ct.label, expires: ct.validityRuleId !== null })),
    canEdit: can(i.role, 'credentials.manage'),
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

export function buildAircraftDetail(i: BuildInput, aircraftId: string, recentFlights: Flight[]): ScreenData<AircraftDetailScreenProps> {
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
  };
}

export function buildBatteryList(i: BuildInput): ScreenData<BatteryListScreenProps> {
  const { snapshot: s, ctx } = i;
  return {
    ...OK,
    batteries: s.batteries.filter((b) => !b.deletedAt).map((b) => toBatteryRow(b, s.batteryLastUsed[b.id] ?? null, ctx)),
    canManage: can(i.role, 'batteries.manage'),
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

export function buildFlightDetail(i: BuildInput, f: Flight | null, extra: { path?: unknown | null; altitudeProfile?: { t: number; altitude: number }[]; integrity?: { contentHash: string; verified: boolean | null } | null } = {}): ScreenData<FlightDetailScreenProps> {
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
          authorizationRef: null,
          weatherSummary: weatherSummary(f.weather, ctx.units),
          notes: f.notes,
          source: f.source === 'manual' ? 'Logged manually' : `Imported${f.importParser ? ` (${f.importParser})` : ''}`,
          integrity: extra.integrity ?? null,
        }
      : null,
    path: extra.path ?? null,
    altitudeProfile: extra.altitudeProfile ?? [],
    canEdit: can(i.role, 'flights.edit'),
  };
}

export function buildLogFlight(i: BuildInput, opts: { currentPilotId: string | null; now: Date }): ScreenData<LogFlightScreenProps> {
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
    },
    hasLastFlight: !!last,
    pilotOptions: activePilots.map((p) => ({ value: p.id, label: p.displayName, status: badgeFromSummary(r.pilots.get(p.id)!) })),
    aircraftOptions: flyable.map((a) => ({ value: a.id, label: aircraftName(a), status: toAircraftRow(a, r.aircraft.get(a.id) ?? { level: 'green', items: [], reasons: [] }).status, recent: recentAircraft.has(a.id) })),
    batteryOptions: s.batteries.filter((b) => !b.deletedAt && b.status !== 'retired').map((b) => ({ value: b.id, label: b.label ?? b.serialNumber, status: toBatteryRow(b, null, ctx).status })),
    siteOptions: s.recentLocations.slice(0, 8).map((name, idx) => ({ value: name, label: name, recent: idx < 3 })),
    operationTypeOptions: ['commercial', 'training', 'public_safety', 'maintenance_test', 'other'].map((v) => ({ value: v, label: OPERATION_TYPE_LABEL[v]! })),
    warnings: ps ? ps.reasons.map((x) => reasonFromItem(x, ctx.today, `/pilots/${pilotId}`)) : [],
    altitudeUnitLabel: ctx.units.length,
    fieldErrors: {},
    saving: false,
  };
}

/** Helper for callers that need a 90-day window start (e.g. pilot totals). */
export const daysAgo = (today: string, n: number) => addDays(today, -n);
