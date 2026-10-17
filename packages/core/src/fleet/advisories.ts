/**
 * Pre-flight conditions advisories from free, authoritative public sources: airspace (FAA UAS
 * Facility Map grid), TFRs (FAA TFR service), special-use airspace and UAS flight restrictions
 * (FAA ADDS layers), weather (NWS observation and hourly forecast, aviationweather.gov METAR /
 * TAF), geomagnetic activity (NOAA SWPC), and daylight (computed). Advisory only — they never
 * block logging, and the remote pilot in command remains responsible. NOTAMs are not checked;
 * the result says so every time.
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
  /** Where to act on it (e.g. the FAA's list of LAANC providers). */
  href: z.string().nullable().optional(),
});
export type Advisory = z.infer<typeof Advisory>;

export const Restriction = z.object({
  kind: z.enum(['tfr', 'prohibited', 'restricted', 'special_use', 'national_security', 'national_security_part_time', 'national_defense', 'stadium', 'fria']),
  name: z.string(),
  detail: z.string(),
  /** false = nearby rather than over the point (TFRs within 5 NM, stadiums within 3 NM). */
  inside: z.boolean(),
});
export type Restriction = z.infer<typeof Restriction>;

export const AviationWeather = z.object({
  station: z.string(),
  name: z.string().nullable(),
  distanceKm: z.number(),
  /** VFR / MVFR / IFR / LIFR as reported. */
  flightCategory: z.string().nullable(),
  /** Lowest broken or overcast layer, feet AGL. */
  ceilingFt: z.number().nullable(),
  visibilitySm: z.number().nullable(),
  metar: z.string(),
  taf: z.string().nullable(),
});
export type AviationWeather = z.infer<typeof AviationWeather>;

export const WindForecast = z.object({ hours: z.number().int(), maxWindMph: z.number(), summary: z.string() });
export type WindForecast = z.infer<typeof WindForecast>;

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
  /** Active TFRs over or near the point; 'unavailable' = lookup failed. */
  tfrs: z.union([z.array(Restriction), z.literal('unavailable')]).optional(),
  /** Special-use airspace and UAS restrictions over or near the point; 'unavailable' = lookup failed. */
  restrictions: z.union([z.array(Restriction), z.literal('unavailable')]).optional(),
  aviation: AviationWeather.nullable().optional(),
  forecast: WindForecast.nullable().optional(),
  /** Latest planetary K index (0–9). */
  kp: z.number().nullable().optional(),
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

const RESTRICTION_TITLE: Record<Restriction['kind'], (name: string, inside: boolean) => string> = {
  tfr: (n) => `TFR: ${n}`,
  prohibited: (n) => `Prohibited area ${n}`,
  restricted: (n, i) => `${i ? 'Inside restricted area' : 'Near restricted area'} ${n}`,
  special_use: (n) => `Special-use airspace: ${n}`,
  national_security: (n) => `UAS flight restriction: ${n}`,
  national_security_part_time: (n) => `Part-time UAS restriction: ${n}`,
  national_defense: (n) => `National defense airspace: ${n}`,
  stadium: (n) => `Stadium within 3 NM: ${n}`,
  fria: (n) => `FAA-recognized identification area: ${n}`,
};

const SURFACE_CONTROLLED: Record<string, string> = { B: 'Class B', C: 'Class C', D: 'Class D', E: 'Class E (surface)' };

const LAANC_HELP = 'https://www.faa.gov/uas/getting_started/laanc';
const TFR_HELP = 'https://tfr.faa.gov/';

export function buildAdvisories(input: {
  airspace: AirspaceInfo | 'unavailable' | null;
  weather: WeatherSnapshot | null;
  daylight: { isDaylight: boolean; civilDawn: string | null; civilDusk: string | null };
  /** Omitted = not looked up (older callers): a reminder replaces the result. */
  tfrs?: Restriction[] | 'unavailable';
  restrictions?: Restriction[] | 'unavailable';
  aviation?: AviationWeather | null;
  forecast?: WindForecast | null;
  kp?: number | null;
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
      out.push({ key: 'airspace', level: 'red', title: `${name}${near} — 0 ft grid`, detail: 'No automatic authorization here. Flight needs an FAA authorization through DroneZone (14 CFR 107.41).', source: 'FAA UAS Facility Map', href: 'https://faadronezone-access.faa.gov/' });
    else
      out.push({
        key: 'airspace',
        level: 'amber',
        title: `${name}${near}`,
        detail: `Authorization required (14 CFR 107.41).${a.laanc ? ` LAANC available up to ${a.ceilingFt} ft AGL — request it in any FAA-approved LAANC app (several are free).` : ' LAANC not available here; apply through DroneZone.'}`,
        source: 'FAA UAS Facility Map',
        href: a.laanc ? LAANC_HELP : 'https://faadronezone-access.faa.gov/',
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

  const av = input.aviation;
  if (av) {
    const at = `${av.station}${av.name ? ` (${av.name})` : ''}, ${Math.round(av.distanceKm)} km away`;
    if (av.visibilitySm != null && av.visibilitySm < 3 && !out.some((x) => x.key === 'visibility'))
      out.push({ key: 'visibility', level: 'red', title: 'Visibility below 3 statute miles', detail: `${at} reports ${av.visibilitySm} SM (14 CFR 107.51(c)).`, source: 'aviationweather.gov METAR' });
    if (av.ceilingFt != null && av.ceilingFt < 900)
      out.push({ key: 'ceiling', level: 'amber', title: `Low ceiling: ${av.ceilingFt} ft`, detail: `${at}. Stay 500 ft below clouds (14 CFR 107.51(d)) — that caps you at ${Math.max(0, av.ceilingFt - 500)} ft AGL.`, source: 'aviationweather.gov METAR' });
    out.push({ key: 'metar', level: av.flightCategory === 'IFR' || av.flightCategory === 'LIFR' ? 'amber' : 'green', title: `Nearest airport: ${av.flightCategory ?? 'reported'}`, detail: av.metar + (av.taf ? `\n${av.taf}` : ''), source: 'aviationweather.gov METAR / TAF' });
  }

  const fc = input.forecast;
  if (fc && fc.maxWindMph >= 20)
    out.push({ key: 'forecast_wind', level: 'amber', title: `Wind building to ${fc.maxWindMph} mph`, detail: `${fc.summary} over the next ${fc.hours} hours.`, source: 'National Weather Service forecast' });

  if (input.kp != null && input.kp >= 5)
    out.push({ key: 'kp', level: 'amber', title: `Geomagnetic storm (Kp ${input.kp})`, detail: 'GNSS positioning and compass may be degraded. Be ready to fly in attitude mode.', source: 'NOAA Space Weather Prediction Center' });

  if (!input.daylight.isDaylight)
    out.push({ key: 'night', level: 'amber', title: 'Night or twilight', detail: 'Anti-collision lighting visible for 3 statute miles is required, and the pilot needs current night training (14 CFR 107.29).', source: 'Computed sunrise/sunset' });

  const t = input.tfrs;
  if (t === undefined) {
    out.push({ key: 'tfr', level: 'amber', title: 'Check TFRs and NOTAMs', detail: 'Temporary flight restrictions are not checked by Certa. Use B4UFLY or an FAA-approved LAANC provider.', source: 'Reminder' });
  } else {
    if (t === 'unavailable') out.push({ key: 'tfr', level: 'amber', title: 'TFRs not checked', detail: 'The FAA TFR service couldn’t be reached. Check tfr.faa.gov before flight.', source: 'FAA TFR service', href: TFR_HELP });
    else {
      const over = t.filter((x) => x.inside);
      const near = t.filter((x) => !x.inside);
      for (const x of over) out.push({ key: `tfr:${x.name}`, level: 'red', title: `Inside a TFR: ${x.name}`, detail: x.detail, source: 'FAA TFR service', href: TFR_HELP });
      for (const x of near) out.push({ key: `tfr:${x.name}`, level: 'amber', title: `TFR nearby: ${x.name}`, detail: x.detail, source: 'FAA TFR service', href: TFR_HELP });
      if (!t.length) out.push({ key: 'tfr', level: 'green', title: 'No active TFRs here', detail: 'No temporary flight restriction over or within 5 NM of this point right now.', source: 'FAA TFR service' });
    }
    out.push({ key: 'notam', level: 'amber', title: 'Check NOTAMs', detail: 'Other NOTAMs (equipment, obstacles, airshows) aren’t checked by Certa yet. Review them before flight.', source: 'Reminder', href: 'https://notams.aim.faa.gov/notamSearch/' });
  }

  const r = input.restrictions;
  if (r === 'unavailable') out.push({ key: 'restrictions', level: 'amber', title: 'Special-use airspace not checked', detail: 'FAA restriction layers couldn’t be reached. Check B4UFLY or the FAA UAS Data Delivery System.', source: 'FAA ADDS' });
  else if (r) {
    for (const x of r) {
      const red = x.inside && ['prohibited', 'restricted', 'national_security', 'national_defense'].includes(x.kind);
      const info = x.kind === 'fria';
      out.push({ key: `${x.kind}:${x.name}`, level: info ? 'green' : red ? 'red' : 'amber', title: RESTRICTION_TITLE[x.kind](x.name, x.inside), detail: x.detail, source: 'FAA ADDS' });
    }
  }
  return out;
}
