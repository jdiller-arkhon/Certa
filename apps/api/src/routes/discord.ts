import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { aircraftName, api, can, fleetReadiness, goNoGo, newId, type OperationType } from '@certa/core';
import { aircraft, and, discordLinkCodes, discordLinks, eq, flights, gt, isNull, memberships, organizations, pilots, priorExperience, sql, withTenant, type Db } from '@certa/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { ApiError, badRequest, notFound } from '../lib/errors.js';
import { loadFleet, orgMapContext, recomputeDerived } from '../lib/fleet.js';
import { OrgParams } from './orgs.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE_TTL_MS = 10 * 60_000;
/** No 0/O or 1/I, so a code read aloud or retyped from a phone survives. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const newCode = () => `CERTA-${group()}-${group()}`;
const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');

const unprocessable = (message: string) => new ApiError(422, 'unprocessable', message);

const MISSION_TO_OPERATION: Record<api.BotFlightRequest['missionType'], OperationType> = {
  Commercial: 'commercial',
  Recreational: 'recreational',
  Training: 'training',
  Inspection: 'commercial',
  Mapping: 'commercial',
  Cinematography: 'commercial',
  Other: 'other',
};

/** UTC instant of local noon on `date` in `timeZone` (a date-only flight has no recorded time). */
export function localNoon(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 12);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asLocal - guess));
}

/** The org and pilot behind an active link, or a 404 the bot reads as "user not found". */
async function resolveLink(ctx: AppContext, linkId: string): Promise<{ orgId: string; pilotId: string }> {
  const res = await ctx.pool.query<{ org_id: string; pilot_id: string }>('SELECT * FROM certa.resolve_discord_link($1)', [linkId]);
  const row = res.rows[0];
  if (!row) throw notFound('Certa user');
  return { orgId: row.org_id, pilotId: row.pilot_id };
}

const asTenant = <T>(ctx: AppContext, req: FastifyRequest, orgId: string, fn: (db: Db) => Promise<T>) => withTenant(ctx.pool, { orgId, userId: null, requestId: req.id }, fn);

/**
 * Discord link for the community bot (Arkhon-ops-bot, bots/certa).
 *
 * In the app, a pilot generates a single-use code and manages the link and leaderboard opt-in;
 * an admin can keep the whole org off the leaderboard. The bot calls the `/discord`, `/users`
 * and `/leaderboard` endpoints with DISCORD_BOT_API_TOKEN and can reach only linked pilots,
 * addressed by the opaque link id, for as long as the link and the pilot stay active.
 */
export const discordRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    // ---------------------------------------------------------------- in the app (signed-in pilot)

    const status = async (db: Db, pilotId: string | null, orgId: string, canManageOrg: boolean): Promise<api.DiscordLinkStatus> => {
      const [org] = await db.select({ on: organizations.discordLeaderboard }).from(organizations).where(eq(organizations.id, orgId));
      const [link] = pilotId ? await db.select().from(discordLinks).where(and(eq(discordLinks.pilotId, pilotId), isNull(discordLinks.revokedAt))) : [];
      return {
        canLink: !!pilotId,
        linked: !!link,
        linkedAt: link ? new Date(link.createdAt).toISOString() : null,
        leaderboardOptIn: link?.leaderboardOptIn ?? false,
        orgLeaderboardEnabled: org?.on ?? true,
        canManageOrg,
      };
    };

    app.get(
      '/orgs/:orgId/discord/link',
      { schema: { tags: ['discord'], summary: 'Your Discord link status', params: OrgParams, response: { 200: api.DiscordLinkStatus } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        return inOrg(ctx.pool, req, oc, (db) => status(db, oc.pilotId, oc.orgId, can(oc.role, 'org.update')));
      },
    );

    app.post(
      '/orgs/:orgId/discord/link-code',
      { schema: { tags: ['discord'], summary: 'A single-use code to redeem with /certa link in Discord (valid 10 minutes; issuing one cancels the last)', params: OrgParams, response: { 201: api.DiscordLinkCode } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        if (!oc.pilotId) throw badRequest('Only pilots can link Discord. Ask an admin to add you as a pilot first.');
        const code = newCode();
        const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        await inOrg(ctx.pool, req, oc, async (db) => {
          await db.update(discordLinkCodes).set({ expiresAt: sql`now()` }).where(and(eq(discordLinkCodes.pilotId, oc.pilotId!), isNull(discordLinkCodes.usedAt), gt(discordLinkCodes.expiresAt, sql`now()`)));
          await db.insert(discordLinkCodes).values({ id: newId(), pilotId: oc.pilotId!, tokenHash: sha256(code), expiresAt });
        });
        return reply.status(201).send({ code, expiresAt });
      },
    );

    app.patch(
      '/orgs/:orgId/discord/link',
      { schema: { tags: ['discord'], summary: 'Opt in or out of the community leaderboard', params: OrgParams, body: api.UpdateDiscordLinkRequest, response: { 200: api.DiscordLinkStatus } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        if (!oc.pilotId) throw notFound('Discord link');
        return inOrg(ctx.pool, req, oc, async (db) => {
          const [r] = await db.update(discordLinks).set({ leaderboardOptIn: req.body.leaderboardOptIn }).where(and(eq(discordLinks.pilotId, oc.pilotId!), isNull(discordLinks.revokedAt))).returning({ id: discordLinks.id });
          if (!r) throw notFound('Discord link');
          return status(db, oc.pilotId, oc.orgId, can(oc.role, 'org.update'));
        });
      },
    );

    app.delete(
      '/orgs/:orgId/discord/link',
      { schema: { tags: ['discord'], summary: 'Unlink Discord. The bot loses access at once.', params: OrgParams, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        if (oc.pilotId) await inOrg(ctx.pool, req, oc, (db) => db.update(discordLinks).set({ revokedAt: sql`now()` }).where(and(eq(discordLinks.pilotId, oc.pilotId!), isNull(discordLinks.revokedAt))));
        return reply.status(204).send(null);
      },
    );

    app.put(
      '/orgs/:orgId/discord/settings',
      { schema: { tags: ['discord'], summary: 'Allow or block this org on the community leaderboard', params: OrgParams, body: api.UpdateDiscordOrgSettingsRequest, response: { 200: api.DiscordLinkStatus } } },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'org.update');
        return inOrg(ctx.pool, req, oc, async (db) => {
          await db.update(organizations).set({ discordLeaderboard: req.body.leaderboardEnabled }).where(eq(organizations.id, oc.orgId));
          return status(db, oc.pilotId, oc.orgId, true);
        });
      },
    );

    // ---------------------------------------------------------------- for the bot (bearer token)

    const botAuth = async (req: FastifyRequest) => {
      const configured = ctx.config.DISCORD_BOT_API_TOKEN;
      if (!configured) throw new ApiError(503, 'bot_api_disabled', 'The Discord bot API is not enabled on this server');
      const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
      if (!timingSafeEqual(Buffer.from(sha256(given), 'hex'), Buffer.from(sha256(configured), 'hex'))) throw new ApiError(401, 'unauthorized', 'Invalid bot token');
    };

    const botRoutes: FastifyPluginAsyncZod = async (bot) => {
      bot.addHook('onRequest', botAuth);

      bot.post(
        '/discord/link-codes/redeem',
        { schema: { tags: ['discord bot'], summary: 'Redeem a link code from Certa (single use, 10 minutes)', body: api.BotRedeemRequest, response: { 200: api.BotRedeemResponse, 404: api.ErrorResponse } } },
        async (req) => {
          const res = await ctx.pool.query<{ link_id: string; display_name: string }>('SELECT * FROM certa.redeem_discord_code($1, $2, $3)', [sha256(normalizeCode(req.body.code)), req.body.discordUserId, newId()]);
          const row = res.rows[0];
          if (!row) throw notFound('Link code (it may have expired or already been used)');
          return { certaUserId: row.link_id, displayName: row.display_name };
        },
      );

      bot.post(
        '/users/:certaUserId/flights',
        {
          schema: {
            tags: ['discord bot'],
            summary: 'Log a flight from Discord. Date-only: stored at local noon with a note that the time was not recorded. Idempotent per Idempotency-Key.',
            params: api.BotUserParams,
            body: api.BotFlightRequest,
            response: { 200: api.BotFlightResponse, 201: api.BotFlightResponse, 422: api.ErrorResponse },
          },
        },
        async (req, reply) => {
          const link = await resolveLink(ctx, req.params.certaUserId);
          const b = req.body;
          const key = String(req.headers['idempotency-key'] ?? '').slice(0, 200);
          // A retry with the same key maps to the same flight id, so it can't log twice.
          const h = sha256(`${req.params.certaUserId}:${key || newId()}`);
          const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
          const result = await asTenant(ctx, req, link.orgId, async (db) => {
            const [existing] = await db.select({ id: flights.id }).from(flights).where(eq(flights.id, id));
            if (existing) return { status: 200 as const };
            // The pilot must still be allowed to log their own flights in this org.
            const [p] = await db.select({ membershipId: pilots.membershipId }).from(pilots).where(eq(pilots.id, link.pilotId));
            const [m] = p?.membershipId ? await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.id, p.membershipId), isNull(memberships.deletedAt))) : [];
            if (!m || !can(m.role, 'flights.log', { actorPilotId: link.pilotId, resourcePilotId: link.pilotId })) throw new ApiError(403, 'forbidden', 'This Certa account can no longer log flights');
            const mapCtx = await orgMapContext(db, link.orgId);
            const tz = mapCtx.org.timezone;
            const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
            if (b.date > today) throw unprocessable('That date is in the future.');
            // Match the aircraft by nickname, make and model, model, or serial — exactly one, or explain.
            const fleet = await db.select().from(aircraft).where(and(isNull(aircraft.deletedAt), sql`${aircraft.status} <> 'retired'`));
            const want = b.aircraft.trim().toLowerCase();
            const names = (a: (typeof fleet)[number]) => [a.nickname, `${a.make} ${a.model}`, a.model, a.serialNumber].filter(Boolean).map((x) => String(x).trim().toLowerCase());
            const matches = fleet.filter((a) => names(a).includes(want));
            const label = (a: (typeof fleet)[number]) => aircraftName(a);
            if (matches.length === 0) throw unprocessable(`No aircraft called “${b.aircraft}” in your Certa fleet.${fleet.length ? ` Try one of: ${fleet.slice(0, 6).map(label).join(', ')}.` : ' Add it in Certa first.'}`);
            if (matches.length > 1) throw unprocessable(`“${b.aircraft}” matches ${matches.length} aircraft (${matches.slice(0, 4).map(label).join(', ')}). Use the nickname or serial number.`);
            const ac = matches[0]!;
            const takeoff = localNoon(b.date, tz);
            const landing = new Date(takeoff.getTime() + b.durationMinutes * 60_000);
            const check = goNoGo(await loadFleet(db, link.orgId), { pilotId: link.pilotId, aircraftId: ac.id, batteryIds: [] }, mapCtx);
            const note = `Logged from Discord; takeoff time not recorded (shown at local noon). Mission: ${b.missionType}.`;
            await db.insert(flights).values({
              id,
              pilotInCommandId: link.pilotId,
              aircraftId: ac.id,
              takeoffAt: takeoff.toISOString(),
              landingAt: landing.toISOString(),
              localTimeZone: tz,
              locationName: b.locationIsIcao ? b.location.toUpperCase() : b.location,
              durationSeconds: b.durationMinutes * 60,
              operationType: MISSION_TO_OPERATION[b.missionType],
              notes: b.notes ? `${b.notes}\n\n${note}` : note,
              source: 'manual',
              goNoGo: check,
            });
            await recomputeDerived(db, { aircraftIds: [ac.id], batteryIds: [] });
            return { status: 201 as const };
          });
          return reply.status(result.status).send({ flightId: id });
        },
      );

      bot.get(
        '/users/:certaUserId/flight-totals',
        { schema: { tags: ['discord bot'], params: api.BotUserParams, response: { 200: api.BotTotalsResponse } } },
        async (req) => {
          const link = await resolveLink(ctx, req.params.certaUserId);
          return asTenant(ctx, req, link.orgId, async (db) => {
            const since = (days: number) => sql`now() - ${`${days} days`}::interval`;
            const agg = (days?: number) =>
              db
                .select({ flights: sql<number>`count(*)::int`, seconds: sql<number>`coalesce(sum(${flights.durationSeconds}), 0)::bigint` })
                .from(flights)
                .where(and(eq(flights.pilotInCommandId, link.pilotId), isNull(flights.deletedAt), days ? gt(flights.takeoffAt, since(days)) : undefined))
                .then((r) => ({ flights: Number(r[0]!.flights), minutes: Math.round(Number(r[0]!.seconds) / 60) }));
            const [all, d30, d90, d365] = await Promise.all([agg(), agg(30), agg(90), agg(365)]);
            // Totals carried over from other apps count toward all time only (they carry no dates).
            const [prior] = await db
              .select({ flights: sql<number>`coalesce(sum(${priorExperience.flights}), 0)::int`, seconds: sql<number>`coalesce(sum(${priorExperience.flightSeconds}), 0)::bigint` })
              .from(priorExperience)
              .where(and(eq(priorExperience.pilotId, link.pilotId), isNull(priorExperience.deletedAt)));
            return {
              totalFlights: all.flights + Number(prior!.flights),
              totalMinutes: Math.round((all.minutes * 60 + Number(prior!.seconds)) / 60),
              last30Days: d30,
              last90Days: d90,
              last365Days: d365,
            };
          });
        },
      );

      bot.get(
        '/users/:certaUserId/currency',
        { schema: { tags: ['discord bot'], summary: 'Part 107 training on file and the recurrent due date from the org’s rule pack', params: api.BotUserParams, response: { 200: api.BotCurrencyResponse } } },
        async (req) => {
          const link = await resolveLink(ctx, req.params.certaUserId);
          return asTenant(ctx, req, link.orgId, async (db) => {
            const snapshot = await loadFleet(db, link.orgId);
            const mapCtx = await orgMapContext(db, link.orgId);
            const training = snapshot.credentials
              .filter((c) => c.pilotId === link.pilotId && !c.deletedAt && c.issuedOn && (c.credentialType === 'part107_certificate' || c.credentialType === 'part107_recurrent'))
              .sort((a, b) => b.issuedOn!.localeCompare(a.issuedOn!));
            const last = training[0];
            // Readiness keys credentials by id (latest of each type wins) or flags the type as missing.
            const recurrentIds = new Set(snapshot.credentials.filter((c) => c.pilotId === link.pilotId && !c.deletedAt && c.credentialType === 'part107_recurrent').map((c) => `credential:${c.id}`));
            const item = fleetReadiness(snapshot, mapCtx)
              .pilots.get(link.pilotId)
              ?.items.find((i) => recurrentIds.has(i.key) || i.key === `credential_missing:${link.pilotId}:part107_recurrent`);
            const dueDate = item?.dueOn ?? null;
            const level = item?.level;
            return {
              lastTrainingDate: last?.issuedOn ?? null,
              lastTrainingKind: last ? (last.credentialType === 'part107_certificate' ? ('initial' as const) : ('recurrent' as const)) : null,
              dueDate,
              status: !item || !dueDate ? ('unknown' as const) : level === 'red' ? ('overdue' as const) : level === 'amber' ? ('due_soon' as const) : ('current' as const),
            };
          });
        },
      );

      bot.get(
        '/leaderboard',
        { schema: { tags: ['discord bot'], summary: 'Community leaderboard: only pilots who opted in, in orgs that allow it', querystring: api.BotLeaderboardQuery, response: { 200: api.BotLeaderboardResponse } } },
        async (req) => {
          const q = req.query;
          let from: string | null = null, to: string | null = null;
          if (q.period === 'month') {
            const now = new Date();
            const [y, m] = (q.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`).split('-').map(Number) as [number, number];
            from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
            to = new Date(Date.UTC(y, m, 1)).toISOString();
          }
          const res = await ctx.pool.query<{ link_id: string; display_name: string; total_seconds: string; flight_count: string }>('SELECT * FROM certa.discord_leaderboard($1, $2, $3)', [from, to, q.limit]);
          return {
            entries: res.rows.map((r, i) => ({ rank: i + 1, certaUserId: r.link_id, displayName: r.display_name, totalMinutes: Math.round(Number(r.total_seconds) / 60), flightCount: Number(r.flight_count) })),
          };
        },
      );
    };
    await app.register(botRoutes);
  };
