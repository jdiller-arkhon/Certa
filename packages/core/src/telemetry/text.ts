import { emptySample, type Telemetry, type TelemetryEvent, type TelemetrySample } from './model.js';

/** A log Certa can't use, with a reason the pilot can act on. */
export class LogReadError extends Error {}

const FT = 0.3048;
const MPH = 0.44704;

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const num = (v: string | undefined) => {
  if (v == null) return null;
  const n = Number(v.trim().replace(/^\+/, ''));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Length and speed unit from a header like "height_above_takeoff(feet)" or "speed [km/h]". */
const lengthK = (h: string) => (/\b(feet|ft)\b/.test(h) ? FT : 1);
const speedK = (h: string) => (/mph/.test(h) ? MPH : /km\/?h|kph|kmh/.test(h) ? 1 / 3.6 : /knot|kts?\b/.test(h) ? 0.514444 : 1);

function parseTime(v: string, utc: boolean): number | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // Epoch seconds or milliseconds.
    return n > 1e12 ? n : n > 1e9 ? n * 1000 : null;
  }
  let iso = s.replace(/^(\d{4}[-/]\d{2}[-/]\d{2})[ T]/, (_, d: string) => `${d.replace(/\//g, '-')}T`);
  // 12-hour clock as AirData writes it: "10/23/2026 4:02:11.20 PM".
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)\s*([AP]M)?$/i.exec(s);
  if (us) {
    let h = Number(us[4]);
    if (us[7]) h = (h % 12) + (us[7].toUpperCase() === 'PM' ? 12 : 0);
    iso = `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}T${String(h).padStart(2, '0')}:${us[5]}:${us[6]!.padStart(2, '0')}`;
  }
  const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const t = Date.parse(zoned || !utc ? iso : `${iso}Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Flight-record CSV: AirData exports (DJI, Autel, Skydio, Parrot and more all export through
 * AirData), Litchi, DJI-converted and generic logs. Columns are found by name, units by suffix.
 */
export function parseFlightCsv(text: string): Telemetry {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 3) throw new LogReadError('This CSV has no flight rows.');
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const find = (re: RegExp, not?: RegExp) => header.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const col = {
    utc: find(/^(datetime|date ?time|time)\s*[([]?utc[)\]]?$|^gps[_ ]?time|^datetime_utc|^timestamp\s*[([]utc/),
    local: find(/^(datetime|date ?time|timestamp|custom\.updatetime|updatetime)/),
    offsetMs: find(/^time\s*\((millisecond|ms)\)|^offsettime|^flytime\s*\(ms/),
    lat: find(/^(osd\.)?lat(itude)?\b|^lat\s*\(/),
    lon: find(/^(osd\.)?(lon|lng|long|longitude)\b/),
    height: find(/height_above_takeoff|^(osd\.)?height\b|relative_?alt|^alt(itude)?\s*\((m|meters?|feet|ft)\)$|^altitude$|alt_rel/, /sea|msl|ground|sonar|max|vps/),
    msl: find(/above_?sea|msl|altitude_above_sealevel|^ele(vation)?\b|gps.?alt/),
    speed: find(/^(osd\.)?(h)?speed\b|ground.?speed|^speed\s*[([]/, /max|^x|^y|^z|vspeed|wind/),
    pct: find(/battery.?percent|^battery\s*\(%\)|charge.?remaining|remain(ing)?.?(cap|pct|percent)|^battery_level/),
    volt: find(/^voltage\s*\(v\)$|^voltage$|^battery.?voltage|^(battery\.)?volt(age)?\s*\(v\)/, /cell/),
    message: find(/^message$|^warning|^(app\.)?tip$|^(app\.)?warn/),
    model: find(/aircraft.?(name|model)|^product.?type|^drone.?type/),
    serial: find(/aircraft.?(sn|serial)|^(drone|uav).?serial/),
    battSerial: find(/battery.?(sn|serial)/),
  };
  const cellCols = header.flatMap((h, i) => (/(voltage_?cell|cell)\s*_?(\d+)\s*(\(v\)|_v)?$/.test(h) ? [i] : []));
  if (col.lat < 0 || col.lon < 0) throw new LogReadError('No latitude and longitude columns in this CSV. Export the flight as a CSV flight record (for example from AirData), not a summary.');
  if (col.utc < 0 && col.local < 0) throw new LogReadError('No date and time column in this CSV, so the flight can’t be placed in time.');
  const warnings: string[] = [];
  const utc = col.utc >= 0;
  const timeCol = utc ? col.utc : col.local;
  if (!utc) warnings.push('Times in this log have no time zone; read as this device’s local time.');

  const body = rows.slice(1);
  // Second-resolution clocks plus a millisecond counter (AirData) give each row its exact time.
  const t0Row = body.findIndex((r) => parseTime(r[timeCol] ?? '', utc) != null);
  if (t0Row < 0) throw new LogReadError('The time column in this CSV couldn’t be read.');
  const t0 = parseTime(body[t0Row]![timeCol]!, utc)!;
  const ms0 = col.offsetMs >= 0 ? num(body[t0Row]![col.offsetMs]) : null;

  const samples: TelemetrySample[] = [];
  const events: TelemetryEvent[] = [];
  let lastMsg = '';
  for (const r of body) {
    const ms = col.offsetMs >= 0 ? num(r[col.offsetMs]) : null;
    const t = ms != null && ms0 != null ? t0 + (ms - ms0) : parseTime(r[timeCol] ?? '', utc);
    if (t == null) continue;
    const s = emptySample(t);
    s.lat = num(r[col.lat]);
    s.lon = num(r[col.lon]);
    if (col.height >= 0) { const v = num(r[col.height]); s.heightM = v == null ? null : v * lengthK(header[col.height]!); }
    if (col.msl >= 0) { const v = num(r[col.msl]); s.altMslM = v == null ? null : v * lengthK(header[col.msl]!); }
    if (col.speed >= 0) { const v = num(r[col.speed]); s.speedMps = v == null ? null : Math.abs(v) * speedK(header[col.speed]!); }
    if (col.pct >= 0) s.batteryPct = num(r[col.pct]);
    if (col.volt >= 0) s.voltageV = num(r[col.volt]);
    if (cellCols.length > 1) {
      const cells = cellCols.map((i) => num(r[i])).filter((v): v is number => v != null && v > 0);
      // Some exports give millivolts.
      s.cellV = cells.length > 1 ? cells.map((v) => (v > 100 ? v / 1000 : v)) : null;
    }
    samples.push(s);
    const msg = col.message >= 0 ? (r[col.message] ?? '').trim() : '';
    if (msg && msg !== lastMsg) events.push({ t, level: /fail|error|critical|lost|emergency|crash/i.test(msg) ? 'error' : 'warning', text: msg });
    lastMsg = msg;
  }
  const first = body[t0Row]!;
  const parser = header.includes('height_above_takeoff(feet)') || header.includes('height_above_takeoff(meters)') ? 'airdata-csv' : header.some((h) => h.startsWith('osd.')) ? 'dji-csv' : 'csv';
  return {
    parser,
    aircraftModel: col.model >= 0 ? first[col.model]?.trim() || null : null,
    aircraftSerial: col.serial >= 0 ? first[col.serial]?.trim() || null : null,
    batterySerials: col.battSerial >= 0 ? [...new Set(body.map((r) => r[col.battSerial]?.trim()).filter((x): x is string => !!x))] : [],
    samples,
    events,
    warnings,
  };
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag)?.[1];
const inner = (xml: string, name: string) => new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml)?.[1]?.trim();

/** GPX track (many apps and controllers export these). Elevation is read as MSL. */
export function parseGpx(xml: string): Telemetry {
  const samples: TelemetrySample[] = [];
  for (const m of xml.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)) {
    const t = Date.parse(inner(m[2]!, 'time') ?? '');
    if (!Number.isFinite(t)) continue;
    const s = emptySample(t);
    s.lat = num(attr(m[1]!, 'lat'));
    s.lon = num(attr(m[1]!, 'lon'));
    s.altMslM = num(inner(m[2]!, 'ele'));
    s.speedMps = num(inner(m[2]!, 'speed'));
    samples.push(s);
  }
  if (samples.length < 2) throw new LogReadError('No timed track points in this GPX file.');
  return { parser: 'gpx', aircraftModel: inner(xml, 'name') ?? null, aircraftSerial: null, batterySerials: [], samples, events: [], warnings: [] };
}

/** KML with a timed gx:Track (Google Earth and several flight apps). Plain lines have no times. */
export function parseKml(xml: string): Telemetry {
  const whens = [...xml.matchAll(/<when>([^<]+)<\/when>/g)].map((m) => Date.parse(m[1]!.trim()));
  const coords = [...xml.matchAll(/<gx:coord>([^<]+)<\/gx:coord>/g)].map((m) => m[1]!.trim().split(/\s+/).map(Number));
  if (whens.length < 2 || coords.length !== whens.length) throw new LogReadError('This KML has no timed track (gx:Track), so takeoff and landing times can’t be read.');
  const samples = whens.flatMap((t, i) => {
    if (!Number.isFinite(t)) return [];
    const [lon, lat, alt] = coords[i]!;
    const s = emptySample(t);
    s.lat = lat ?? null;
    s.lon = lon ?? null;
    // KML altitudes are relative to ground in most drone exports.
    s.heightM = alt ?? null;
    return [s];
  });
  return { parser: 'kml', aircraftModel: inner(xml, 'name') ?? null, aircraftSerial: null, batterySerials: [], samples, events: [], warnings: [] };
}
