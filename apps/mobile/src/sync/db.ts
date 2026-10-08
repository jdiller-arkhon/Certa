/**
 * On-device SQLite for the offline-first field app. Phase 1 creates the database and the
 * sync bookkeeping tables; Phase 2 adds the synced entity tables, the push/pull loop, and
 * conflict handling (docs/ARCHITECTURE_PLAN.md §8).
 */
import * as SQLite from 'expo-sqlite';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS outbox (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     op_id TEXT NOT NULL UNIQUE,
     entity TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     op TEXT NOT NULL CHECK (op IN ('create','update','delete')),
     fields TEXT NOT NULL,
     base_version INTEGER,
     hlc TEXT NOT NULL,
     created_at TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   );
   CREATE TABLE IF NOT EXISTS sync_state (org_id TEXT PRIMARY KEY NOT NULL, cursor TEXT, last_synced_at TEXT);`,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('certa.db');
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let version = row?.user_version ?? 0;
    for (; version < MIGRATIONS.length; version++) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(MIGRATIONS[version]!);
        await db.execAsync(`PRAGMA user_version = ${version + 1}`);
      });
    }
    return db;
  })();
  return dbPromise;
}

export async function pendingChangeCount(): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM outbox');
  return row?.n ?? 0;
}
