// Renders PNG exports from the SVGs built by build.py (headless Chromium, transparent background).
//   node brand/render.mjs
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
  for (const s of [1024, 512, 192, 180, 64, 32, 16]) await png(join(d, `${p}-app-icon.svg`), join(o, `${p}-app-icon-${s}.png`), s);
  await png(join(d, `${p}-app-icon-maskable.svg`), join(o, `${p}-app-icon-maskable-512.png`), 512);
  await png(join(d, `${p}-mark.svg`), join(o, `${p}-mark-512.png`), 512);
  await png(join(d, `${p}-mark-white.svg`), join(o, `${p}-mark-white-512.png`), 512);
  for (const v of ['', '-white']) {
    const svg = readFileSync(join(d, `${p}-lockup${v}.svg`), 'utf8');
    const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    await png(join(d, `${p}-lockup${v}.svg`), join(o, `${p}-lockup${v}@4x.png`), Math.round(w * 4), Math.round(h * 4));
  }
}
await browser.close();
console.log('rendered PNGs');
