import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryBlobStore } from '../src/lib/blobs.js';
import { MemoryMailer } from '../src/lib/mailer.js';

const ORIGIN = 'http://localhost:8080';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;
const blobs = new MemoryBlobStore();

/** A one-triangle GLB 2.0. `json` overrides parts of the glTF JSON. */
function glb(json: Record<string, unknown> = {}): Buffer {
  const bin = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const gltf = {
    asset: { version: '2.0', generator: 'test' },
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    ...json,
  };
  let js = Buffer.from(JSON.stringify(gltf));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + js.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const ch = (len: number, type: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(len, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  return Buffer.concat([header, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]);
}

beforeAll(async () => {
  tdb = await createTestDatabase('models');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: tdb.appUrl, AUTH_SECRET: 'test-secret-test-secret-test-secret-123', PUBLIC_URL: ORIGIN, LOG_LEVEL: 'silent', RATE_LIMIT_AUTH_PER_MINUTE: '1000' });
  app = await buildApp({ config, pool, mailer: new MemoryMailer(), blobs }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

async function signUp(email: string, org: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/signup', headers: { origin: ORIGIN }, payload: { name: 'Owner', email, password: 'correct-horse-battery', organizationName: org, timezone: 'America/Denver' } });
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw : [raw as string]).map((c) => c.split(';')[0]).join('; ');
  return { orgId: res.json().memberships[0].orgId as string, cookie };
}

describe('aircraft 3D models', () => {
  it('uploads, serves to the org only, validates GLBs, replaces and removes', async () => {
    const a = await signUp('a@example.com', 'Alpha');
    const b = await signUp('b@example.com', 'Bravo');
    const ac = (await app.inject({ method: 'POST', url: `/api/v1/orgs/${a.orgId}/aircraft`, headers: { origin: ORIGIN, cookie: a.cookie }, payload: { make: 'DJI', model: 'M30T', serialNumber: 'S1' } })).json();
    const url = `/api/v1/orgs/${a.orgId}/aircraft/${ac.id}/model`;
    const put = (body: Buffer, cookie = a.cookie, path = url) => app.inject({ method: 'PUT', url: path, headers: { origin: ORIGIN, cookie, 'content-type': 'model/gltf-binary' }, payload: body });

    const up = await put(glb());
    expect(up.statusCode, up.body).toBe(200);
    expect(up.json()).toMatchObject({ meshes: 1 });
    expect([...blobs.files.keys()][0]).toMatch(new RegExp(`^orgs/${a.orgId}/models/`));

    const fleet = (await app.inject({ method: 'GET', url: `/api/v1/orgs/${a.orgId}/fleet`, headers: { cookie: a.cookie } })).json();
    expect(fleet.aircraft[0].modelDocumentId).toBe(up.json().documentId);

    const got = await app.inject({ method: 'GET', url, headers: { cookie: a.cookie } });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('model/gltf-binary');
    expect(got.rawPayload.subarray(0, 4).toString()).toBe('glTF');
    const etag = got.headers.etag as string;
    expect((await app.inject({ method: 'GET', url, headers: { cookie: a.cookie, 'if-none-match': etag } })).statusCode).toBe(304);

    // Another org can't read or write it.
    expect((await app.inject({ method: 'GET', url, headers: { cookie: b.cookie } })).statusCode).toBe(404);
    expect((await put(glb(), b.cookie)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/v1/orgs/${b.orgId}/aircraft/${ac.id}/model`, headers: { cookie: b.cookie } })).statusCode).toBe(404);

    // Validation.
    expect((await put(Buffer.from('not a model at all, sorry'))).json().error.message).toMatch(/Not a GLB/);
    expect((await put(glb({ images: [{ uri: 'https://tracker.example.com/pixel.png' }] }))).json().error.message).toMatch(/external files/);
    expect((await put(glb({ extensionsRequired: ['KHR_draco_mesh_compression'] }))).json().error.message).toMatch(/Compressed/);
    const truncated = glb().subarray(0, 60);
    expect((await put(Buffer.from(truncated))).json().error.message).toMatch(/length header/);
    expect((await app.inject({ method: 'PUT', url, headers: { origin: ORIGIN, cookie: a.cookie, 'content-type': 'model/gltf-binary' }, payload: Buffer.alloc(21 * 1024 * 1024) })).statusCode).toBe(413);

    // Replace, then remove.
    const second = (await put(glb())).json();
    expect(second.documentId).not.toBe(up.json().documentId);
    expect((await app.inject({ method: 'DELETE', url, headers: { origin: ORIGIN, cookie: a.cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url, headers: { cookie: a.cookie } })).statusCode).toBe(404);
  });
});
