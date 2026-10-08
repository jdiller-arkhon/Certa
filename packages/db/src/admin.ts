import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, newId, type RulePack } from '@certa/core';
import { loadAllPacks } from '@certa/rulepacks';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Applies all migrations using the admin (owner) connection. */
export async function runMigrations(adminUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Ensures the login role the API connects with exists, has the given password, and inherits
 * `certa_app` (no BYPASSRLS). Idempotent.
 */
export async function ensureAppLogin(adminUrl: string, user: string, password: string): Promise<void> {
  if (!IDENT.test(user)) throw new Error(`Invalid role name: ${user}`);
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user]);
    const lit = (await client.query('SELECT quote_literal($1) AS q', [password])).rows[0].q as string;
    if (rows.length === 0) await client.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${lit}`);
    else await client.query(`ALTER ROLE ${user} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${lit}`);
    await client.query(`GRANT certa_app TO ${user}`);
  } finally {
    await client.end();
  }
}

/**
 * Loads every shipped rule pack into `rule_packs`. A pack version is immutable once loaded:
 * if the file changes without a version bump, loading fails loudly.
 */
export async function loadRulePacks(adminUrl: string, packs: RulePack[] = loadAllPacks().map((p) => p.pack)) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const loaded: string[] = [];
  try {
    for (const pack of packs) {
      const hash = contentHash(pack);
      const existing = await client.query<{ content_hash: string }>(
        'SELECT content_hash FROM rule_packs WHERE jurisdiction = $1 AND version = $2',
        [pack.jurisdiction, pack.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].content_hash !== hash)
          throw new Error(
            `Rule pack ${pack.jurisdiction}@${pack.version} changed without a version bump. Bump the version.`,
          );
        continue;
      }
      await client.query(
        `INSERT INTO rule_packs (id, jurisdiction, version, name, authority, effective_from, disclaimer, document, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [newId(), pack.jurisdiction, pack.version, pack.name, pack.authority, pack.effectiveFrom, pack.disclaimer, pack, hash],
      );
      loaded.push(`${pack.jurisdiction}@${pack.version}`);
    }
  } finally {
    await client.end();
  }
  return loaded;
}
