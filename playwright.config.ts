import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, STORYBOOK_PORT } from './playwright.ports.ts';

// Playwright runs against the built Storybook, served as static files (UI wave 1).
// Browsers per SRS NFR-QA-001: Chrome and Edge. Pull requests run Chrome only; Edge runs after a merge to main and on
// demand (decisions/2026-10.md "Tests: depth by criterion type"). The tests live in e2e/. Visual regression
// (*.visual.spec.ts) runs in Chrome only: its baselines are Linux Chrome renderings.
const PORT = STORYBOOK_PORT;
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './e2e',
  // Timeouts and parallelism (P3, 18.10.2026), measured on main's CI (runs 39059353456, 39069774455):
  // - Per test, by type. Story/axe and app-flow tests take at most 4 s on CI, so they keep the 30 s default (a hang is
  //   reported, not hidden). The build tests keep their own 240/300 s (e2e/app-shell-guard-*.spec.ts; at most 114 s).
  // - Parallelism is per file, never global fullyParallel: only a file whose tests share no state, hooks or order opts
  //   in with test.describe.configure({ mode: 'parallel' }) (today e2e/a11y.spec.ts), so its tests share the workers of
  //   their shard. Shards are split by test count in file order (no hand-made file lists: a new file is never dropped).
  // - On CI the run ends itself before the job's timeout-minutes, so a hang still reports and uploads its report.
  timeout: 30_000,
  globalTimeout: isCi ? 13 * 60_000 : 0,
  // - Workers: Playwright's default (half the CPUs: 2 on the 4-vCPU runner). Three were measured in P3 on the same 2,312
  //   tests: each test ran ~35-40% slower and the slowest shard gained ~40 s, within run-to-run noise; not kept.
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  // One baseline per screen and size, no OS or project in the name: CI (Linux Chrome) is the only place baselines are made.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // Starts tight (about 150 px at 375x812). Raised only after a flake observed on CI and recorded in decisions.md; nothing is masked.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.0005 } },
  // A missing baseline is a failure, never silently written (the default 'missing' would pass the first run).
  updateSnapshots: 'none',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' }, testIgnore: /\.visual\.spec\.ts$/ },
  ],
  webServer: [
    {
      command: `node tools/serve-static.mjs apps/web/storybook-static ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !isCi,
    },
    // The app itself, built in the e2e mode (test-only session source), for the I1 F1.2 flows.
    {
      command: `npm run build:e2e -w @nestly/web && npm run preview:e2e -w @nestly/web -- --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: !isCi,
      timeout: 180_000,
    },
  ],
});
