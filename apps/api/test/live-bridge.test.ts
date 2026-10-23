import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { createServer, type Server } from 'node:net';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import { startLiveBridge } from '../src/lib/live-bridge.js';

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
  tdb = await createTestDatabase('live_bridge');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: ORIGIN,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
    LIVE_MQTT_PUBLIC_URL: 'tcp://live.example.com:1883',
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

const silent = { info: () => {}, warn: () => {}, error: () => {} };

describe('DJI bridge over MQTT', () => {
  it('answers topology, follows a flight and logs it when the aircraft lands', async () => {
    const broker = await Aedes.createBroker();
    const server: Server = createServer(broker.handle);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const url = `mqtt://127.0.0.1:${(server.address() as { port: number }).port}`;
    const bridge = startLiveBridge(loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', LIVE_MQTT_URL: url, LIVE_MQTT_PASSWORD: BRIDGE_PASSWORD }), pool, silent)!;
    try {
      const aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Mavic 3 Enterprise', serialNumber: '1581F6Q8D2470' }), 201)).id;
      await ok(call(owner, 'POST', '/live/devices/bind', { gatewaySn: '5YSZL260021E9' }));
      await new Promise<void>((r) => (bridge.client.connected ? r() : bridge.client.once('connect', () => r())));
      await new Promise((r) => setTimeout(r, 200));

      // The controller, as DJI Pilot 2 behaves: topology first, then aircraft state once a second.
      const rc = await mqtt.connectAsync(url, { clientId: 'pilot2-rc' });
      const replies: string[] = [];
      rc.on('message', (topic, buf) => replies.push(`${topic} ${JSON.parse(buf.toString()).data.result}`));
      await rc.subscribeAsync('sys/product/5YSZL260021E9/status_reply');
      await rc.publishAsync('sys/product/5YSZL260021E9/status', JSON.stringify({ tid: 't1', bid: 'b1', timestamp: Date.now(), method: 'update_topo', data: { domain: '2', type: 144, sub_type: 0, sub_devices: [{ sn: '1581F6Q8D2470', domain: '0', type: 77, sub_type: 0 }] } }));
      for (let i = 0; i < 50 && !replies.length; i++) await new Promise((r) => setTimeout(r, 50));
      expect(replies).toEqual(['sys/product/5YSZL260021E9/status_reply 0']);

      const t0 = Date.now() - 400_000;
      for (let s = 0; s <= 360; s++) {
        const airborne = s >= 30 && s < 330;
        await rc.publishAsync('thing/product/1581F6Q8D2470/osd', JSON.stringify({ timestamp: t0 + s * 1000, gateway: '5YSZL260021E9', data: { latitude: 39.6 + (airborne ? s * 1e-5 : 0), longitude: -104.8, height: 1700, elevation: airborne ? 40 : 0, horizontal_speed: airborne ? 3 : 0, mode_code: airborne ? 3 : 0, battery: { capacity_percent: 100 - Math.round(s / 10), batteries: [{ sn: 'M3EPACK01', capacity_percent: 100 - Math.round(s / 10), voltage: 16800 - s * 3 }] } } }));
      }
      await rc.endAsync();
      let session: { status: string; flightId: string | null; model: string } | undefined;
      for (let i = 0; i < 200; i++) {
        session = (await ok(call(owner, 'GET', '/live'))).sessions[0];
        if (session?.status === 'logged') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(session).toMatchObject({ status: 'logged', model: 'DJI Mavic 3 Enterprise' });
      const flight = await ok(call(owner, 'GET', `/flights/${session!.flightId}`));
      expect(flight).toMatchObject({ aircraftId, importParser: 'dji-cloud-live', hasPath: true });
      expect(flight.durationSeconds).toBeGreaterThan(290);
    } finally {
      await bridge.stop();
      await new Promise((r) => broker.close(() => r(null)));
      server.close();
    }
  }, 60_000);
});
