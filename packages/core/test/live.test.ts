import { describe, expect, it } from 'vitest';
import {
  djiAircraftName,
  djiHealthEvents,
  djiOsdToFrame,
  djiStatusReply,
  djiTopology,
  framesToTelemetry,
  LANDED_HOLD_MS,
  parseDjiTopic,
  sessionStep,
  sessionTimedOut,
  summarizeTelemetry,
  type LiveFrame,
  type OpenSession,
} from '../src/index.js';

const T0 = Date.UTC(2026, 9, 23, 16, 0, 0);
/** An M30T OSD message as DJI Pilot 2 publishes it on thing/product/{aircraft_sn}/osd. */
const osd = (s: number, over: Record<string, unknown> = {}) => ({
  tid: `t-${s}`, bid: `b-${s}`, timestamp: T0 + s * 1000, gateway: '5YSZKAV0010002',
  data: {
    latitude: 39.65 + Math.min(Math.max(s - 60, 0), 200) * 0.000018, longitude: -104.85, height: 1650 + (s > 30 ? 50 : 0), elevation: s > 30 && s < 330 ? 50 : 0,
    horizontal_speed: s > 60 && s < 260 ? 2 : 0, vertical_speed: 0, attitude_head: 90, home_distance: 0, mode_code: s >= 30 && s < 330 ? (s < 40 ? 4 : s > 320 ? 10 : 3) : 0,
    wind_speed: 52, position_state: { gps_number: 24, is_fixed: 2 },
    battery: { capacity_percent: 98 - Math.round(s / 10), remain_flight_time: 1500 - s, batteries: [{ index: 0, sn: '4BUPJ8DEA02Q41', capacity_percent: 98 - Math.round(s / 10), voltage: 25100 - s * 5, temperature: 31.5, loop_times: 79 }, { index: 1, sn: '4BUPJ8DEA02Q42', capacity_percent: 97 - Math.round(s / 10), voltage: 25050 - s * 5, temperature: 32, loop_times: 81 }] },
    ...over,
  },
});

describe('DJI Cloud API messages', () => {
  it('reads topics, aircraft state, topology and health alerts', () => {
    expect(parseDjiTopic('thing/product/1581F5BKD225400/osd')).toEqual({ kind: 'osd', sn: '1581F5BKD225400' });
    expect(parseDjiTopic('sys/product/5YSZKAV0010002/status')).toEqual({ kind: 'status', sn: '5YSZKAV0010002' });
    expect(parseDjiTopic('thing/product/../osd')).toBeNull();
    const f = djiOsdToFrame('1581F5BKD225400', osd(120), T0)!;
    expect(f).toMatchObject({ t: T0 + 120_000, heightM: 50, speedMps: 2, mode: 3, modeLabel: 'Manual flight', airborne: true, gpsSats: 24, windMps: 5.2, batteryPct: 86 });
    expect(f.packs).toEqual([
      { sn: '4BUPJ8DEA02Q41', pct: 86, voltageV: 24.5, tempC: 31.5, cycles: 79 },
      { sn: '4BUPJ8DEA02Q42', pct: 85, voltageV: 24.45, tempC: 32, cycles: 81 },
    ]);
    // Before the first fix DJI sends 0,0; a controller's OSD has no flight mode.
    expect(djiOsdToFrame('X1234567', osd(0, { latitude: 0, longitude: 0 }), T0)).toMatchObject({ lat: null, lon: null, airborne: false });
    expect(djiOsdToFrame('5YSZKAV0010002', { data: { capacity_percent: 80, latitude: 1, longitude: 2 } }, T0)).toBeNull();
    expect(djiOsdToFrame('X1234567', 'garbage', T0)).toBeNull();
    const topo = { tid: 'a', bid: 'b', timestamp: T0, method: 'update_topo', data: { domain: '2', type: 144, sub_type: 0, sub_devices: [{ sn: '1581F5BKD225400', domain: '0', type: 67, sub_type: 1, index: 'A' }] } };
    expect(djiTopology(topo)).toEqual({ aircraft: [{ sn: '1581F5BKD225400', model: 'DJI Matrice 30T' }] });
    expect(djiTopology({ ...topo, data: { ...topo.data, sub_devices: [] } })).toEqual({ aircraft: [] });
    expect(djiStatusReply(topo, T0 + 5)).toEqual({ tid: 'a', bid: 'b', timestamp: T0 + 5, method: 'update_topo', data: { result: 0 } });
    expect(djiAircraftName(1234, 0)).toBe('DJI aircraft (type 1234-0)');
    expect(djiHealthEvents({ method: 'hms', timestamp: T0, data: { list: [{ level: 2, code: '0x16100083', in_the_sky: 1 }, { level: 0, code: '0x1' }] } }, T0)).toEqual([{ t: T0, level: 'error', text: 'Aircraft health alert 0x16100083 (in flight)' }]);
  });
});

describe('live sessions', () => {
  it('opens on takeoff, ends 20 s after landing, and summarizes like an imported log', () => {
    let open: OpenSession | null = null;
    const kept: LiveFrame[] = [];
    const actions: string[] = [];
    for (let s = 0; s <= 400; s++) {
      const f = djiOsdToFrame('1581F5BKD225400', osd(s), T0)!;
      const r = sessionStep(open, f);
      open = r.open;
      if (r.action !== 'none') actions.push(`${s}:${r.action}`);
      if (r.action === 'start' || r.action === 'append') kept.push(f);
      if (r.action === 'end') break;
    }
    expect(actions[0]).toBe('30:start');
    expect(actions.at(-1)).toBe(`${330 + LANDED_HOLD_MS / 1000 - 1}:end`);
    const { summary } = summarizeTelemetry(framesToTelemetry({ sn: '1581F5BKD225400', model: 'DJI Matrice 30T', frames: kept, events: [], timedOut: false }))!;
    expect(summary).toMatchObject({ parser: 'dji-cloud-live', aircraftSerial: '1581F5BKD225400', maxHeightM: 50, batterySerials: ['4BUPJ8DEA02Q41', '4BUPJ8DEA02Q42'] });
    expect(summary.durationSeconds).toBeGreaterThanOrEqual(298);
    expect(summary.durationSeconds).toBeLessThanOrEqual(302);
    expect(summary.maxDistanceM).toBeGreaterThan(395);
    expect(summary.battery.minVoltageV).toBeCloseTo(23.4, 1);
  });

  it('closes a session that goes quiet, and ignores ground frames before takeoff', () => {
    expect(sessionStep(null, { t: T0, airborne: false })).toEqual({ open: null, action: 'none' });
    const open = sessionStep(null, { t: T0, airborne: true }).open!;
    expect(sessionTimedOut(open, T0 + 60_000)).toBe(false);
    expect(sessionTimedOut(open, T0 + 120_000)).toBe(true);
    // A brief touch-and-go doesn't end the flight.
    const touched = sessionStep(open, { t: T0 + 5000, airborne: false });
    expect(touched.action).toBe('append');
    expect(sessionStep(touched.open, { t: T0 + 10_000, airborne: true }).action).toBe('append');
    const t = framesToTelemetry({ sn: 'X1234567', model: null, frames: [], events: [], timedOut: true });
    expect(t.warnings[0]).toMatch(/went quiet/);
  });
});
