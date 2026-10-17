import { describe, expect, it } from 'vitest';
import { clearConditionsCache, conditionsAt } from '../src/lib/conditions.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface Fake {
  cells?: object[];
  obs?: object;
  failAirspace?: boolean;
  failWeather?: boolean;
  /** FAA ADDS layer name → features' attributes. */
  layers?: Record<string, object[]>;
  tfrs?: { geometry: object; properties: object }[];
  metars?: object[];
  taf?: string;
  hourly?: { windSpeed: string; windDirection: string }[];
  kp?: number;
}

function fakeFetch(opts: Fake) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('arcgis')) {
      if (opts.failAirspace) return json({}, 503);
      if (url.includes('FAA_UAS_FacilityMap')) return json({ features: (opts.cells ?? []).map((attributes) => ({ attributes })) });
      const layer = /services\/([^/]+)\/FeatureServer/.exec(url)?.[1] ?? '';
      return json({ features: (opts.layers?.[layer] ?? []).map((attributes) => ({ attributes })) });
    }
    if (opts.failWeather) throw new TypeError('network down');
    if (url.includes('tfr.faa.gov')) return json({ type: 'FeatureCollection', features: opts.tfrs ?? [] });
    if (url.includes('aviationweather.gov/api/data/metar')) return json(opts.metars ?? []);
    if (url.includes('aviationweather.gov/api/data/taf')) return json(opts.taf ? [{ rawTAF: opts.taf }] : []);
    if (url.includes('swpc.noaa.gov')) return json([{ time_tag: '2026-10-11T15:00:00', Kp: opts.kp ?? 1.33 }]);
    if (url.includes('/points/')) return json({ properties: { observationStations: 'https://api.weather.gov/gridpoints/BOU/1,1/stations', forecastHourly: 'https://api.weather.gov/gridpoints/BOU/1,1/forecast/hourly' } });
    if (url.endsWith('/forecast/hourly')) return json({ properties: { periods: opts.hourly ?? [{ windSpeed: '5 mph', windDirection: 'W' }] } });
    if (url.endsWith('/stations')) return json({ features: [{ properties: { stationIdentifier: 'KAPA' } }] });
    if (url.includes('/observations/latest')) return json({ properties: { timestamp: '2026-10-11T15:00:00Z', temperature: { value: 12 }, windSpeed: { value: 36 }, windGust: { value: 54 }, windDirection: { value: 270 }, visibility: { value: 3200 }, textDescription: 'Light Rain', cloudLayers: [] , ...opts.obs } });
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

/** A square around a point, as GeoJSON [lon, lat]. */
const square = (lat: number, lon: number, d: number) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });

const NOON_MDT = new Date('2026-10-11T18:00:00Z');

describe('pre-flight conditions', () => {
  it('turns facility-map cells and an NWS observation into advisories', async () => {
    clearConditionsCache();
    const { f } = fakeFetch({ cells: [{ CEILING: 200, APT1_NAME: 'Centennial', APT1_LAANC: 1, AIRSPACE_1: 'D' }, { CEILING: 100, APT1_NAME: 'Centennial', APT1_LAANC: 1, AIRSPACE_1: 'D' }] });
    const r = await conditionsAt(f, 39.57, -104.85, NOON_MDT);
    expect(r.airspace).toEqual({ class: 'D', ceilingFt: 100, airport: 'Centennial', laanc: true }); // lowest ceiling governs
    expect(r.weather).toMatchObject({ provider: 'NWS KAPA', windSpeedMps: 10, windGustMps: 15, visibilityM: 3200, summary: 'Light Rain' });
    expect(r.daylight.isDaylight).toBe(true);
    const by = Object.fromEntries(r.advisories.map((a) => [a.key, a]));
    expect(by.airspace).toMatchObject({ level: 'amber', title: 'Class D near Centennial' });
    expect(by.airspace!.detail).toContain('LAANC available up to 100 ft AGL');
    expect(by.visibility!.level).toBe('red');
    expect(by.precip!.level).toBe('amber');
    expect(by.wind!.detail).toContain('gusts 29 kt');
    expect(by.night).toBeUndefined();
    expect(by.tfr).toMatchObject({ level: 'green', title: 'No active TFRs here' });
    expect(by.notam!.level).toBe('amber');
  });

  it('degrades to "not checked" when services fail, and retries failures instead of caching them', async () => {
    clearConditionsCache();
    const { f, calls } = fakeFetch({ failAirspace: true, failWeather: true });
    const r = await conditionsAt(f, 40.0, -105.0, new Date('2026-10-12T05:00:00Z'));
    expect(r.airspace).toBe('unavailable');
    expect(r.weather).toBeNull();
    expect(r.tfrs).toBe('unavailable');
    expect(r.restrictions).toBe('unavailable');
    expect(r.advisories.map((a) => a.title)).toEqual(['Airspace not checked', 'Weather not available', 'Night or twilight', 'TFRs not checked', 'Check NOTAMs', 'Special-use airspace not checked']);
    const n = calls.length;
    await conditionsAt(f, 40.001, -105.001, new Date('2026-10-12T05:00:00Z'));
    expect(calls.filter((u) => u.includes('FacilityMap')).length).toBe(2); // failed lookup retried
    expect(calls.length).toBeGreaterThan(n);
  });

  it('caches successful lookups per ~1 km cell and the national TFR list once', async () => {
    clearConditionsCache();
    const { f, calls } = fakeFetch({});
    await conditionsAt(f, 39.6, -104.9, NOON_MDT);
    const n = calls.length;
    await conditionsAt(f, 39.601, -104.901, NOON_MDT);
    expect(calls.length).toBe(n);
    await conditionsAt(f, 41.0, -104.9, NOON_MDT); // another cell: new lookups, but the TFR list is shared
    expect(calls.filter((u) => u.includes('tfr.faa.gov')).length).toBe(1);
  });

  it('no grid cell means likely Class G', async () => {
    clearConditionsCache();
    const { f } = fakeFetch({ cells: [], obs: { visibility: { value: 16000 }, windSpeed: { value: 10 }, windGust: { value: null }, textDescription: 'Clear' } });
    const r = await conditionsAt(f, 38.0, -103.5, NOON_MDT);
    expect(r.advisories.map((a) => [a.key, a.level])).toEqual([['airspace', 'green'], ['weather', 'green'], ['tfr', 'green'], ['notam', 'amber']]);
  });

  it('an empty LAANC grid inside surface controlled airspace is not reported as Class G', async () => {
    clearConditionsCache();
    const { f } = fakeFetch({ cells: [], layers: { Class_Airspace: [{ NAME: 'WASHINGTON-TRI AREA CLASS B', CLASS: 'B', LOCAL_TYPE: 'CLASS_B', LOWER_VAL: 0, LOWER_CODE: 'SFC' }, { NAME: 'WASHINGTON CLASS E5', CLASS: 'E', LOCAL_TYPE: 'CLASS_E5', LOWER_VAL: 700, LOWER_CODE: 'SFC' }] } });
    const r = await conditionsAt(f, 38.8977, -77.0365, NOON_MDT);
    expect(r.airspace).toEqual({ class: 'B', ceilingFt: null, airport: 'WASHINGTON-TRI AREA', laanc: false });
    const air = r.advisories.find((a) => a.key === 'airspace')!;
    expect(air.level).toBe('amber');
    expect(air.detail).toContain('DroneZone');
  });

  it('flags TFRs, prohibited and special-use airspace, stadiums, low ceilings, forecast wind, and geomagnetic storms', async () => {
    clearConditionsCache();
    const lat = 38.8977, lon = -77.0365;
    const { f } = fakeFetch({
      cells: [],
      obs: { visibility: { value: 16000 }, windSpeed: { value: 10 }, windGust: { value: null }, textDescription: 'Cloudy' },
      tfrs: [
        { geometry: square(lat, lon, 0.05), properties: { NOTAM_KEY: '4/9383-1-FDC-F', TITLE: 'WASHINGTON, DC', LEGAL: 'SECURITY' } },
        { geometry: square(lat + 0.09, lon, 0.02), properties: { NOTAM_KEY: '6/1111-1-FDC-F', TITLE: 'NEARBY EVENT', LEGAL: 'SPECIAL' } },
        { geometry: square(lat + 2, lon, 0.02), properties: { NOTAM_KEY: '6/2222-1-FDC-F', TITLE: 'FAR AWAY', LEGAL: 'HAZARDS' } },
      ],
      layers: {
        Prohibited_Areas: [{ NAME: 'P-56', TYPE_CODE: 'P', LOWER_VAL: '0', LOWER_UOM: 'FT', LOWER_CODE: 'SFC', UPPER_VAL: '18000', UPPER_UOM: 'FT', UPPER_CODE: 'MSL' }],
        Special_Use_Airspace: [{ NAME: 'BISON MOA', TYPE_CODE: 'MOA', LOWER_VAL: '1000', LOWER_UOM: 'FT', LOWER_CODE: 'SFC', UPPER_VAL: '180', UPPER_UOM: 'FL', UPPER_CODE: 'STD' }],
        Stadiums: [{ NAME: 'Nationals Park', CITY: 'Washington' }],
      },
      metars: [
        { icaoId: 'KFAR', name: 'Far Field, VA, US', lat: lat + 0.4, lon, fltCat: 'VFR', visib: '10+', clouds: [], rawOb: 'METAR KFAR' },
        { icaoId: 'KDCA', name: 'Washington National, DC, US', lat: lat - 0.03, lon, fltCat: 'IFR', visib: 2, clouds: [{ cover: 'FEW', base: 400 }, { cover: 'OVC', base: 700 }], rawOb: 'METAR KDCA 111552Z 36017KT 2SM OVC007' },
      ],
      taf: 'TAF KDCA 111130Z',
      hourly: [{ windSpeed: '10 mph', windDirection: 'N' }, { windSpeed: '15 to 25 mph', windDirection: 'N' }, { windSpeed: '20 mph', windDirection: 'NW' }],
      kp: 6.33,
    });
    const r = await conditionsAt(f, lat, lon, NOON_MDT);
    const by = Object.fromEntries(r.advisories.map((a) => [a.key, a]));
    expect(by['tfr:NOTAM 4/9383']).toMatchObject({ level: 'red', title: 'Inside a TFR: NOTAM 4/9383' });
    expect(by['tfr:NOTAM 6/1111']).toMatchObject({ level: 'amber' });
    expect(by['tfr:NOTAM 6/1111']!.detail).toMatch(/NM away/);
    expect(by['tfr:NOTAM 6/2222']).toBeUndefined();
    expect(by['prohibited:P-56']).toMatchObject({ level: 'red' });
    expect(by['prohibited:P-56']!.detail).toContain('From the surface to 18,000 ft MSL');
    expect(by['special_use:BISON MOA']).toMatchObject({ level: 'amber' });
    expect(by['special_use:BISON MOA']!.detail).toContain('1,000 ft AGL to FL180');
    expect(by['stadium:Nationals Park, Washington']).toMatchObject({ level: 'amber' });
    expect(r.aviation).toMatchObject({ station: 'KDCA', ceilingFt: 700, visibilitySm: 2, taf: 'TAF KDCA 111130Z' }); // nearest of two
    expect(by.visibility).toMatchObject({ level: 'red' });
    expect(by.ceiling!.detail).toContain('caps you at 200 ft AGL');
    expect(by.forecast_wind).toMatchObject({ level: 'amber', title: 'Wind building to 25 mph' });
    expect(by.kp).toMatchObject({ level: 'amber' });
  });
});
