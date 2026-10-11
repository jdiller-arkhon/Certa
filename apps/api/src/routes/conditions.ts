/** Pre-flight conditions advisories for a point (airspace, weather, daylight). Advisory only. */
import { ConditionsResponse } from '@certa/core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, resolveOrg } from '../lib/context.js';
import { conditionsAt, setConditionsContact } from '../lib/conditions.js';
import { OrgParams } from './orgs.js';

export const conditionsRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    setConditionsContact(ctx.config.PUBLIC_URL);
    app.get(
      '/orgs/:orgId/conditions',
      {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        schema: {
          tags: ['flights'],
          summary: 'Airspace, weather, and daylight advisories at a point (US; advisory only)',
          params: OrgParams,
          querystring: z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) }),
          response: { 200: ConditionsResponse },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'flights.read');
        const offline: typeof fetch = async () => {
          throw new Error('conditions lookups are off');
        };
        return conditionsAt(ctx.config.CONDITIONS_LOOKUPS === 'off' ? offline : (ctx.fetch ?? fetch), req.query.lat, req.query.lon);
      },
    );
  };
