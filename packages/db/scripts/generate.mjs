// Wraps `drizzle-kit generate`, then unquotes parameterised custom types that drizzle-kit
// wraps in quotes ("geography(Point, 4326)"), which Postgres rejects.
// Usage: pnpm generate --name <migration_name>
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

execFileSync('drizzle-kit', ['generate', ...process.argv.slice(2)], { stdio: 'inherit' });
const dir = new URL('../migrations/', import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  const out = src.replace(/"(geography\([A-Za-z]+, 4326\))"/g, '$1');
  if (out !== src) writeFileSync(new URL(f, dir), out);
}
