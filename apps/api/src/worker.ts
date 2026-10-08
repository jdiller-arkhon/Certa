/**
 * Background worker: pg-boss consumers for alerts, digests, imports, exports, and enrichment.
 * Phase 1 registers only a heartbeat; feature jobs arrive in their phases.
 */
import pino from 'pino';
import { loadConfig } from './config.js';
import { createQueue } from './jobs/queue.js';

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
log.info('worker started');

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 20_000 });
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
