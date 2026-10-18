import { hash, verify } from '@node-rs/argon2';
import { newId } from '@certa/core';
import { authAccounts, authSessions, authUsers, authVerifications, globalDb } from '@certa/db';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { bearer, magicLink } from 'better-auth/plugins';
import type pg from 'pg';
import type { Config } from '../config.js';
import { fetchArkhonUser, provisionArkhonUser } from './arkhon.js';
import { ApiError } from './errors.js';
import type { Mailer } from './mailer.js';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ } as const;

/** Certa's own sign-in paths, closed when LOCAL_AUTH=off (everyone signs in with Arkhon). */
const LOCAL_AUTH_PATHS = ['/sign-in/email', '/sign-up/email', '/sign-in/magic-link', '/magic-link/verify', '/request-password-reset', '/reset-password', '/change-password', '/change-email'];

/**
 * POST {base}/api/auth/arkhon/exchange: turns the Arkhon session the browser already has into a
 * Certa session, creating or linking the Certa account (see lib/arkhon.ts).
 */
function arkhonSso(config: Config, pool: pg.Pool): BetterAuthPlugin {
  return {
    id: 'arkhon-sso',
    endpoints: {
      arkhonExchange: createAuthEndpoint('/arkhon/exchange', { method: 'POST', requireHeaders: true }, async (ctx) => {
        if (!config.ARKHON_AUTH_ORIGIN) throw new APIError('NOT_FOUND', { message: 'Arkhon sign-in is not enabled' });
        let userId: string;
        let role: string;
        try {
          const au = await fetchArkhonUser(config, ctx.headers?.get('cookie') ?? undefined);
          if (!au) throw new APIError('UNAUTHORIZED', { message: 'Sign in to your Arkhon account first', code: 'ARKHON_SIGN_IN_REQUIRED' });
          userId = await provisionArkhonUser(config, pool, au, ctx.headers?.get('x-request-id') ?? newId());
          role = au.role;
        } catch (err) {
          if (err instanceof ApiError) throw new APIError(err.statusCode === 409 ? 'CONFLICT' : 'SERVICE_UNAVAILABLE', { message: err.message, code: err.code.toUpperCase() });
          throw err;
        }
        const user = await ctx.context.internalAdapter.findUserById(userId);
        if (!user) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Account could not be loaded' });
        const session = await ctx.context.internalAdapter.createSession(userId);
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ ok: true, role });
      }),
    },
  };
}

export function createAuth(config: Config, pool: pg.Pool, mailer: Mailer) {
  return betterAuth({
    appName: 'Certa',
    baseURL: config.publicOrigin,
    basePath: `${config.basePath}/api/auth`,
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.publicOrigin, ...config.TRUSTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)],
    database: drizzleAdapter(globalDb(pool), {
      provider: 'pg',
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    advanced: {
      database: { generateId: () => newId() },
      useSecureCookies: config.publicOrigin.startsWith('https://'),
      // Certa may share an origin with the Arkhon website: prefix and path-scope its cookies so
      // they never collide with, or get sent to, the rest of the site.
      cookiePrefix: 'certa',
      defaultCookieAttributes: { path: config.basePath || '/', sameSite: 'lax', httpOnly: true },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      autoSignIn: true,
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: h, password }) => verify(h, password),
      },
    },
    // With Arkhon sign-in, sessions last as long as Arkhon's (7 days) so a suspended Arkhon account
    // can't keep using Certa for weeks.
    session: { expiresIn: config.ARKHON_AUTH_ORIGIN ? 60 * 60 * 24 * 7 : 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // Rate limiting is applied at the Fastify layer so it covers every route consistently.
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (config.LOCAL_AUTH === 'off' && LOCAL_AUTH_PATHS.some((p) => ctx.path === p || ctx.path.startsWith(`${p}/`)))
          throw new APIError('FORBIDDEN', { message: 'Sign in with your Arkhon account', code: 'LOCAL_AUTH_DISABLED' });
      }),
    },
    plugins: [
      arkhonSso(config, pool),
      bearer(),
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          await mailer.send({
            to: email,
            subject: 'Your Certa sign-in link',
            text: `Sign in to Certa:\n\n${url}\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.`,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
