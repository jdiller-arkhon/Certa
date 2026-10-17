/**
 * One-shot expiry-alert run, then exit. Cloudflare Containers sleep when idle, so instead of the
 * always-on worker's schedule, a Cron Trigger starts this once a day. Safe to run twice: the
 * delivery ledger skips alerts already sent.
 */
import { createPool } from '@certa/db';
import pino from 'pino';
import { loadConfig } from './config.js';
import { runExpiryAlerts } from './jobs/expiry-alerts.js';
import { smtpMailer } from './lib/mailer.js';
import { createPusher } from './lib/push.js';

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, base: { service: 'alerts' } });
const pool = createPool(config.DATABASE_URL, 2);
try {
  await runExpiryAlerts({ pool, mailer: smtpMailer(config.SMTP_URL, config.MAIL_FROM), pusher: createPusher(config), publicUrl: config.PUBLIC_URL.replace(/\/+$/, ''), log });
  log.info('expiry alerts done');
} finally {
  await pool.end();
}
