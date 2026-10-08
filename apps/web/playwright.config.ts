import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Default: starts a fresh API (:4100) and a production web build (:3100), both under /certa —
 * the same base path as the hosted app on the Arkhon website.
 * E2E_BASE_URL=http://localhost:8080/certa/ runs the same tests against a running stack.
 * Tests use relative paths ('sign-up', not '/sign-up') so the base path is preserved.
 */
const external = process.env.E2E_BASE_URL;
const BASE = '/certa';
// Use a preinstalled Chromium when present (cloud dev containers); otherwise Playwright's own.
const chromium = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: external ?? `http://localhost:3100${BASE}/`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(chromium ? { launchOptions: { executablePath: chromium } } : {}) } }],
  webServer: external ? [] : [
    { command: `E2E_PUBLIC_URL=http://localhost:3100${BASE} pnpm --filter @certa/api exec tsx scripts/e2e-server.ts`, url: 'http://localhost:4100/readyz', timeout: 120_000, reuseExistingServer: false, stdout: 'pipe' },
    {
      // basePath is read from next.config at both build and start, so the env applies to both.
      command: 'npx next build && npx next start --port 3100',
      url: `http://localhost:3100${BASE}/sign-in`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: '1', API_ORIGIN: 'http://localhost:4100', NEXT_PUBLIC_BASE_PATH: BASE },
    },
  ],
});
