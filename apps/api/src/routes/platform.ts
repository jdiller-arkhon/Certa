import {
  api,
  addDays,
  defaultPlatformPeriod,
  monthsEnding,
  newId,
  platformComplianceItems,
  platformExportRows,
  platformMonthlySeries,
  platformOverview,
  platformPilotRows,
  toCsv,
  type PlatformPeriod,
} from '@certa/core';
import { and, authUsers, desc, eq, globalDb, gt, isNull, lte, memberships, or, platformAdminEvents, platformAnnouncements, withTenant } from '@certa/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { requireUser } from '../lib/context.js';
import { notFound } from '../lib/errors.js';
import { iso } from '../lib/mappers.js';
import { listMemberships } from '../lib/orgs.js';
import { arkhonAdminBase, loadBundles, logPlatformEvent, orgIds, pushTargets, remindPilot, requirePlatformAdmin, resendInvite } from '../lib/platform.js';

const PILOT_ROLES = ['owner', 'admin', 'chief_pilot', 'pilot'];
const MANAGER_ROLES = ['owner', 'admin', 'chief_pilot'];
const audienceRoles = { everyone: null, pilots: PILOT_ROLES, managers: MANAGER_ROLES } as const;

const periodOf = (q: { from?: string; to?: string }, now: Date): PlatformPeriod => {
  const d = defaultPlatformPeriod(now);
  return { from: q.from ?? (q.to ? addDays(q.to, -29) : d.from), to: q.to ?? d.to };
};
/** Flights needed for a period plus the 12-month chart that ends with it. */
const sinceFor = (p: PlatformPeriod) => [p.from, `${monthsEnding(p.to, 12)[0]}-01`].sort()[0]!;

const toAnnouncement = (r: typeof platformAnnouncements.$inferSelect & { createdByName?: string | null }): api.Announcement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  audience: r.audience,
  level: r.level,
  startsAt: iso(r.startsAt),
  endsAt: iso(r.endsAt),
  createdAt: iso(r.createdAt),
  createdBy: r.createdByName ?? null,
  emailed: r.emailed,
  pushed: r.pushed,
});

const activeNow = (now: Date) => and(lte(platformAnnouncements.startsAt, now.toISOString()), or(isNull(platformAnnouncements.endsAt), gt(platformAnnouncements.endsAt, now.toISOString())));

export const platformRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const admin = (req: FastifyRequest) => requirePlatformAdmin(ctx, req);

    app.get(
      '/platform/overview',
      { schema: { tags: ['platform'], summary: 'Platform metrics across every organization (Arkhon admins)', querystring: api.PlatformPeriodQuery, response: { 200: api.PlatformOverviewResponse } } },
      async (req) => {
        const user = await admin(req);
        const now = new Date();
        const period = periodOf(req.query, now);
        const bundles = await loadBundles(ctx, req, user.id, sinceFor(period), now);
        return platformOverview(bundles, period, now);
      },
    );

    app.get(
      '/platform/pilots',
      { schema: { tags: ['platform'], summary: 'Every pilot in every organization, with readiness and help flags', response: { 200: api.PlatformPilotListResponse } } },
      async (req) => {
        const user = await admin(req);
        const now = new Date();
        const bundles = await loadBundles(ctx, req, user.id, now.toISOString().slice(0, 10), now);
        return { pilots: platformPilotRows(bundles, { arkhonAdminBase: arkhonAdminBase(ctx) }), generatedAt: now.toISOString() };
      },
    );

    app.get(
      '/platform/pilots/:orgId/:pilotId',
      { schema: { tags: ['platform'], summary: 'One pilot: readiness items, recent flights, monthly hours, account', params: api.PlatformPilotParams, response: { 200: api.PlatformPilotDetail } } },
      async (req) => {
        const user = await admin(req);
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const months = monthsEnding(today, 12);
        const [bundle] = await loadBundles(ctx, req, user.id, `${months[0]}-01`, now, [req.params.orgId]);
        const pilot = bundle && platformPilotRows([bundle], { arkhonAdminBase: arkhonAdminBase(ctx) }).find((r) => r.pilotId === req.params.pilotId);
        if (!bundle || !pilot) throw notFound('Pilot');
        const p = bundle.snapshot.pilots.find((x) => x.id === pilot.pilotId)!;
        const member = p.membershipId ? bundle.members.find((m) => m.membershipId === p.membershipId) : undefined;
        const theirs = (b: typeof bundle, f: (typeof bundle.flights)[number]) => b === bundle && f.pilotId === pilot.pilotId;
        const aircraftName = (id: string | null) => {
          const a = id ? bundle.snapshot.aircraft.find((x) => x.id === id) : undefined;
          return a ? (a.nickname ?? `${a.make} ${a.model}`) : null;
        };
        const items = [
          ...platformComplianceItems([bundle], 365).filter((i) => i.pilotId === pilot.pilotId),
        ].map((i) => ({ kind: i.kind, label: i.label, dueOn: i.dueOn, daysRemaining: i.daysRemaining, level: i.level, reason: i.reason }));
        const history = await globalDb(ctx.pool)
          .select({ at: platformAdminEvents.at, action: platformAdminEvents.action, actor: authUsers.name, detail: platformAdminEvents.detail })
          .from(platformAdminEvents)
          .leftJoin(authUsers, eq(authUsers.id, platformAdminEvents.actorUserId))
          .where(and(eq(platformAdminEvents.orgId, bundle.org.id), eq(platformAdminEvents.target, pilot.pilotId)))
          .orderBy(desc(platformAdminEvents.at))
          .limit(20);
        const others = member ? (await listMemberships(ctx.pool, member.userId, req.id)).filter((m) => m.orgId !== bundle.org.id) : [];
        const mine = await listMemberships(ctx.pool, user.id, req.id);
        return {
          pilot,
          items,
          recentFlights: bundle.flights
            .filter((f) => f.pilotId === pilot.pilotId)
            .sort((a, b) => b.takeoffAt.localeCompare(a.takeoffAt))
            .slice(0, 15)
            .map((f) => ({ id: f.id, source: f.source, takeoffAt: f.takeoffAt, durationSeconds: f.durationSeconds, aircraft: aircraftName(f.aircraftId), locationName: f.locationName })),
          monthly: platformMonthlySeries([bundle], months, theirs),
          otherOrganizations: others.map((m) => ({ orgId: m.orgId, name: m.orgName, role: m.role })),
          history: history.map((h) => ({ at: iso(h.at), action: h.action, actor: h.actor ?? null, detail: describeDetail(h.detail) })),
          viewerIsMember: mine.some((m) => m.orgId === bundle.org.id),
        };
      },
    );

    app.post(
      '/platform/remind',
      { schema: { tags: ['platform'], summary: 'Email pilots what needs attention in their records', body: api.PlatformRemindRequest, response: { 200: api.PlatformActionResult } } },
      async (req) => {
        const user = await admin(req);
        const byOrg = new Map<string, string[]>();
        for (const t of req.body.pilots) byOrg.set(t.orgId, [...new Set([...(byOrg.get(t.orgId) ?? []), t.pilotId])]);
        const known = new Set(await orgIds(ctx));
        const result: api.PlatformActionResult = { sent: 0, skipped: [] };
        for (const [orgId, pilotIds] of byOrg) {
          if (!known.has(orgId)) {
            result.skipped.push(...pilotIds.map((pilotId) => ({ pilotId, name: 'Pilot', reason: 'Organization not found' })));
            continue;
          }
          const [bundle] = await loadBundles(ctx, req, user.id, new Date().toISOString().slice(0, 10), new Date(), [orgId]);
          for (const pilotId of pilotIds) {
            const name = bundle?.snapshot.pilots.find((p) => p.id === pilotId)?.displayName ?? 'Pilot';
            const why = bundle ? await remindPilot(ctx, req, user.id, bundle, pilotId, req.body.note ?? null).catch((err: unknown) => (req.log.warn({ err }, 'reminder failed'), 'Email failed to send')) : 'Organization not found';
            if (why) result.skipped.push({ pilotId, name, reason: why });
            else result.sent += 1;
          }
        }
        return result;
      },
    );

    app.post(
      '/platform/pilots/:orgId/:pilotId/invite',
      { schema: { tags: ['platform'], summary: 'Re-send sign-in instructions to a pilot who hasn’t signed in', params: api.PlatformPilotParams, response: { 200: api.PlatformActionResult } } },
      async (req) => {
        const user = await admin(req);
        if (!(await orgIds(ctx)).includes(req.params.orgId)) throw notFound('Pilot');
        const [bundle] = await loadBundles(ctx, req, user.id, new Date().toISOString().slice(0, 10), new Date(), [req.params.orgId]);
        const name = bundle?.snapshot.pilots.find((p) => p.id === req.params.pilotId)?.displayName;
        if (!bundle || !name) throw notFound('Pilot');
        const why = await resendInvite(ctx, req, user.id, bundle, req.params.pilotId);
        return why ? { sent: 0, skipped: [{ pilotId: req.params.pilotId, name, reason: why }] } : { sent: 1, skipped: [] };
      },
    );

    app.get(
      '/platform/compliance',
      { schema: { tags: ['platform'], summary: 'Everything overdue or coming due across every organization', querystring: api.PlatformComplianceQuery, response: { 200: api.PlatformComplianceResponse } } },
      async (req) => {
        const user = await admin(req);
        const now = new Date();
        const bundles = await loadBundles(ctx, req, user.id, now.toISOString().slice(0, 10), now);
        return { items: platformComplianceItems(bundles, req.query.windowDays), windowDays: req.query.windowDays, generatedAt: now.toISOString() };
      },
    );

    app.get(
      '/platform/exports/:dataset',
      {
        schema: {
          tags: ['platform'],
          summary: 'Download a metrics dataset as CSV',
          params: api.PlatformExportParams,
          querystring: api.PlatformExportQuery,
          response: { 200: z.string().describe('text/csv') },
        },
      },
      async (req, reply) => {
        const user = await admin(req);
        const now = new Date();
        const period = periodOf(req.query, now);
        const { orgId, pilotId } = req.query;
        if (orgId && !(await orgIds(ctx)).includes(orgId)) throw notFound('Organization');
        let bundles = await loadBundles(ctx, req, user.id, period.from, now, orgId ? [orgId] : undefined);
        let name = '';
        if (pilotId) {
          const pilot = bundles[0]?.snapshot.pilots.find((p) => p.id === pilotId);
          if (!pilot) throw notFound('Pilot');
          name = `-${pilot.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          bundles = bundles.map((b) => ({ ...b, flights: b.flights.filter((f) => f.pilotId === pilotId), snapshot: { ...b.snapshot, pilots: [pilot] } }));
        }
        const csv = toCsv(platformExportRows(req.params.dataset, bundles, period, now));
        await logPlatformEvent(ctx, req, user.id, { action: 'export', orgId: orgId ?? null, target: pilotId ?? req.params.dataset, detail: { dataset: req.params.dataset, from: period.from, to: period.to, ...(bundles.length === 1 && orgId ? { org: bundles[0]!.org.name } : {}), ...(pilotId ? { pilot: bundles[0]!.snapshot.pilots[0]!.displayName } : {}) } });
        return reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', `attachment; filename="certa-${req.params.dataset}${name}-${period.from}-to-${period.to}.csv"`)
          .header('cache-control', 'no-store')
          .send(`﻿${csv}`);
      },
    );

    app.get(
      '/platform/announcements',
      { schema: { tags: ['platform'], summary: 'Announcements, newest first', response: { 200: api.AnnouncementListResponse } } },
      async (req) => {
        await admin(req);
        const rows = await globalDb(ctx.pool)
          .select({ a: platformAnnouncements, createdByName: authUsers.name })
          .from(platformAnnouncements)
          .leftJoin(authUsers, eq(authUsers.id, platformAnnouncements.createdBy))
          .orderBy(desc(platformAnnouncements.createdAt))
          .limit(100);
        return { announcements: rows.map((r) => toAnnouncement({ ...r.a, createdByName: r.createdByName })) };
      },
    );

    app.post(
      '/platform/announcements',
      { schema: { tags: ['platform'], summary: 'Post an announcement in the app, optionally by email and push', body: api.CreateAnnouncementRequest, response: { 201: api.Announcement } } },
      async (req, reply) => {
        const user = await admin(req);
        const b = req.body;
        const id = newId();
        // Everyone in the audience, across every organization (an address hears once).
        const roles = audienceRoles[b.audience];
        const people = new Map<string, { email: string; userId: string; name: string }>();
        if (b.email || b.push) {
          for (const orgId of await orgIds(ctx)) {
            const rows = await withTenant(ctx.pool, { orgId, userId: user.id, requestId: req.id }, (db) =>
              db
                .select({ userId: memberships.userId, role: memberships.role, email: authUsers.email, name: authUsers.name, expiresAt: memberships.expiresAt })
                .from(memberships)
                .innerJoin(authUsers, eq(authUsers.id, memberships.userId))
                .where(isNull(memberships.deletedAt)),
            );
            for (const r of rows) {
              if (r.expiresAt && new Date(r.expiresAt) <= new Date()) continue;
              if (roles && !roles.includes(r.role)) continue;
              people.set(r.email.toLowerCase(), { email: r.email, userId: r.userId, name: r.name });
            }
          }
        }
        let emailed = 0;
        if (b.email) {
          for (const p of people.values()) {
            const ok = await ctx.mailer
              .send({ to: p.email, subject: `${b.level === 'important' ? 'Important: ' : ''}${b.title}`, text: `${b.body}\n\n— Arkhon Industries\n\nOpen Certa: ${ctx.config.PUBLIC_URL}/` })
              .then(() => true)
              .catch((err: unknown) => (req.log.warn({ err }, 'announcement email failed'), false));
            if (ok) emailed += 1;
          }
        }
        let pushed = 0;
        if (b.push && ctx.pusher) {
          for (const s of await pushTargets(ctx, req, user.id, [...new Set([...people.values()].map((p) => p.userId))])) {
            if ((await ctx.pusher.send(s, { title: b.title, body: b.body.slice(0, 180), url: '/', tag: `announcement-${id}` }).catch(() => 'failed')) === 'sent') pushed += 1;
          }
        }
        const [row] = await globalDb(ctx.pool)
          .insert(platformAnnouncements)
          .values({ id, title: b.title, body: b.body, audience: b.audience, level: b.level, endsAt: b.endsAt ?? null, emailed, pushed, createdBy: user.id })
          .returning();
        await logPlatformEvent(ctx, req, user.id, { action: 'announcement.post', target: id, detail: { title: b.title, audience: b.audience, emailed, pushed } });
        return reply.status(201).send(toAnnouncement({ ...row!, createdByName: user.name }));
      },
    );

    app.post(
      '/platform/announcements/:announcementId/end',
      { schema: { tags: ['platform'], summary: 'Stop showing an announcement', params: api.AnnouncementParams, response: { 200: api.Announcement } } },
      async (req) => {
        const user = await admin(req);
        const [row] = await globalDb(ctx.pool)
          .update(platformAnnouncements)
          .set({ endsAt: new Date().toISOString() })
          .where(and(eq(platformAnnouncements.id, req.params.announcementId), or(isNull(platformAnnouncements.endsAt), gt(platformAnnouncements.endsAt, new Date().toISOString()))))
          .returning();
        if (!row) throw notFound('Active announcement');
        await logPlatformEvent(ctx, req, user.id, { action: 'announcement.end', target: row.id, detail: { title: row.title } });
        return toAnnouncement(row);
      },
    );

    app.get(
      '/platform/activity',
      { schema: { tags: ['platform'], summary: 'What platform admins did, newest first', response: { 200: api.PlatformActivityResponse } } },
      async (req) => {
        await admin(req);
        const rows = await globalDb(ctx.pool)
          .select({ e: platformAdminEvents, actor: authUsers.name })
          .from(platformAdminEvents)
          .leftJoin(authUsers, eq(authUsers.id, platformAdminEvents.actorUserId))
          .orderBy(desc(platformAdminEvents.at))
          .limit(200);
        return {
          events: rows.map(({ e, actor }) => ({
            id: e.id,
            at: iso(e.at),
            actor: actor ?? null,
            action: e.action,
            orgName: typeof e.detail?.org === 'string' ? e.detail.org : null,
            target: typeof e.detail?.pilot === 'string' ? e.detail.pilot : typeof e.detail?.title === 'string' ? e.detail.title : e.target,
            detail: describeDetail(e.detail),
          })),
        };
      },
    );

    // Any signed-in person: announcements addressed to them, current right now.
    app.get(
      '/announcements',
      { schema: { tags: ['platform'], summary: 'Current announcements for the signed-in user', response: { 200: api.AnnouncementListResponse } } },
      async (req) => {
        const user = requireUser(req);
        const roles = new Set((await listMemberships(ctx.pool, user.id, req.id)).map((m) => m.role));
        const rows = await globalDb(ctx.pool).select().from(platformAnnouncements).where(activeNow(new Date())).orderBy(desc(platformAnnouncements.startsAt)).limit(5);
        return {
          announcements: rows
            .filter((r) => r.audience === 'everyone' || audienceRoles[r.audience]!.some((x) => roles.has(x as never)))
            .map((r) => ({ ...toAnnouncement(r), emailed: 0, pushed: 0 })),
        };
      },
    );
  };

/** One readable line for an event's detail. */
function describeDetail(d: Record<string, unknown> | null): string | null {
  if (!d) return null;
  if (Array.isArray(d.items)) return d.items.length ? `Reminded about: ${(d.items as string[]).join(', ')}` : d.note ? 'Sent a note' : null;
  if (typeof d.from === 'string') return `${typeof d.pilot === 'string' && typeof d.dataset === 'string' ? `${d.dataset}, ` : ''}${d.from} to ${d.to}`;
  if (typeof d.emailed === 'number') return `To ${d.audience}: ${d.emailed} emailed, ${d.pushed} pushed`;
  return null;
}
