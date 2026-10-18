/**
 * One account across Arkhon. Certa is served on the Arkhon website (same site), so the browser
 * already sends the Arkhon session cookie with every Certa request. Certa never reads or stores
 * that cookie itself: it forwards just those cookies to Arkhon's own session endpoint, which
 * answers with the signed-in user (or nothing), and links that user to a Certa account.
 *
 * Arkhon roles map to Certa like this:
 * - pilot: gets their own Certa logbook (an organization they own) on first sign-in;
 * - admin: also joins Arkhon Industries' organization (ARKHON_ORG_ID) as an admin, and is a
 *   platform admin while Arkhon still says so (checked live, see liveArkhonUser);
 * - client: an account with no organization; the client view shows the pilots on their jobs.
 */
import { DEFAULT_UNITS_US, newId } from '@certa/core';
import { and, authUsers, eq, globalDb, isNull, memberships, organizations, pilots, sql, withTenant } from '@certa/db';
import type pg from 'pg';
import { z } from 'zod';
import type { Config } from '../config.js';
import { ApiError } from './errors.js';
import { slugify } from './orgs.js';

export const ArkhonRole = z.enum(['client', 'pilot', 'admin']);
export type ArkhonRole = z.infer<typeof ArkhonRole>;

const ArkhonSession = z.object({
  user: z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(200).default(''),
    email: z.email(),
    emailVerified: z.boolean(),
    role: z.string().optional(),
    status: z.string().optional(),
    adminLevel: z.string().nullable().optional(),
  }),
});

export interface ArkhonUser {
  id: string;
  name: string;
  email: string;
  role: ArkhonRole;
  adminLevel: string | null;
}

/** Arkhon's Better Auth cookies (`__Secure-` on https). Certa's own cookies use the `certa` prefix. */
const ARKHON_COOKIE = /^(__Secure-|__Host-)?better-auth\./;

/** Only the Arkhon session cookies from a Cookie header, so nothing of Certa's is ever forwarded. */
export function arkhonCookies(cookieHeader: string | undefined): string {
  if (!cookieHeader) return '';
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => ARKHON_COOKIE.test(c.slice(0, c.indexOf('=') >>> 0)))
    .join('; ');
}

/**
 * The Arkhon user behind these cookies, or null when there's no usable Arkhon session: not
 * signed in, email not verified, account not active (suspended, banned, pending deletion), or
 * a role Certa doesn't know. Network or upstream errors throw 503 rather than signing anyone out.
 */
export async function fetchArkhonUser(config: Config, cookieHeader: string | undefined, fetchImpl: typeof fetch = fetch): Promise<ArkhonUser | null> {
  if (!config.ARKHON_AUTH_ORIGIN) return null;
  const cookie = arkhonCookies(cookieHeader);
  if (!cookie) return null;
  let res: Response;
  try {
    res = await fetchImpl(new URL('/api/auth/get-session', config.ARKHON_AUTH_ORIGIN), {
      headers: { cookie, accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError(503, 'arkhon_unavailable', 'Couldn’t reach Arkhon to check your sign-in. Try again in a moment.');
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new ApiError(503, 'arkhon_unavailable', 'Couldn’t reach Arkhon to check your sign-in. Try again in a moment.');
  const body: unknown = await res.json().catch(() => null);
  if (body === null) return null;
  const parsed = ArkhonSession.safeParse(body);
  if (!parsed.success) return null;
  const u = parsed.data.user;
  const role = ArkhonRole.safeParse(u.role ?? 'client');
  if (!u.emailVerified || (u.status ?? 'active') !== 'active' || !role.success) return null;
  return { id: u.id, name: u.name.trim() || u.email.split('@')[0]!, email: u.email.toLowerCase(), role: role.data, adminLevel: u.adminLevel ?? null };
}

/**
 * The Certa user id for an Arkhon user, creating or linking the Certa account and the
 * organization access their Arkhon role gives them. Idempotent: safe on every sign-in.
 */
export async function provisionArkhonUser(config: Config, pool: pg.Pool, au: ArkhonUser, requestId: string): Promise<string> {
  const db = globalDb(pool);
  const now = new Date().toISOString();
  const synced = { name: au.name, arkhonRole: au.role, arkhonAdminLevel: au.adminLevel, arkhonSyncedAt: now, updatedAt: now };

  let [user] = await db.select().from(authUsers).where(eq(authUsers.arkhonUserId, au.id));
  if (user) {
    // Arkhon is the source of truth for the email: it only changes there after the owner
    // approves it from their current inbox.
    if (user.email !== au.email) {
      const [clash] = await db.select({ id: authUsers.id }).from(authUsers).where(and(eq(authUsers.email, au.email), sql`${authUsers.id} <> ${user.id}`));
      if (clash) throw new ApiError(409, 'email_in_use', 'Another Certa account already uses this email. Contact support to merge them.');
    }
    [user] = await db.update(authUsers).set({ ...synced, email: au.email, emailVerified: true }).where(eq(authUsers.id, user.id)).returning();
  } else {
    const [byEmail] = await db.select().from(authUsers).where(eq(authUsers.email, au.email));
    if (byEmail?.arkhonUserId) throw new ApiError(409, 'account_linked', 'This email’s Certa account is linked to a different Arkhon account.');
    if (byEmail) {
      // Arkhon verified this address, so the existing Certa account with it is theirs.
      [user] = await db.update(authUsers).set({ ...synced, arkhonUserId: au.id, emailVerified: true }).where(eq(authUsers.id, byEmail.id)).returning();
    } else {
      [user] = await db
        .insert(authUsers)
        .values({ id: newId(), name: au.name, email: au.email, emailVerified: true, arkhonUserId: au.id, arkhonRole: au.role, arkhonAdminLevel: au.adminLevel, arkhonSyncedAt: now })
        .returning();
    }
  }
  const userId = user!.id;

  if (au.role === 'admin' && config.ARKHON_ORG_ID) {
    await withTenant(pool, { orgId: config.ARKHON_ORG_ID, userId, requestId }, async (t) => {
      const [org] = await t.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, config.ARKHON_ORG_ID!));
      if (!org) return;
      const [m] = await t.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.orgId, config.ARKHON_ORG_ID!), eq(memberships.userId, userId), isNull(memberships.deletedAt)));
      if (!m) await t.insert(memberships).values({ id: newId(), userId, role: 'admin' });
    });
  }

  if (au.role === 'pilot' || au.role === 'admin') {
    const has = await withTenant(pool, { orgId: null, userId, requestId }, async (t) =>
      t.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt))).limit(1),
    );
    if (!has.length) await createLogbook(pool, userId, au, requestId);
  }
  return userId;
}

/** A pilot's own Certa organization ("logbook"), owned by them, with their pilot record. */
async function createLogbook(pool: pg.Pool, userId: string, au: ArkhonUser, requestId: string) {
  const orgId = newId();
  await withTenant(pool, { orgId, userId, requestId }, async (t) => {
    await t.insert(organizations).values({ id: orgId, name: au.name, slug: slugify(au.name, orgId), timezone: 'America/Denver', units: DEFAULT_UNITS_US, createdBy: userId });
    const membershipId = newId();
    await t.insert(memberships).values({ id: membershipId, userId, role: 'owner' });
    await t.insert(pilots).values({ id: newId(), membershipId, displayName: au.name, email: au.email });
  });
}

/**
 * For platform-admin actions: the live Arkhon user behind this request, required to still be an
 * Arkhon admin right now (not just at sign-in), and to be the same person as the Certa session.
 */
export async function liveArkhonAdmin(config: Config, cookieHeader: string | undefined, certaArkhonUserId: string | null): Promise<ArkhonUser> {
  const au = await fetchArkhonUser(config, cookieHeader);
  if (!au || au.role !== 'admin' || !certaArkhonUserId || au.id !== certaArkhonUserId)
    throw new ApiError(403, 'forbidden', 'Platform admin tools need an active Arkhon admin sign-in.');
  return au;
}
