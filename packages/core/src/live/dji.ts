/**
 * DJI Cloud API (DJI Pilot 2 "Open Platform" and DJI Dock) messages, translated into Certa's
 * live frames. Enterprise aircraft publish their state about once a second over MQTT:
 *
 *   sys/product/{gateway_sn}/status   which aircraft is connected to the controller or dock
 *   thing/product/{device_sn}/osd      the aircraft's state (position, height, speed, battery)
 *   thing/product/{gateway_sn}/events  health alerts (HMS) and other events
 *
 * Field names follow DJI's Cloud API thing model. Unknown fields are ignored, so newer
 * firmware that adds fields keeps working.
 */
import { z } from 'zod';

/** One moment of a live aircraft, normalized across brands. */
export interface LiveFrame {
  sn: string;
  /** Epoch milliseconds. */
  t: number;
  lat: number | null;
  lon: number | null;
  /** Height above the takeoff point, metres. */
  heightM: number | null;
  /** Ellipsoid or MSL altitude as the aircraft reports it, metres. */
  altM: number | null;
  speedMps: number | null;
  verticalSpeedMps: number | null;
  headingDeg: number | null;
  homeDistanceM: number | null;
  batteryPct: number | null;
  /** Minutes of flight the aircraft estimates it has left. */
  remainingFlightSec: number | null;
  packs: { sn: string | null; pct: number | null; voltageV: number | null; tempC: number | null; cycles: number | null }[];
  gpsSats: number | null;
  windMps: number | null;
  /** DJI flight mode code, and whether that mode means airborne. */
  mode: number | null;
  modeLabel: string | null;
  airborne: boolean;
}

export const DJI_MODES: Record<number, string> = {
  0: 'Standby', 1: 'Preparing to take off', 2: 'Ready to take off', 3: 'Manual flight', 4: 'Automatic takeoff', 5: 'Waypoint mission',
  6: 'Panorama', 7: 'Tracking', 8: 'ADS-B avoidance', 9: 'Returning home', 10: 'Automatic landing', 11: 'Forced landing',
  12: 'Three-propeller landing', 13: 'Updating firmware', 14: 'Not connected', 15: 'Obstacle avoidance (APAS)', 16: 'Virtual stick',
  17: 'Live flight control', 18: 'RTK fixing in the air', 19: 'Dock site check',
};
const AIRBORNE_MODES = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18]);

/** Aircraft names by DJI device type and sub-type (domain 0). Unlisted types show as "DJI aircraft (type n)". */
const DJI_AIRCRAFT: Record<number, string | Record<number, string>> = {
  60: 'Matrice 300 RTK',
  67: { 0: 'Matrice 30', 1: 'Matrice 30T' },
  77: { 0: 'Mavic 3 Enterprise', 1: 'Mavic 3 Thermal', 2: 'Mavic 3 Multispectral' },
  89: 'Matrice 350 RTK',
  91: { 0: 'Matrice 3D', 1: 'Matrice 3TD' },
  99: { 0: 'Matrice 4E', 1: 'Matrice 4T' },
};
export function djiAircraftName(type: number, subType: number): string {
  const e = DJI_AIRCRAFT[type];
  const name = typeof e === 'string' ? e : e?.[subType];
  return name ? `DJI ${name}` : `DJI aircraft (type ${type}-${subType})`;
}

const num = z.number().finite();
const Envelope = z.object({ tid: z.string().optional(), bid: z.string().optional(), timestamp: z.number().optional(), method: z.string().optional(), gateway: z.string().optional(), data: z.unknown() });
const AircraftOsd = z.object({
  latitude: num.optional(),
  longitude: num.optional(),
  height: num.optional(),
  elevation: num.optional(),
  horizontal_speed: num.optional(),
  vertical_speed: num.optional(),
  attitude_head: num.optional(),
  home_distance: num.optional(),
  mode_code: z.number().int(),
  wind_speed: num.optional(),
  position_state: z.object({ gps_number: num.optional() }).partial().optional(),
  battery: z
    .object({
      capacity_percent: num.optional(),
      remain_flight_time: num.optional(),
      batteries: z.array(z.object({ sn: z.string().optional(), capacity_percent: num.optional(), voltage: num.optional(), temperature: num.optional(), loop_times: num.optional() }).partial()).optional(),
    })
    .partial()
    .optional(),
});

/** Splits "thing/product/{sn}/osd" and friends. */
export function parseDjiTopic(topic: string): { kind: 'osd' | 'state' | 'events' | 'status' | 'other'; sn: string } | null {
  const m = /^(thing|sys)\/product\/([A-Za-z0-9]{6,40})\/(osd|state|events|status|requests|services_reply)$/.exec(topic);
  if (!m) return null;
  const kind = m[3] === 'osd' || m[3] === 'state' || m[3] === 'events' || m[3] === 'status' ? m[3] : 'other';
  return { kind, sn: m[2]! };
}

/**
 * An aircraft OSD message as a live frame; null for controller and dock OSD (no flight mode)
 * and for anything malformed.
 */
export function djiOsdToFrame(sn: string, payload: unknown, receivedAt: number): LiveFrame | null {
  const env = Envelope.safeParse(payload);
  if (!env.success) return null;
  const d = AircraftOsd.safeParse(env.data.data);
  if (!d.success) return null;
  const o = d.data;
  const t = env.data.timestamp && Math.abs(env.data.timestamp - receivedAt) < 6 * 3600_000 ? env.data.timestamp : receivedAt;
  // 0,0 is what DJI reports before the first GPS fix.
  const hasFix = o.latitude != null && o.longitude != null && !(o.latitude === 0 && o.longitude === 0);
  const packs = (o.battery?.batteries ?? []).map((b) => ({ sn: b.sn?.trim() || null, pct: b.capacity_percent ?? null, voltageV: b.voltage != null ? b.voltage / 1000 : null, tempC: b.temperature ?? null, cycles: b.loop_times ?? null }));
  return {
    sn,
    t,
    lat: hasFix ? o.latitude! : null,
    lon: hasFix ? o.longitude! : null,
    heightM: o.elevation ?? null,
    altM: o.height ?? null,
    speedMps: o.horizontal_speed ?? null,
    verticalSpeedMps: o.vertical_speed ?? null,
    headingDeg: o.attitude_head ?? null,
    homeDistanceM: o.home_distance ?? null,
    batteryPct: o.battery?.capacity_percent ?? (packs.length ? Math.min(...packs.map((p) => p.pct ?? 100)) : null),
    remainingFlightSec: o.battery?.remain_flight_time ?? null,
    packs,
    gpsSats: o.position_state?.gps_number ?? null,
    // DJI's thing model gives wind in units of 0.1 m/s.
    windMps: o.wind_speed != null ? o.wind_speed / 10 : null,
    mode: o.mode_code,
    modeLabel: DJI_MODES[o.mode_code] ?? `Mode ${o.mode_code}`,
    airborne: AIRBORNE_MODES.has(o.mode_code),
  };
}

const Topo = z.object({
  domain: z.union([z.string(), z.number()]).optional(),
  type: z.number().int().optional(),
  sub_type: z.number().int().optional(),
  sub_devices: z.array(z.object({ sn: z.string(), domain: z.union([z.string(), z.number()]).optional(), type: z.number().int().optional(), sub_type: z.number().int().optional() })).default([]),
});

/**
 * A gateway's topology update: the aircraft now connected to it (none when it disconnects).
 * The platform must answer every update with `statusReply`.
 */
export function djiTopology(payload: unknown): { aircraft: { sn: string; model: string }[] } | null {
  const env = Envelope.safeParse(payload);
  if (!env.success || env.data.method !== 'update_topo') return null;
  const d = Topo.safeParse(env.data.data);
  if (!d.success) return null;
  return {
    aircraft: d.data.sub_devices.filter((s) => String(s.domain ?? '0') === '0').map((s) => ({ sn: s.sn, model: djiAircraftName(s.type ?? -1, s.sub_type ?? 0) })),
  };
}

export function djiStatusReply(payload: unknown, now: number): { tid?: string; bid?: string; timestamp: number; method: string; data: { result: 0 } } {
  const env = Envelope.safeParse(payload);
  return { tid: env.success ? env.data.tid : undefined, bid: env.success ? env.data.bid : undefined, timestamp: now, method: env.success && env.data.method ? env.data.method : 'update_topo', data: { result: 0 } };
}

const Hms = z.object({ list: z.array(z.object({ level: z.number().int(), code: z.string(), in_the_sky: z.number().optional(), device_type: z.string().optional() }).partial()) });

/** Health alerts (HMS). Level 2 is serious, 1 a caution; level 0 notices are skipped. */
export function djiHealthEvents(payload: unknown, receivedAt: number): { t: number; level: 'warning' | 'error'; text: string }[] {
  const env = Envelope.safeParse(payload);
  if (!env.success || env.data.method !== 'hms') return [];
  const d = Hms.safeParse(env.data.data);
  if (!d.success) return [];
  const t = env.data.timestamp ?? receivedAt;
  return d.data.list
    .filter((h) => (h.level ?? 0) >= 1 && h.code)
    .map((h) => ({ t, level: h.level! >= 2 ? ('error' as const) : ('warning' as const), text: `Aircraft health alert ${h.code}${h.in_the_sky ? ' (in flight)' : ''}` }));
}
