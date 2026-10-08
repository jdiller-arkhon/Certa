import pg from 'pg';
import { ensureAppLogin, loadRulePacks, runMigrations } from './admin.js';

export interface TestDatabase {
  adminUrl: string;
  appUrl: string;
  drop: () => Promise<void>;
}

/**
 * Creates a fresh, fully-migrated database for an integration test file. The app URL connects
 * as a non-superuser role without BYPASSRLS — exactly like production.
 */
export async function createTestDatabase(name: string): Promise<TestDatabase> {
  const server = process.env.TEST_PG_SERVER_URL ?? 'postgres://postgres:postgres@localhost:5432';
  const dbName = `certa_test_${name}`.replace(/[^a-z0-9_]/g, '_');
  const root = new pg.Client({ connectionString: `${server}/postgres` });
  await root.connect();
  await root.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await root.query(`CREATE DATABASE ${dbName}`);
  await root.end();

  const adminUrl = `${server}/${dbName}`;
  await runMigrations(adminUrl);
  await ensureAppLogin(adminUrl, 'certa_test_app', 'certa_test_app');
  await loadRulePacks(adminUrl);
  const u = new URL(adminUrl);
  u.username = 'certa_test_app';
  u.password = 'certa_test_app';
  return {
    adminUrl,
    appUrl: u.toString(),
    drop: async () => {
      const c = new pg.Client({ connectionString: `${server}/postgres` });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await c.end();
    },
  };
}
