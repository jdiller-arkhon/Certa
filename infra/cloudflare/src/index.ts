/**
 * Certa on Cloudflare: this Worker runs on the route arkhonindustries.com/certa* and does what
 * Caddy does in the Docker Compose stack. /certa/api, /certa/healthz and /certa/readyz go to the
 * API container; everything else goes to the web container. A daily Cron Trigger starts a
 * short-lived jobs container that sends expiry reminders.
 *
 * The database is Neon Postgres and uploads live in R2 (via its S3 API); both are reached from
 * the containers with the secrets below. Containers sleep when idle and wake on the next request.
 */
import { DurableObject } from 'cloudflare:workers';
import { Container, getContainer } from '@cloudflare/containers';
import { RelaySession, type RelayMessage, type RelayState } from './mqtt-relay';

interface Env {
  CERTA_WEB: DurableObjectNamespace<CertaWeb>;
  CERTA_API: DurableObjectNamespace<CertaApi>;
  CERTA_JOBS: DurableObjectNamespace<CertaJobs>;
  LIVE_RELAY: DurableObjectNamespace<LiveRelay>;
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
  // Live telemetry from DJI Pilot 2 (docs/LIVE_TELEMETRY.md)
  LIVE_MQTT_PUBLIC_URL?: string;
  LIVE_HOOK_SECRET?: string;
  DJI_APP_ID?: string;
  DJI_APP_KEY?: string;
  DJI_APP_LICENSE?: string;
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
    LIVE_MQTT_PUBLIC_URL: env.LIVE_MQTT_PUBLIC_URL,
    LIVE_HOOK_SECRET: env.LIVE_HOOK_SECRET,
    DJI_APP_ID: env.DJI_APP_ID,
    DJI_APP_KEY: env.DJI_APP_KEY,
    DJI_APP_LICENSE: env.DJI_APP_LICENSE,
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

/**
 * Live relay: one Durable Object per DJI controller connection, speaking MQTT over WebSocket
 * (wss://arkhonindustries.com/certa/live/mqtt). It checks the controller's credential and
 * forwards its messages to the API container, which wakes on demand, so nothing has to stay
 * running between flights. WebSocket hibernation keeps an idle connection free.
 */
export class LiveRelay extends DurableObject<Env> {
  private sessions = new Map<WebSocket, RelaySession>();

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ username: null, subscriptions: [] } satisfies RelayState);
    // DJI Pilot 2 (Eclipse Paho) asks for the "mqtt" subprotocol and gives up without it.
    const asked = request.headers.get('Sec-WebSocket-Protocol') ?? '';
    const proto = asked.split(',').map((p) => p.trim()).find((p) => p === 'mqtt' || p === 'mqttv3.1');
    return new Response(null, { status: 101, webSocket: client, headers: proto ? { 'Sec-WebSocket-Protocol': proto } : {} });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string') return ws.close(1003, 'MQTT is binary');
    this.session(ws).onData(new Uint8Array(message));
  }

  async webSocketClose(ws: WebSocket) {
    const s = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!s) return;
    await s.onClose();
    // If the drone was flying, its flight is closed after two minutes of silence.
    if (s.state.username) await this.ctx.storage.setAlarm(Date.now() + 150_000);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    await this.api('/api/v1/live/relay/sweep', null).catch(() => {});
  }

  /** The session for a socket, rebuilt from its attachment after the object hibernated. */
  private session(ws: WebSocket): RelaySession {
    let s = this.sessions.get(ws);
    if (s) return s;
    s = new RelaySession(
      {
        send: (bytes) => ws.send(bytes),
        close: () => ws.close(1000, 'bye'),
        auth: async (username, password) => {
          const res = await this.api('/api/v1/live/mqtt/auth', { username, password });
          return ((await res.json()) as { result: string }).result === 'allow';
        },
        forward: async (username: string, messages: RelayMessage[]) => {
          const res = await this.api('/api/v1/live/relay', { username, messages });
          return (await res.json()) as { publish: RelayMessage[]; disconnect: boolean };
        },
        log: (event, fields) => console.log(JSON.stringify({ event, ...fields })),
      },
      ws.deserializeAttachment() as RelayState,
      (state) => ws.serializeAttachment(state),
    );
    this.sessions.set(ws, s);
    return s;
  }

  /** POST to the API container; retries while it wakes up (a cold start takes a few seconds). */
  private async api(path: string, body: unknown): Promise<Response> {
    if (!this.env.LIVE_HOOK_SECRET) throw new Error('LIVE_HOOK_SECRET is not set');
    const url = new URL(this.env.PUBLIC_URL);
    let last: unknown;
    for (const wait of [0, 1000, 3000, 6000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        const res = await getContainer(this.env.CERTA_API, 'main').fetch(
          new Request(`${url.origin}${url.pathname.replace(/\/$/, '')}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-certa-hook-secret': this.env.LIVE_HOOK_SECRET },
            body: body === null ? undefined : JSON.stringify(body),
          }),
        );
        if (res.ok) return res;
        // A refusal (wrong hook secret, bad request) won't change on retry.
        if (res.status < 500) throw Object.assign(new Error(`API answered ${res.status}`), { final: true });
        last = new Error(`API answered ${res.status}`);
      } catch (err) {
        if ((err as { final?: boolean }).final) throw err;
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error('API unreachable');
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
    if (pathname === '/certa/live/mqtt' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      // One relay object per connection, near the API and database.
      return env.LIVE_RELAY.get(env.LIVE_RELAY.newUniqueId(), { locationHint: 'enam' }).fetch(request);
    }
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
