import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * Public URL of the app, including any base path. Hosted on the Arkhon site:
   * https://arkhonindustries.com/certa. Self-hosted at a root: https://certa.example.com.
   */
  PUBLIC_URL: z.url().default('http://localhost:8080'),
  /** Connection as the non-privileged app role. */
  DATABASE_URL: z.string().min(1),
  /** Owner connection; only used by the migrator and the worker's queue install. */
  DATABASE_ADMIN_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Certa <no-reply@certa.local>'),
  /** Comma-separated extra origins allowed to call auth endpoints (e.g. a separate dev origin). */
  TRUSTED_ORIGINS: z.string().default(''),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().default(20),
  /**
   * Header carrying the real client IP when Certa sits behind another proxy (e.g. the Arkhon
   * website + Cloudflare: "cf-connecting-ip"). Only set this when the origin is reachable solely
   * through that proxy, otherwise clients can spoof it.
   */
  CLIENT_IP_HEADER: z.string().toLowerCase().optional(),
  /** Reverse proxies in front of the API (bundled Caddy = 1). Only their X-Forwarded-For entries are trusted. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  /**
   * Web Push (VAPID) keys. Generate once with `npx web-push generate-vapid-keys` and keep the
   * private key secret. Unset: push notifications are off and the app hides the toggle.
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Contact for push services, a mailto: or https: URL. Defaults to PUBLIC_URL. */
  VAPID_SUBJECT: z.string().optional(),
  /** S3-compatible object storage for uploads. Unset: files are kept under BLOB_DIR (dev only). */
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().default('certa'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  BLOB_DIR: z.string().default('./data/blobs'),
  /**
   * Pre-flight conditions call free, keyless public US services: api.weather.gov, the FAA on
   * services6.arcgis.com and tfr.faa.gov, aviationweather.gov, and services.swpc.noaa.gov. "off"
   * keeps the stack fully offline; the app then shows airspace, TFRs and weather as "not checked".
   */
  CONDITIONS_LOOKUPS: z.enum(['on', 'off']).default('on'),
  /**
   * Bearer token the community Discord bot uses for /v1/discord, /v1/users and /v1/leaderboard.
   * Unset disables those endpoints. Generate with `openssl rand -base64 48`.
   */
  DISCORD_BOT_API_TOKEN: z.string().min(32, 'DISCORD_BOT_API_TOKEN must be at least 32 characters').optional(),
});

export type Config = z.infer<typeof Env> & {
  /** Scheme + host + port of PUBLIC_URL. */
  publicOrigin: string;
  /** Path prefix of PUBLIC_URL without trailing slash: '' or e.g. '/certa'. */
  basePath: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const url = new URL(parsed.data.PUBLIC_URL);
  const basePath = url.pathname.replace(/\/+$/, '');
  if (basePath && !/^(\/[a-z0-9-]+)+$/.test(basePath))
    throw new Error(`PUBLIC_URL path must look like /certa (got ${basePath})`);
  return { ...parsed.data, publicOrigin: url.origin, basePath };
}

export const VERSION = '0.1.0';
