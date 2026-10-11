/**
 * Background worker: pg-boss consumers for alerts, digests, imports, exports, and enrichment.
 * Runs the daily expiry-alert digest (07:00 America/Denver) and a heartbeat.
 */
import { createPool } from '@certa/db';
import pino from 'pino';
import { loadConfig } from './config.js';
import { runExpiryAlerts } from './jobs/expiry-alerts.js';
import { createQueue } from './jobs/queue.js';
import { smtpMailer } from './lib/mailer.js';

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
const boss = createQueue(config.DATABASE_URL);
boss.on('error', (err) => log.error({ err }, 'queue error'));

await boss.start();
await boss.createQueue('heartbeat');
await boss.schedule('heartbeat', '*/5 * * * *');
await boss.work('heartbeat', async () => {
  log.info('heartbeat');
});

const pool = createPool(config.DATABASE_URL, 4);
const mailer = smtpMailer(config.SMTP_URL, config.MAIL_FROM);
await boss.createQueue('expiry-alerts');
await boss.schedule('expiry-alerts', '0 7 * * *', null, { tz: 'America/Denver' });
await boss.work('expiry-alerts', async () => {
  await runExpiryAlerts({ pool, mailer, publicUrl: config.PUBLIC_URL.replace(/\/+$/, ''), log });
});
log.info('worker started');

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 20_000 });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
