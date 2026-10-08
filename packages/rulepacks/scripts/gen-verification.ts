import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllPacks, renderVerificationDoc } from '../src/index.js';

const out = join(import.meta.dirname, '..', '..', '..', 'docs', 'RULES_VERIFICATION.md');
const doc = renderVerificationDoc(loadAllPacks().map((p) => p.pack));
if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8');
  if (current !== doc) {
    console.error('docs/RULES_VERIFICATION.md is stale. Run `pnpm rules:verify-doc`.');
    process.exit(1);
  }
} else {
  writeFileSync(out, doc);
  console.log(`Wrote ${out}`);
}
