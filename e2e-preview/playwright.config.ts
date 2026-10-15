// Playwright config for the preview-e2e workflow only. Separate from the root config, whose testDir is ./e2e: neither
// the root `playwright test` nor CI's browser job runs this folder, and this never runs e2e/.
// Run: npx playwright test -c e2e-preview/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { checkDeploymentUrl } from '../tools/preview-e2e-url-check.ts';

const checked = checkDeploymentUrl(process.env['PREVIEW_E2E_BASE_URL']);
if (!checked.ok) throw new Error(`preview-e2e config: ${checked.reason}`);

// The JSON report feeds the workflow summary (passed/failed per project). Written only when the workflow names a file,
// which sits in the runner's temp dir and is never uploaded.
const reportFile = process.env['PREVIEW_E2E_REPORT_FILE'];

// No video, trace or screenshots: they could capture credentials. retries 0: a retry would create another user and mask
// a flake. One worker, so a project's user and its failed-attempt counter live in one process.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.flow.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalSetup: './support/global-setup.ts',
  reporter: reportFile === undefined || reportFile === '' ? 'list' : [['list'], ['json', { outputFile: reportFile }]],
  use: { baseURL: checked.base, video: 'off', trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 375, height: 812 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 800 } } },
  ],
});
