import { sql } from 'drizzle-orm';
import { bigint, customType, timestamp, uuid } from 'drizzle-orm/pg-core';

/** PostGIS geography column. Values cross the driver as EWKT on write / hex EWKB on read. */
export const geography = (name: string, type: 'Point' | 'LineStringZM' | 'Polygon' | 'Geometry') =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      return type === 'Geometry' ? 'geography' : `geography(${type}, 4326)`;
    },
  })(name);

export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** Tenant column defaulting to the RLS session's org, so inserts can't land in another tenant. */
export const orgIdColumn = () =>
  uuid('org_id')
    .notNull()
    .default(sql`(current_setting('app.org_id', true))::uuid`);

/** Columns shared by every tenant entity: identity, tenancy, provenance, soft delete, sync. */
export const entityColumns = () => ({
  id: uuid('id').primaryKey(),
  orgId: orgIdColumn(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by').default(sql`nullif(current_setting('app.user_id', true), '')::uuid`),
  updatedBy: uuid('updated_by'),
  deletedAt: ts('deleted_at'),
  /** Incremented by trigger on every update; used for optimistic concurrency and sync. */
  version: bigint('version', { mode: 'number' }).notNull().default(1),
});
