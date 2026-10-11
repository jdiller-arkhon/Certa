/**
 * Pre-flight conditions advisories: airspace (FAA UAS Facility Map grid), weather (NWS
 * observation), and daylight (computed). Advisory only — they never block logging, and the
 * remote pilot in command remains responsible. TFRs and NOTAMs are not checked; the result
 * says so every time.
 */
import { z } from 'zod';
import { AirspaceClass } from '../domain/enums.js';
import { WeatherSnapshot } from '../domain/entities.js';

const Level = z.enum(['green', 'amber', 'red']);

export const Advisory = z.object({
  key: z.string(),
  level: Level,
  title: z.string(),
  detail: z.string(),
  source: z.string(),
});
export type Advisory = z.infer<typeof Advisory>;

export const AirspaceInfo = z.object({
  class: AirspaceClass,
  /** Highest LAANC grid altitude in feet AGL; 0 means no automatic authorization. */
  ceilingFt: z.number().nullable(),
  airport: z.string().nullable(),
  laanc: z.boolean(),
});
export type AirspaceInfo = z.infer<typeof AirspaceInfo>;

export const ConditionsResponse = z.object({
  point: z.object({ lat: z.number(), lon: z.number() }),
  checkedAt: z.string(),
  /** null = no facility-map grid here (likely Class G); 'unavailable' = lookup failed. */
  airspace: z.union([AirspaceInfo, z.literal('unavailable')]).nullable(),
  weather: WeatherSnapshot.nullable(),
  daylight: z.object({ civilDawn: z.string().nullable(), civilDusk: z.string().nullable(), isDaylight: z.boolean() }),
  advisories: z.array(Advisory),
});
export type ConditionsResponse = z.infer<typeof ConditionsResponse>;

// ---------------------------------------------------------------- daylight (NOAA solar position)

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Civil dawn and dusk (sun 6° below the horizon) for a UTC date at a point. Null in polar
 * day/night (`polar` says which). Accurate to about a minute: plenty for a daylight advisory.
 */
export function civilTwilight(date: Date, lat: number, lon: number): { dawn: Date | null; dusk: Date | null; polar: 'day' | 'night' | null } {
  const day0 = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const n = Math.floor((day0 - Date.UTC(2000, 0, 1, 12)) / 86400000) + 1; // days since J2000
  const meanNoon = n - lon / 360;
  const M = (357.5291 + 0.98560028 * meanNoon) % 360;
  const C = 1.9148 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 0.0003 * Math.sin(rad(3 * M));
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545 + meanNoon + 0.0053 * Math.sin(rad(M)) - 0.0069 * Math.sin(rad(2 * lambda));
  const decl = Math.asin(Math.sin(rad(lambda)) * Math.sin(rad(23.44)));
  const cosH = (Math.sin(rad(-6)) - Math.sin(rad(lat)) * Math.sin(decl)) / (Math.cos(rad(lat)) * Math.cos(decl));
  if (cosH > 1) return { dawn: null, dusk: null, polar: 'night' };
  if (cosH < -1) return { dawn: null, dusk: null, polar: 'day' };
  const H = deg(Math.acos(cosH)) / 360;
  const toDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);
  return { dawn: toDate(transit - H), dusk: toDate(transit + H), polar: null };
}

/** Is `now` between civil dawn and dusk at the point? Checks the neighbouring days too, for zones far from UTC. */
export function isCivilDaylight(now: Date, lat: number, lon: number): { isDaylight: boolean; civilDawn: string | null; civilDusk: string | null } {
  for (const offset of [0, -1, 1]) {
    const t = civilTwilight(new Date(now.getTime() + offset * 86400000), lat, lon);
    if (t.polar) return { isDaylight: t.polar === 'day', civilDawn: null, civilDusk: null };
    if (t.dawn && t.dusk && now >= t.dawn && now <= t.dusk) return { isDaylight: true, civilDawn: t.dawn.toISOString(), civilDusk: t.dusk.toISOString() };
  }
  const t = civilTwilight(now, lat, lon);
  return { isDaylight: false, civilDawn: t.dawn?.toISOString() ?? null, civilDusk: t.dusk?.toISOString() ?? null };
}

// ---------------------------------------------------------------- advisories

/** 14 CFR 107.51(c): minimum flight visibility 3 statute miles. */
const MIN_VISIBILITY_M = 4828;
/** Typical small-UAS wind limit; manufacturer limits vary (advisory). */
const GUST_AMBER_MPS = 10.3; // 20 kt
const WIND_AMBER_MPS = 8; // ~15 kt

const SURFACE_CONTROLLED: Record<string, string> = { B: 'Class B', C: 'Class C', D: 'Class D', E: 'Class E (surface)' };

export function buildAdvisories(input: {
  airspace: AirspaceInfo | 'unavailable' | null;
  weather: WeatherSnapshot | null;
  daylight: { isDaylight: boolean; civilDawn: string | null; civilDusk: string | null };
}): Advisory[] {
  const out: Advisory[] = [];
  const a = input.airspace;
  if (a === 'unavailable') {
    out.push({ key: 'airspace', level: 'amber', title: 'Airspace not checked', detail: 'The FAA facility map couldn’t be reached. Check airspace before flight.', source: 'FAA UAS Facility Map' });
  } else if (a === null) {
    out.push({ key: 'airspace', level: 'green', title: 'No LAANC grid here', detail: 'Likely uncontrolled (Class G) airspace. Confirm on FAA sources.', source: 'FAA UAS Facility Map' });
  } else {
    const name = SURFACE_CONTROLLED[a.class] ?? `Class ${a.class}`;
    const near = a.airport ? ` near ${a.airport}` : '';
    if (a.ceilingFt === 0)
      out.push({ key: 'airspace', level: 'red', title: `${name}${near} — 0 ft grid`, detail: 'No automatic authorization here. Flight needs an FAA authorization through DroneZone (14 CFR 107.41).', source: 'FAA UAS Facility Map' });
    else
      out.push({
        key: 'airspace',
        level: 'amber',
        title: `${name}${near}`,
        detail: `Authorization required (14 CFR 107.41).${a.laanc ? ` LAANC available up to ${a.ceilingFt} ft AGL.` : ' LAANC not available here.'}`,
        source: 'FAA UAS Facility Map',
      });
  }

  const w = input.weather;
  if (!w) {
    out.push({ key: 'weather', level: 'amber', title: 'Weather not available', detail: 'Check current conditions before flight.', source: 'National Weather Service' });
  } else {
    if (w.visibilityM != null && w.visibilityM < MIN_VISIBILITY_M)
      out.push({ key: 'visibility', level: 'red', title: 'Visibility below 3 statute miles', detail: `Reported ${(w.visibilityM / 1609.34).toFixed(1)} SM; Part 107 requires 3 SM from the control station (14 CFR 107.51(c)).`, source: 'National Weather Service' });
    const summary = (w.summary ?? '').toLowerCase();
    if (/thunder/.test(summary))
      out.push({ key: 'storm', level: 'red', title: 'Thunderstorms reported', detail: w.summary!, source: 'National Weather Service' });
    else if (/rain|snow|drizzle|sleet|freezing|showers/.test(summary))
      out.push({ key: 'precip', level: 'amber', title: 'Precipitation', detail: `${w.summary}. Check your aircraft’s ingress protection rating.`, source: 'National Weather Service' });
    const gust = w.windGustMps ?? 0;
    const wind = w.windSpeedMps ?? 0;
    if (gust >= GUST_AMBER_MPS || wind >= WIND_AMBER_MPS)
      out.push({ key: 'wind', level: 'amber', title: 'Strong wind', detail: `Wind ${Math.round(wind * 1.944)} kt${gust ? `, gusts ${Math.round(gust * 1.944)} kt` : ''}. Compare with your aircraft’s wind limit.`, source: 'National Weather Service' });
    if (!out.some((x) => ['visibility', 'storm', 'precip', 'wind'].includes(x.key)))
      out.push({ key: 'weather', level: 'green', title: 'Weather within typical limits', detail: w.summary ?? 'No significant weather reported.', source: 'National Weather Service' });
  }

  if (!input.daylight.isDaylight)
    out.push({ key: 'night', level: 'amber', title: 'Night or twilight', detail: 'Anti-collision lighting visible for 3 statute miles is required, and the pilot needs current night training (14 CFR 107.29).', source: 'Computed sunrise/sunset' });

  out.push({ key: 'tfr', level: 'amber', title: 'Check TFRs and NOTAMs', detail: 'Temporary flight restrictions are not checked by Certa. Use B4UFLY or an FAA-approved LAANC provider.', source: 'Reminder' });
  return out;
}
