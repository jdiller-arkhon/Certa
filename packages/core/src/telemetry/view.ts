import type { UnitsPreference } from '../domain/enums.js';
import { formatLength, formatSpeed } from '../format/units.js';
import { batteryFlags } from './summarize.js';
import type { TelemetrySummary, TrackPoint } from './model.js';

export const PARSER_LABEL: Record<string, string> = {
  'airdata-csv': 'AirData CSV',
  'dji-csv': 'DJI CSV',
  csv: 'CSV flight record',
  gpx: 'GPX track',
  kml: 'KML track',
  'ardupilot-bin': 'ArduPilot log',
  'px4-ulog': 'PX4 log',
  'dji-cloud-live': 'DJI live link',
};

export interface TelemetryViewModel {
  /** e.g. "From the aircraft's log (AirData CSV)". */
  source: string;
  aircraft: string | null;
  stats: { label: string; value: string }[];
  battery: { level: 'green' | 'amber' | 'red'; summary: string; notes: string[] } | null;
  events: { time: string; level: 'warning' | 'error'; text: string }[];
  warnings: string[];
}

/** Display rows for an imported flight's log metrics, in the organization's units. */
export function buildTelemetryView(t: TelemetrySummary, units: UnitsPreference, timeZone: string): TelemetryViewModel {
  const stats: { label: string; value: string }[] = [];
  if (t.maxHeightM != null) stats.push({ label: 'Max height', value: formatLength(Math.max(0, t.maxHeightM), units).display });
  if (t.maxDistanceM != null) stats.push({ label: 'Farthest from home', value: formatLength(t.maxDistanceM, units).display });
  if (t.totalDistanceM != null) stats.push({ label: 'Distance flown', value: t.totalDistanceM >= 1000 ? `${(t.totalDistanceM / (units.length === 'ft' ? 1609.344 : 1000)).toFixed(2)} ${units.length === 'ft' ? 'mi' : 'km'}` : formatLength(t.totalDistanceM, units).display });
  if (t.maxSpeedMps != null) stats.push({ label: 'Top speed', value: formatSpeed(t.maxSpeedMps, units).display });
  const b = t.battery;
  const hasBattery = [b.startPct, b.endPct, b.minVoltageV, b.minCellV].some((x) => x != null);
  let battery: TelemetryViewModel['battery'] = null;
  if (hasBattery) {
    const flags = batteryFlags(b);
    const parts = [b.startPct != null && b.endPct != null ? `${b.startPct}% → ${b.endPct}%` : null, b.minCellV != null ? `lowest cell ${b.minCellV.toFixed(2)} V` : b.minVoltageV != null ? `lowest ${b.minVoltageV.toFixed(1)} V` : null, b.maxCellDeltaV != null ? `cells within ${Math.round(b.maxCellDeltaV * 1000)} mV` : null].filter(Boolean);
    battery = { level: flags.level, summary: parts.join(' · '), notes: flags.notes };
  }
  const time = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone }).format(new Date(iso));
  return {
    source: `From the aircraft’s log (${PARSER_LABEL[t.parser] ?? t.parser})`,
    aircraft: [t.aircraftModel, t.aircraftSerial ? `SN ${t.aircraftSerial}` : null].filter(Boolean).join(' · ') || null,
    stats,
    battery,
    events: t.events.map((e) => ({ time: time(e.at), level: e.level, text: e.text })),
    warnings: t.warnings,
  };
}

/** The flight page's track (GeoJSON-style) and altitude profile from stored track points. */
export function trackDisplay(points: TrackPoint[], units: UnitsPreference): { path: { type: 'LineString'; coordinates: number[][] } | null; altitudeProfile: { t: number; altitude: number }[] } {
  if (points.length < 2) return { path: null, altitudeProfile: [] };
  const t0 = points[0]![3];
  return {
    path: { type: 'LineString', coordinates: points.map((p) => [p[0], p[1]]) },
    altitudeProfile: points.map((p) => ({ t: p[3] - t0, altitude: Math.max(0, formatLength(p[2], units, 1).value) })),
  };
}
