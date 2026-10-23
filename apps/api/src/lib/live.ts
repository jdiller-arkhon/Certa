/**
 * Live telemetry processing, shared by the DJI bridge (worker) and the generic frame API.
 * Each frame from a linked aircraft moves its session along (core `sessionStep`): takeoff opens a
 * session, frames are stored, and landing (or two minutes of silence) closes it and logs the
 * flight, summarized exactly like an imported log. A session that can't be logged on its own
 * (unknown aircraft or no pilot) waits on the Live page for someone to assign it.
 */
import {
  framesToTelemetry,
  goNoGo,
  matchAircraft,
  matchBatteries,
  newId,
  PRE_TAKEOFF_FRAMES,
  sessionStep,
  SILENCE_MS,
  summarizeTelemetry,
  telemetryDedupeKey,
  type LiveFrame,
  type OpenSession,
  type TelemetryEvent,
} from '@certa/core';
import { aircraft, and, asc, batteries, eq, flightBatteries, flights, isNull, liveDevices, liveSamples, liveSessions, sql, withTenant, type Db } from '@certa/db';
import type pg from 'pg';
import { loadFleet, orgMapContext, recomputeDerived } from './fleet.js';
import { ewkt, lineZM } from './geo.js';

interface Logger { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void }

export interface SnRoute { orgId: string; kind: 'gateway' | 'aircraft'; gatewaySn: string | null }

const tenant = <T>(pool: pg.Pool, orgId: string, fn: (db: Db) => Promise<T>) => withTenant(pool, { orgId, userId: null, requestId: 'live' }, fn);

export class LiveProcessor {
  private routes = new Map<string, { route: SnRoute | null; at: number }>();
  private open = new Map<string, { id: string; orgId: string; state: OpenSession }>();
  private ring = new Map<string, LiveFrame[]>();
  private seen = new Map<string, number>();
  /** One message at a time per aircraft, so a takeoff can't open two sessions. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(private pool: pg.Pool, private log: Logger) {}

  /** Runs `fn` after anything already queued for `key`. */
  serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(key, next.catch(() => {}));
    return next;
  }

  /** Which org a serial number streams to (cached for 30 s). */
  async route(sn: string): Promise<SnRoute | null> {
    const hit = this.routes.get(sn);
    if (hit && Date.now() - hit.at < 30_000) return hit.route;
    const r = await this.pool.query<{ org_id: string; kind: 'gateway' | 'aircraft'; gateway_sn: string | null }>('SELECT * FROM certa.live_device_org($1)', [sn]);
    const route = r.rows[0] ? { orgId: r.rows[0].org_id, kind: r.rows[0].kind, gatewaySn: r.rows[0].gateway_sn } : null;
    this.routes.set(sn, { route, at: Date.now() });
    return route;
  }

  forget(sn: string) {
    this.routes.delete(sn);
  }

  /** A gateway reported the aircraft connected to it: register them under its organization. */
  async topology(gatewaySn: string, connected: { sn: string; model: string }[]) {
    const gw = await this.route(gatewaySn);
    if (!gw || gw.kind !== 'gateway') return;
    await tenant(this.pool, gw.orgId, async (db) => {
      const [g] = await db.select({ pilotId: liveDevices.pilotId }).from(liveDevices).where(and(eq(liveDevices.sn, gatewaySn), isNull(liveDevices.deletedAt)));
      await db.update(liveDevices).set({ lastSeenAt: sql`now()` }).where(and(eq(liveDevices.sn, gatewaySn), isNull(liveDevices.deletedAt)));
      for (const a of connected) {
        const [cur] = await db.select({ id: liveDevices.id }).from(liveDevices).where(and(eq(liveDevices.sn, a.sn), isNull(liveDevices.deletedAt)));
        if (cur) await db.update(liveDevices).set({ model: a.model, gatewaySn, pilotId: g?.pilotId ?? null, lastSeenAt: sql`now()` }).where(eq(liveDevices.id, cur.id));
        else {
          const added = await db
            .insert(liveDevices)
            .values({ id: newId(), sn: a.sn, kind: 'aircraft', model: a.model, gatewaySn, pilotId: g?.pilotId ?? null, lastSeenAt: new Date().toISOString() })
            .onConflictDoNothing()
            .returning({ id: liveDevices.id });
          // Linked to another organization: its frames keep going there.
          if (!added.length) this.log.warn({ gatewaySn }, 'aircraft on this controller is linked to another organization');
        }
        this.forget(a.sn);
      }
    });
  }

  /** Health alerts from a gateway go on its aircraft's open session. */
  async health(gatewaySn: string, events: TelemetryEvent[]) {
    if (!events.length) return;
    const gw = await this.route(gatewaySn);
    if (!gw) return;
    await tenant(this.pool, gw.orgId, (db) =>
      db
        .update(liveSessions)
        .set({ events: sql`${liveSessions.events} || ${JSON.stringify(events)}::jsonb` })
        .where(and(eq(liveSessions.status, 'open'), eq(liveSessions.gatewaySn, gatewaySn))),
    );
  }

  /** One frame from an aircraft in `orgId`. */
  async ingest(orgId: string, frame: LiveFrame, meta: { model?: string | null; gatewaySn?: string | null; pilotId?: string | null } = {}) {
    return this.serial(frame.sn, async () => {
      let cur = this.open.get(frame.sn) ?? (await this.loadOpen(orgId, frame.sn));
      if (cur && cur.orgId !== orgId) cur = null;
      const { open, action } = sessionStep(cur?.state ?? null, frame);
      if (action === 'none') {
        const ring = [...(this.ring.get(frame.sn) ?? []), frame].slice(-PRE_TAKEOFF_FRAMES);
        this.ring.set(frame.sn, ring);
        await this.touchDevice(orgId, frame.sn);
        return { action, sessionId: null };
      }
      if (action === 'start') {
        const id = newId();
        await tenant(this.pool, orgId, async (db) => {
          const dev = await db.select({ pilotId: liveDevices.pilotId, model: liveDevices.model, gatewaySn: liveDevices.gatewaySn }).from(liveDevices).where(and(eq(liveDevices.sn, frame.sn), isNull(liveDevices.deletedAt)));
          const model = meta.model ?? dev[0]?.model ?? null;
          const fleet = await db.select({ id: aircraft.id, make: aircraft.make, model: aircraft.model, serialNumber: aircraft.serialNumber, status: aircraft.status }).from(aircraft).where(isNull(aircraft.deletedAt));
          const link = matchAircraft({ aircraftSerial: frame.sn, aircraftModel: model }, fleet.map((a) => ({ ...a, retired: a.status === 'retired' })));
          await db.insert(liveSessions).values({
            id,
            aircraftSn: frame.sn,
            gatewaySn: meta.gatewaySn ?? dev[0]?.gatewaySn ?? null,
            model,
            // Only a serial match is trusted for automatic logging; a model match still asks.
            aircraftId: link?.by === 'serial' ? link.id : null,
            pilotId: meta.pilotId ?? dev[0]?.pilotId ?? null,
            startedAt: new Date(open!.startedAt).toISOString(),
            lastFrameAt: new Date(frame.t).toISOString(),
            lastAirborneAt: new Date(frame.t).toISOString(),
            lastFrame: frame,
          });
          const before = (this.ring.get(frame.sn) ?? []).filter((f) => f.t < frame.t);
          await db.insert(liveSamples).values([...before, frame].map((f) => ({ sessionId: id, t: new Date(f.t).toISOString(), frame: f }))).onConflictDoNothing();
        });
        this.ring.delete(frame.sn);
        this.open.set(frame.sn, { id, orgId, state: open! });
        return { action, sessionId: id };
      }
      const id = cur!.id;
      await tenant(this.pool, orgId, async (db) => {
        await db.insert(liveSamples).values({ sessionId: id, t: new Date(frame.t).toISOString(), frame }).onConflictDoNothing();
        const st = open ?? cur!.state;
        await db
          .update(liveSessions)
          .set({ lastFrame: frame, lastFrameAt: new Date(Math.max(frame.t, cur!.state.lastFrameAt)).toISOString(), lastAirborneAt: new Date(st.lastAirborneAt).toISOString() })
          .where(eq(liveSessions.id, id));
      });
      if (action === 'end') {
        this.open.delete(frame.sn);
        await this.finalize(orgId, id, false);
      } else this.open.set(frame.sn, { id, orgId, state: open! });
      return { action, sessionId: id };
    });
  }

  private async loadOpen(orgId: string, sn: string) {
    const [s] = await tenant(this.pool, orgId, (db) => db.select().from(liveSessions).where(and(eq(liveSessions.aircraftSn, sn), eq(liveSessions.status, 'open'))));
    if (!s) return null;
    const v = { id: s.id, orgId, state: { startedAt: Date.parse(s.startedAt), lastAirborneAt: Date.parse(s.lastAirborneAt), lastFrameAt: Date.parse(s.lastFrameAt) } };
    this.open.set(sn, v);
    return v;
  }

  private async touchDevice(orgId: string, sn: string) {
    const last = this.seen.get(sn) ?? 0;
    if (Date.now() - last < 30_000) return;
    this.seen.set(sn, Date.now());
    await tenant(this.pool, orgId, (db) => db.update(liveDevices).set({ lastSeenAt: sql`now()` }).where(and(eq(liveDevices.sn, sn), isNull(liveDevices.deletedAt))));
  }

  /** Sessions whose aircraft went quiet for two minutes are closed and logged. */
  async sweep(now = Date.now()) {
    const r = await this.pool.query<{ id: string; org_id: string }>('SELECT * FROM certa.live_stale_sessions($1)', [new Date(now - SILENCE_MS).toISOString()]);
    for (const s of r.rows) {
      for (const [sn, v] of this.open) if (v.id === s.id) this.open.delete(sn);
      await this.finalize(s.org_id, s.id, true).catch((err) => this.log.error({ err, sessionId: s.id }, 'closing a quiet live session failed'));
    }
    return r.rows.length;
  }

  /**
   * Turns a finished session into a logged flight. With `assign`, a person supplies the aircraft
   * and pilot for a session that waited for review.
   */
  async finalize(orgId: string, sessionId: string, timedOut: boolean, assign?: { aircraftId: string; pilotId: string }) {
    return tenant(this.pool, orgId, async (db) => {
      const [s] = await db.select().from(liveSessions).where(eq(liveSessions.id, sessionId));
      if (!s || (s.status !== 'open' && !(assign && s.status === 'needs_aircraft'))) return s ?? null;
      const rows = await db.select({ frame: liveSamples.frame }).from(liveSamples).where(eq(liveSamples.sessionId, sessionId)).orderBy(asc(liveSamples.t));
      const frames = rows.map((r) => r.frame as LiveFrame);
      const result = summarizeTelemetry(framesToTelemetry({ sn: s.aircraftSn, model: s.model, frames, events: (s.events as TelemetryEvent[]) ?? [], timedOut: timedOut || s.timedOut }));
      const endedAt = s.endedAt ?? new Date(frames.at(-1)?.t ?? Date.parse(s.lastFrameAt)).toISOString();
      if (!result) {
        await db.update(liveSessions).set({ status: 'discarded', endedAt, timedOut: timedOut || s.timedOut }).where(eq(liveSessions.id, sessionId));
        return { ...s, status: 'discarded' as const };
      }
      const aircraftId = assign?.aircraftId ?? s.aircraftId;
      const pilotId = assign?.pilotId ?? s.pilotId;
      if (!aircraftId || !pilotId) {
        await db.update(liveSessions).set({ status: 'needs_aircraft', endedAt, timedOut: timedOut || s.timedOut }).where(eq(liveSessions.id, sessionId));
        return { ...s, status: 'needs_aircraft' as const };
      }
      const { summary, track } = result;
      const dedupeKey = telemetryDedupeKey(summary, aircraftId);
      const [dup] = await db.select({ id: flights.id }).from(flights).where(and(eq(flights.dedupeKey, dedupeKey), isNull(flights.deletedAt))).limit(1);
      let flightId = dup?.id ?? null;
      if (!flightId) {
        flightId = newId();
        const ctx = await orgMapContext(db, orgId);
        const packs = await db.select({ id: batteries.id, serialNumber: batteries.serialNumber, status: batteries.status }).from(batteries).where(isNull(batteries.deletedAt));
        const batteryIds = matchBatteries(summary.batterySerials, packs.map((b) => ({ ...b, retired: b.status === 'retired' })));
        const check = goNoGo(await loadFleet(db, orgId), { pilotId, aircraftId, batteryIds }, ctx);
        await db.insert(flights).values({
          id: flightId,
          pilotInCommandId: pilotId,
          aircraftId,
          takeoffAt: summary.takeoffAt,
          landingAt: summary.landingAt,
          localTimeZone: ctx.orgTimeZone,
          takeoffPoint: ewkt(summary.home) as unknown as string,
          landingPoint: ewkt(summary.landing) as unknown as string,
          path: lineZM(track) as unknown as string,
          durationSeconds: Math.max(1, summary.durationSeconds),
          maxAltitudeAglM: summary.maxHeightM == null ? null : Math.max(0, summary.maxHeightM),
          maxDistanceM: summary.maxDistanceM,
          totalDistanceM: summary.totalDistanceM,
          operationType: 'commercial',
          notes: 'Logged automatically from the aircraft’s live link.',
          source: 'import',
          importParser: summary.parser,
          importWarnings: summary.warnings,
          dedupeKey,
          telemetry: summary,
          goNoGo: check,
        });
        if (batteryIds.length) await db.insert(flightBatteries).values(batteryIds.map((batteryId) => ({ flightId: flightId!, batteryId, startPct: summary.battery.startPct, endPct: summary.battery.endPct })));
        await recomputeDerived(db, { aircraftIds: [aircraftId], batteryIds });
      }
      await db.update(liveSessions).set({ status: 'logged', flightId, aircraftId, pilotId, endedAt, timedOut: timedOut || s.timedOut }).where(eq(liveSessions.id, sessionId));
      this.log.info({ sessionId, flightId, orgId }, 'live flight logged');
      return { ...s, status: 'logged' as const, flightId };
    });
  }
}
