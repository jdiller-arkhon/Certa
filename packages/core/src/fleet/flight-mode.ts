/**
 * Flight mode: what the pilot uses between takeoff and landing on site. A session is one visit
 * to a site with one aircraft; each takeoff-to-landing (a sortie, usually one battery set) is
 * logged as its own Certa flight, so hours and battery cycles come out right on multi-battery
 * jobs. Sessions live on the device until they are finished, so flight mode works without signal.
 *
 * Pure: the screen, the tests and the outbox all go through these functions.
 */
import type { Advisory } from './advisories.js';
import type { CreateFlightRequest } from '../api/schemas.js';
import type { ReadinessLevel } from '../domain/enums.js';

export const MARKER_KINDS = ['manned_aircraft', 'wildlife', 'signal_loss', 'battery_warning', 'compass_warning', 'other'] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];
export const MARKER_LABEL: Record<MarkerKind, string> = {
  manned_aircraft: 'Manned aircraft',
  wildlife: 'Birds or wildlife',
  signal_loss: 'Signal loss',
  battery_warning: 'Battery warning',
  compass_warning: 'Compass or IMU warning',
  other: 'Other',
};

export interface Sortie {
  id: string;
  batteryIds: string[];
  takeoffAt: string;
  landingAt: string | null;
  /** Charge left at landing, if the pilot noted it (applies to every battery on the sortie). */
  endPct: number | null;
}

export interface FlightMarker {
  id: string;
  at: string;
  kind: MarkerKind;
  /** The sortie in the air at the time; null when on the ground. */
  sortieId: string | null;
}

export interface FlightSession {
  id: string;
  orgId: string;
  pilotId: string;
  aircraftId: string;
  /** Batteries brought to the site, in the order they'll be used. */
  batteryIds: string[];
  locationName: string | null;
  missionId: string | null;
  operationType: CreateFlightRequest['operationType'];
  localTimeZone: string;
  startedAt: string;
  sorties: Sortie[];
  markers: FlightMarker[];
  /** Where conditions were last checked; becomes each flight's takeoff point. */
  point: { lat: number; lon: number } | null;
}

export type SessionPhase = 'ground' | 'airborne';

export function startSession(input: Omit<FlightSession, 'sorties' | 'markers' | 'startedAt' | 'point'> & { now: Date }): FlightSession {
  const { now, ...rest } = input;
  return { ...rest, startedAt: now.toISOString(), sorties: [], markers: [], point: null };
}

export const currentSortie = (s: FlightSession): Sortie | null => {
  const last = s.sorties.at(-1);
  return last && !last.landingAt ? last : null;
};
export const phase = (s: FlightSession): SessionPhase => (currentSortie(s) ? 'airborne' : 'ground');
export const landedSorties = (s: FlightSession) => s.sorties.filter((x): x is Sortie & { landingAt: string } => !!x.landingAt);

export function takeOff(s: FlightSession, batteryIds: string[], now: Date, id: string): FlightSession {
  if (currentSortie(s)) return s;
  return { ...s, sorties: [...s.sorties, { id, batteryIds: [...new Set(batteryIds)], takeoffAt: now.toISOString(), landingAt: null, endPct: null }] };
}

export function land(s: FlightSession, now: Date): FlightSession {
  const cur = currentSortie(s);
  if (!cur) return s;
  // A clock change mid-flight must never give a sortie negative time.
  const landingAt = new Date(Math.max(now.getTime(), Date.parse(cur.takeoffAt))).toISOString();
  return { ...s, sorties: s.sorties.map((x) => (x.id === cur.id ? { ...x, landingAt } : x)) };
}

/** Charge left on the last landed sortie's batteries. */
export function setLandingCharge(s: FlightSession, pct: number | null): FlightSession {
  const last = landedSorties(s).at(-1);
  if (!last) return s;
  const endPct = pct == null ? null : Math.min(100, Math.max(0, Math.round(pct)));
  return { ...s, sorties: s.sorties.map((x) => (x.id === last.id ? { ...x, endPct } : x)) };
}

export function addMarker(s: FlightSession, kind: MarkerKind, now: Date, id: string): FlightSession {
  return { ...s, markers: [...s.markers, { id, at: now.toISOString(), kind, sortieId: currentSortie(s)?.id ?? null }] };
}

/** Removes a sortie logged by mistake (e.g. a takeoff tapped twice). */
export function discardSortie(s: FlightSession, sortieId: string): FlightSession {
  return { ...s, sorties: s.sorties.filter((x) => x.id !== sortieId), markers: s.markers.map((m) => (m.sortieId === sortieId ? { ...m, sortieId: null } : m)) };
}

/** The next battery set: the first battery not flown yet, else the least recently flown. */
export function nextBatteries(s: FlightSession, perSortie = 1): string[] {
  const lastUse = new Map<string, number>();
  s.sorties.forEach((x, i) => x.batteryIds.forEach((b) => lastUse.set(b, i)));
  return [...s.batteryIds].sort((a, b) => (lastUse.get(a) ?? -1) - (lastUse.get(b) ?? -1)).slice(0, perSortie);
}

export const sortieSeconds = (x: Sortie, now: Date) => Math.max(0, Math.round(((x.landingAt ? Date.parse(x.landingAt) : now.getTime()) - Date.parse(x.takeoffAt)) / 1000));
export const totalAirSeconds = (s: FlightSession, now: Date) => s.sorties.reduce((a, x) => a + sortieSeconds(x, now), 0);

/**
 * Typical sortie length from past flights (seconds), used for the land-by countdown: the median,
 * so one short test hop or one long flight doesn't move it. Null until there are 3 flights.
 */
export function typicalSortieSeconds(durations: number[]): number | null {
  const d = durations.filter((x) => x >= 60).sort((a, b) => a - b);
  if (d.length < 3) return null;
  const m = Math.floor(d.length / 2);
  return d.length % 2 ? d[m]! : Math.round((d[m - 1]! + d[m]!) / 2);
}

/** Default when there's no history: a conservative figure for small multirotors. */
export const DEFAULT_SORTIE_SECONDS = 20 * 60;

/**
 * Land-by countdown for the sortie in the air. Amber with 3 minutes left, red at 1 minute or
 * past the typical time. A planning aid from history, not a battery reading: the aircraft's
 * own battery warnings always win.
 */
export function landBy(sortie: Sortie, typicalSeconds: number, now: Date): { remaining: number; fraction: number; level: ReadinessLevel } {
  const flown = sortieSeconds(sortie, now);
  const remaining = typicalSeconds - flown;
  const level: ReadinessLevel = remaining <= 60 ? 'red' : remaining <= 180 ? 'amber' : 'green';
  return { remaining, fraction: Math.min(1, flown / Math.max(1, typicalSeconds)), level };
}

const RANK: Record<ReadinessLevel, number> = { green: 0, amber: 1, red: 2 };

/**
 * What got worse between two condition checks: advisories that are new or more severe. Ones
 * that cleared or eased are left out; the watch only interrupts the pilot for bad news.
 * The always-on reminder (TFRs/NOTAMs) never counts as a change.
 */
export function conditionChanges(prev: Advisory[], next: Advisory[]): Advisory[] {
  const before = new Map(prev.map((a) => [a.key, a.level]));
  return next.filter((a) => a.source !== 'Reminder' && a.level !== 'green' && (!before.has(a.key) || RANK[a.level] > RANK[before.get(a.key)!]));
}

/** Seconds of civil daylight left, or null when unknown or already dark. */
export function daylightLeft(civilDusk: string | null, now: Date): number | null {
  if (!civilDusk) return null;
  const s = Math.round((Date.parse(civilDusk) - now.getTime()) / 1000);
  return s > 0 ? s : null;
}

const hhmm = (iso: string, zone: string) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(iso));

/**
 * The flight to log for one landed sortie. Markers flown during it go into the notes with their
 * local time, so they reach the logbook and any incident report.
 */
export function sortieFlight(s: FlightSession, sortie: Sortie & { landingAt: string }, extra: { id: string; notes?: string | null } ): CreateFlightRequest & { id: string } {
  const marks = s.markers.filter((m) => m.sortieId === sortie.id);
  const n = s.sorties.findIndex((x) => x.id === sortie.id) + 1;
  const lines = [
    `Sortie ${n} of ${s.sorties.length}, logged with flight mode.`,
    ...marks.map((m) => `${hhmm(m.at, s.localTimeZone)} ${MARKER_LABEL[m.kind]}`),
    ...(extra.notes?.trim() ? [extra.notes.trim()] : []),
  ];
  return {
    id: extra.id,
    pilotInCommandId: s.pilotId,
    visualObserverIds: [],
    aircraftId: s.aircraftId,
    batteries: sortie.batteryIds.map((batteryId) => ({ batteryId, startPct: null, endPct: sortie.endPct })),
    takeoffAt: sortie.takeoffAt,
    landingAt: sortie.landingAt,
    localTimeZone: s.localTimeZone,
    takeoffPoint: s.point,
    locationName: s.locationName,
    operationType: s.operationType,
    notes: lines.join('\n'),
    ...(s.missionId ? { missionId: s.missionId } : {}),
  };
}

/** Plain-text clock for timers: 4:05, 1:02:09, −0:42 when past. */
export function clock(seconds: number): string {
  const neg = seconds < 0;
  const t = Math.abs(Math.round(seconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  return neg ? `−${body}` : body;
}

/** Decimal and degrees-minutes-seconds, the two forms a 911 dispatcher may ask for. */
export function coordinateText(p: { lat: number; lon: number }): { decimal: string; dms: string } {
  const dms = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″${v >= 0 ? pos : neg}`;
  };
  return { decimal: `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, dms: `${dms(p.lat, 'N', 'S')} ${dms(p.lon, 'E', 'W')}` };
}
