// Renders PNG exports from the SVGs built by build.py (headless Chromium, transparent background).
//   node brand/render.mjs
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();

async function png(svgPath, out, width, height = width) {
  const svg = readFileSync(svgPath, 'utf8').replace(/width="[\d.]+" height="[\d.]+"/, `width="${width}" height="${height}"`);
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  mkdirSync(dirname(out), { recursive: true });
  await page.locator('svg').screenshot({ path: out, omitBackground: true });
}

for (const p of ['certa', 'argus']) {
  const d = join(here, p);
  const o = join(d, 'png');
  rmSync(o, { recursive: true, force: true });
  for (const s of [1024, 512, 192, 180, 64]) await png(join(d, `${p}-app-icon.svg`), join(o, `${p}-app-icon-${s}.png`), s);
  await png(join(d, `${p}-app-icon-light.svg`), join(o, `${p}-app-icon-light-1024.png`), 1024);
  // Small sizes use the wider-channel variant so the cuts survive pixelation.
  for (const s of [48, 32, 16]) await png(join(d, `${p}-app-icon-small.svg`), join(o, `${p}-app-icon-${s}.png`), s);
  await png(join(d, `${p}-app-icon-maskable.svg`), join(o, `${p}-app-icon-maskable-512.png`), 512);
  for (const v of ['', '-white']) {
    await png(join(d, `${p}-mark${v}.svg`), join(o, `${p}-mark${v}-512.png`), 512);
    for (const kind of ['lockup', 'lockup-endorsed']) {
      const file = join(d, `${p}-${kind}${v}.svg`);
      const [, w, h] = readFileSync(file, 'utf8').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      await png(file, join(o, `${p}-${kind}${v}@4x.png`), Math.round(w * 4), Math.round(h * 4));
    }
  }
}
await browser.close();
console.log('rendered PNGs');
