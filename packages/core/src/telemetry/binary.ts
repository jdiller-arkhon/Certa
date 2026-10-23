import { emptySample, type Telemetry, type TelemetryEvent, type TelemetrySample } from './model.js';
import { LogReadError } from './text.js';

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
/** GPS time runs ahead of UTC by the leap seconds since 1980 (18 since 2017). */
const LEAP_MS = 18_000;
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (const c of b) {
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
};

// ---------------------------------------------------------------- ArduPilot DataFlash (.bin)

const DF_SIZE: Record<string, number> = { b: 1, B: 1, M: 1, h: 2, H: 2, c: 2, C: 2, i: 4, I: 4, e: 4, E: 4, L: 4, f: 4, n: 4, d: 8, q: 8, Q: 8, N: 16, Z: 64, a: 64 };
interface DfFormat { name: string; length: number; format: string; columns: string[] }

function dfDecode(v: DataView, bytes: Uint8Array, at: number, fmt: DfFormat): Record<string, number | string> | null {
  const out: Record<string, number | string> = {};
  let o = at;
  for (let k = 0; k < fmt.format.length; k++) {
    const ch = fmt.format[k]!;
    const size = DF_SIZE[ch];
    if (size == null || o + size > bytes.length) return null;
    const name = fmt.columns[k] ?? `f${k}`;
    let val: number | string;
    switch (ch) {
      case 'b': val = v.getInt8(o); break;
      case 'B': case 'M': val = v.getUint8(o); break;
      case 'h': val = v.getInt16(o, true); break;
      case 'H': val = v.getUint16(o, true); break;
      case 'c': val = v.getInt16(o, true) / 100; break;
      case 'C': val = v.getUint16(o, true) / 100; break;
      case 'i': val = v.getInt32(o, true); break;
      case 'I': val = v.getUint32(o, true); break;
      case 'e': val = v.getInt32(o, true) / 100; break;
      case 'E': val = v.getUint32(o, true) / 100; break;
      case 'L': val = v.getInt32(o, true) / 1e7; break;
      case 'f': val = v.getFloat32(o, true); break;
      case 'd': val = v.getFloat64(o, true); break;
      case 'q': val = Number(v.getBigInt64(o, true)); break;
      case 'Q': val = Number(v.getBigUint64(o, true)); break;
      case 'n': case 'N': case 'Z': val = latin1(bytes.subarray(o, o + size)).trim(); break;
      default: val = 0;
    }
    out[name] = val;
    o += size;
  }
  return out;
}

/** ArduPilot (ArduCopter, ArduPlane, …) DataFlash binary logs from the flight controller's SD card. */
export function parseArduPilotBin(bytes: Uint8Array): Telemetry {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formats = new Map<number, DfFormat>();
  const gps: { timeUs: number; utc: number | null; lat: number; lon: number; alt: number; spd: number; fix: number }[] = [];
  const bat: { timeUs: number; volt: number | null; pct: number | null }[] = [];
  const cells: { timeUs: number; v: number[] }[] = [];
  const msgs: { timeUs: number; text: string }[] = [];
  const errs: { timeUs: number; sub: number; code: number }[] = [];
  let skipped = 0;
  for (let i = 0; i + 3 <= bytes.length; ) {
    if (bytes[i] !== 0xa3 || bytes[i + 1] !== 0x95) { i++; skipped++; continue; }
    const type = bytes[i + 2]!;
    if (type === 0x80) {
      if (i + 89 > bytes.length) break;
      const t = bytes[i + 3]!;
      formats.set(t, {
        length: bytes[i + 4]!,
        name: latin1(bytes.subarray(i + 5, i + 9)),
        format: latin1(bytes.subarray(i + 9, i + 25)),
        columns: latin1(bytes.subarray(i + 25, i + 89)).split(','),
      });
      i += 89;
      continue;
    }
    const fmt = formats.get(type);
    if (!fmt || fmt.length < 3) { i++; skipped++; continue; }
    const r = dfDecode(v, bytes, i + 3, fmt);
    i += fmt.length;
    if (!r) break;
    const timeUs = Number(r.TimeUS ?? (r.TimeMS != null ? Number(r.TimeMS) * 1000 : NaN));
    if (fmt.name === 'GPS' && (r.I == null || r.I === 0) && (r.Instance == null || r.Instance === 0)) {
      const wk = Number(r.GWk), ms = Number(r.GMS);
      gps.push({ timeUs, utc: wk > 0 ? GPS_EPOCH_MS + wk * 604_800_000 + ms - LEAP_MS : null, lat: Number(r.Lat), lon: Number(r.Lng), alt: Number(r.Alt), spd: Number(r.Spd), fix: Number(r.Status) });
    } else if (fmt.name === 'BAT' && (r.Inst == null || r.Inst === 0) && (r.Instance == null || r.Instance === 0)) {
      bat.push({ timeUs, volt: Number.isFinite(Number(r.Volt)) ? Number(r.Volt) : null, pct: r.RemPct != null ? Number(r.RemPct) : null });
    } else if (fmt.name === 'BCL' && (r.Instance == null || r.Instance === 0)) {
      const vs = Object.keys(r).filter((k) => /^V\d+$/.test(k)).map((k) => Number(r[k]) / 1000).filter((x) => x > 0.5 && x < 6);
      if (vs.length > 1) cells.push({ timeUs, v: vs });
    } else if (fmt.name === 'MSG') {
      msgs.push({ timeUs, text: String(r.Message ?? '') });
    } else if (fmt.name === 'ERR') {
      errs.push({ timeUs, sub: Number(r.Subsys), code: Number(r.ECode) });
    }
  }
  if (!formats.size) throw new LogReadError('This doesn’t look like an ArduPilot DataFlash log.');
  const anchor = gps.find((g) => g.utc != null && g.fix >= 3 && Number.isFinite(g.timeUs));
  if (!anchor) throw new LogReadError('No GPS time in this ArduPilot log, so the flight can’t be placed in time.');
  const offset = anchor.utc! - anchor.timeUs / 1000;
  const at = (us: number) => offset + us / 1000;

  // GPS samples carry the latest battery reading forward.
  let bi = 0, ci = 0;
  const samples: TelemetrySample[] = [];
  for (const g of gps) {
    if (g.fix < 3 || !Number.isFinite(g.timeUs)) continue;
    while (bi + 1 < bat.length && bat[bi + 1]!.timeUs <= g.timeUs) bi++;
    while (ci + 1 < cells.length && cells[ci + 1]!.timeUs <= g.timeUs) ci++;
    const s = emptySample(at(g.timeUs));
    s.lat = g.lat;
    s.lon = g.lon;
    s.altMslM = g.alt;
    s.speedMps = g.spd;
    const b = bat[bi] && bat[bi]!.timeUs <= g.timeUs ? bat[bi]! : null;
    s.voltageV = b?.volt ?? null;
    s.batteryPct = b?.pct ?? null;
    s.cellV = cells[ci] && cells[ci]!.timeUs <= g.timeUs ? cells[ci]!.v : null;
    samples.push(s);
  }
  const fw = msgs.find((m) => /^Ardu\w+ V?\d/.test(m.text))?.text ?? null;
  const frame = msgs.find((m) => /^Frame:/.test(m.text))?.text.replace(/^Frame:\s*/, '') ?? null;
  const board = msgs.find((m) => /^\S+ [0-9A-F]{8} [0-9A-F]{8} [0-9A-F]{8}$/.test(m.text))?.text ?? null;
  const events: TelemetryEvent[] = [
    ...errs.filter((e) => e.code !== 0).map((e) => ({ t: at(e.timeUs), level: 'error' as const, text: `Error: subsystem ${e.sub}, code ${e.code}` })),
    ...msgs.filter((m) => /fail|error|crash|ekf|battery|radio|lost|low|bad|emergency/i.test(m.text)).map((m) => ({ t: at(m.timeUs), level: /fail|crash|emergency/i.test(m.text) ? ('error' as const) : ('warning' as const), text: m.text })),
  ].sort((a, b) => a.t - b.t);
  return {
    parser: 'ardupilot-bin',
    aircraftModel: [fw, frame].filter(Boolean).join(' · ') || null,
    aircraftSerial: board ? board.split(' ').slice(1).join('-') : null,
    batterySerials: [],
    samples,
    events,
    warnings: skipped > 1024 ? ['Parts of this log were unreadable and were skipped.'] : [],
  };
}

// ---------------------------------------------------------------- PX4 ULog (.ulg)

const ULOG_MAGIC = [0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35];
const UL_SIZE: Record<string, number> = { int8_t: 1, uint8_t: 1, bool: 1, char: 1, int16_t: 2, uint16_t: 2, int32_t: 4, uint32_t: 4, float: 4, int64_t: 8, uint64_t: 8, double: 8 };
interface UlField { type: string; name: string; count: number }

export const isULog = (b: Uint8Array) => ULOG_MAGIC.every((c, i) => b[i] === c);
export const isDataFlash = (b: Uint8Array) => b.length > 3 && b[0] === 0xa3 && b[1] === 0x95;

/** PX4 ULog flight logs (Holybro, ModalAI, Auterion-based and other PX4 aircraft). */
export function parseULog(bytes: Uint8Array): Telemetry {
  if (!isULog(bytes)) throw new LogReadError('This doesn’t look like a PX4 ULog file.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formats = new Map<string, UlField[]>();
  const subs = new Map<number, string>();
  const info = new Map<string, string>();
  const sizeOf = (type: string, seen = 0): number => {
    if (UL_SIZE[type] != null) return UL_SIZE[type]!;
    const f = formats.get(type);
    if (!f || seen > 8) return 0;
    return f.reduce((a, x) => a + sizeOf(x.type, seen + 1) * x.count, 0);
  };
  const read = (type: string, o: number): number => {
    switch (type) {
      case 'int8_t': return v.getInt8(o);
      case 'uint8_t': case 'bool': case 'char': return v.getUint8(o);
      case 'int16_t': return v.getInt16(o, true);
      case 'uint16_t': return v.getUint16(o, true);
      case 'int32_t': return v.getInt32(o, true);
      case 'uint32_t': return v.getUint32(o, true);
      case 'float': return v.getFloat32(o, true);
      case 'double': return v.getFloat64(o, true);
      case 'int64_t': return Number(v.getBigInt64(o, true));
      case 'uint64_t': return Number(v.getBigUint64(o, true));
      default: return NaN;
    }
  };
  /** Top-level numeric fields (arrays as arrays) of one data message. */
  const decode = (topic: string, at: number, end: number): Record<string, number | number[]> => {
    const out: Record<string, number | number[]> = {};
    let o = at;
    for (const f of formats.get(topic) ?? []) {
      const size = sizeOf(f.type);
      if (o + size * f.count > end) break;
      if (UL_SIZE[f.type] != null && !f.name.startsWith('_padding')) {
        if (f.count === 1) out[f.name] = read(f.type, o);
        else out[f.name] = Array.from({ length: f.count }, (_, k) => read(f.type, o + k * size));
      }
      o += size * f.count;
    }
    return out;
  };

  const gps: { ts: number; utcUs: number; lat: number; lon: number; alt: number; spd: number; fix: number }[] = [];
  const bat: { ts: number; volt: number; pct: number | null; cells: number[] | null }[] = [];
  const logs: { ts: number; level: number; text: string }[] = [];
  for (let i = 16; i + 3 <= bytes.length; ) {
    const size = v.getUint16(i, true);
    const type = String.fromCharCode(bytes[i + 2]!);
    const p = i + 3, end = p + size;
    if (end > bytes.length) break;
    if (type === 'F') {
      const s = latin1(bytes.subarray(p, end));
      const [name, body] = [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)];
      formats.set(name, body.split(';').filter(Boolean).map((d) => {
        const [t, n] = d.trim().split(/\s+/) as [string, string];
        const arr = /^(\w+)\[(\d+)\]$/.exec(t);
        return { type: arr ? arr[1]! : t, name: n, count: arr ? Number(arr[2]) : 1 };
      }));
    } else if (type === 'I') {
      const kl = bytes[p]!;
      const key = latin1(bytes.subarray(p + 1, p + 1 + kl));
      const name = key.split(' ')[1] ?? key;
      if (key.startsWith('char')) info.set(name, latin1(bytes.subarray(p + 1 + kl, end)));
    } else if (type === 'A') {
      subs.set(v.getUint16(p + 1, true), latin1(bytes.subarray(p + 3, end)));
    } else if (type === 'D') {
      const topic = subs.get(v.getUint16(p, true));
      if (topic === 'vehicle_gps_position' || topic === 'sensor_gps') {
        const r = decode(topic, p + 2, end);
        const lat = r.latitude_deg != null ? Number(r.latitude_deg) : Number(r.lat) / 1e7;
        const lon = r.longitude_deg != null ? Number(r.longitude_deg) : Number(r.lon) / 1e7;
        const alt = r.altitude_msl_m != null ? Number(r.altitude_msl_m) : Number(r.alt) / 1000;
        gps.push({ ts: Number(r.timestamp), utcUs: Number(r.time_utc_usec ?? 0), lat, lon, alt, spd: Number(r.vel_m_s), fix: Number(r.fix_type) });
      } else if (topic === 'battery_status') {
        const r = decode(topic, p + 2, end);
        const n = Number(r.cell_count ?? 0);
        const cv = Array.isArray(r.voltage_cell_v) ? (r.voltage_cell_v as number[]).slice(0, n || undefined).filter((x) => x > 0.5 && x < 6) : null;
        bat.push({ ts: Number(r.timestamp), volt: Number(r.voltage_v), pct: r.remaining != null && Number(r.remaining) >= 0 ? Number(r.remaining) * 100 : null, cells: cv && cv.length > 1 ? cv : null });
      }
    } else if (type === 'L' || type === 'C') {
      const lvl = bytes[p]! - 48;
      const o = type === 'C' ? p + 3 : p + 1;
      logs.push({ ts: Number(v.getBigUint64(o, true)), level: lvl, text: latin1(bytes.subarray(o + 8, end)) });
    }
    i = end;
  }
  const anchor = gps.find((g) => g.utcUs > 1e15 && g.fix >= 3);
  if (!anchor) throw new LogReadError('No GPS time in this PX4 log, so the flight can’t be placed in time.');
  const offsetUs = anchor.utcUs - anchor.ts;
  const at = (ts: number) => (ts + offsetUs) / 1000;
  let bi = 0;
  const samples: TelemetrySample[] = [];
  for (const g of gps) {
    if (g.fix < 3) continue;
    while (bi + 1 < bat.length && bat[bi + 1]!.ts <= g.ts) bi++;
    const b = bat[bi] && bat[bi]!.ts <= g.ts ? bat[bi]! : null;
    const s = emptySample(at(g.ts));
    s.lat = g.lat;
    s.lon = g.lon;
    s.altMslM = g.alt;
    s.speedMps = Number.isFinite(g.spd) ? g.spd : null;
    s.voltageV = b && Number.isFinite(b.volt) && b.volt > 0 ? b.volt : null;
    s.batteryPct = b?.pct ?? null;
    s.cellV = b?.cells ?? null;
    samples.push(s);
  }
  return {
    parser: 'px4-ulog',
    aircraftModel: [info.get('sys_name'), info.get('ver_hw')].filter(Boolean).join(' ') || null,
    aircraftSerial: info.get('sys_uuid') ?? info.get('sys_mcu') ?? null,
    batterySerials: [],
    samples,
    events: logs.filter((l) => l.level >= 0 && l.level <= 4).map((l) => ({ t: at(l.ts), level: l.level <= 3 ? ('error' as const) : ('warning' as const), text: l.text })),
    warnings: [],
  };
}
