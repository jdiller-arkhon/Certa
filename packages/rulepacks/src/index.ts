import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRulePack, type RulePack } from '@certa/core';
import { parse } from 'yaml';

/** Directory holding `<jurisdiction>/<version>.yaml` pack files. */
export const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs');

export interface PackFile {
  path: string;
  pack: RulePack;
}

export function loadPackFile(path: string): RulePack {
  return validateRulePack(parse(readFileSync(path, 'utf8')));
}

/** Loads and validates every pack shipped with Certa. Throws on any invalid pack. */
export function loadAllPacks(dir = PACKS_DIR): PackFile[] {
  const out: PackFile[] = [];
  for (const jurisdiction of readdirSync(dir, { withFileTypes: true })) {
    if (!jurisdiction.isDirectory()) continue;
    for (const file of readdirSync(join(dir, jurisdiction.name))) {
      if (!file.endsWith('.yaml')) continue;
      const path = join(dir, jurisdiction.name, file);
      const pack = loadPackFile(path);
      if (pack.jurisdiction !== jurisdiction.name || `${pack.version}.yaml` !== file)
        throw new Error(`${path}: file location must match jurisdiction/version (${pack.jurisdiction}/${pack.version})`);
      out.push({ path, pack });
    }
  }
  return out.sort((a, b) =>
    a.pack.jurisdiction.localeCompare(b.pack.jurisdiction) || compareSemver(a.pack.version, b.pack.version),
  );
}

export function latestPack(jurisdiction: string, dir = PACKS_DIR): RulePack {
  const packs = loadAllPacks(dir).filter((p) => p.pack.jurisdiction === jurisdiction);
  const last = packs.at(-1);
  if (!last) throw new Error(`No rule pack for ${jurisdiction}`);
  return last.pack;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export { renderVerificationDoc } from './verification.js';
