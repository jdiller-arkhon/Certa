// drizzle-kit quotes parameterised custom types ("geography(Point, 4326)"), which Postgres
// rejects. Unquote them in generated migrations. Run automatically after `pnpm generate`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../migrations/', import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  const out = src.replace(/"(geography\([A-Za-z]+, 4326\))"/g, '$1');
  if (out !== src) writeFileSync(new URL(f, dir), out);
}
