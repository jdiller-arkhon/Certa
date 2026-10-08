/** Web e2e server (apps/web/playwright.config.ts): fresh migrated database + API on :4100. */
import { createTestDatabase } from '@certa/db/testing';

const db = await createTestDatabase('e2e');
process.env.DATABASE_URL = db.appUrl;
process.env.AUTH_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e';
process.env.PUBLIC_URL = process.env.E2E_PUBLIC_URL ?? 'http://localhost:3100';
process.env.PORT = '4100';
process.env.LOG_LEVEL = 'warn';
process.env.SMTP_URL = 'smtp://localhost:1025';
await import('../src/server.js');
