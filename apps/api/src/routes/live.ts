/**
 * Live telemetry: linking DJI Pilot 2 controllers, the Live page's data, reviewing finished
 * sessions, the MQTT message server's authentication hooks, and a frame API for other bridges.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { api, Id, newId, parseDjiTopic, type LiveFrame } from '@certa/core';
import { aircraft, and, asc, desc, eq, gte, inArray, isNull, liveDevices, liveSamples, liveSessions, or, organizations, pilots, sql } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { ApiError, badRequest, conflict, notFound } from '../lib/errors.js';
import { LiveProcessor } from '../lib/live.js';
import { handleDjiMessage } from '../lib/live-bridge.js';
import { iso } from '../lib/mappers.js';
import { authenticateKey } from './integrations.js';
import { OrgParams } from './orgs.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const CRED = /^(lv_[0-9a-f]{12})$/;
const SessionParams = OrgParams.extend({ sessionId: Id });
const DeviceParams = OrgParams.extend({ deviceId: Id });

const toDevice = (d: typeof liveDevices.$inferSelect): api.LiveDevice => ({
  id: d.id, sn: d.sn, kind: d.kind, model: d.model, gatewaySn: d.gatewaySn, pilotId: d.pilotId, lastSeenAt: iso(d.lastSeenAt), createdAt: iso(d.createdAt)!,
});
const toSession = (s: typeof liveSessions.$inferSelect): api.LiveSession => ({
  id: s.id, aircraftSn: s.aircraftSn, model: s.model, aircraftId: s.aircraftId, pilotId: s.pilotId, status: s.status,
  startedAt: iso(s.startedAt)!, lastFrameAt: iso(s.lastFrameAt)!, endedAt: iso(s.endedAt), timedOut: s.timedOut, flightId: s.flightId,
  lastFrame: (s.lastFrame as LiveFrame | null) ?? null, events: ((s.events as api.LiveSession['events']) ?? []).slice(-30),
});

export const liveRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const { config } = ctx;
    const processor = new LiveProcessor(ctx.pool, app.log);
    const djiEnabled = !!(config.LIVE_MQTT_PUBLIC_URL && config.DJI_APP_ID && config.DJI_APP_KEY && config.DJI_APP_LICENSE);

    // ------------------------------------------------------------ pilots and the Live page

    app.get('/orgs/:orgId/live', { schema: { tags: ['live'], summary: 'Linked controllers and aircraft, flights in the air, and recent live sessions.', params: OrgParams, response: { 200: api.LiveOverview } } }, async (req) => {
      const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
      authorize(oc, 'flights.read');
      return inOrg(ctx.pool, req, oc, async (db) => {
        const devices = await db.select().from(liveDevices).where(isNull(liveDevices.deletedAt)).orderBy(asc(liveDevices.kind), desc(liveDevices.lastSeenAt));
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const sessions = await db
          .select()
          .from(liveSessions)
          .where(or(eq(liveSessions.status, 'open'), eq(liveSessions.status, 'needs_aircraft'), gte(liveSessions.startedAt, since)))
          .orderBy(desc(liveSessions.startedAt))
          .limit(40);
        return { djiEnabled, devices: devices.map(toDevice), sessions: sessions.map(toSession) };
      });
    });

    app.get('/orgs/:orgId/live/sessions/:sessionId/track', { schema: { tags: ['live'], params: SessionParams, response: { 200: api.LiveSessionTrack } } }, async (req) => {
      const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
      authorize(oc, 'flights.read');
      return inOrg(ctx.pool, req, oc, async (db) => {
        const [s] = await db.select({ id: liveSessions.id }).from(liveSessions).where(eq(liveSessions.id, req.params.sessionId));
        if (!s) throw notFound('Live session');
        const rows = await db.select({ frame: liveSamples.frame }).from(liveSamples).where(eq(liveSamples.sessionId, s.id)).orderBy(asc(liveSamples.t));
        const fixes = rows.map((r) => r.frame as LiveFrame).filter((f) => f.lat != null && f.lon != null);
        const step = Math.max(1, Math.ceil(fixes.length / 600));
        return { points: fixes.filter((_, i) => i % step === 0 || i === fixes.length - 1).map((f) => [f.lon!, f.lat!, f.heightM ?? 0, Math.round(f.t / 1000)] as [number, number, number, number]) };
      });
    });

    app.get('/orgs/:orgId/live/dji-setup', { schema: { tags: ['live'], summary: 'What DJI Pilot 2 needs to link a controller to Certa.', params: OrgParams, response: { 200: api.LiveDjiSetup } } }, async (req) => {
      const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
      authorize(oc, 'flights.log');
      return djiEnabled
        ? { enabled: true, appId: config.DJI_APP_ID!, appKey: config.DJI_APP_KEY!, license: config.DJI_APP_LICENSE!, mqttHost: config.LIVE_MQTT_PUBLIC_URL! }
        : { enabled: false, appId: null, appKey: null, license: null, mqttHost: null };
    });

    app.post(
      '/orgs/:orgId/live/devices/bind',
      { schema: { tags: ['live'], summary: 'Link a DJI Pilot 2 controller (or dock): returns its message-server credential, shown once.', params: OrgParams, body: api.LiveBindRequest, response: { 200: api.LiveBindResponse, 409: api.ErrorResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'flights.log');
        if (!djiEnabled) throw new ApiError(503, 'live_disabled', 'Live linking isn’t switched on for this Certa server yet.');
        const b = req.body;
        const prefix = `lv_${randomBytes(6).toString('hex')}`;
        const secret = randomBytes(32).toString('base64url');
        const result = await inOrg(ctx.pool, req, oc, async (db) => {
          const [mine] = await db.select().from(liveDevices).where(and(eq(liveDevices.sn, b.gatewaySn), isNull(liveDevices.deletedAt)));
          let id = mine?.id;
          if (mine) await db.update(liveDevices).set({ kind: 'gateway', mqttPrefix: prefix, secretHash: sha256(secret), pilotId: oc.pilotId ?? mine.pilotId, lastSeenAt: sql`now()` }).where(eq(liveDevices.id, mine.id));
          else {
            id = newId();
            // No nested transaction here: it would commit the tenant transaction early. A serial
            // linked elsewhere is a unique conflict, so nothing is inserted.
            const added = await db
              .insert(liveDevices)
              .values({ id, sn: b.gatewaySn, kind: 'gateway', mqttPrefix: prefix, secretHash: sha256(secret), pilotId: oc.pilotId, lastSeenAt: new Date().toISOString() })
              .onConflictDoNothing()
              .returning({ id: liveDevices.id });
            if (!added.length) throw conflict('This controller is linked to another organization. Unlink it there first.');
          }
          if (b.aircraftSn && b.aircraftSn !== b.gatewaySn) {
            const [a] = await db.select({ id: liveDevices.id }).from(liveDevices).where(and(eq(liveDevices.sn, b.aircraftSn), isNull(liveDevices.deletedAt)));
            if (a) await db.update(liveDevices).set({ gatewaySn: b.gatewaySn, pilotId: oc.pilotId }).where(eq(liveDevices.id, a.id));
            else await db.insert(liveDevices).values({ id: newId(), sn: b.aircraftSn, kind: 'aircraft', gatewaySn: b.gatewaySn, pilotId: oc.pilotId }).onConflictDoNothing();
          }
          const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, oc.orgId));
          return { deviceId: id!, workspaceName: org?.name ?? 'Certa' };
        });
        processor.forget(b.gatewaySn);
        if (b.aircraftSn) processor.forget(b.aircraftSn);
        return { deviceId: result.deviceId, mqtt: { host: config.LIVE_MQTT_PUBLIC_URL!, username: prefix, password: secret }, workspaceId: oc.orgId, workspaceName: result.workspaceName };
      },
    );

    app.delete('/orgs/:orgId/live/devices/:deviceId', { schema: { tags: ['live'], summary: 'Unlink a controller or aircraft (its credential stops working at once).', params: DeviceParams } }, async (req, reply) => {
      const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
      await inOrg(ctx.pool, req, oc, async (db) => {
        const [d] = await db.select().from(liveDevices).where(and(eq(liveDevices.id, req.params.deviceId), isNull(liveDevices.deletedAt)));
        if (!d) throw notFound('Linked device');
        // Pilots can unlink the controllers they linked; managers can unlink any.
        authorize(oc, 'flights.log', d.pilotId);
        // Deleted devices are invisible to the credential lookup, so the credential stops working now.
        await db.update(liveDevices).set({ deletedAt: sql`now()` }).where(eq(liveDevices.id, d.id));
        processor.forget(d.sn);
      });
      return reply.status(204).send();
    });

    app.post(
      '/orgs/:orgId/live/sessions/:sessionId/assign',
      { schema: { tags: ['live'], summary: 'Log a finished live session that needed an aircraft or pilot.', params: SessionParams, body: api.LiveAssignRequest, response: { 200: api.LiveSession } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'flights.log', req.body.pilotId);
        const [s] = await inOrg(ctx.pool, req, oc, async (db) => {
          const [a] = await db.select({ id: aircraft.id }).from(aircraft).where(and(eq(aircraft.id, req.body.aircraftId), isNull(aircraft.deletedAt)));
          const [p] = await db.select({ id: pilots.id }).from(pilots).where(and(eq(pilots.id, req.body.pilotId), isNull(pilots.deletedAt)));
          if (!a || !p) throw badRequest('Unknown aircraft or pilot');
          return db.select().from(liveSessions).where(eq(liveSessions.id, req.params.sessionId));
        });
        if (!s) throw notFound('Live session');
        if (s.status !== 'needs_aircraft') throw conflict('This session isn’t waiting for review');
        await processor.finalize(oc.orgId, s.id, s.timedOut, { aircraftId: req.body.aircraftId, pilotId: req.body.pilotId });
        const [done] = await inOrg(ctx.pool, req, oc, (db) => db.select().from(liveSessions).where(eq(liveSessions.id, s.id)));
        return toSession(done!);
      },
    );

    app.post('/orgs/:orgId/live/sessions/:sessionId/discard', { schema: { tags: ['live'], params: SessionParams, response: { 200: api.LiveSession } } }, async (req) => {
      const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
      authorize(oc, 'flights.log');
      return inOrg(ctx.pool, req, oc, async (db) => {
        const [s] = await db
          .update(liveSessions)
          .set({ status: 'discarded', endedAt: sql`coalesce(${liveSessions.endedAt}, ${liveSessions.lastFrameAt})` })
          .where(and(eq(liveSessions.id, req.params.sessionId), inArray(liveSessions.status, ['needs_aircraft', 'open'])))
          .returning();
        if (!s) throw notFound('Live session');
        return toSession(s);
      });
    });

    // ------------------------------------------------------------ other bridges (API key)

    app.post(
      '/integrations/live/frames',
      { schema: { tags: ['live'], summary: 'Send live frames from another bridge (MAVLink forwarder, Skydio, Autel). Bearer API key with live:write.', body: api.LiveFramesRequest } },
      async (req, reply) => {
        const key = await authenticateKey(ctx, req, 'live:write');
        const frames = [...req.body.frames].sort((a, b) => a.t - b.t);
        if (new Set(frames.map((f) => f.sn)).size > 1) throw badRequest('Send one aircraft’s frames per request');
        let session: string | null = null;
        for (const f of frames) session = (await processor.ingest(key.orgId, f, { model: req.body.model ?? null })).sessionId ?? session;
        return reply.status(202).send({ accepted: frames.length, sessionId: session });
      },
    );

    // ------------------------------------------------------------ message server hooks

    const hookOk = (h: unknown) => {
      if (!config.LIVE_HOOK_SECRET || typeof h !== 'string') return false;
      const a = Buffer.from(sha256(h), 'hex');
      const b = Buffer.from(sha256(config.LIVE_HOOK_SECRET), 'hex');
      return timingSafeEqual(a, b);
    };
    const isBridge = (u: string, p?: string) =>
      u === config.LIVE_MQTT_USERNAME && (p === undefined || (!!config.LIVE_MQTT_PASSWORD && timingSafeEqual(Buffer.from(sha256(p), 'hex'), Buffer.from(sha256(config.LIVE_MQTT_PASSWORD), 'hex'))));
    const credential = async (username: string) => {
      const m = CRED.exec(username);
      if (!m) return null;
      const r = await ctx.pool.query<{ org_id: string; sn: string; secret_hash: string }>('SELECT * FROM certa.live_gateway_credential($1)', [m[1]]);
      return r.rows[0] ?? null;
    };

    app.post('/live/mqtt/auth', { schema: { hide: true, body: api.MqttAuthRequest, response: { 200: api.MqttDecision } } }, async (req) => {
      if (!hookOk(req.headers['x-certa-hook-secret'])) throw new ApiError(401, 'unauthorized', 'Unknown caller');
      const { username, password } = req.body;
      if (isBridge(username, password)) return { result: 'allow' as const, is_superuser: true };
      const c = await credential(username);
      // Compare even without a match, so timing doesn't reveal which credentials exist.
      const ok = timingSafeEqual(Buffer.from(c?.secret_hash ?? '0'.repeat(64), 'hex'), Buffer.from(sha256(password), 'hex'));
      return { result: c && ok ? ('allow' as const) : ('deny' as const), is_superuser: false };
    });

    /** Whether a controller may publish to (or read) a topic: its own serial, or its aircraft's. */
    const topicAllowed = async (c: { org_id: string; sn: string }, topic: string) => {
      const sn = /^(?:thing|sys)\/product\/([A-Za-z0-9]{6,40})\//.exec(topic)?.[1] ?? parseDjiTopic(topic)?.sn;
      if (!sn) return false;
      if (sn === c.sn) return true;
      // The aircraft connected to this controller, in the same organization.
      const r = await ctx.pool.query<{ org_id: string; kind: string; gateway_sn: string | null }>('SELECT * FROM certa.live_device_org($1)', [sn]);
      const d = r.rows[0];
      return !!d && d.org_id === c.org_id && d.kind === 'aircraft' && d.gateway_sn === c.sn;
    };

    app.post('/live/mqtt/acl', { schema: { hide: true, body: api.MqttAclRequest, response: { 200: api.MqttDecision } } }, async (req) => {
      if (!hookOk(req.headers['x-certa-hook-secret'])) throw new ApiError(401, 'unauthorized', 'Unknown caller');
      const { username, topic } = req.body;
      if (isBridge(username)) return { result: 'allow' as const };
      const c = await credential(username);
      return { result: c && (await topicAllowed(c, topic)) ? ('allow' as const) : ('deny' as const) };
    });

    // ------------------------------------------------------------ Cloudflare relay

    /**
     * The Cloudflare relay (a Durable Object speaking MQTT over WebSocket to DJI Pilot 2) has
     * already checked the password through /live/mqtt/auth; it forwards each batch here.
     */
    app.post('/live/relay', { schema: { hide: true, body: api.LiveRelayRequest, response: { 200: api.LiveRelayResponse } } }, async (req) => {
      if (!hookOk(req.headers['x-certa-hook-secret'])) throw new ApiError(401, 'unauthorized', 'Unknown caller');
      const c = await credential(req.body.username);
      if (!c) return { publish: [], disconnect: true };
      const allowed = new Map<string, boolean>();
      const publish: api.LiveRelayResponse['publish'] = [];
      for (const m of req.body.messages) {
        const sn = parseDjiTopic(m.topic)?.sn;
        if (!sn) continue;
        if (!allowed.has(sn)) allowed.set(sn, await topicAllowed(c, m.topic));
        if (!allowed.get(sn)) continue;
        // A topology update can link a new aircraft, so its permission is looked up again.
        if (parseDjiTopic(m.topic)?.kind === 'status') allowed.clear();
        publish.push(...(await handleDjiMessage(processor, m.topic, m.payload)));
      }
      return { publish, disconnect: false };
    });

    /** After a controller disconnects, the relay asks for flights that went silent to be closed. */
    app.post('/live/relay/sweep', { schema: { hide: true } }, async (req, reply) => {
      if (!hookOk(req.headers['x-certa-hook-secret'])) throw new ApiError(401, 'unauthorized', 'Unknown caller');
      await processor.sweep();
      return reply.status(204).send();
    });
  };

