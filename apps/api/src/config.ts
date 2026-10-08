import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Public origin users reach the app at (Caddy), e.g. https://certa.example.com */
  PUBLIC_URL: z.url().default('http://localhost:8080'),
  /** Connection as the non-privileged app role. */
  DATABASE_URL: z.string().min(1),
  /** Owner connection; only used by the migrator and the worker's queue install. */
  DATABASE_ADMIN_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Certa <no-reply@certa.local>'),
  /** Comma-separated extra origins allowed to call auth endpoints (e.g. Expo dev server). */
  TRUSTED_ORIGINS: z.string().default(''),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().default(20),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const VERSION = '0.1.0';
