import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import { LiveProcessor } from '../src/lib/live.js';
import { djiOsdToFrame, djiTopology } from '@certa/core';

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
  tdb = await createTestDatabase('live');
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
const T0 = Date.UTC(2026, 9, 22, 15, 0, 0);
/** M30T state at second s of a 5-minute flight (takeoff at 30 s, landing at 330 s). */
const osd = (s: number) => ({
  timestamp: T0 + s * 1000,
  data: {
    latitude: 39.65 + Math.min(Math.max(s - 60, 0), 200) * 0.000018, longitude: -104.85, height: 1700, elevation: s > 30 && s < 330 ? 50 : 0,
    horizontal_speed: s > 60 && s < 260 ? 2 : 0, mode_code: s >= 30 && s < 330 ? 3 : 0, position_state: { gps_number: 22 },
    battery: { capacity_percent: 98 - Math.round(s / 10), batteries: [{ sn: 'PACKA0001', capacity_percent: 98 - Math.round(s / 10), voltage: 25100 - s * 5 }, { sn: 'PACKB0002', capacity_percent: 97 - Math.round(s / 10), voltage: 25050 - s * 5 }] },
  },
});
const hook = (path: string, payload: object, secret = HOOK) => app.inject({ method: 'POST', url: `/api/v1/live/mqtt/${path}`, headers: { 'x-certa-hook-secret': secret }, payload });

describe('live telemetry', () => {
  let creds: { username: string; password: string };
  let aircraftId: string;
  let pilotId: string;

  it('links a DJI Pilot 2 controller and gives it a message-server credential', async () => {
    const setup = await ok(call(owner, 'GET', '/live/dji-setup'));
    expect(setup).toEqual({ enabled: true, appId: 123456, appKey: 'test-app-key', license: 'test-license', mqttHost: 'tcp://live.example.com:1883' });
    aircraftId = (await ok(call(owner, 'POST', '/aircraft', { make: 'DJI', model: 'Matrice 30T', serialNumber: '1581F5BKD225400' }), 201)).id;
    await ok(call(owner, 'POST', '/batteries', { serialNumber: 'PACKA0001', label: 'TB30 #1' }), 201);
    await ok(call(owner, 'POST', '/batteries', { serialNumber: 'PACKB0002', label: 'TB30 #2' }), 201);
    pilotId = (await ok(call(owner, 'GET', '/fleet'))).pilots.find((p: { displayName: string }) => p.displayName === 'Olivia Owner').id;
    const bound = await ok(call(owner, 'POST', '/live/devices/bind', { gatewaySn: '5YSZKAV0010002' }));
    expect(bound).toMatchObject({ mqtt: { host: 'tcp://live.example.com:1883' }, workspaceId: owner.orgId, workspaceName: 'Skyline Aerial' });
    expect(bound.mqtt.username).toMatch(/^lv_[0-9a-f]{12}$/);
    creds = bound.mqtt;
    // Another organization can't take over a linked controller.
    expect((await call(other, 'POST', '/live/devices/bind', { gatewaySn: '5YSZKAV0010002' })).statusCode).toBe(409);
  });

  it('answers the message server: who may connect and which topics they may use', async () => {
    expect((await hook('auth', { username: creds.username, password: creds.password })).json()).toEqual({ result: 'allow', is_superuser: false });
    expect((await hook('auth', { username: creds.username, password: 'wrong' })).json().result).toBe('deny');
    expect((await hook('auth', { username: 'certa-bridge', password: BRIDGE_PASSWORD })).json()).toEqual({ result: 'allow', is_superuser: true });
    expect((await hook('auth', { username: creds.username, password: creds.password }, 'nope')).statusCode).toBe(401);
    expect((await hook('acl', { username: creds.username, topic: 'sys/product/5YSZKAV0010002/status', action: 'publish' })).json().result).toBe('allow');
    expect((await hook('acl', { username: creds.username, topic: 'thing/product/1581F5BKD225400/osd', action: 'publish' })).json().result).toBe('deny'); // not seen yet
    expect((await hook('acl', { username: creds.username, topic: 'thing/product/SOMEONEELSE1/osd', action: 'subscribe' })).json().result).toBe('deny');
  });

  it('logs a whole flight from DJI messages: drone, pilot and both batteries linked by serial', async () => {
    const live = new LiveProcessor(pool, silent);
    await live.topology('5YSZKAV0010002', djiTopology({ method: 'update_topo', data: { sub_devices: [{ sn: '1581F5BKD225400', domain: '0', type: 67, sub_type: 1 }] } })!.aircraft);
    expect((await hook('acl', { username: creds.username, topic: 'thing/product/1581F5BKD225400/osd', action: 'publish' })).json().result).toBe('allow');
    let mid: unknown = null;
    for (let s = 0; s <= 360; s++) {
      const r = await live.ingest(owner.orgId, djiOsdToFrame('1581F5BKD225400', osd(s), T0)!, { gatewaySn: '5YSZKAV0010002' });
      if (s === 150) mid = (await ok(call(owner, 'GET', '/live'))).sessions[0];
      if (r.action === 'end') break;
    }
    expect(mid).toMatchObject({ status: 'open', model: 'DJI Matrice 30T', aircraftId, pilotId, lastFrame: { airborne: true, heightM: 50, modeLabel: 'Manual flight' } });
    const overview = await ok(call(owner, 'GET', '/live'));
    expect(overview.devices.map((d: { sn: string; kind: string }) => `${d.kind}:${d.sn}`).sort()).toEqual(['aircraft:1581F5BKD225400', 'gateway:5YSZKAV0010002']);
    const s = overview.sessions[0];
    expect(s).toMatchObject({ status: 'logged', aircraftId, pilotId });
    const track = await ok(call(owner, 'GET', `/live/sessions/${s.id}/track`));
    expect(track.points.length).toBeGreaterThan(100);
    const flight = await ok(call(owner, 'GET', `/flights/${s.flightId}`));
    expect(flight).toMatchObject({ source: 'import', importParser: 'dji-cloud-live', pilotInCommandId: pilotId, aircraftId, hasPath: true });
    expect(flight.batteries.map((b: { endPct: number }) => b.endPct)).toEqual([65, 65]);
    expect(flight.durationSeconds).toBeGreaterThan(290);
    const t = await ok(call(owner, 'GET', `/flights/${s.flightId}/track`));
    expect(t.telemetry).toMatchObject({ parser: 'dji-cloud-live', aircraftSerial: '1581F5BKD225400', maxHeightM: 50 });
    expect((await ok(call(other, 'GET', '/live'))).sessions).toEqual([]);
  });

  it('holds a flight from an unknown drone for review, and takes frames from other bridges', async () => {
    const created = await ok(call(owner, 'POST', '/api-keys', { name: 'MAVLink forwarder', scopes: ['live:write'] }), 201);
    const frames = Array.from({ length: 80 }, (_, i) => ({
      sn: 'ARDU0001', t: T0 + 3600_000 + i * 5000, lat: 39.7 + i * 1e-5, lon: -104.9, heightM: i > 2 && i < 70 ? 40 : 0, altM: null, speedMps: i > 2 && i < 70 ? 5 : 0, verticalSpeedMps: null,
      headingDeg: null, homeDistanceM: null, batteryPct: 100 - i, remainingFlightSec: null, packs: [], gpsSats: 14, windMps: null, mode: null, modeLabel: null, airborne: i > 2 && i < 70,
    }));
    const res = await app.inject({ method: 'POST', url: '/api/v1/integrations/live/frames', headers: { authorization: `Bearer ${created.key}` }, payload: { model: 'ArduCopter V4.5', frames } });
    expect(res.statusCode, res.body).toBe(202);
    const waiting = (await ok(call(owner, 'GET', '/live'))).sessions.find((x: { aircraftSn: string }) => x.aircraftSn === 'ARDU0001');
    expect(waiting).toMatchObject({ status: 'needs_aircraft', aircraftId: null, pilotId: null });
    const logged = await ok(call(owner, 'POST', `/live/sessions/${waiting.id}/assign`, { aircraftId, pilotId }));
    expect(logged).toMatchObject({ status: 'logged', aircraftId, pilotId });
    expect((await ok(call(owner, 'GET', `/flights/${logged.flightId}`))).durationSeconds).toBeGreaterThan(300);
    const noScope = await ok(call(owner, 'POST', '/api-keys', { name: 'verify only' }), 201);
    expect((await app.inject({ method: 'POST', url: '/api/v1/integrations/live/frames', headers: { authorization: `Bearer ${noScope.key}` }, payload: { frames } })).statusCode).toBe(403);
  });

  it('unlinking revokes the credential at once', async () => {
    const { devices } = await ok(call(owner, 'GET', '/live'));
    const gw = devices.find((d: { kind: string }) => d.kind === 'gateway');
    await ok(call(owner, 'DELETE', `/live/devices/${gw.id}`), 204);
    expect((await hook('auth', { username: creds.username, password: creds.password })).json().result).toBe('deny');
  });
});
