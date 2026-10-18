import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { newId } from '@certa/core';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type pg from 'pg';
import { VERSION, type Config } from './config.js';
import { createAuth, type Auth } from './lib/auth.js';
import type { SessionUser } from './lib/context.js';
import { ApiError, badRequest } from './lib/errors.js';
import type { Mailer } from './lib/mailer.js';
import { createPusher, type Pusher } from './lib/push.js';
import { createBlobStore, type BlobStore } from './lib/blobs.js';
import { iso } from './lib/mappers.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { fleetRoutes } from './routes/fleet.js';
import { flightRoutes } from './routes/flights.js';
import { checklistRoutes } from './routes/checklists.js';
import { authorizationRoutes } from './routes/authorizations.js';
import { missionRoutes } from './routes/missions.js';
import { discordRoutes } from './routes/discord.js';
import { shareRoutes } from './routes/share.js';
import { integrationRoutes } from './routes/integrations.js';
import { argusRoutes } from './routes/argus.js';
import { conditionsRoutes } from './routes/conditions.js';
import { pushRoutes } from './routes/push.js';
import { modelRoutes } from './routes/models.js';
import { healthRoutes } from './routes/health.js';
import { memberRoutes } from './routes/members.js';
import { orgRoutes } from './routes/orgs.js';
import { ruleRoutes } from './routes/rules.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
  mailer: Mailer;
  /** Outbound HTTP for public data (weather, airspace); tests inject a fake. */
  fetch?: typeof fetch;
  /** Web Push sender; defaults to one built from the VAPID config (null when unconfigured). */
  pusher?: Pusher | null;
  /** Upload storage; defaults to S3 (or a local dir in development). */
  blobs?: BlobStore;
}

export interface AppContext extends AppDeps {
  auth: Auth;
  pusher: Pusher | null;
  blobs: BlobStore;
}

export type App = FastifyInstance;

/** Replaces secret path segments (share tokens) for logging. */
export const redactUrl = (url: string) => url.replace(/\/public\/share\/[^/?#]+/g, '/public/share/:token');

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const { config } = deps;
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            serializers: {
              // Share-link tokens are bearer secrets: never write them to logs.
              req: (req: { method: string; url: string; id: string }) => ({ id: req.id, method: req.method, url: redactUrl(req.url) }),
            },
          },
    // Always server-generated: request ids are recorded in the audit log, so clients can't choose them.
    genReqId: () => newId(),
    // Trust only the proxies in front of us (Caddy = 1 hop), so X-Forwarded-For can't be forged
    // to dodge per-IP rate limits.
    trustProxy: (_addr: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
    bodyLimit: 10 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const ctx: AppContext = { ...deps, auth: createAuth(config, deps.pool, deps.mailer), pusher: deps.pusher === undefined ? createPusher(config) : deps.pusher, blobs: deps.blobs ?? createBlobStore(config) };

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (req) => {
      const h = config.CLIENT_IP_HEADER ? req.headers[config.CLIENT_IP_HEADER] : undefined;
      return (Array.isArray(h) ? h[0] : h)?.split(',')[0]?.trim() || req.ip;
    },
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Certa API',
        version: VERSION,
        description:
          'Flight operations & compliance logbook API. All quantities are SI; all instants are UTC ISO-8601. ' +
          'Org-scoped routes live under /api/v1/orgs/{orgId}.',
      },
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
          bearer: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ session: [] }, { bearer: [] }],
    },
    transform: jsonSchemaTransform,
  });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    if (!req.url.startsWith(`${config.basePath}/api/v1`)) return;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const session = await ctx.auth.api.getSession({ headers });
    req.user = session
      ? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          emailVerified: session.user.emailVerified,
          createdAt: iso(new Date(session.user.createdAt).toISOString()),
        }
      : null;
  });

  // Postgres can't store U+0000 in text. Reject it up front instead of failing the query with a 500.
  app.addHook('preValidation', async (req) => {
    if (hasNul(req.body) || hasNul(req.query) || hasNul(req.params)) throw badRequest('Text can’t contain null characters');
  });

  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: { code: 'validation_failed', message: 'Request validation failed', requestId: req.id, details: err.validation },
      });
    }
    if (err instanceof ApiError) {
      // `message` at the top level too, for clients that read only that (e.g. the Discord bot).
      return reply.status(err.statusCode).send({
        message: err.message,
        error: { code: err.code, message: err.message, requestId: req.id, details: err.details },
      });
    }
    if (isResponseSerializationError(err)) req.log.error({ err, issues: err.cause.issues }, 'response failed schema');
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.status(status).send({
      error: {
        code: status === 429 ? 'rate_limited' : status >= 500 ? 'internal' : 'error',
        message: status >= 500 ? 'Internal server error' : (err as Error).message,
        requestId: req.id,
      },
    });
  });

  // Health checks answer at the root (container probes) and under the base path (public).
  await app.register(healthRoutes(ctx));
  if (config.basePath) await app.register(healthRoutes(ctx, { hidden: true }), { prefix: config.basePath });
  await app.register(authRoutes(ctx));
  const v1 = `${config.basePath}/api/v1`;
  await app.register(orgRoutes(ctx), { prefix: v1 });
  await app.register(memberRoutes(ctx), { prefix: v1 });
  await app.register(ruleRoutes(ctx), { prefix: v1 });
  await app.register(auditRoutes(ctx), { prefix: v1 });
  await app.register(fleetRoutes(ctx), { prefix: v1 });
  await app.register(flightRoutes(ctx), { prefix: v1 });
  await app.register(checklistRoutes(ctx), { prefix: v1 });
  await app.register(authorizationRoutes(ctx), { prefix: v1 });
  await app.register(missionRoutes(ctx), { prefix: v1 });
  await app.register(discordRoutes(ctx), { prefix: v1 });
  await app.register(shareRoutes(ctx), { prefix: v1 });
  await app.register(integrationRoutes(ctx), { prefix: v1 });
  await app.register(argusRoutes(ctx), { prefix: v1 });
  await app.register(conditionsRoutes(ctx), { prefix: v1 });
  await app.register(pushRoutes(ctx), { prefix: v1 });
  await app.register(modelRoutes(ctx), { prefix: v1 });

  return app;
}

/** True if any string in a parsed body, query or params object contains U+0000. */
function hasNul(v: unknown, depth = 0): boolean {
  if (typeof v === 'string') return v.includes('\u0000');
  if (depth > 20 || v === null || typeof v !== 'object' || Buffer.isBuffer(v)) return false;
  if (Array.isArray(v)) return v.some((x) => hasNul(x, depth + 1));
  return Object.entries(v).some(([k, x]) => k.includes('\u0000') || hasNul(x, depth + 1));
}
