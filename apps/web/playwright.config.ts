import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' } } }],
  webServer: [
    { command: 'pnpm --filter @certa/api exec tsx scripts/e2e-server.ts', url: 'http://localhost:4100/readyz', timeout: 120_000, reuseExistingServer: false, stdout: 'pipe' },
    {
      command: 'API_ORIGIN=http://localhost:4100 npx next build && npx next start --port 3100',
      url: 'http://localhost:3100/sign-in',
      timeout: 300_000,
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
