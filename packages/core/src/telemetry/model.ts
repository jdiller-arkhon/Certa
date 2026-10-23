/**
 * Flight logs from any drone, in one shape. Each parser turns its format into a `Telemetry`;
 * `summarizeTelemetry` then works out the flight (takeoff, landing, height, distance, battery
 * health, warnings) the same way for every brand. Pure and dependency-free, so logs are read on
 * the pilot's device and never have to be uploaded to be understood.
 */
import { z } from 'zod';

export interface TelemetrySample {
  /** Epoch milliseconds (UTC). */
  t: number;
  lat: number | null;
  lon: number | null;
  /** Height above the takeoff point, metres. */
  heightM: number | null;
  /** Altitude above mean sea level, metres. */
  altMslM: number | null;
  /** Ground speed, m/s. */
  speedMps: number | null;
  batteryPct: number | null;
  voltageV: number | null;
  cellV: number[] | null;
}

export interface TelemetryEvent {
  t: number;
  level: 'warning' | 'error';
  text: string;
}

export interface Telemetry {
  /** e.g. 'airdata-csv', 'gpx', 'ardupilot-bin', 'px4-ulog'. */
  parser: string;
  aircraftModel: string | null;
  aircraftSerial: string | null;
  batterySerials: string[];
  samples: TelemetrySample[];
  events: TelemetryEvent[];
  /** Problems reading the file that the pilot should know about. */
  warnings: string[];
}

export const emptySample = (t: number): TelemetrySample => ({ t, lat: null, lon: null, heightM: null, altMslM: null, speedMps: null, batteryPct: null, voltageV: null, cellV: null });

/** What Certa keeps from a log: metrics for the flight, not the raw samples. */
export const TelemetrySummary = z.object({
  parser: z.string().max(40),
  takeoffAt: z.string(),
  landingAt: z.string(),
  durationSeconds: z.number().int().nonnegative(),
  maxHeightM: z.number().nullable(),
  maxDistanceM: z.number().nullable(),
  totalDistanceM: z.number().nullable(),
  maxSpeedMps: z.number().nullable(),
  home: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  landing: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  battery: z.object({
    startPct: z.number().nullable(),
    endPct: z.number().nullable(),
    startVoltageV: z.number().nullable(),
    minVoltageV: z.number().nullable(),
    minCellV: z.number().nullable(),
    /** Largest gap between the highest and lowest cell at one moment: a sign of a tired pack. */
    maxCellDeltaV: z.number().nullable(),
  }),
  aircraftModel: z.string().max(120).nullable(),
  aircraftSerial: z.string().max(80).nullable(),
  batterySerials: z.array(z.string().max(80)).max(12),
  events: z.array(z.object({ at: z.string(), level: z.enum(['warning', 'error']), text: z.string().max(300) })).max(60),
  warnings: z.array(z.string().max(300)).max(20),
  samples: z.number().int().nonnegative(),
});
export type TelemetrySummary = z.infer<typeof TelemetrySummary>;

/** Track points as stored: [lon, lat, height above takeoff m, epoch seconds]. */
export const TrackPoint = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-1000).max(20000), z.number().int().positive()]);
export type TrackPoint = z.infer<typeof TrackPoint>;
export const MAX_TRACK_POINTS = 1500;
