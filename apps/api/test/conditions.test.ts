import { describe, expect, it } from 'vitest';
import { clearConditionsCache, conditionsAt } from '../src/lib/conditions.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(opts: { cells?: object[]; obs?: object; failAirspace?: boolean; failWeather?: boolean }) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('arcgis')) return opts.failAirspace ? json({}, 503) : json({ features: (opts.cells ?? []).map((attributes) => ({ attributes })) });
    if (opts.failWeather) throw new TypeError('network down');
    if (url.includes('/points/')) return json({ properties: { observationStations: 'https://api.weather.gov/gridpoints/BOU/1,1/stations' } });
    if (url.endsWith('/stations')) return json({ features: [{ properties: { stationIdentifier: 'KAPA' } }] });
    if (url.includes('/observations/latest')) return json({ properties: { timestamp: '2026-10-11T15:00:00Z', temperature: { value: 12 }, windSpeed: { value: 36 }, windGust: { value: 54 }, windDirection: { value: 270 }, visibility: { value: 3200 }, textDescription: 'Light Rain', cloudLayers: [] , ...opts.obs } });
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

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
    expect(by.tfr!.level).toBe('amber');
  });

  it('degrades to "not checked" when services fail, and caches per cell', async () => {
    clearConditionsCache();
    const { f, calls } = fakeFetch({ failAirspace: true, failWeather: true });
    const r = await conditionsAt(f, 40.0, -105.0, new Date('2026-10-12T05:00:00Z'));
    expect(r.airspace).toBe('unavailable');
    expect(r.weather).toBeNull();
    expect(r.advisories.map((a) => a.title)).toEqual(['Airspace not checked', 'Weather not available', 'Night or twilight', 'Check TFRs and NOTAMs']);
    const n = calls.length;
    await conditionsAt(f, 40.001, -105.001, new Date('2026-10-12T05:00:00Z'));
    expect(calls.length).toBe(n); // same ~1 km cell: served from cache
  });

  it('no grid cell means likely Class G', async () => {
    clearConditionsCache();
    const { f } = fakeFetch({ cells: [], obs: { visibility: { value: 16000 }, windSpeed: { value: 10 }, windGust: { value: null }, textDescription: 'Clear' } });
    const r = await conditionsAt(f, 38.0, -103.5, NOON_MDT);
    expect(r.advisories.map((a) => [a.key, a.level])).toEqual([['airspace', 'green'], ['weather', 'green'], ['tfr', 'amber']]);
  });
});
