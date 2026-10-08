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
import { ApiError } from './lib/errors.js';
import type { Mailer } from './lib/mailer.js';
import { iso } from './lib/mappers.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
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
}

export interface AppContext extends AppDeps {
  auth: Auth;
}

export type App = FastifyInstance;

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const { config } = deps;
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          },
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? newId(),
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const ctx: AppContext = { ...deps, auth: createAuth(config, deps.pool, deps.mailer) };

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
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
    if (!req.url.startsWith('/api/v1')) return;
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

  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: { code: 'validation_failed', message: 'Request validation failed', requestId: req.id, details: err.validation },
      });
    }
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send({
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

  await app.register(healthRoutes(ctx));
  await app.register(authRoutes(ctx));
  await app.register(orgRoutes(ctx), { prefix: '/api/v1' });
  await app.register(memberRoutes(ctx), { prefix: '/api/v1' });
  await app.register(ruleRoutes(ctx), { prefix: '/api/v1' });
  await app.register(auditRoutes(ctx), { prefix: '/api/v1' });

  return app;
}
