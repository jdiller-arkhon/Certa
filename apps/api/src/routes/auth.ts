import { api, DEFAULT_UNITS_US, newId } from '@certa/core';
import { authUsers, eq, globalDb, memberships, organizations, pilots, withTenant } from '@certa/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppContext } from '../app.js';
import { requireUser } from '../lib/context.js';
import { ApiError, conflict } from '../lib/errors.js';
import { listMemberships, slugify } from '../lib/orgs.js';

function toWebHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (typeof v === 'string') headers.set(k, v);
  }
  return headers;
}

function forwardSetCookies(from: Headers, reply: FastifyReply) {
  const cookies = from.getSetCookie();
  if (cookies.length) reply.header('set-cookie', cookies);
}

export const authRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    const authRateLimit = { max: ctx.config.RATE_LIMIT_AUTH_PER_MINUTE, timeWindow: '1 minute' };

    const base = ctx.config.basePath;

    // Better Auth owns {base}/api/auth/* (sign-in, sign-out, magic link, session). Not in OpenAPI.
    app.route({
      method: ['GET', 'POST'],
      url: `${base}/api/auth/*`,
      schema: { hide: true },
      config: { rateLimit: authRateLimit },
      async handler(req, reply) {
        const url = new URL(req.url, ctx.config.publicOrigin);
        const request = new Request(url, {
          method: req.method,
          headers: toWebHeaders(req),
          body: req.method === 'GET' || req.body === undefined ? undefined : JSON.stringify(req.body),
        });
        const response = await ctx.auth.handler(request);
        reply.status(response.status);
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie') reply.header(key, value);
        });
        forwardSetCookies(response.headers, reply);
        return reply.send(response.body ? await response.text() : null);
      },
    });

    // Sign-up creates the user, their first organization (as owner), and their pilot record.
    app.post(
      `${base}/api/v1/signup`,
      {
        config: { rateLimit: authRateLimit },
        schema: {
          tags: ['auth'],
          summary: 'Create an account and its first organization',
          body: api.SignUpRequest,
          response: { 201: api.SignUpResponse, 409: api.ErrorResponse },
          security: [],
        },
      },
      async (req, reply) => {
        const body = req.body;
        const existing = await globalDb(ctx.pool).select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, body.email.toLowerCase()));
        if (existing.length) throw conflict('An account with that email already exists');

        const { headers, response } = await ctx.auth.api.signUpEmail({
          body: { name: body.name, email: body.email, password: body.password },
          headers: toWebHeaders(req),
          returnHeaders: true,
        });
        const userId = response.user.id;
        const orgId = newId();
        try {
          await withTenant(ctx.pool, { orgId, userId, requestId: req.id }, async (db) => {
            await db.insert(organizations).values({
              id: orgId,
              name: body.organizationName,
              slug: slugify(body.organizationName, orgId),
              timezone: body.timezone,
              units: DEFAULT_UNITS_US,
              createdBy: userId,
            });
            const membershipId = newId();
            await db.insert(memberships).values({ id: membershipId, userId, role: 'owner' });
            await db.insert(pilots).values({ id: newId(), membershipId, displayName: body.name, email: body.email });
          });
        } catch (err) {
          // Don't leave an orphan account without an organization.
          await globalDb(ctx.pool).delete(authUsers).where(eq(authUsers.id, userId));
          throw err instanceof ApiError ? err : new ApiError(500, 'signup_failed', 'Could not create organization');
        }
        forwardSetCookies(headers, reply);
        const user = {
          id: userId,
          email: response.user.email,
          name: response.user.name,
          emailVerified: response.user.emailVerified,
          createdAt: new Date(response.user.createdAt).toISOString(),
        };
        return reply.status(201).send({ user, memberships: await listMemberships(ctx.pool, userId, req.id) });
      },
    );

    app.get(
      `${base}/api/v1/me`,
      { schema: { tags: ['auth'], summary: 'Current user and their organizations', response: { 200: api.MeResponse } } },
      async (req) => {
        const user = requireUser(req);
        return { user, memberships: await listMemberships(ctx.pool, user.id, req.id) };
      },
    );
  };
