/**
 * Public data for pre-flight conditions, all free, keyless, US-only services run by the FAA,
 * NWS and NOAA: the UAS Facility Map grid (airspace class, LAANC ceiling), active TFRs, FAA
 * special-use airspace and UAS flight restrictions, the nearest NWS observation and hourly
 * forecast, the nearest airport METAR / TAF, and the planetary K index. Failures degrade to
 * "not checked" advisories rather than errors, and results are cached briefly per ~1 km cell
 * (TFRs and Kp once for everyone) so a busy site doesn't hammer any service.
 */
import { AirspaceClass, buildAdvisories, isCivilDaylight, type AirspaceInfo, type AviationWeather, type ConditionsResponse, type Restriction, type WeatherSnapshot, type WindForecast } from '@certa/core';
import { VERSION } from '../config.js';

const FACILITY_MAP =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query';
const NWS = 'https://api.weather.gov';
const ADDS = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';
const TFR_WFS = 'https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=1000&outputFormat=application/json&srsname=EPSG:4326';
const AWC = 'https://aviationweather.gov/api/data';
const KP = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const NM = 1852;
const TIMEOUT_MS = 6000;
const TTL_MS = 10 * 60_000;

type Fetch = typeof fetch;
/** NWS asks API clients to identify themselves; set from PUBLIC_URL at startup. */
let UA = `Certa/${VERSION}`;
export const setConditionsContact = (publicUrl: string) => {
  UA = `Certa/${VERSION} (${publicUrl})`;
};
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  // A failed lookup is retried on the next request rather than remembered.
  if (value !== 'unavailable') cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return value;
}

async function getJson(f: Fetch, url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await f(url, { headers: { 'user-agent': UA, accept: 'application/geo+json, application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const SURFACE_TYPES = new Set(['CLASS_B', 'CLASS_C', 'CLASS_D', 'CLASS_E2', 'CLASS_E3', 'CLASS_E4']);
/** Controlled airspace that begins at the surface (where small UAS fly), most restrictive first; null = none (Class G). */
async function surfaceClass(f: Fetch, lat: number, lon: number): Promise<AirspaceInfo | null> {
  const rows = await adds(f, 'Class_Airspace', lat, lon, 'NAME,CLASS,LOCAL_TYPE,LOWER_VAL,LOWER_CODE');
  const surface = rows
    .filter((r) => SURFACE_TYPES.has(String(r.LOCAL_TYPE)) && Number(r.LOWER_VAL) === 0 && String(r.LOWER_CODE) === 'SFC')
    .sort((a, b) => String(a.CLASS).localeCompare(String(b.CLASS)));
  const top = surface[0];
  if (!top) return null;
  const cls = AirspaceClass.safeParse(String(top.CLASS ?? '').toUpperCase());
  return { class: cls.success ? cls.data : 'unknown', ceilingFt: null, airport: String(top.NAME ?? '').replace(/\s+CLASS\s+\w+$/i, '') || null, laanc: false };
}

/** null = no grid cell here; 'unavailable' = lookup failed. */
export async function lookupAirspace(f: Fetch, lat: number, lon: number): Promise<AirspaceInfo | 'unavailable' | null> {
  try {
    const q = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'CEILING,APT1_NAME,APT1_LAANC,AIRSPACE_1',
      returnGeometry: 'false',
      f: 'json',
    });
    const d = await getJson(f, `${FACILITY_MAP}?${q}`);
    if (d.error) throw new Error(d.error.message);
    const cells = (d.features ?? []).map((x: { attributes: Record<string, unknown> }) => x.attributes);
    // No grid cell is not proof of Class G: the grid leaves gaps (e.g. inside the DC FRZ).
    // Ask the FAA class-airspace layer what starts at the surface here.
    if (!cells.length) return surfaceClass(f, lat, lon);
    // Overlapping cells: the most restrictive (lowest ceiling) governs.
    const c = cells.reduce((m: Record<string, unknown>, x: Record<string, unknown>) => ((x.CEILING as number) < (m.CEILING as number) ? x : m));
    const cls = AirspaceClass.safeParse(String(c.AIRSPACE_1 ?? '').trim().toUpperCase());
    return {
      class: cls.success ? cls.data : 'unknown',
      ceilingFt: typeof c.CEILING === 'number' ? c.CEILING : null,
      airport: (c.APT1_NAME as string) || null,
      laanc: c.APT1_LAANC === 1,
    };
  } catch {
    return 'unavailable';
  }
}

const kmhToMps = (v: number | null | undefined) => (v == null ? null : Math.round((v / 3.6) * 10) / 10);

export async function nearestObservation(f: Fetch, lat: number, lon: number): Promise<WeatherSnapshot | null> {
  try {
    const point = await getJson(f, `${NWS}/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    // Follow only URLs on api.weather.gov, and only well-formed station ids.
    const stationsUrl = String(point.properties?.observationStations ?? '');
    if (!stationsUrl.startsWith(`${NWS}/`)) return null;
    const stations = await getJson(f, stationsUrl);
    const station = String(stations.features?.[0]?.properties?.stationIdentifier ?? '');
    if (!/^[A-Z0-9]{3,6}$/.test(station)) return null;
    const o = (await getJson(f, `${NWS}/stations/${station}/observations/latest`)).properties;
    return {
      provider: `NWS ${station}`,
      fetchedAt: new Date(o.timestamp ?? Date.now()).toISOString(),
      temperatureC: o.temperature?.value ?? null,
      windSpeedMps: kmhToMps(o.windSpeed?.value),
      windGustMps: kmhToMps(o.windGust?.value),
      windDirectionDeg: o.windDirection?.value ?? null,
      visibilityM: o.visibility?.value ?? null,
      cloudBaseM: o.cloudLayers?.find((l: { base?: { value: number | null } }) => l.base?.value != null)?.base.value ?? null,
      precipitationMm: o.precipitationLastHour?.value ?? null,
      summary: o.textDescription || null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- geometry

type Ring = [number, number][];
/** Ray-casting point-in-polygon on [lon, lat] rings (first ring outer, rest holes). */
function inPolygon(lon: number, lat: number, rings: Ring[]): boolean {
  const inRing = (ring: Ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return rings.length > 0 && inRing(rings[0]!) && !rings.slice(1).some(inRing);
}
/** Metres from the point to the nearest edge (local equirectangular projection; fine within tens of km). */
function distanceToRings(lon: number, lat: number, rings: Ring[]): number {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180), ky = 110_540;
  let best = Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i]![0] - lon) * kx, ay = (ring[i]![1] - lat) * ky;
      const bx = (ring[i + 1]![0] - lon) * kx, by = (ring[i + 1]![1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  return best;
}
const polygonsOf = (g: { type: string; coordinates: unknown }): Ring[][] => (g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : []);
const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// ---------------------------------------------------------------- TFRs

/** Active TFRs over the point or within 5 NM of it. The national list is fetched once and shared. */
export async function lookupTfrs(f: Fetch, lat: number, lon: number): Promise<Restriction[] | 'unavailable'> {
  try {
    const all = await cached('tfr:all', async () => {
      const d = await getJson(f, TFR_WFS);
      if (!Array.isArray(d.features)) throw new Error('bad TFR payload');
      return d.features as { geometry: { type: string; coordinates: unknown } | null; properties: Record<string, string> }[];
    });
    const out: Restriction[] = [];
    const seen = new Set<string>();
    for (const t of all) {
      if (!t.geometry) continue;
      const key = t.properties.NOTAM_KEY ?? t.properties.TITLE;
      if (!key || seen.has(key)) continue;
      const polys = polygonsOf(t.geometry);
      const inside = polys.some((p) => inPolygon(lon, lat, p));
      const dist = inside ? 0 : Math.min(...polys.map((p) => distanceToRings(lon, lat, p)));
      if (!inside && dist > 5 * NM) continue;
      seen.add(key);
      const notam = String(key).split('-')[0];
      out.push({
        kind: 'tfr',
        name: `NOTAM ${notam}`,
        detail: `${t.properties.TITLE ?? 'Temporary flight restriction'}${t.properties.LEGAL ? ` · ${t.properties.LEGAL.toLowerCase()}` : ''}${inside ? '' : ` · ${(dist / NM).toFixed(1)} NM away`}. Read the full NOTAM for altitudes and times.`,
        inside,
      });
    }
    return out.sort((a, b) => Number(b.inside) - Number(a.inside));
  } catch {
    return 'unavailable';
  }
}

// ---------------------------------------------------------------- FAA special-use airspace and UAS restrictions

async function adds(f: Fetch, layer: string, lat: number, lon: number, fields: string, distanceM = 0): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: fields,
    returnGeometry: 'false',
    f: 'json',
    ...(distanceM ? { distance: String(distanceM), units: 'esriSRUnit_Meter' } : {}),
  });
  const d = await getJson(f, `${ADDS}/${layer}/FeatureServer/0/query?${q}`);
  if (d.error) throw new Error(d.error.message);
  return (d.features ?? []).map((x: { attributes: Record<string, unknown> }) => x.attributes);
}

/** e.g. "FL180", "1,000 ft AGL", "the surface". */
function altitude(val: unknown, uom: unknown, code: unknown): string {
  const v = Number(val);
  if (val == null || String(val).trim() === '' || !Number.isFinite(v)) return '';
  if (String(uom) === 'FL') return `FL${v}`;
  if (v === 0 && String(code) === 'SFC') return 'the surface';
  return `${v.toLocaleString('en-US')} ft ${String(code) === 'MSL' ? 'MSL' : 'AGL'}`;
}

const SUA_TYPE: Record<string, [Restriction['kind'], string]> = {
  R: ['restricted', 'Flight needs permission from the controlling agency (14 CFR 73).'],
  P: ['prohibited', 'Flight is prohibited (14 CFR 73).'],
  MOA: ['special_use', 'Military operations area: high-speed, low-level military traffic. Use extra vigilance.'],
  D: ['special_use', 'Danger area: hazardous activity.'],
  W: ['special_use', 'Warning area: hazardous activity offshore.'],
  A: ['special_use', 'Alert area: high volume of pilot training or unusual activity.'],
};

/** Prohibited and special-use airspace, national security and defense restrictions, stadiums, and FRIAs at the point. */
export async function lookupRestrictions(f: Fetch, lat: number, lon: number): Promise<Restriction[] | 'unavailable'> {
  try {
    const [sua, prohibited, nsufr, partTime, defense, stadiums, fria] = await Promise.all([
      adds(f, 'Special_Use_Airspace', lat, lon, 'NAME,TYPE_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE,CONT_AGENT'),
      adds(f, 'Prohibited_Areas', lat, lon, 'NAME,TYPE_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE'),
      adds(f, 'DoD_Mar_13', lat, lon, 'Facility,Base,Reason,Ceiling'),
      adds(f, 'Part_Time_National_Security_UAS_Flight_Restrictions', lat, lon, 'Facility,Base,Reason,Ceiling,ACTIVETIME,ENDTIME'),
      adds(f, 'National_Defense_Airspace_TFR_Areas', lat, lon, 'NAME,LOCAL_TYPE,WKHR_RMK'),
      adds(f, 'Stadiums', lat, lon, 'NAME,CITY', 3 * NM),
      adds(f, 'FAA_Recognized_Identification_Areas', lat, lon, 'title,orgName'),
    ]);
    const out: Restriction[] = [];
    const str = (v: unknown) => (v == null ? '' : String(v)).trim();
    for (const a of [...prohibited, ...sua]) {
      const [kind, detail] = SUA_TYPE[str(a.TYPE_CODE)] ?? ['special_use', 'Special-use airspace.'];
      const lo = altitude(a.LOWER_VAL, a.LOWER_UOM, a.LOWER_CODE), hi = altitude(a.UPPER_VAL, a.UPPER_UOM, a.UPPER_CODE);
      const alt = lo || hi ? ` From ${lo || 'the surface'} to ${hi || 'an unpublished altitude'}.` : '';
      const agent = str(a.CONT_AGENT) ? ` Controlling agency: ${str(a.CONT_AGENT)}.` : '';
      if (!out.some((x) => x.name === str(a.NAME))) out.push({ kind, name: str(a.NAME) || 'Unnamed', detail: detail + alt + agent, inside: true });
    }
    for (const a of nsufr) out.push({ kind: 'national_security', name: str(a.Facility) || str(a.Base) || 'Restricted facility', detail: `No UAS flight without FAA approval (14 CFR 99.7, special security instructions).${str(a.Reason) ? ` ${str(a.Reason)}.` : ''}`, inside: true });
    for (const a of partTime) out.push({ kind: 'national_security_part_time', name: str(a.Facility) || str(a.Base) || 'Restricted facility', detail: `Active only at published times${str(a.ACTIVETIME) ? ` (${str(a.ACTIVETIME)}${str(a.ENDTIME) ? `–${str(a.ENDTIME)}` : ''})` : ''}. Check activation before flight.`, inside: true });
    for (const a of defense) out.push({ kind: 'national_defense', name: str(a.NAME) || 'National defense airspace', detail: `${str(a.LOCAL_TYPE) || 'Standing restriction'}${str(a.WKHR_RMK) ? ` · ${str(a.WKHR_RMK)}` : ''}. Flight needs FAA authorization.`, inside: true });
    for (const a of stadiums) out.push({ kind: 'stadium', name: `${str(a.NAME)}${str(a.CITY) ? `, ${str(a.CITY)}` : ''}`, detail: 'During major sporting events a TFR applies within 3 NM up to 3,000 ft AGL, from one hour before to one hour after the event.', inside: false });
    for (const a of fria) out.push({ kind: 'fria', name: str(a.title) || 'FRIA', detail: `${str(a.orgName) ? `${str(a.orgName)}. ` : ''}Aircraft without Remote ID may fly here within line of sight.`, inside: true });
    return out;
  } catch {
    return 'unavailable';
  }
}

// ---------------------------------------------------------------- aviation weather, forecast, space weather

/** The nearest airport METAR (within ~50 km) and its TAF, if it issues one. */
export async function nearestAviationWeather(f: Fetch, lat: number, lon: number): Promise<AviationWeather | null> {
  try {
    const d = 0.45;
    const metars = (await getJson(f, `${AWC}/metar?bbox=${(lat - d).toFixed(3)},${(lon - d).toFixed(3)},${(lat + d).toFixed(3)},${(lon + d).toFixed(3)}&format=json`)) as {
      icaoId: string; name?: string; lat: number; lon: number; fltCat?: string; visib?: string | number; clouds?: { cover: string; base: number | null }[]; rawOb: string;
    }[];
    if (!Array.isArray(metars) || !metars.length) return null;
    const m = metars.map((x) => ({ x, km: haversineKm({ lat, lon }, x) })).sort((a, b) => a.km - b.km)[0]!;
    if (!/^[A-Z0-9]{3,5}$/.test(m.x.icaoId)) return null;
    const tafs = await getJson(f, `${AWC}/taf?ids=${m.x.icaoId}&format=json`).catch(() => []);
    const ceiling = (m.x.clouds ?? []).filter((c) => (c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'OVX') && c.base != null).map((c) => c.base!)[0] ?? null;
    const vis = m.x.visib == null ? null : typeof m.x.visib === 'number' ? m.x.visib : parseFloat(String(m.x.visib).replace('+', ''));
    return {
      station: m.x.icaoId,
      name: m.x.name?.split(',')[0] ?? null,
      distanceKm: Math.round(m.km * 10) / 10,
      flightCategory: m.x.fltCat ?? null,
      ceilingFt: ceiling,
      visibilitySm: vis != null && Number.isFinite(vis) ? vis : null,
      metar: m.x.rawOb,
      taf: Array.isArray(tafs) && tafs[0]?.rawTAF ? String(tafs[0].rawTAF) : null,
    };
  } catch {
    return null;
  }
}

/** Highest sustained wind in the NWS hourly forecast for the next three hours. */
export async function windForecast(f: Fetch, lat: number, lon: number): Promise<WindForecast | null> {
  try {
    const point = await getJson(f, `${NWS}/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    const url = String(point.properties?.forecastHourly ?? '');
    if (!url.startsWith(`${NWS}/`)) return null;
    const periods = ((await getJson(f, url)).properties?.periods ?? []).slice(0, 3) as { windSpeed?: string; windDirection?: string }[];
    if (!periods.length) return null;
    const speeds = periods.map((p) => Math.max(0, ...(String(p.windSpeed ?? '').match(/\d+/g) ?? []).map(Number)));
    const max = Math.max(...speeds);
    return { hours: periods.length, maxWindMph: max, summary: periods.map((p) => `${p.windDirection ?? ''} ${p.windSpeed ?? ''}`.trim()).join(', ') };
  } catch {
    return null;
  }
}

/** Latest observed planetary K index. */
export async function planetaryKp(f: Fetch): Promise<number | null> {
  try {
    const rows = await getJson(f, KP);
    const last = Array.isArray(rows) ? rows[rows.length - 1] : null;
    const kp = last ? Number(Array.isArray(last) ? last[1] : last.Kp) : NaN;
    return Number.isFinite(kp) ? kp : null;
  } catch {
    return null;
  }
}

export async function conditionsAt(f: Fetch, lat: number, lon: number, now = new Date()): Promise<ConditionsResponse> {
  const cell = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const [airspace, weather, tfrs, restrictions, aviation, forecast, kp] = await Promise.all([
    cached(`air:${cell}`, () => lookupAirspace(f, lat, lon)),
    cached(`wx:${cell}`, () => nearestObservation(f, lat, lon)),
    lookupTfrs(f, lat, lon),
    cached(`sua:${cell}`, () => lookupRestrictions(f, lat, lon)),
    cached(`awc:${cell}`, () => nearestAviationWeather(f, lat, lon)),
    cached(`fc:${cell}`, () => windForecast(f, lat, lon)),
    cached('kp', () => planetaryKp(f)),
  ]);
  const daylight = isCivilDaylight(now, lat, lon);
  return { point: { lat, lon }, checkedAt: now.toISOString(), airspace, weather, daylight, tfrs, restrictions, aviation, forecast, kp, advisories: buildAdvisories({ airspace, weather, daylight, tfrs, restrictions, aviation, forecast, kp }) };
}

/** Test hook: forget cached lookups. */
export const clearConditionsCache = () => cache.clear();
