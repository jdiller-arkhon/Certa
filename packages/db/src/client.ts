import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;
export type { schema };

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max });
}

export interface TenantContext {
  /** Org whose rows are visible. Null for identity-only operations (sign-in, "my orgs"). */
  orgId: string | null;
  /** Acting user, recorded by audit triggers. */
  userId: string | null;
  requestId?: string | null;
}

/**
 * Runs `fn` in a transaction whose Postgres session settings carry the tenant context.
 * Row-level security reads `app.org_id`; audit triggers read `app.user_id` / `app.request_id`.
 * `set_config(..., true)` scopes the settings to this transaction, so pooled connections can't
 * leak context between requests.
 */
export async function withTenant<T>(
  pool: pg.Pool,
  ctx: TenantContext,
  fn: (db: Db, client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('app.request_id', $3, true)`,
      [ctx.orgId ?? '', ctx.userId ?? '', ctx.requestId ?? ''],
    );
    const db = drizzle(client, { schema });
    const result = await fn(db, client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Drizzle over a pool with no tenant context — only for global tables (auth, rule packs). */
export function globalDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
