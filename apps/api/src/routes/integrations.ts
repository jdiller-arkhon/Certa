/**
 * Machine access: org API keys, and the verification endpoints Argus (and other integrations)
 * call to ask "is this pilot / aircraft legal to fly?" without a user session.
 *
 * Key format: `ck_<12 hex>_<43 base64url>`. The `ck_<12 hex>` prefix is public (shown in lists,
 * used for lookup); the secret is shown once and stored only as a SHA-256 hash, compared in
 * constant time. Keys are scoped (`verify:read`) and answer only for their own org.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { api, Id, newId, verifyFlight, verifySubject, type FleetSnapshot } from '@certa/core';
import { and, apiKeys, desc, eq, isNull, sql, withTenant, type Db } from '@certa/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { ApiError, badRequest, notFound } from '../lib/errors.js';
import { loadFleet, orgMapContext } from '../lib/fleet.js';
import { iso } from '../lib/mappers.js';
import { OrgParams } from './orgs.js';

const KEY = /^ck_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const toApiKey = (r: typeof apiKeys.$inferSelect) => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  scopes: r.scopes,
  lastUsedAt: iso(r.lastUsedAt),
  expiresAt: iso(r.expiresAt),
  createdAt: iso(r.createdAt)!,
});

const unauthorizedKey = () => new ApiError(401, 'invalid_api_key', 'Missing, invalid, expired, or revoked API key');

interface KeyContext {
  keyId: string;
  orgId: string;
}

/** Authenticates `Authorization: Bearer ck_…` and checks the scope. */
async function authenticateKey(ctx: AppContext, req: FastifyRequest, scope: string): Promise<KeyContext> {
  const header = req.headers.authorization ?? '';
  const m = KEY.exec(header.replace(/^Bearer\s+/i, '').trim());
  if (!m) throw unauthorizedKey();
  const prefix = `ck_${m[1]}`;
  const res = await ctx.pool.query<{ id: string; org_id: string; secret_hash: string; scopes: string[] }>('SELECT * FROM certa.resolve_api_key($1)', [prefix]);
  const row = res.rows[0];
  // Compare even when no row matched, so timing doesn't reveal which prefixes exist.
  const expected = Buffer.from(row?.secret_hash ?? '0'.repeat(64), 'hex');
  const actual = Buffer.from(sha256(m[2]!), 'hex');
  if (!row || !timingSafeEqual(expected, actual)) throw unauthorizedKey();
  if (!row.scopes.includes(scope)) throw new ApiError(403, 'insufficient_scope', `This key lacks the ${scope} scope`);
  // Record use at most hourly (each update is audited).
  await withTenant(ctx.pool, { orgId: row.org_id, userId: null, requestId: req.id }, (db) =>
    db
      .update(apiKeys)
      .set({ lastUsedAt: sql`now()` })
      .where(and(eq(apiKeys.id, row.id), sql`(${apiKeys.lastUsedAt} IS NULL OR ${apiKeys.lastUsedAt} < now() - interval '1 hour')`)),
  );
  return { keyId: row.id, orgId: row.org_id };
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/[\s-]/g, '').toUpperCase();

export const integrationRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    // ------------------------------------------------------------ key management (admins)

    app.post(
      '/orgs/:orgId/api-keys',
      { schema: { tags: ['integrations'], summary: 'Create an API key (the secret is returned once)', params: OrgParams, body: api.CreateApiKeyRequest, response: { 201: api.CreatedApiKey } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'integrations.manage');
        const prefix = `ck_${randomBytes(6).toString('hex')}`;
        const secret = randomBytes(32).toString('base64url');
        const b = req.body;
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          const [r] = await db
            .insert(apiKeys)
            .values({
              id: newId(),
              name: b.name,
              prefix,
              secretHash: sha256(secret),
              scopes: [...new Set(b.scopes)],
              expiresAt: b.expiresInDays ? new Date(Date.now() + b.expiresInDays * 86400_000).toISOString() : null,
            })
            .returning();
          return r!;
        });
        return reply.status(201).send({ ...toApiKey(row), key: `${prefix}_${secret}` });
      },
    );

    app.get(
      '/orgs/:orgId/api-keys',
      { schema: { tags: ['integrations'], params: OrgParams, response: { 200: api.ApiKeyListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'integrations.manage');
        const rows = await inOrg(ctx.pool, req, oc, (db) => db.select().from(apiKeys).where(isNull(apiKeys.deletedAt)).orderBy(desc(apiKeys.createdAt)));
        return { keys: rows.map(toApiKey) };
      },
    );

    app.delete(
      '/orgs/:orgId/api-keys/:keyId',
      { schema: { tags: ['integrations'], summary: 'Revoke an API key immediately', params: OrgParams.extend({ keyId: Id }), response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'integrations.manage');
        const n = await inOrg(ctx.pool, req, oc, (db) =>
          db.update(apiKeys).set({ deletedAt: sql`now()` }).where(and(eq(apiKeys.id, req.params.keyId), isNull(apiKeys.deletedAt))).returning({ id: apiKeys.id }),
        );
        if (!n.length) throw notFound('API key');
        return reply.status(204).send(null);
      },
    );

    // ------------------------------------------------------------ verification (API key)

    const limit = {
      // Per key for well-formed keys; per IP otherwise, so varying a bogus bearer string doesn't buy fresh buckets.
      rateLimit: { max: 300, timeWindow: '1 minute', keyGenerator: (r: FastifyRequest) => {
        const m = KEY.exec((r.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim());
        return m ? `key:${m[1]}` : `ip:${r.ip}`;
      } },
    };
    const security = [{ bearer: [] }];
    const withFleet = async <T>(req: FastifyRequest, fn: (s: FleetSnapshot, db: Db, k: KeyContext) => Promise<T> | T) => {
      const k = await authenticateKey(ctx, req, 'verify:read');
      return withTenant(ctx.pool, { orgId: k.orgId, userId: null, requestId: req.id }, async (db) => fn(await loadFleet(db, k.orgId), db, k));
    };
    const answer = async (db: Db, s: FleetSnapshot, orgId: string, subject: { type: 'pilot' | 'aircraft'; id: string } | null) => {
      if (!subject) throw notFound('Record');
      const res = verifySubject(s, subject, await orgMapContext(db, orgId));
      if (!res) throw notFound(subject.type === 'pilot' ? 'Pilot' : 'Aircraft');
      return res;
    };

    app.get(
      '/verify/pilots/:pilotId',
      { config: limit, schema: { tags: ['verify'], summary: 'Is this pilot current? (API key, verify:read)', security, params: z.object({ pilotId: Id }), response: { 200: api.VerificationResponse } } },
      async (req) => withFleet(req, (s, db, k) => answer(db, s, k.orgId, { type: 'pilot', id: req.params.pilotId })),
    );

    app.get(
      '/verify/aircraft/:aircraftId',
      { config: limit, schema: { tags: ['verify'], summary: 'Is this aircraft airworthy on record? (API key, verify:read)', security, params: z.object({ aircraftId: Id }), response: { 200: api.VerificationResponse } } },
      async (req) => withFleet(req, (s, db, k) => answer(db, s, k.orgId, { type: 'aircraft', id: req.params.aircraftId })),
    );

    app.get(
      '/verify/lookup',
      {
        config: limit,
        schema: { tags: ['verify'], summary: 'Verify by certificate number, registration, or serial number', security, querystring: api.VerifyLookupQuery, response: { 200: api.VerificationResponse } },
      },
      async (req) =>
        withFleet(req, (s, db, k) => {
          const q = req.query;
          const wanted = norm(q.certificateNumber ?? q.registration ?? q.serialNumber);
          if (!wanted) throw badRequest('The lookup value is empty');
          if (q.certificateNumber) {
            const p = s.pilots.find((x) => !x.deletedAt && norm(x.certificateNumber) === norm(q.certificateNumber));
            return answer(db, s, k.orgId, p ? { type: 'pilot', id: p.id } : null);
          }
          const a = s.aircraft.find((x) => !x.deletedAt && (q.registration ? norm(x.registrationNumber) === norm(q.registration) : norm(x.serialNumber) === norm(q.serialNumber)));
          return answer(db, s, k.orgId, a ? { type: 'aircraft', id: a.id } : null);
        }),
    );

    app.post(
      '/verify/flight',
      { config: limit, schema: { tags: ['verify'], summary: 'Pre-flight go / no-go for a pilot, aircraft, and batteries', security, body: api.VerifyFlightRequest, response: { 200: api.FlightVerificationResponse } } },
      async (req) =>
        withFleet(req, async (s, db, k) => {
          const b = req.body;
          // Ids from another org simply aren't in this org's snapshot: they come back as red checks.
          return verifyFlight(s, { pilotId: b.pilotId, aircraftId: b.aircraftId, batteryIds: b.batteryIds }, await orgMapContext(db, k.orgId));
        }),
    );
  };
