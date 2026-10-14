import { defineConfig, devices } from '@playwright/test';

// Playwright runs against the built Storybook, served as static files (UI wave 1).
// Browsers per SRS NFR-QA-001: Chrome and Edge. The tests live in e2e/.
const PORT = 6007;
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
  ],
  webServer: [
    {
      command: `node tools/serve-static.mjs apps/web/storybook-static ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !isCi,
    },
    // The app itself, built in the e2e mode (test-only session source), for the I1 F1.2 flows.
    {
      command: 'npm run build:e2e -w @nestly/web && npm run preview:e2e -w @nestly/web',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !isCi,
      timeout: 180_000,
    },
  ],
});
