import { describe, expect, it } from 'vitest';
import { batteryFlags, haversineM, LogReadError, parseCsv, parseFlightLog, summarizeTelemetry, telemetryDedupeKey, trackOf, type Telemetry } from '../src/index.js';

const enc = new TextEncoder();
const T0 = Date.UTC(2026, 9, 23, 16, 0, 0);
const HOME = { lat: 39.65, lon: -104.85 };
/** A 10-minute survey: climb to 60 m over 1 min, fly a 400 m leg out and back, land. */
function flightPoint(s: number) {
  const h = s < 30 ? 0 : s < 90 ? ((s - 30) / 60) * 60 : s < 510 ? 60 : s < 570 ? 60 - ((s - 510) / 60) * 60 : 0;
  const leg = s < 90 || s >= 510 ? 0 : s < 300 ? (s - 90) / 210 : 1 - (s - 300) / 210;
  return { lat: HOME.lat + leg * 0.0036, lon: HOME.lon, h, speed: s >= 90 && s < 510 ? 400 / 210 : s >= 30 && s < 570 ? 1 : 0, pct: 98 - (s / 600) * 60, volt: 25.2 - (s / 600) * 3, cells: [4.2, 4.19, 4.2, 4.18, 4.2, 4.2].map((c) => c - (s / 600) * 0.5 - (s > 400 ? 0.12 : 0) * (c === 4.18 ? 1 : 0)) };
}
const seconds = Array.from({ length: 61 }, (_, i) => i * 10);

describe('flight logs', () => {
  it('reads an AirData CSV export with units, cells and messages', () => {
    const header = 'time(millisecond),datetime(utc),latitude,longitude,height_above_takeoff(feet),altitude_above_seaLevel(feet),speed(mph),battery_percent,voltage(v),voltageCell1,voltageCell2,voltageCell3,voltageCell4,voltageCell5,voltageCell6,message';
    const rows = seconds.map((s) => {
      const p = flightPoint(s);
      const d = new Date(T0 + Math.floor(s) * 1000).toISOString().replace('T', ' ').slice(0, 19);
      return [s * 1000, d, p.lat.toFixed(7), p.lon.toFixed(7), (p.h / 0.3048).toFixed(1), ((p.h + 1650) / 0.3048).toFixed(1), (p.speed / 0.44704).toFixed(2), p.pct.toFixed(0), p.volt.toFixed(2), ...p.cells.map((c) => c.toFixed(3)), s === 300 ? '"Strong wind, fly with caution"' : ''].join(',');
    });
    const tel = parseFlightLog('Oct-23rd-2026-10-00AM-Flight-Airdata.csv', enc.encode([header, ...rows].join('\r\n')));
    expect(tel.parser).toBe('airdata-csv');
    const { summary, track } = summarizeTelemetry(tel)!;
    expect(summary.takeoffAt).toBe(new Date(T0 + 30_000).toISOString());
    expect(summary.landingAt).toBe(new Date(T0 + 570_000).toISOString());
    expect(summary.maxHeightM).toBeCloseTo(60, 0);
    expect(summary.maxDistanceM).toBeGreaterThan(395);
    expect(summary.maxDistanceM).toBeLessThan(405);
    expect(summary.totalDistanceM).toBeGreaterThan(790);
    expect(summary.totalDistanceM).toBeLessThan(810);
    expect(summary.maxSpeedMps).toBeCloseTo(1.9, 1);
    expect(summary.battery).toMatchObject({ startPct: 95, endPct: 41, startVoltageV: 25.05 });
    expect(summary.battery.maxCellDeltaV).toBeCloseTo(0.14, 2);
    expect(summary.events).toEqual([{ at: new Date(T0 + 300_000).toISOString(), level: 'warning', text: 'Strong wind, fly with caution' }]);
    expect(track.length).toBeGreaterThan(50);
    expect(track[0]).toEqual([-104.85, 39.65, 0, (T0 + 30_000) / 1000]);
    expect(batteryFlags(summary.battery).level).toBe('amber');
  });

  it('reads GPX with MSL elevations and KML timed tracks', () => {
    const pts = seconds.map((s) => { const p = flightPoint(s); return `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${1650 + p.h}</ele><time>${new Date(T0 + s * 1000).toISOString()}</time></trkpt>`; });
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Mavic 3E</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
    const g = summarizeTelemetry(parseFlightLog('track.gpx', enc.encode(gpx)))!.summary;
    expect(g).toMatchObject({ parser: 'gpx', aircraftModel: 'Mavic 3E', durationSeconds: 540 });
    expect(g.maxHeightM).toBeCloseTo(60, 0);
    const kml = `<kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><gx:Track>${seconds.map((s) => `<when>${new Date(T0 + s * 1000).toISOString()}</when>`).join('')}${seconds.map((s) => { const p = flightPoint(s); return `<gx:coord>${p.lon} ${p.lat} ${p.h}</gx:coord>`; }).join('')}</gx:Track></Placemark></kml>`;
    expect(summarizeTelemetry(parseFlightLog('track.kml', enc.encode(kml)))!.summary).toMatchObject({ parser: 'kml', durationSeconds: 540 });
    expect(() => parseFlightLog('plain.kml', enc.encode('<kml><LineString><coordinates>1,2 3,4</coordinates></LineString></kml>'))).toThrow(LogReadError);
  });

  it('reads ArduPilot DataFlash logs, with GPS time, battery cells and errors', () => {
    const bin = dataflash([
      ['GPS', 'QBIHBcLLeffffB', 'TimeUS,Status,GMS,GWk,NSats,HDop,Lat,Lng,Alt,Spd,GCrs,VZ,Yaw,U'],
      ['BAT', 'QBfffffcfB', 'TimeUS,Inst,Volt,VoltR,Curr,CurrTot,EnrgTot,Temp,Res,RemPct'],
      ['BCL', 'QBfHHHHHH', 'TimeUS,Instance,Volt,V0,V1,V2,V3,V4,V5'],
      ['MSG', 'QZ', 'TimeUS,Message'],
      ['ERR', 'QBB', 'TimeUS,Subsys,ECode'],
    ], (emit) => {
      emit('MSG', [1e6, 'ArduCopter V4.5.7 (2a3dc4b7)']);
      emit('MSG', [1e6, 'CubeOrange 003A0028 3130510D 31373834']);
      emit('MSG', [1e6, 'Frame: QUAD/X']);
      const gpsMs = (T0 + 18_000 - Date.UTC(1980, 0, 6)) % 604_800_000;
      const wk = Math.floor((T0 + 18_000 - Date.UTC(1980, 0, 6)) / 604_800_000);
      for (const s of seconds) {
        const p = flightPoint(s), us = 5e6 + s * 1e6;
        emit('GPS', [us, 3, gpsMs + s * 1000, wk, 18, 0.7, p.lat, p.lon, 1650 + p.h, p.speed, 0, 0, 0, 1]);
        emit('BAT', [us, 0, p.volt, p.volt, 10, 0, 0, 25, 0, Math.round(p.pct)]);
        emit('BCL', [us, 0, p.volt, ...p.cells.map((c) => Math.round(c * 1000))]);
      }
      emit('ERR', [5e6 + 200e6, 16, 2]);
    });
    const tel = parseFlightLog('00000042.BIN', bin);
    expect(tel).toMatchObject({ parser: 'ardupilot-bin', aircraftModel: 'ArduCopter V4.5.7 (2a3dc4b7) · QUAD/X', aircraftSerial: '003A0028-3130510D-31373834' });
    const { summary } = summarizeTelemetry(tel)!;
    expect(summary.takeoffAt).toBe(new Date(T0 + 30_000).toISOString());
    expect(summary.durationSeconds).toBe(540);
    expect(summary.maxHeightM).toBeCloseTo(60, 0);
    expect(summary.battery.minCellV).toBeCloseTo(3.585, 3);
    expect(summary.events).toEqual([{ at: new Date(T0 + 200_000).toISOString(), level: 'error', text: 'Error: subsystem 16, code 2' }]);
  });

  it('reads PX4 ULog files, old and new GPS topics', () => {
    for (const newer of [false, true]) {
      const tel = parseFlightLog('log_12_2026-10-23-16-00-00.ulg', ulog(newer));
      expect(tel).toMatchObject({ parser: 'px4-ulog', aircraftModel: 'PX4 HOLYBRO_X500', aircraftSerial: '0001A2B3C4' });
      const { summary } = summarizeTelemetry(tel)!;
      expect(summary.takeoffAt).toBe(new Date(T0 + 30_000).toISOString());
      expect(summary.maxDistanceM).toBeGreaterThan(395);
      expect(summary.battery).toMatchObject({ startPct: 95, endPct: 41 });
      expect(summary.battery.minCellV).toBeCloseTo(3.585, 3);
      expect(summary.events.map((e) => e.text)).toEqual(['Low battery, return advised']);
    }
  });

  it('explains files it cannot use', () => {
    expect(() => parseFlightLog('DJIFlightRecord_2026-10-23_[16-00-00].txt', new Uint8Array([3, 0, 0, 1, 200, 4]))).toThrow(/encrypted/);
    expect(() => parseFlightLog('summary.csv', enc.encode('date,flights\n2026-10-23,3\n2026-10-24,1'))).toThrow(/latitude/);
    expect(() => parseFlightLog('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff]))).toThrow(LogReadError);
    const ground: Telemetry = { parser: 'csv', aircraftModel: null, aircraftSerial: null, batterySerials: [], events: [], warnings: [], samples: [0, 1, 2].map((i) => ({ t: T0 + i * 1000, lat: 1, lon: 1, heightM: 0, altMslM: null, speedMps: 0, batteryPct: null, voltageV: null, cellV: null })) };
    expect(summarizeTelemetry(ground)).toBeNull();
  });

  it('ignores GPS jumps, thins tracks and keys duplicates', () => {
    expect(haversineM(HOME, { lat: HOME.lat + 0.0036, lon: HOME.lon })).toBeCloseTo(400.3, 0);
    const samples = Array.from({ length: 5000 }, (_, i) => ({ t: T0 + i * 100, lat: HOME.lat + i * 1e-6, lon: HOME.lon, heightM: 30, altMslM: null, speedMps: 5, batteryPct: null, voltageV: null, cellV: null }));
    samples[2500] = { ...samples[2500]!, lat: HOME.lat + 1 };
    const { summary, track } = summarizeTelemetry({ parser: 'csv', aircraftModel: null, aircraftSerial: null, batterySerials: [], events: [], warnings: [], samples })!;
    expect(summary.warnings).toContain('2 GPS jumps ignored in the distance.');
    expect(summary.totalDistanceM).toBeLessThan(600);
    expect(track.length).toBeLessThanOrEqual(1500);
    expect(track.at(-1)![3]).toBe(Math.round((T0 + 4999 * 100) / 1000));
    expect(trackOf([])).toEqual([]);
    expect(telemetryDedupeKey({ aircraftSerial: '1581f5bkd225400', aircraftModel: null, takeoffAt: '2026-10-23T16:00:30.000Z' }, 'x')).toBe('1581F5BKD225400@2026-10-23T16:00');
    expect(parseCsv('a,"b,""c"""\r\n1,2')).toEqual([['a', 'b,"c"'], ['1', '2']]);
  });
});

// ---------------------------------------------------------------- log builders for the tests

function dataflash(defs: [string, string, string][], body: (emit: (name: string, values: (number | string)[]) => void) => void): Uint8Array {
  const SIZE: Record<string, number> = { b: 1, B: 1, M: 1, h: 2, H: 2, c: 2, C: 2, i: 4, I: 4, e: 4, E: 4, L: 4, f: 4, n: 4, d: 8, q: 8, Q: 8, N: 16, Z: 64 };
  const out: number[] = [];
  const str = (s: string, n: number) => Array.from({ length: n }, (_, i) => (i < s.length ? s.charCodeAt(i) : 0));
  const types = new Map<string, { type: number; format: string }>();
  defs.forEach(([name, format, columns], i) => {
    const type = 130 + i;
    types.set(name, { type, format });
    const length = 3 + [...format].reduce((a, c) => a + SIZE[c]!, 0);
    out.push(0xa3, 0x95, 0x80, type, length, ...str(name, 4), ...str(format, 16), ...str(columns, 64));
  });
  out.push(0x00, 0x11); // a little noise between messages must be skipped
  body((name, values) => {
    const { type, format } = types.get(name)!;
    const b: number[] = [0xa3, 0x95, type];
    [...format].forEach((c, i) => {
      const v = values[i]!;
      const dv = new DataView(new ArrayBuffer(8));
      const put = (n: number) => b.push(...new Uint8Array(dv.buffer, 0, n));
      switch (c) {
        case 'B': case 'M': dv.setUint8(0, Number(v)); put(1); break;
        case 'H': dv.setUint16(0, Number(v), true); put(2); break;
        case 'c': dv.setInt16(0, Math.round(Number(v) * 100), true); put(2); break;
        case 'I': dv.setUint32(0, Number(v), true); put(4); break;
        case 'L': dv.setInt32(0, Math.round(Number(v) * 1e7), true); put(4); break;
        case 'e': dv.setInt32(0, Math.round(Number(v) * 100), true); put(4); break;
        case 'f': dv.setFloat32(0, Number(v), true); put(4); break;
        case 'Q': dv.setBigUint64(0, BigInt(Math.round(Number(v))), true); put(8); break;
        case 'Z': b.push(...str(String(v), 64)); break;
        default: throw new Error(`test encoder lacks ${c}`);
      }
    });
    out.push(...b);
  });
  return new Uint8Array(out);
}

function ulog(newer: boolean): Uint8Array {
  const out: number[] = [0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35, 0x01, ...new Array(8).fill(0)];
  const msg = (type: string, payload: number[]) => {
    out.push(payload.length & 0xff, payload.length >> 8, type.charCodeAt(0), ...payload);
  };
  const s = (x: string) => [...x].map((c) => c.charCodeAt(0));
  const le = (n: number, bytes: number, kind: 'u' | 'i' | 'f' | 'd' = 'u') => {
    const dv = new DataView(new ArrayBuffer(8));
    if (kind === 'f') dv.setFloat32(0, n, true);
    else if (kind === 'd') dv.setFloat64(0, n, true);
    else if (bytes === 8) dv.setBigUint64(0, BigInt(Math.round(n)), true);
    else if (bytes === 4) kind === 'i' ? dv.setInt32(0, n, true) : dv.setUint32(0, n, true);
    else if (bytes === 2) dv.setUint16(0, n, true);
    else dv.setUint8(0, n);
    return [...new Uint8Array(dv.buffer, 0, bytes)];
  };
  const info = (key: string, value: string) => msg('I', [key.length, ...s(key), ...s(value)]);
  info('char[3] sys_name', 'PX4');
  info('char[13] ver_hw', 'HOLYBRO_X500');
  info('char[10] sys_uuid', '0001A2B3C4');
  const gpsTopic = newer ? 'sensor_gps' : 'vehicle_gps_position';
  msg('F', s(newer
    ? 'sensor_gps:uint64_t timestamp;uint64_t time_utc_usec;double latitude_deg;double longitude_deg;double altitude_msl_m;float vel_m_s;uint8_t fix_type;uint8_t[7] _padding0'
    : 'vehicle_gps_position:uint64_t timestamp;uint64_t time_utc_usec;int32_t lat;int32_t lon;int32_t alt;float vel_m_s;uint8_t fix_type;uint8_t[3] _padding0'));
  msg('F', s('battery_status:uint64_t timestamp;float voltage_v;float remaining;float[14] voltage_cell_v;uint8_t cell_count;uint8_t[3] _padding0'));
  msg('A', [0, ...le(1, 2), ...s(gpsTopic)]);
  msg('A', [0, ...le(2, 2), ...s('battery_status')]);
  const bootUs = 3e9;
  for (const sec of seconds) {
    const p = flightPoint(sec), ts = bootUs + sec * 1e6, utcUs = (T0 + sec * 1000) * 1000;
    const pos = newer ? [...le(p.lat, 8, 'd'), ...le(p.lon, 8, 'd'), ...le(1650 + p.h, 8, 'd')] : [...le(Math.round(p.lat * 1e7), 4, 'i'), ...le(Math.round(p.lon * 1e7), 4, 'i'), ...le(Math.round((1650 + p.h) * 1000), 4, 'i')];
    msg('D', [...le(1, 2), ...le(ts, 8), ...le(utcUs, 8), ...pos, ...le(p.speed, 4, 'f'), 3]);
    const cells = [...p.cells, ...new Array(8).fill(0)].flatMap((c) => le(c, 4, 'f'));
    msg('D', [...le(2, 2), ...le(ts, 8), ...le(p.volt, 4, 'f'), ...le(p.pct / 100, 4, 'f'), ...cells, 6]);
    if (sec === 400) msg('L', [0x34, ...le(ts, 8), ...s('Low battery, return advised')]);
    if (sec === 410) msg('L', [0x36, ...le(ts, 8), ...s('info only, not a warning')]);
  }
  return new Uint8Array(out);
}

describe('linking logs to the fleet', () => {
  const fleet = [
    { id: 'a1', make: 'DJI', model: 'Mavic 3 Enterprise', serialNumber: '1581F5FHD23' },
    { id: 'a2', make: 'DJI', model: 'Matrice 30T', serialNumber: '1581F5BKD225400' },
    { id: 'a3', make: 'DJI', model: 'Matrice 30T', serialNumber: '1581F5BKD225401' },
    { id: 'a4', make: 'Holybro', model: 'X500', serialNumber: '0001A2B3C4', retired: true },
  ];
  it('links by serial first, then by a unique model', async () => {
    const { matchAircraft, matchBatteries, isLikelyDuplicate } = await import('../src/index.js');
    expect(matchAircraft({ aircraftSerial: '1581-f5bk-d225401', aircraftModel: 'M30T' }, fleet)).toEqual({ id: 'a3', by: 'serial' });
    expect(matchAircraft({ aircraftSerial: null, aircraftModel: 'Mavic 3E (Mavic 3 Enterprise)' }, fleet)).toEqual({ id: 'a1', by: 'model' });
    expect(matchAircraft({ aircraftSerial: null, aircraftModel: 'Matrice 30T' }, fleet)).toBeNull(); // two fit: ask
    expect(matchAircraft({ aircraftSerial: '0001A2B3C4', aircraftModel: 'PX4 HOLYBRO_X500' }, fleet)).toBeNull(); // retired
    expect(matchBatteries(['tb30-0001', 'unknown1'], [{ id: 'b1', serialNumber: 'TB30 0001' }, { id: 'b2', serialNumber: 'TB30-0002' }])).toEqual(['b1']);
    expect(isLikelyDuplicate('2026-10-23T16:00:30Z', 'a1', [{ aircraftId: 'a1', takeoffAt: '2026-10-23T16:01:30Z' }])).toBe(true);
    expect(isLikelyDuplicate('2026-10-23T16:00:30Z', 'a2', [{ aircraftId: 'a1', takeoffAt: '2026-10-23T16:00:30Z' }])).toBe(false);
  });
});
