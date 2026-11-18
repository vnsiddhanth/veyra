import { defineConfig } from '@playwright/test';

/**
 * Real-browser media tests.
 * - chrome / msedge: the locally installed browsers (the supported targets; must pass).
 * - firefox / webkit: Playwright's builds (`npx playwright install firefox webkit`). Run explicitly with
 *   `--project=firefox` / `--project=webkit` to measure cross-engine support; results are recorded in
 *   BROWSER_COMPATIBILITY.md. Playwright's WebKit on Windows is not Safari and lacks some media features.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'msedge', use: { channel: 'msedge' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
