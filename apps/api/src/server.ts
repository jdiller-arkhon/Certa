import { createPool } from '@certa/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { smtpMailer } from './lib/mailer.js';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const app = await buildApp({ config, pool, mailer: smtpMailer(config.SMTP_URL, config.MAIL_FROM) });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: config.HOST });
