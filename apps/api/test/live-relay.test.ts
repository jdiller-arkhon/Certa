import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import mqtt from 'mqtt';
import { WebSocketServer } from 'ws';
import { RelaySession } from '../../../infra/cloudflare/src/mqtt-relay.js';

const ORIGIN = 'http://localhost:8080';
const HOOK = 'hook-secret-hook-secret-hook-secret-1234';
const BRIDGE_PASSWORD = 'bridge-password-bridge-password';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;

interface Session {
  cookie: string;
  orgId: string;
}

const cookieFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw as string] : [];
  return list.map((c: string) => c.split(';')[0]).join('; ');
};

async function signUp(name: string, email: string, org: string): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/signup',
    headers: { origin: ORIGIN },
    payload: { name, email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' },
  });
  expect(res.statusCode, res.body).toBe(201);
  return { cookie: cookieFrom(res), orgId: res.json().memberships[0].orgId };
}

const call = (s: Session, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1/orgs/${s.orgId}${path}`, headers: { origin: ORIGIN, cookie: s.cookie }, payload: payload as object });
const ok = async (p: ReturnType<typeof call>, status = 200) => {
  const res = await p;
  expect(res.statusCode, res.body).toBe(status);
  return res.statusCode === 204 ? null : res.json();
};

let owner: Session;
let other: Session;

beforeAll(async () => {
  tdb = await createTestDatabase('live_relay');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
    LIVE_MQTT_PUBLIC_URL: 'wss://live.example.com/certa/live/mqtt',
    LIVE_MQTT_PASSWORD: BRIDGE_PASSWORD,
    LIVE_HOOK_SECRET: HOOK,
    DJI_APP_ID: '123456',
    DJI_APP_KEY: 'test-app-key',
    DJI_APP_LICENSE: 'test-license',
  });
  app = await buildApp({ config, pool, mailer: new MemoryMailer() }, { logger: false });
  owner = await signUp('Olivia Owner', 'olivia@example.com', 'Skyline Aerial');
  other = await signUp('Oscar Other', 'oscar@example.com', 'Other Co');
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

/**
 * The Cloudflare relay's MQTT session, behind a plain WebSocket server instead of a Durable
 * Object, calling the real API the way the Worker does.
 */
async function startRelay(hook = HOOK) {
  const post = async (url: string, payload: unknown) => {
    const res = await app.inject({ method: 'POST', url, headers: { 'x-certa-hook-secret': hook }, payload: payload as object });
    if (res.statusCode >= 400) throw new Error(`API answered ${res.statusCode}`);
    return res.json();
  };
  const wss = new WebSocketServer({ port: 0, handleProtocols: (p) => (p.has('mqtt') ? 'mqtt' : false) });
  const log: string[] = [];
  wss.on('connection', (ws) => {
    const s = new RelaySession({
      send: (b) => ws.send(b),
      close: () => ws.close(),
      auth: async (username, password) => (await post('/api/v1/live/mqtt/auth', { username, password })).result === 'allow',
      forward: (username, messages) => post('/api/v1/live/relay', { username, messages }),
      log: (e) => log.push(e),
    });
    ws.on('message', (d) => s.onData(new Uint8Array(d as Buffer)));
    ws.on('close', () => void s.onClose());
  });
  await new Promise((r) => wss.once('listening', r));
  return { url: `ws://127.0.0.1:${(wss.address() as { port: number }).port}`, log, close: () => new Promise((r) => wss.close(r)) };
}

const osd = (sn: string, gw: string, t: number, s: number, airborne: boolean) =>
  JSON.stringify({ timestamp: t, gateway: gw, data: { latitude: 39.6 + (airborne ? s * 1e-5 : 0), longitude: -104.8, height: 1700, elevation: airborne ? 40 : 0, horizontal_speed: airborne ? 3 : 0, mode_code: airborne ? 3 : 0, battery: { capacity_percent: 100 - Math.round(s / 10), batteries: [{ sn: 'M30PACK01', capacity_percent: 100 - Math.round(s / 10), voltage: 52000 - s * 5 }] } } });

describe('Cloudflare relay (MQTT over WebSocket)', () => {
  it('lets a linked controller in, answers topology, and logs the flight when the aircraft lands', async () => {
    const relay = await startRelay();
    try {
      const aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Matrice 30T', serialNumber: '1581F5BKD225D00' }), 201)).id;
      const bind = await ok(call(owner, 'POST', '/live/devices/bind', { gatewaySn: '4LFCL2E00100A1' }));

      // A wrong password is refused with CONNACK 5.
      await expect(mqtt.connectAsync(relay.url, { username: bind.mqtt.username, password: 'wrong', reconnectPeriod: 0, protocolVersion: 4 })).rejects.toThrow(/Not authorized|5/);

      const rc = await mqtt.connectAsync(relay.url, { clientId: 'pilot2', username: bind.mqtt.username, password: bind.mqtt.password, protocolVersion: 4, reconnectPeriod: 0 });
      const replies: string[] = [];
      rc.on('message', (topic, buf) => replies.push(`${topic} ${JSON.parse(buf.toString()).data.result}`));
      await rc.subscribeAsync('sys/product/4LFCL2E00100A1/status_reply');
      await rc.publishAsync('sys/product/4LFCL2E00100A1/status', JSON.stringify({ tid: 't1', bid: 'b1', timestamp: Date.now(), method: 'update_topo', data: { domain: '2', type: 144, sub_type: 0, sub_devices: [{ sn: '1581F5BKD225D00', domain: '0', type: 67, sub_type: 1 }] } }), { qos: 1 });
      for (let i = 0; i < 60 && !replies.length; i++) await new Promise((r) => setTimeout(r, 50));
      expect(replies).toEqual(['sys/product/4LFCL2E00100A1/status_reply 0']);

      // Another organization's aircraft can't be reported through this controller.
      await rc.publishAsync('thing/product/OTHERSN0001/osd', osd('OTHERSN0001', '4LFCL2E00100A1', Date.now(), 0, true));

      const t0 = Date.now() - 400_000;
      for (let s = 0; s <= 360; s++) await rc.publishAsync('thing/product/1581F5BKD225D00/osd', osd('1581F5BKD225D00', '4LFCL2E00100A1', t0 + s * 1000, s, s >= 30 && s < 330));
      await rc.endAsync();

      let session: { status: string; flightId: string | null; aircraftSn: string } | undefined;
      for (let i = 0; i < 200; i++) {
        const all = (await ok(call(owner, 'GET', '/live'))).sessions;
        session = all[0];
        if (session?.status === 'logged') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(session).toMatchObject({ status: 'logged', aircraftSn: '1581F5BKD225D00' });
      expect((await ok(call(owner, 'GET', '/live'))).sessions.map((s: { aircraftSn: string }) => s.aircraftSn)).not.toContain('OTHERSN0001');
      const flight = await ok(call(owner, 'GET', `/flights/${session!.flightId}`));
      expect(flight).toMatchObject({ aircraftId, importParser: 'dji-cloud-live', hasPath: true });
      expect(flight.durationSeconds).toBeGreaterThan(290);

      // Unlinking hangs up on the controller at its next message.
      const device = (await ok(call(owner, 'GET', '/live'))).devices.find((d: { sn: string }) => d.sn === '4LFCL2E00100A1');
      await ok(call(owner, 'DELETE', `/live/devices/${device.id}`), 204);
      const again = await mqtt.connectAsync(relay.url, { username: bind.mqtt.username, password: bind.mqtt.password, protocolVersion: 4, reconnectPeriod: 0 }).catch((e: Error) => e);
      expect(again).toBeInstanceOf(Error);
    } finally {
      await relay.close();
    }
  }, 60_000);

  it('refuses callers without the hook secret', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/live/relay', headers: { 'x-certa-hook-secret': 'nope' }, payload: { username: 'lv_000000000000', messages: [] } });
    expect(res.statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/live/relay/sweep' })).statusCode).toBe(401);
  });
});

describe('relay MQTT framing', () => {
  it('reassembles packets split across WebSocket frames and matches topic filters', async () => {
    const { splitPackets, topicMatches, publishPacket } = await import('../../../infra/cloudflare/src/mqtt-relay.js');
    const a = publishPacket('thing/product/SN123456/osd', '{"x":1}');
    const b = publishPacket('sys/product/SN123456/status', '{}');
    const both = new Uint8Array([...a, ...b]);
    const first = splitPackets(both.subarray(0, 5));
    expect(first.packets).toHaveLength(0);
    const rest = splitPackets(new Uint8Array([...first.rest, ...both.subarray(5)]));
    expect(rest.packets.map((p) => p.type)).toEqual([3, 3]);
    expect(rest.rest.length).toBe(0);
    expect(topicMatches('sys/product/+/status_reply', 'sys/product/SN1/status_reply')).toBe(true);
    expect(topicMatches('thing/#', 'thing/product/SN1/osd')).toBe(true);
    expect(topicMatches('thing/product/+', 'thing/product/SN1/osd')).toBe(false);
  });
});
