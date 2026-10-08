/**
 * Writes contract/openapi.yaml from the live Fastify route schemas (which come from @certa/core
 * Zod schemas), so the spec cannot drift from the code. `--check` fails if the file is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryMailer } from '../src/lib/mailer.js';
import pg from 'pg';

const config = loadConfig({
  DATABASE_URL: 'postgres://unused@localhost/unused',
  AUTH_SECRET: 'openapi-generation-only-openapi-generation-only',
  LOG_LEVEL: 'silent',
});
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const app = await buildApp({ config, pool, mailer: new MemoryMailer() }, { logger: false });
await app.ready();
const spec = stringify(app.swagger(), { sortMapEntries: false, lineWidth: 0 });
await app.close();
await pool.end();

const out = join(import.meta.dirname, '..', '..', '..', 'contract', 'openapi.yaml');
const header = '# GENERATED from apps/api route schemas by `pnpm contract:gen`. Do not edit by hand.\n';
const doc = header + spec;
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== doc) {
    console.error('contract/openapi.yaml is stale. Run `pnpm contract:gen`.');
    process.exit(1);
  }
} else {
  writeFileSync(out, doc);
  console.log(`Wrote ${out}`);
}
