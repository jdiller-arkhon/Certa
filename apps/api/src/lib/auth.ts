import { hash, verify } from '@node-rs/argon2';
import { newId } from '@certa/core';
import { authAccounts, authSessions, authUsers, authVerifications, globalDb } from '@certa/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, magicLink } from 'better-auth/plugins';
import type pg from 'pg';
import type { Config } from '../config.js';
import type { Mailer } from './mailer.js';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ } as const;

export function createAuth(config: Config, pool: pg.Pool, mailer: Mailer) {
  return betterAuth({
    appName: 'Certa',
    baseURL: config.PUBLIC_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.PUBLIC_URL, ...config.TRUSTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)],
    database: drizzleAdapter(globalDb(pool), {
      provider: 'pg',
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    advanced: {
      database: { generateId: () => newId() },
      useSecureCookies: config.PUBLIC_URL.startsWith('https://'),
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
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // Rate limiting is applied at the Fastify layer so it covers every route consistently.
    rateLimit: { enabled: false },
    plugins: [
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
