import { ensureAppLogin, loadRulePacks, runMigrations } from '../src/index.js';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');

await runMigrations(adminUrl);
console.log('migrations applied');
if (process.env.APP_DB_USER && process.env.APP_DB_PASSWORD) {
  await ensureAppLogin(adminUrl, process.env.APP_DB_USER, process.env.APP_DB_PASSWORD);
  console.log(`app login role ${process.env.APP_DB_USER} ready`);
}
const loaded = await loadRulePacks(adminUrl);
console.log(loaded.length ? `rule packs loaded: ${loaded.join(', ')}` : 'rule packs up to date');
