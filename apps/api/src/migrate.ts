/** Container entrypoint: apply migrations, ensure the app login role, load rule packs, install the job queue. */
import { ensureAppLogin, loadRulePacks, runMigrations } from '@certa/db';
import { installQueue } from './jobs/queue.js';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required to migrate');

await runMigrations(adminUrl);
console.log(JSON.stringify({ msg: 'migrations applied' }));
const { APP_DB_USER, APP_DB_PASSWORD } = process.env;
if (APP_DB_USER && APP_DB_PASSWORD) {
  await ensureAppLogin(adminUrl, APP_DB_USER, APP_DB_PASSWORD);
  console.log(JSON.stringify({ msg: 'app login role ready', role: APP_DB_USER }));
}
const loaded = await loadRulePacks(adminUrl);
console.log(JSON.stringify({ msg: 'rule packs', loaded }));
await installQueue(adminUrl);
console.log(JSON.stringify({ msg: 'job queue installed' }));
