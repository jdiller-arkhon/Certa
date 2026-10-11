/** Web Push subscriptions: one per browser per org, owned by the signed-in user. */
import { newId } from '@certa/core';
import { and, eq, isNull, pushSubscriptions, sql } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, conflict } from '../lib/errors.js';
import { isPushEndpoint } from '../lib/push.js';
import { OrgParams } from './orgs.js';

const Subscription = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});

export const pushRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/push/config',
      { schema: { tags: ['notifications'], summary: 'VAPID public key (null when push is not configured)', security: [], response: { 200: z.object({ publicKey: z.string().nullable() }) } } },
      async () => ({ publicKey: ctx.pusher?.publicKey ?? null }),
    );

    app.post(
      '/orgs/:orgId/push-subscriptions',
      { schema: { tags: ['notifications'], summary: 'Subscribe this browser to expiry notifications', params: OrgParams, body: Subscription, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        if (!ctx.pusher) throw badRequest('Push notifications are not configured on this server');
        if (!isPushEndpoint(req.body.endpoint)) throw badRequest('Unsupported push service');
        await inOrg(ctx.pool, req, oc, async (db) => {
          // Re-subscribing replaces your own row. Taking over another member's row (a new user on a
          // shared browser) requires proof of holding that browser's keys, so knowing an endpoint
          // isn't enough to cancel someone else's notifications.
          const [cur] = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, req.body.endpoint), isNull(pushSubscriptions.deletedAt)));
          if (cur && cur.userId !== oc.userId && cur.p256dh !== req.body.keys.p256dh) throw conflict('This browser is subscribed by another member');
          if (cur) await db.update(pushSubscriptions).set({ deletedAt: sql`now()` }).where(eq(pushSubscriptions.id, cur.id));
          await db.insert(pushSubscriptions).values({
            id: newId(),
            userId: oc.userId,
            endpoint: req.body.endpoint,
            p256dh: req.body.keys.p256dh,
            auth: req.body.keys.auth,
            userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
          });
        });
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/orgs/:orgId/push-subscriptions/remove',
      { schema: { tags: ['notifications'], summary: 'Unsubscribe this browser', params: OrgParams, body: z.object({ endpoint: z.string().max(2000) }), response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        await inOrg(ctx.pool, req, oc, (db) =>
          db
            .update(pushSubscriptions)
            .set({ deletedAt: sql`now()` })
            .where(and(eq(pushSubscriptions.endpoint, req.body.endpoint), eq(pushSubscriptions.userId, oc.userId), isNull(pushSubscriptions.deletedAt))),
        );
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/orgs/:orgId/push-subscriptions/test',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, schema: { tags: ['notifications'], summary: 'Send a test notification to your browsers', params: OrgParams, response: { 200: z.object({ sent: z.number().int() }) } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        if (!ctx.pusher) throw badRequest('Push notifications are not configured on this server');
        const pusher = ctx.pusher;
        const subs = await inOrg(ctx.pool, req, oc, (db) =>
          db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, oc.userId), isNull(pushSubscriptions.deletedAt))),
        );
        let sent = 0;
        for (const s of subs) {
          const r = await pusher.send(s, { title: 'Certa notifications are on', body: 'You’ll hear here when a certificate, registration, or inspection is coming due.', url: '/', tag: 'certa-test' });
          if (r === 'sent') sent += 1;
          if (r === 'gone') await inOrg(ctx.pool, req, oc, (db) => db.update(pushSubscriptions).set({ deletedAt: sql`now()` }).where(eq(pushSubscriptions.id, s.id)));
        }
        return { sent };
      },
    );
  };
