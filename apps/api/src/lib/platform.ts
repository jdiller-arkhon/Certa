/**
 * Platform console plumbing: who counts as a platform admin, loading every organization's
 * records for the console (one tenant transaction per org, so row-level security still applies
 * and reads run as the admin), the admin action log, and reminder emails to pilots.
 */
import {
  DEFAULT_READINESS_POLICY,
  HELP_FLAG_LABEL,
  newId,
  platformComplianceItems,
  platformPilotRows,
  type OrgBundle,
  type PlatformFlight,
  type ReadinessPolicy,
  type Role,
} from '@certa/core';
import {
  and,
  authSessions,
  authUsers,
  discordLinks,
  eq,
  externalFlights,
  flights,
  gte,
  inArray,
  isNull,
  memberships,
  platformAdminEvents,
  pushSubscriptions,
  sql,
  withTenant,
  globalDb,
} from '@certa/db';
import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../app.js';
import { authorizationItems } from '../jobs/expiry-alerts.js';
import { liveArkhonAdmin } from './arkhon.js';
import { requireUser, type SessionUser } from './context.js';
import { forbidden } from './errors.js';
import { loadFleet, orgMapContext } from './fleet.js';
import { iso } from './mappers.js';

/**
 * The signed-in user, required to be an Arkhon platform admin. With Arkhon sign-in configured
 * this asks Arkhon live, every request: a role revoked there takes effect here immediately.
 * Without Arkhon (local development only) the role stored on the account decides.
 */
export async function requirePlatformAdmin(ctx: AppContext, req: FastifyRequest): Promise<SessionUser> {
  const user = requireUser(req);
  const [row] = await globalDb(ctx.pool).select({ arkhonUserId: authUsers.arkhonUserId, arkhonRole: authUsers.arkhonRole }).from(authUsers).where(eq(authUsers.id, user.id));
  if (ctx.config.ARKHON_AUTH_ORIGIN) await liveArkhonAdmin(ctx.config, req.headers.cookie, row?.arkhonUserId ?? null);
  else if (ctx.config.NODE_ENV === 'production' || row?.arkhonRole !== 'admin') throw forbidden('Platform admin tools need an Arkhon admin account.');
  return user;
}

export async function orgIds(ctx: AppContext): Promise<string[]> {
  const res = await ctx.pool.query<{ id: string }>('SELECT certa.alert_org_ids() AS id');
  return res.rows.map((r) => r.id);
}

/**
 * Every organization's records the console needs, with flights from `since` (YYYY-MM-DD, UTC)
 * on. Organizations are read one at a time, each in its own tenant transaction.
 */
export async function loadBundles(ctx: AppContext, req: FastifyRequest, adminUserId: string, since: string, now = new Date(), only?: string[]): Promise<OrgBundle[]> {
  const out: OrgBundle[] = [];
  for (const orgId of only ?? (await orgIds(ctx))) {
    const bundle = await withTenant(ctx.pool, { orgId, userId: adminUserId, requestId: req.id }, async (db) => {
      const mctx = await orgMapContext(db, orgId, now);
      if (mctx.org.deletedAt) return null;
      const policy = (mctx.org.alertPolicy as ReadinessPolicy | null) ?? DEFAULT_READINESS_POLICY;
      const snapshot = await loadFleet(db, orgId, now);
      const sinceTs = `${since}T00:00:00Z`;
      const certa = await db
        .select({
          id: flights.id,
          pilotId: flights.pilotInCommandId,
          aircraftId: flights.aircraftId,
          takeoffAt: flights.takeoffAt,
          landingAt: flights.landingAt,
          durationSeconds: flights.durationSeconds,
          locationName: flights.locationName,
          operationType: flights.operationType,
        })
        .from(flights)
        .where(and(isNull(flights.deletedAt), gte(flights.takeoffAt, sinceTs)));
      const argus = await db
        .select({ id: externalFlights.id, pilotId: externalFlights.pilotId, takeoffAt: externalFlights.takeoffAt, landingAt: externalFlights.landingAt, durationSeconds: externalFlights.durationSeconds, locationName: externalFlights.locationName })
        .from(externalFlights)
        .where(and(isNull(externalFlights.deletedAt), isNull(externalFlights.convertedFlightId), gte(externalFlights.takeoffAt, sinceTs)));
      // Last sign-in: the newest session, or the last Arkhon sign-in (sessions end at sign-out).
      const members = await db
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          email: authUsers.email,
          arkhonUserId: authUsers.arkhonUserId,
          lastSignInAt: sql<string | null>`greatest((select max(s.created_at) from ${authSessions} s where s.user_id = ${authUsers.id}), ${authUsers.arkhonSyncedAt})`,
        })
        .from(memberships)
        .innerJoin(authUsers, eq(authUsers.id, memberships.userId))
        .where(isNull(memberships.deletedAt));
      const discord = await db.select({ pilotId: discordLinks.pilotId }).from(discordLinks).where(isNull(discordLinks.revokedAt));
      const flightsOut: PlatformFlight[] = [
        ...certa.map((f) => ({ ...f, source: 'certa' as const, takeoffAt: iso(f.takeoffAt), landingAt: iso(f.landingAt) })),
        ...argus.map((f) => ({ ...f, source: 'argus' as const, aircraftId: null, operationType: null, takeoffAt: iso(f.takeoffAt), landingAt: iso(f.landingAt) })),
      ];
      return {
        org: { id: orgId, name: mctx.org.name, createdAt: iso(mctx.org.createdAt) },
        snapshot,
        ctx: { today: mctx.today, now, units: mctx.units, orgTimeZone: mctx.orgTimeZone, policy },
        flights: flightsOut,
        members: members.map((m) => ({ ...m, role: m.role as Role, lastSignInAt: m.lastSignInAt ? new Date(m.lastSignInAt).toISOString() : null })),
        discordPilotIds: discord.map((d) => d.pilotId),
        authorizations: await authorizationItems(db, mctx.org.timezone, mctx.today, policy),
      } satisfies OrgBundle;
    });
    if (bundle) out.push(bundle);
  }
  return out;
}

/** Arkhon's site origin, for links to its admin pages. */
export const arkhonAdminBase = (ctx: AppContext) => (ctx.config.ARKHON_AUTH_ORIGIN ? new URL(ctx.config.ARKHON_AUTH_ORIGIN).origin : null);

export async function logPlatformEvent(
  ctx: AppContext,
  req: FastifyRequest,
  actorUserId: string,
  e: { action: string; orgId?: string | null; target?: string | null; detail?: Record<string, unknown> },
) {
  await globalDb(ctx.pool)
    .insert(platformAdminEvents)
    .values({ id: newId(), actorUserId, action: e.action, orgId: e.orgId ?? null, target: e.target ?? null, detail: e.detail ?? null, requestId: req.id });
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

/**
 * Emails one pilot what needs doing (and pushes to their devices). Returns null when sent, or
 * why it wasn't.
 */
export async function remindPilot(ctx: AppContext, req: FastifyRequest, adminUserId: string, bundle: OrgBundle, pilotId: string, note: string | null): Promise<string | null> {
  const row = platformPilotRows([bundle]).find((r) => r.pilotId === pilotId);
  if (!row) return 'Pilot not found';
  if (!row.email) return 'No email address on file';
  const items = platformComplianceItems([bundle], 60).filter((i) => i.pilotId === pilotId);
  const extras = row.helpFlags.filter((f) => ['never_signed_in', 'argus_waiting', 'inactive_90d'].includes(f));
  if (!items.length && !extras.length && !note) return 'Nothing to remind them about';
  const base = ctx.config.PUBLIC_URL;
  const when = (i: (typeof items)[number]) =>
    i.daysRemaining == null ? i.reason : i.daysRemaining < 0 ? `expired ${-i.daysRemaining} day${i.daysRemaining === -1 ? '' : 's'} ago (${i.dueOn})` : i.daysRemaining === 0 ? `due today (${i.dueOn})` : `due ${i.dueOn} (${i.daysRemaining} day${i.daysRemaining === 1 ? '' : 's'})`;
  const lines = [`Hi ${firstName(row.name)},`, ''];
  if (note) lines.push(note.trim(), '');
  if (items.length) lines.push(`Here’s what needs attention in your Certa records for ${bundle.org.name}:`, '', ...items.map((i) => `  • ${i.label}: ${when(i)}`), '');
  for (const f of extras) {
    if (f === 'never_signed_in') lines.push(`You haven’t signed in to Certa yet. Sign in with your Arkhon account (using this email address): ${base}/sign-in`, '');
    if (f === 'argus_waiting') lines.push(`${row.argusWaiting} Argus flight${row.argusWaiting === 1 ? ' is' : 's are'} waiting for you to pick the aircraft you flew, so ${row.argusWaiting === 1 ? 'it counts' : 'they count'} toward that aircraft’s hours: ${base}/flights`, '');
    if (f === 'inactive_90d') lines.push(`${HELP_FLAG_LABEL.inactive_90d} on Certa. If you’ve been flying, log those flights so your records stay current: ${base}/flights/new`, '');
  }
  lines.push(`Open Certa: ${base}/pilots/${pilotId}`, '', '— Arkhon Industries', '', 'Certa is a record-keeping tool. Operators remain responsible for compliance with all applicable regulations.');
  await ctx.mailer.send({ to: row.email, subject: items.length ? `Certa: ${items.length} item${items.length === 1 ? '' : 's'} to update before your next flight` : 'A note from Arkhon about Certa', text: lines.join('\n') });

  const member = bundle.members.find((m) => m.email === row.email);
  if (ctx.pusher && member) {
    const subs = await withTenant(ctx.pool, { orgId: bundle.org.id, userId: adminUserId, requestId: req.id }, (db) =>
      db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, member.userId), isNull(pushSubscriptions.deletedAt))),
    );
    for (const s of subs) await ctx.pusher.send(s, { title: 'Certa', body: items.length ? `${items.length} record${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} attention` : 'A note from Arkhon', url: `/pilots/${pilotId}`, tag: 'platform-remind' }).catch(() => 'failed');
  }
  await logPlatformEvent(ctx, req, adminUserId, { action: 'pilot.remind', orgId: bundle.org.id, target: pilotId, detail: { org: bundle.org.name, pilot: row.name, items: items.map((i) => i.label), note: !!note } });
  return null;
}

/** Re-sends the "you've been added to Certa" sign-in instructions. */
export async function resendInvite(ctx: AppContext, req: FastifyRequest, adminUserId: string, bundle: OrgBundle, pilotId: string): Promise<string | null> {
  const row = platformPilotRows([bundle]).find((r) => r.pilotId === pilotId);
  if (!row) return 'Pilot not found';
  if (!row.email) return 'No email address on file';
  if (row.account === 'active') return 'Already signed in';
  // A pilot record with no account can't sign in until their organization adds them as a member.
  if (row.account === 'no_account') return 'No Certa account yet: add them under Members in their organization';
  const base = ctx.config.PUBLIC_URL;
  const how =
    ctx.config.LOCAL_AUTH === 'off'
      ? `Sign in with your Arkhon account (using this email address):\n\n${base}/sign-in\n\nNo Arkhon account yet? Create one from that page with this email address.`
      : `Sign in here with this email address and we’ll send you a sign-in link:\n\n${base}/sign-in`;
  await ctx.mailer.send({
    to: row.email,
    subject: `Your Certa logbook at ${bundle.org.name} is ready`,
    text: `Hi ${firstName(row.name)},\n\nYou’ve been added to ${bundle.org.name} on Certa, the drone logbook.\n\n${how}\n\n— Arkhon Industries`,
  });
  await logPlatformEvent(ctx, req, adminUserId, { action: 'pilot.invite', orgId: bundle.org.id, target: pilotId, detail: { org: bundle.org.name, pilot: row.name } });
  return null;
}

/** Push subscriptions for these users, across every organization they're in. */
export async function pushTargets(ctx: AppContext, req: FastifyRequest, adminUserId: string, userIds: string[]) {
  if (!userIds.length) return [];
  const out: (typeof pushSubscriptions.$inferSelect)[] = [];
  for (const orgId of await orgIds(ctx)) {
    out.push(...(await withTenant(ctx.pool, { orgId, userId: adminUserId, requestId: req.id }, (db) => db.select().from(pushSubscriptions).where(and(inArray(pushSubscriptions.userId, userIds), isNull(pushSubscriptions.deletedAt))))));
  }
  return [...new Map(out.map((s) => [s.endpoint, s])).values()];
}
