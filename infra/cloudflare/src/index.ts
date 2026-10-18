/**
 * Certa on Cloudflare: this Worker runs on the route arkhonindustries.com/certa* and does what
 * Caddy does in the Docker Compose stack. /certa/api, /certa/healthz and /certa/readyz go to the
 * API container; everything else goes to the web container. A daily Cron Trigger starts a
 * short-lived jobs container that sends expiry reminders.
 *
 * The database is Neon Postgres and uploads live in R2 (via its S3 API); both are reached from
 * the containers with the secrets below. Containers sleep when idle and wake on the next request.
 */
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  CERTA_WEB: DurableObjectNamespace<CertaWeb>;
  CERTA_API: DurableObjectNamespace<CertaApi>;
  CERTA_JOBS: DurableObjectNamespace<CertaJobs>;
  // Plain vars (wrangler.jsonc)
  PUBLIC_URL: string;
  S3_BUCKET: string;
  MAIL_FROM: string;
  ARKHON_AUTH_ORIGIN?: string;
  ARKHON_ORG_ID?: string;
  LOCAL_AUTH?: string;
  // Secrets (wrangler secret put …)
  DATABASE_URL: string;
  AUTH_SECRET: string;
  SMTP_URL: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  DISCORD_BOT_API_TOKEN?: string;
  ARGUS_INGEST_TOKEN?: string;
}

/** Environment for the API and jobs containers; unset optional secrets are left out. */
function apiEnv(env: Env): Record<string, string> {
  const vars: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    PUBLIC_URL: env.PUBLIC_URL,
    DATABASE_URL: env.DATABASE_URL,
    AUTH_SECRET: env.AUTH_SECRET,
    SMTP_URL: env.SMTP_URL,
    MAIL_FROM: env.MAIL_FROM,
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_BUCKET: env.S3_BUCKET,
    S3_REGION: 'auto',
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    // Requests only reach the container through this Worker, and Cloudflare sets this header
    // itself, so per-visitor rate limits can trust it.
    CLIENT_IP_HEADER: 'cf-connecting-ip',
    TRUST_PROXY_HOPS: '1',
    CONDITIONS_LOOKUPS: 'on',
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: env.VAPID_SUBJECT,
    DISCORD_BOT_API_TOKEN: env.DISCORD_BOT_API_TOKEN,
    // One account across Arkhon: sign in with the Arkhon (Argus) account.
    ARKHON_AUTH_ORIGIN: env.ARKHON_AUTH_ORIGIN,
    ARKHON_ORG_ID: env.ARKHON_ORG_ID,
    LOCAL_AUTH: env.LOCAL_AUTH,
    ARGUS_INGEST_TOKEN: env.ARGUS_INGEST_TOKEN,
  };
  return Object.fromEntries(Object.entries(vars).filter((e): e is [string, string] => !!e[1]));
}

export class CertaWeb extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '20m';
}

export class CertaApi extends Container<Env> {
  defaultPort = 4000;
  sleepAfter = '20m';
  constructor(ctx: DurableObjectState<object>, env: Env) {
    super(ctx, env);
    this.envVars = apiEnv(env);
  }
}

export class CertaJobs extends Container<Env> {
  sleepAfter = '15m';
  constructor(ctx: DurableObjectState<object>, env: Env) {
    super(ctx, env);
    this.envVars = apiEnv(env);
    this.entrypoint = ['node', 'dist/run-alerts.js'];
  }
}

const API_PATHS = /^\/certa\/(api\/|healthz$|readyz$)/;

/** The headers Caddy adds in the self-hosted stack. */
function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('X-Frame-Options', 'DENY');
  // Per-user pages and API responses must never be cached at the edge.
  if (!out.headers.has('Cache-Control')) out.headers.set('Cache-Control', 'private, no-store');
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    // The route also matches e.g. /certainty; only /certa and /certa/... are Certa's.
    if (pathname !== '/certa' && !pathname.startsWith('/certa/')) return fetch(request);
    const target = API_PATHS.test(pathname) ? getContainer(env.CERTA_API, 'main') : getContainer(env.CERTA_WEB, 'main');
    try {
      return withSecurityHeaders(await target.fetch(request));
    } catch {
      // First request after idle: the container may still be starting.
      return new Response('Certa is starting up. Try again in a few seconds.', { status: 503, headers: { 'Retry-After': '5', 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  },

  /** Daily expiry reminders (07:00 in Denver: two UTC times cover daylight saving; reruns are no-ops). */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(getContainer(env.CERTA_JOBS, 'daily').start());
  },
} satisfies ExportedHandler<Env>;
