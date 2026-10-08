import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '@certa/db';
import { createTestDatabase, type TestDatabase } from '@certa/db/testing';
import type pg from 'pg';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';

// Hosted inside the Arkhon website at https://arkhonindustries.com/certa.
const SITE = 'https://arkhonindustries.example';
let tdb: TestDatabase;
let pool: pg.Pool;
let app: App;
const mailer = new MemoryMailer();

beforeAll(async () => {
  tdb = await createTestDatabase('api_base_path');
  pool = createPool(tdb.appUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: tdb.appUrl,
    AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    PUBLIC_URL: `${SITE}/certa`,
    LOG_LEVEL: 'silent',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
  });
  app = await buildApp({ config, pool, mailer }, { logger: false });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await tdb?.drop();
});

describe('hosted under /certa on a shared origin', () => {
  let cookies: string[] = [];

  it('rejects malformed base paths', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', AUTH_SECRET: 'x'.repeat(32), PUBLIC_URL: 'https://a.example/Certa App' })).toThrow();
  });

  it('serves the API under the base path only', async () => {
    expect((await app.inject({ method: 'GET', url: '/certa/readyz' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200); // container probe
    expect((await app.inject({ method: 'GET', url: '/certa/api/v1/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(404);
  });

  it('scopes session cookies to /certa with a certa prefix, Secure on https', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/certa/api/v1/signup',
      headers: { origin: SITE },
      payload: { name: 'Dana Reyes', email: 'dana@example.com', password: 'correct-horse-battery', organizationName: 'Reyes Aerial' },
    });
    expect(res.statusCode, res.body).toBe(201);
    const raw = res.headers['set-cookie'];
    cookies = Array.isArray(raw) ? raw : [raw as string];
    const session = cookies.find((c) => /certa\.session_token=/.test(c))!;
    expect(session).toBeDefined();
    expect(session).toMatch(/Path=\/certa(;|$)/);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });

  it('authenticates with the scoped cookie', async () => {
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const me = await app.inject({ method: 'GET', url: '/certa/api/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('dana@example.com');
  });

  it('magic links point back under the base path', async () => {
    await app.inject({
      method: 'POST',
      url: '/certa/api/auth/sign-in/magic-link',
      headers: { origin: SITE, 'content-type': 'application/json' },
      payload: { email: 'dana@example.com', callbackURL: '/certa/' },
    });
    const mail = mailer.sent.at(-1)!;
    expect(mail.text).toContain(`${SITE}/certa/api/auth/magic-link/verify?token=`);
    expect(mail.text).toContain('callbackURL=%2Fcerta%2F');
  });
});

describe('rate limiting behind the Arkhon website proxy', () => {
  it('limits per real client IP from CLIENT_IP_HEADER, not per proxy', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: tdb.appUrl,
      AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
      PUBLIC_URL: `${SITE}/certa`,
      LOG_LEVEL: 'silent',
      RATE_LIMIT_AUTH_PER_MINUTE: '2',
      CLIENT_IP_HEADER: 'CF-Connecting-IP',
    });
    const limited = await buildApp({ config, pool, mailer }, { logger: false });
    const attempt = (ip: string) =>
      limited.inject({
        method: 'POST',
        url: '/certa/api/auth/sign-in/email',
        headers: { origin: SITE, 'content-type': 'application/json', 'cf-connecting-ip': ip },
        payload: { email: 'nobody@example.com', password: 'wrong-password-123' },
      });
    expect((await attempt('203.0.113.1')).statusCode).toBe(401);
    expect((await attempt('203.0.113.1')).statusCode).toBe(401);
    expect((await attempt('203.0.113.1')).statusCode).toBe(429);
    // A different visitor arriving through the same proxy is unaffected.
    expect((await attempt('203.0.113.2')).statusCode).toBe(401);
    await limited.close();
  });
});
