/**
 * Live flight sessions: when a linked aircraft takes off a session opens, every frame is kept,
 * and when it has been on the ground for 20 seconds (or silent for 2 minutes) the session ends
 * and becomes a logged flight, summarized exactly like an imported log.
 */
import { emptySample, type Telemetry, type TelemetryEvent } from '../telemetry/model.js';
import type { LiveFrame } from './dji.js';

export const LANDED_HOLD_MS = 20_000;
export const SILENCE_MS = 120_000;
/** Ground frames kept from just before takeoff, so the flight starts at the home point. */
export const PRE_TAKEOFF_FRAMES = 10;

export interface OpenSession {
  startedAt: number;
  lastAirborneAt: number;
  lastFrameAt: number;
}

export type SessionAction = 'none' | 'start' | 'append' | 'end';

/** What a new frame does to the aircraft's session. */
export function sessionStep(open: OpenSession | null, f: Pick<LiveFrame, 't' | 'airborne'>): { open: OpenSession | null; action: SessionAction } {
  if (!open) return f.airborne ? { open: { startedAt: f.t, lastAirborneAt: f.t, lastFrameAt: f.t }, action: 'start' } : { open: null, action: 'none' };
  const next = { ...open, lastFrameAt: Math.max(open.lastFrameAt, f.t), lastAirborneAt: f.airborne ? Math.max(open.lastAirborneAt, f.t) : open.lastAirborneAt };
  if (!f.airborne && f.t - next.lastAirborneAt >= LANDED_HOLD_MS) return { open: null, action: 'end' };
  return { open: next, action: 'append' };
}

/** A session whose aircraft went quiet (link lost, controller off) is closed after 2 minutes. */
export const sessionTimedOut = (open: OpenSession, now: number) => now - open.lastFrameAt >= SILENCE_MS;

/** A finished session's frames as telemetry for `summarizeTelemetry`. */
export function framesToTelemetry(input: { sn: string; model: string | null; frames: LiveFrame[]; events: TelemetryEvent[]; timedOut: boolean }): Telemetry {
  const serials = new Set<string>();
  const samples = input.frames.map((f) => {
    f.packs.forEach((p) => p.sn && serials.add(p.sn));
    const s = emptySample(f.t);
    s.lat = f.lat;
    s.lon = f.lon;
    s.heightM = f.heightM;
    s.speedMps = f.speedMps;
    s.batteryPct = f.batteryPct;
    const volts = f.packs.map((p) => p.voltageV).filter((v): v is number => v != null);
    s.voltageV = volts.length ? Math.min(...volts) : null;
    return s;
  });
  return {
    parser: 'dji-cloud-live',
    aircraftModel: input.model,
    aircraftSerial: input.sn,
    batterySerials: [...serials],
    samples,
    events: input.events,
    warnings: input.timedOut ? ['The live link went quiet before landing was seen; landing time is the last message received.'] : [],
  };
}
