import { PgBoss } from 'pg-boss';

export const QUEUE_SCHEMA = 'pgboss';

/** Creates the pg-boss schema as the owner and grants the app role access to it. */
export async function installQueue(adminUrl: string): Promise<void> {
  const boss = new PgBoss({ connectionString: adminUrl, schema: QUEUE_SCHEMA, supervise: false, schedule: false });
  await boss.start();
  await boss.stop({ graceful: false });
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`GRANT USAGE ON SCHEMA ${QUEUE_SCHEMA} TO certa_app`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${QUEUE_SCHEMA} TO certa_app`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${QUEUE_SCHEMA} TO certa_app`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${QUEUE_SCHEMA} TO certa_app`);
  } finally {
    await client.end();
  }
}

export function createQueue(connectionString: string): PgBoss {
  return new PgBoss({ connectionString, schema: QUEUE_SCHEMA, migrate: false });
}
