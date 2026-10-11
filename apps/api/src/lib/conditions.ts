/**
 * Public data for pre-flight conditions: the FAA UAS Facility Map grid (airspace class and
 * LAANC ceiling) and the nearest National Weather Service observation. Both are free, US-only,
 * keyless services. Failures degrade to "not checked" advisories rather than errors, and
 * results are cached briefly per ~1 km cell so a busy site doesn't hammer either service.
 */
import { AirspaceClass, buildAdvisories, isCivilDaylight, type AirspaceInfo, type ConditionsResponse, type WeatherSnapshot } from '@certa/core';
import { VERSION } from '../config.js';

const FACILITY_MAP =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query';
const NWS = 'https://api.weather.gov';
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
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return value;
}

async function getJson(f: Fetch, url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await f(url, { headers: { 'user-agent': UA, accept: 'application/geo+json, application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
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
    if (!cells.length) return null;
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
    const stations = await getJson(f, point.properties.observationStations);
    const station = stations.features?.[0]?.properties?.stationIdentifier;
    if (!station) return null;
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

export async function conditionsAt(f: Fetch, lat: number, lon: number, now = new Date()): Promise<ConditionsResponse> {
  const cell = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const [airspace, weather] = await Promise.all([
    cached(`air:${cell}`, () => lookupAirspace(f, lat, lon)),
    cached(`wx:${cell}`, () => nearestObservation(f, lat, lon)),
  ]);
  const daylight = isCivilDaylight(now, lat, lon);
  return { point: { lat, lon }, checkedAt: now.toISOString(), airspace, weather, daylight, advisories: buildAdvisories({ airspace, weather, daylight }) };
}

/** Test hook: forget cached lookups. */
export const clearConditionsCache = () => cache.clear();
