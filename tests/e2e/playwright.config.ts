import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Heritage E2E suite.
 *
 * Targets the deployed prod URL by default. Override via:
 *   E2E_BASE_URL=https://staging.example.com pnpm e2e
 *
 * Specs run serially (not fully parallel) because:
 *   - RL_LOGIN_IP is 20/min per IP (tenant-global) and would trip with
 *     concurrent login specs from the same runner.
 *   - Some specs mutate shared D1 state (tree-shares, sessions) and benefit
 *     from deterministic ordering.
 */

const baseURL = process.env.E2E_BASE_URL ?? 'https://heritage.jairukchan.com';

export default defineConfig({
  testDir: './',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [['list']] : [['list'], ['html', { open: 'never' }]],

  globalTeardown: './helpers/global-teardown.ts',

  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Emit a bit of verbosity in console captured by Playwright; specs add their own listeners
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
