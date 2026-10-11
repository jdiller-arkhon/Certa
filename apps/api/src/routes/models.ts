/**
 * Customer 3D models for the hangar: one self-contained GLB per aircraft, up to 20 MB.
 * Stored privately (org-prefixed key) and served only to members of the owning org.
 */
import { createHash } from 'node:crypto';
import { Id, newId } from '@certa/core';
import { aircraft, and, documents, eq, isNull, sql } from '@certa/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { authorize, inOrg, resolveOrg } from '../lib/context.js';
import { badRequest, notFound } from '../lib/errors.js';
import { GlbError, inspectGlb } from '../lib/glb.js';
import { OrgParams } from './orgs.js';

const MAX_BYTES = 20 * 1024 * 1024;
const Params = OrgParams.extend({ aircraftId: Id });

export const modelRoutes =
  (ctx: AppContext): FastifyPluginAsyncZod =>
  async (app) => {
    app.addContentTypeParser(['model/gltf-binary', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_req, body, done) => done(null, body));

    app.put(
      '/orgs/:orgId/aircraft/:aircraftId/model',
      {
        bodyLimit: MAX_BYTES,
        schema: {
          tags: ['aircraft'],
          summary: 'Upload a 3D model (binary glTF, .glb, ≤ 20 MB) for the hangar',
          params: Params,
          response: { 200: z.object({ documentId: Id, sizeBytes: z.number().int(), sha256: z.string(), meshes: z.number().int() }) },
        },
      },
      async (req) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        const body = req.body as unknown;
        if (!(body instanceof Buffer)) throw badRequest('Send the .glb file as the request body (Content-Type: model/gltf-binary)');
        let info;
        try {
          info = inspectGlb(body);
        } catch (err) {
          if (err instanceof GlbError) throw badRequest(err.message);
          throw err;
        }
        const sha256 = createHash('sha256').update(body).digest('hex');
        const docId = newId();
        const key = `orgs/${oc.orgId}/models/${docId}.glb`;
        const old = await inOrg(ctx.pool, req, oc, async (db) => {
          const [a] = await db.select({ id: aircraft.id, modelDocumentId: aircraft.modelDocumentId }).from(aircraft).where(and(eq(aircraft.id, req.params.aircraftId), isNull(aircraft.deletedAt)));
          if (!a) throw notFound('Aircraft');
          return a.modelDocumentId;
        });
        // Store first, then record: a failed DB write leaves an orphan blob, never a dangling row.
        await ctx.blobs.put(key, body, 'model/gltf-binary');
        await inOrg(ctx.pool, req, oc, async (db) => {
          await db.insert(documents).values({ id: docId, ownerType: 'aircraft', ownerId: req.params.aircraftId, fileName: `${req.params.aircraftId}.glb`, mimeType: 'model/gltf-binary', sizeBytes: body.byteLength, sha256, storageKey: key });
          await db.update(aircraft).set({ modelDocumentId: docId }).where(eq(aircraft.id, req.params.aircraftId));
          if (old) await db.update(documents).set({ deletedAt: sql`now()` }).where(eq(documents.id, old));
        });
        return { documentId: docId, sizeBytes: body.byteLength, sha256, meshes: info.meshes };
      },
    );

    app.get(
      '/orgs/:orgId/aircraft/:aircraftId/model',
      { schema: { tags: ['aircraft'], summary: 'The aircraft’s uploaded 3D model (GLB)', params: Params } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'aircraft.read');
        const doc = await inOrg(ctx.pool, req, oc, async (db) => {
          const [row] = await db
            .select({ key: documents.storageKey, sha256: documents.sha256 })
            .from(aircraft)
            .innerJoin(documents, and(eq(documents.id, aircraft.modelDocumentId), isNull(documents.deletedAt)))
            .where(and(eq(aircraft.id, req.params.aircraftId), isNull(aircraft.deletedAt)));
          return row;
        });
        if (!doc) throw notFound('Model');
        const etag = `"${doc.sha256}"`;
        reply.headers({ etag, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
        if (req.headers['if-none-match'] === etag) return reply.status(304).send();
        const bytes = await ctx.blobs.get(doc.key);
        if (!bytes) throw notFound('Model');
        return reply.type('model/gltf-binary').send(Buffer.from(bytes));
      },
    );

    app.delete(
      '/orgs/:orgId/aircraft/:aircraftId/model',
      { schema: { tags: ['aircraft'], summary: 'Remove the uploaded model (the hangar draws the airframe type again)', params: Params, response: { 204: z.null() } } },
      async (req, reply) => {
        const oc = await resolveOrg(ctx.pool, req, req.params.orgId);
        authorize(oc, 'aircraft.manage');
        await inOrg(ctx.pool, req, oc, async (db) => {
          const [a] = await db.select({ doc: aircraft.modelDocumentId }).from(aircraft).where(and(eq(aircraft.id, req.params.aircraftId), isNull(aircraft.deletedAt)));
          if (!a) throw notFound('Aircraft');
          await db.update(aircraft).set({ modelDocumentId: null }).where(eq(aircraft.id, req.params.aircraftId));
          if (a.doc) await db.update(documents).set({ deletedAt: sql`now()` }).where(eq(documents.id, a.doc));
        });
        return reply.status(204).send(null);
      },
    );
  };
