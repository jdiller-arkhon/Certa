/**
 * Inspector packet share links. A member creates a time-boxed, read-only link to one pilot's
 * or aircraft's compliance summary; whoever holds it (an FAA inspector, client, or insurer)
 * sees that one summary — as a web page or a sealed PDF — and nothing else, without an account.
 *
 * The token is 256 random bits, shown once, and stored only as a SHA-256 hash. Public lookups
 * go through certa.resolve_share_link (SECURITY DEFINER: matches one live link, counts the
 * view); the packet is then built under the owning org's normal row-level security.
 */
import { createHash, randomBytes } from 'node:crypto';
import { api, buildInspectorPacket, contentHash, grantFor, Id, newId, type Flight } from '@certa/core';
import { aircraft, and, desc, eq, flights, isNull, pilots, shareLinks, withTenant, type Db } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { notFound } from '../lib/errors.js';
import { flightSelection, loadFleet, orgMapContext, toFlights, type FlightSelectRow } from '../lib/fleet.js';
import { iso } from '../lib/mappers.js';
import { renderPacketPdf } from '../lib/packet-pdf.js';
import { OrgParams } from './orgs.js';

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
/** base64url of 32 random bytes: 43 chars. */
const Token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const toShareLink = (r: typeof shareLinks.$inferSelect) => ({
  id: r.id,
  subjectType: r.subjectType,
  subjectId: r.subjectId,
  label: r.label,
  expiresAt: iso(r.expiresAt)!,
  revokedAt: iso(r.revokedAt),
  viewCount: r.viewCount,
  lastViewedAt: iso(r.lastViewedAt),
  createdAt: iso(r.createdAt)!,
});

/** Headers for public packet responses: never cached, indexed, or leaked via Referer. */
const PRIVATE_HEADERS = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
};

async function packetFor(db: Db, orgId: string, subject: { type: 'pilot' | 'aircraft'; id: string }) {
  const snapshot = await loadFleet(db, orgId);
  const ctx = await orgMapContext(db, orgId);
  const where = subject.type === 'pilot' ? eq(flights.pilotInCommandId, subject.id) : eq(flights.aircraftId, subject.id);
  const rows = (await db.select(flightSelection).from(flights).where(and(where, isNull(flights.deletedAt))).orderBy(desc(flights.takeoffAt)).limit(500)) as FlightSelectRow[];
  const recent = (await toFlights(db, rows)) as Flight[];
  return buildInspectorPacket(snapshot, subject, recent, ctx);
}

export const shareRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const viewUrl = (token: string) => `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/share/${token}`;
    const LinkParams = OrgParams.extend({ linkId: Id });

    app.post(
      '/orgs/:orgId/share-links',
      { schema: { tags: ['share'], summary: 'Create a time-boxed inspector packet link (the URL is returned once)', params: OrgParams, body: api.CreateShareLinkRequest, response: { 201: api.CreatedShareLink } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const b = req.body;
        authorize(oc, 'exports.create', b.subjectType === 'pilot' ? b.subjectId : null);
        const token = randomBytes(32).toString('base64url');
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          const [subject] =
            b.subjectType === 'pilot'
              ? await db.select({ name: pilots.displayName }).from(pilots).where(and(eq(pilots.id, b.subjectId), isNull(pilots.deletedAt)))
              : await db.select({ name: aircraft.nickname, make: aircraft.make, model: aircraft.model }).from(aircraft).where(and(eq(aircraft.id, b.subjectId), isNull(aircraft.deletedAt)));
          if (!subject) throw notFound(b.subjectType === 'pilot' ? 'Pilot' : 'Aircraft');
          const name = subject.name ?? ('make' in subject ? `${subject.make} ${subject.model}` : 'Record');
          const [r] = await db
            .insert(shareLinks)
            .values({
              id: newId(),
              subjectType: b.subjectType,
              subjectId: b.subjectId,
              label: b.label ?? `Inspector packet — ${name}`,
              tokenHash: hashToken(token),
              expiresAt: new Date(Date.now() + b.expiresInDays * 86400_000).toISOString(),
            })
            .returning();
          return r!;
        });
        return reply.status(201).send({ ...toShareLink(row), url: viewUrl(token) });
      },
    );

    app.get(
      '/orgs/:orgId/share-links',
      { schema: { tags: ['share'], params: OrgParams, querystring: z.object({ subjectId: Id.optional() }), response: { 200: api.ShareLinkListResponse } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'exports.create');
        // Pilots (an "own" grant) see only links to their own packet.
        const ownOnly = grantFor(oc.role, 'exports.create') === 'own';
        const rows = await inOrg(ctx.pool, req, oc, (db) =>
          db
            .select()
            .from(shareLinks)
            .where(
              and(
                isNull(shareLinks.deletedAt),
                req.query.subjectId ? eq(shareLinks.subjectId, req.query.subjectId) : undefined,
                ownOnly ? and(eq(shareLinks.subjectType, 'pilot'), eq(shareLinks.subjectId, oc.pilotId ?? '00000000-0000-0000-0000-000000000000')) : undefined,
              ),
            )
            .orderBy(desc(shareLinks.createdAt))
            .limit(100),
        );
        return { links: rows.map(toShareLink) };
      },
    );

    app.post(
      '/orgs/:orgId/share-links/:linkId/revoke',
      { schema: { tags: ['share'], summary: 'Revoke a share link immediately', params: LinkParams, response: { 200: api.ShareLink } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        const row = await inOrg(ctx.pool, req, oc, async (db) => {
          const [cur] = await db.select().from(shareLinks).where(and(eq(shareLinks.id, req.params.linkId), isNull(shareLinks.deletedAt)));
          if (!cur) throw notFound('Share link');
          authorize(oc, 'exports.create', cur.subjectType === 'pilot' ? cur.subjectId : null);
          const [r] = await db.update(shareLinks).set({ revokedAt: new Date().toISOString() }).where(and(eq(shareLinks.id, cur.id), isNull(shareLinks.revokedAt))).returning();
          return r ?? cur;
        });
        return toShareLink(row);
      },
    );

    // ---------------------------------------------------------------- public (no account)

    const resolve = async (token: string) => {
      const res = await ctx.pool.query<{ id: string; org_id: string; subject_type: 'pilot' | 'aircraft'; subject_id: string; label: string; expires_at: Date }>(
        'SELECT * FROM certa.resolve_share_link($1)',
        [hashToken(token)],
      );
      const link = res.rows[0];
      // Unknown, expired, and revoked links all look the same.
      if (!link) throw notFound('Share link');
      const packet = await withTenant(ctx.pool, { orgId: link.org_id, userId: null }, (db) => packetFor(db, link.org_id, { type: link.subject_type, id: link.subject_id }));
      if (!packet) throw notFound('Share link');
      return { label: link.label, expiresAt: new Date(link.expires_at).toISOString(), seal: contentHash(packet), packet };
    };
    const publicLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } };

    app.get(
      '/public/share/:token',
      { config: publicLimit, schema: { tags: ['share'], summary: 'Inspector packet behind a share link (no account needed)', security: [], params: z.object({ token: Token }), response: { 200: api.PublicPacketResponse } } },
      async (req, reply) => {
        reply.headers(PRIVATE_HEADERS);
        return resolve(req.params.token);
      },
    );

    app.get(
      '/public/share/:token/packet.pdf',
      { config: publicLimit, schema: { tags: ['share'], summary: 'Sealed PDF of the inspector packet', security: [], params: z.object({ token: Token }) } },
      async (req, reply) => {
        const r = await resolve(req.params.token);
        const pdf = await renderPacketPdf(r.packet, { seal: r.seal, expiresAt: r.expiresAt, viewUrl: viewUrl(req.params.token) });
        const slug = r.packet.subject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'packet';
        return reply
          .headers({ ...PRIVATE_HEADERS, 'content-type': 'application/pdf', 'content-disposition': `inline; filename="certa-packet-${slug}-${r.packet.asOf}.pdf"` })
          .send(Buffer.from(pdf));
      },
    );
  };
