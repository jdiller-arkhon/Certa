/** Web e2e server (apps/web/playwright.config.ts): fresh migrated database + API on :4100. */
import { createTestDatabase } from '@certa/db/testing';

const db = await createTestDatabase('e2e');
process.env.DATABASE_URL = db.appUrl;
process.env.AUTH_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e';
process.env.PUBLIC_URL = process.env.E2E_PUBLIC_URL ?? 'http://localhost:3100';
process.env.PORT = '4100';
process.env.LOG_LEVEL = 'warn';
process.env.SMTP_URL = 'smtp://localhost:1025';
process.env.DISCORD_BOT_API_TOKEN ??= 'e2e-discord-bot-token-e2e-discord-bot-token';
process.env.ARGUS_INGEST_TOKEN ??= 'e2e-argus-ingest-token-e2e-argus-ingest-token';
await import('../src/server.js');

// No Arkhon in e2e: accounts signed up as platform-admin-…@example.com get the Arkhon admin
// role stored on them, which local development uses for the platform console.
const { createPool } = await import('@certa/db');
const promote = createPool(db.appUrl, 1);
setInterval(() => {
  promote.query(`UPDATE auth_users SET arkhon_role = 'admin' WHERE arkhon_role IS NULL AND email LIKE 'platform-admin-%@example.com'`).catch(() => {});
}, 500).unref();
