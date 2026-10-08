import { api } from '@certa/core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppContext } from '../app.js';
import { VERSION } from '../config.js';

export const healthRoutes =
  (ctx: AppContext, opts: { hidden?: boolean } = {}): FastifyPluginAsyncZod =>
  async (app) => {
    app.get('/healthz', { schema: { hide: opts.hidden, tags: ['health'], response: { 200: api.HealthResponse } } }, async () => ({
      status: 'ok' as const,
      version: VERSION,
      checks: {},
    }));

    app.get(
      '/readyz',
      { schema: { hide: opts.hidden, tags: ['health'], response: { 200: api.HealthResponse, 503: api.HealthResponse } } },
      async (_req, reply) => {
        let db: 'ok' | 'fail' = 'ok';
        try {
          await ctx.pool.query('SELECT 1');
        } catch {
          db = 'fail';
        }
        const body = { status: db === 'ok' ? ('ok' as const) : ('degraded' as const), version: VERSION, checks: { database: db } };
        return reply.status(db === 'ok' ? 200 : 503).send(body);
      },
    );
  };
