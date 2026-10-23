import { MAX_TRACK_POINTS, type Telemetry, type TelemetrySample, type TelemetrySummary, type TrackPoint } from './model.js';

const R = 6371008.8;
/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const hasFix = (s: TelemetrySample): s is TelemetrySample & { lat: number; lon: number } =>
  s.lat != null && s.lon != null && Number.isFinite(s.lat) && Number.isFinite(s.lon) && !(s.lat === 0 && s.lon === 0) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180;

/** Above this height (m) or speed (m/s) the aircraft is treated as airborne. */
const AIRBORNE_HEIGHT = 1.5;
const AIRBORNE_SPEED = 2;
/** A GPS jump faster than this between samples is a glitch, not flight. */
const MAX_PLAUSIBLE_MPS = 60;

const round = (v: number | null, dp = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);
const maxOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.max(...v) : null;
};
const minOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.min(...v) : null;
};

/**
 * Heights above takeoff for samples that only carry MSL altitude: the first altitude with a
 * position is taken as the takeoff point. Samples that already have a height keep it.
 */
function withHeights(samples: TelemetrySample[]): TelemetrySample[] {
  if (samples.some((s) => s.heightM != null)) return samples;
  const base = samples.find((s) => s.altMslM != null)?.altMslM;
  if (base == null) return samples;
  return samples.map((s) => (s.altMslM == null ? s : { ...s, heightM: s.altMslM - base }));
}

/**
 * The flight inside a log: from the first moment the aircraft is airborne to the last, with
 * a little ground time either side trimmed off. Returns null when nothing in the log ever flew.
 */
export function summarizeTelemetry(tel: Telemetry): { summary: TelemetrySummary; track: TrackPoint[] } | null {
  const all = withHeights([...tel.samples].filter((s) => Number.isFinite(s.t)).sort((a, b) => a.t - b.t));
  if (all.length < 2) return null;
  const airborne = (s: TelemetrySample) => (s.heightM != null && s.heightM > AIRBORNE_HEIGHT) || (s.speedMps != null && s.speedMps > AIRBORNE_SPEED);
  const first = all.findIndex(airborne);
  let last = -1;
  for (let i = all.length - 1; i >= 0; i--) if (airborne(all[i]!)) { last = i; break; }
  const warnings = [...tel.warnings];
  let from = 0, to = all.length - 1;
  if (first === -1) {
    // No height or speed at all (a bare track): the whole log is the flight.
    if (all.some((s) => s.heightM != null || s.speedMps != null)) return null;
    warnings.push('No height or speed in this log, so takeoff and landing are the first and last points.');
  } else {
    from = Math.max(0, first - 1);
    to = Math.min(all.length - 1, last + 1);
  }
  const flight = all.slice(from, to + 1);
  const takeoff = flight[0]!.t;
  const landing = flight.at(-1)!.t;
  if (landing <= takeoff) return null;

  const fixes = all.filter(hasFix);
  const home = fixes.find((s) => s.t >= all[from]!.t) ?? fixes[0] ?? null;
  const flown = flight.filter(hasFix);
  let total = 0, glitches = 0;
  for (let i = 1; i < flown.length; i++) {
    const d = haversineM(flown[i - 1]!, flown[i]!);
    const dt = (flown[i]!.t - flown[i - 1]!.t) / 1000;
    if (dt > 0 && d / dt > MAX_PLAUSIBLE_MPS) { glitches++; continue; }
    total += d;
  }
  if (glitches) warnings.push(`${glitches} GPS jump${glitches === 1 ? '' : 's'} ignored in the distance.`);
  if (!flown.length) warnings.push('No GPS position in this log: no track or distance.');
  const maxDistance = home && flown.length ? Math.max(...flown.map((s) => haversineM(home, s))) : null;

  const withPct = flight.filter((s) => s.batteryPct != null);
  const withV = flight.filter((s) => s.voltageV != null);
  const cells = flight.filter((s) => s.cellV && s.cellV.length > 1);
  const deltas = cells.map((s) => Math.max(...s.cellV!) - Math.min(...s.cellV!));

  const events = tel.events
    .filter((e) => e.t >= takeoff - 60_000 && e.t <= landing + 60_000)
    .slice(0, 60)
    .map((e) => ({ at: new Date(e.t).toISOString(), level: e.level, text: e.text.slice(0, 300) }));

  const summary: TelemetrySummary = {
    parser: tel.parser,
    takeoffAt: new Date(takeoff).toISOString(),
    landingAt: new Date(landing).toISOString(),
    durationSeconds: Math.round((landing - takeoff) / 1000),
    maxHeightM: round(maxOf(flight.map((s) => s.heightM))),
    maxDistanceM: round(maxDistance, 0),
    totalDistanceM: flown.length > 1 ? round(total, 0) : null,
    maxSpeedMps: round(maxOf(flight.map((s) => s.speedMps))),
    home: home ? { lat: round(home.lat, 6)!, lon: round(home.lon, 6)! } : null,
    landing: flown.length ? { lat: round(flown.at(-1)!.lat, 6)!, lon: round(flown.at(-1)!.lon, 6)! } : null,
    battery: {
      startPct: round(withPct[0]?.batteryPct ?? null, 0),
      endPct: round(withPct.at(-1)?.batteryPct ?? null, 0),
      startVoltageV: round(withV[0]?.voltageV ?? null, 2),
      minVoltageV: round(minOf(withV.map((s) => s.voltageV)), 2),
      minCellV: round(minOf(cells.flatMap((s) => s.cellV!)), 3),
      maxCellDeltaV: round(maxOf(deltas), 3),
    },
    aircraftModel: tel.aircraftModel?.slice(0, 120) ?? null,
    aircraftSerial: tel.aircraftSerial?.slice(0, 80) ?? null,
    batterySerials: [...new Set(tel.batterySerials)].slice(0, 12),
    events,
    warnings: warnings.slice(0, 20),
    samples: tel.samples.length,
  };
  return { summary, track: trackOf(flown) };
}

/** Evenly thinned track (first and last always kept), small enough to store with the flight. */
export function trackOf(samples: (TelemetrySample & { lat: number; lon: number })[], max = MAX_TRACK_POINTS): TrackPoint[] {
  if (samples.length < 2) return [];
  const step = Math.max(1, Math.ceil(samples.length / max));
  const keep = samples.filter((_, i) => i % step === 0);
  if (keep.at(-1) !== samples.at(-1)) keep.push(samples.at(-1)!);
  return keep.slice(0, max).map((s) => [round(s.lon, 6)!, round(s.lat, 6)!, round(Math.max(-1000, Math.min(20000, s.heightM ?? 0)), 1)!, Math.max(1, Math.round(s.t / 1000))]);
}

/** Import de-duplication: the same aircraft taking off in the same minute is the same flight. */
export function telemetryDedupeKey(s: Pick<TelemetrySummary, 'aircraftSerial' | 'aircraftModel' | 'takeoffAt'>, aircraftId: string): string {
  return `${(s.aircraftSerial ?? aircraftId).toUpperCase()}@${s.takeoffAt.slice(0, 16)}`;
}

/**
 * Battery health from one flight: a sag below 3.5 V per cell under load, or cells drifting
 * more than 0.1 V apart, means the pack is worth a closer look.
 */
export function batteryFlags(b: TelemetrySummary['battery']): { level: 'green' | 'amber' | 'red'; notes: string[] } {
  const notes: string[] = [];
  let level: 'green' | 'amber' | 'red' = 'green';
  if (b.minCellV != null && b.minCellV < 3.3) (level = 'red'), notes.push(`A cell dropped to ${b.minCellV.toFixed(2)} V`);
  else if (b.minCellV != null && b.minCellV < 3.5) (level = 'amber'), notes.push(`A cell sagged to ${b.minCellV.toFixed(2)} V`);
  if (b.maxCellDeltaV != null && b.maxCellDeltaV > 0.2) (level = 'red'), notes.push(`Cells ${Math.round(b.maxCellDeltaV * 1000)} mV apart`);
  else if (b.maxCellDeltaV != null && b.maxCellDeltaV > 0.1) (level = level === 'red' ? 'red' : 'amber'), notes.push(`Cells ${Math.round(b.maxCellDeltaV * 1000)} mV apart`);
  if (b.endPct != null && b.endPct < 15) (level = level === 'red' ? 'red' : 'amber'), notes.push(`Landed with ${b.endPct}%`);
  return { level, notes };
}
