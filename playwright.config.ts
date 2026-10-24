import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, STORYBOOK_PORT } from './playwright.ports.ts';

// Playwright runs against the built Storybook, served as static files, and the e2e build of the app.
// Browsers per SRS NFR-QA-001: Chrome and Edge. CI (.github/workflows/ci.yml): a pull request runs only the specs it
// added or changed, in Chrome; a push to main and the nightly run take the whole Chrome suite; a manual run adds Edge and
// the pixel visual specs. The tests live in e2e/. The pixel visual specs (*.visual.spec.ts) run in Chrome only (their
// baselines are Linux Chrome renderings) and never block (Afik 24.10): every blocking CI job sets E2E_SKIP_VISUAL=true and
// the manual job `browser-visual` runs them as a warning. What blocks instead is layer 1, e2e/layout-rules.spec.ts.
const PORT = STORYBOOK_PORT;
const isCi = process.env['CI'] !== undefined;
// E2E_SKIP_VISUAL=true leaves the visual specs out of the chrome project (by file name, not by title).
const VISUAL_SPECS = /\.visual\.spec\.ts$/;
const skipVisual = process.env['E2E_SKIP_VISUAL'] === 'true';

export default defineConfig({
  testDir: './e2e',
  // Timeouts and parallelism (P3, 18.10.2026), measured on main's CI (runs 39059353456, 39069774455):
  // - Per test, by type. Story/axe and app-flow tests take at most 4 s on CI, so they keep the 30 s default (a hang is
  //   reported, not hidden). The build tests keep their own 240/300 s (e2e/app-shell-guard-*.spec.ts; at most 114 s).
  // - Parallelism is per file, never global fullyParallel: only a file whose tests share no state, hooks or order opts
  //   in with test.describe.configure({ mode: 'parallel' }) (today e2e/a11y.spec.ts), so its tests share the workers of
  //   their shard. Shards are split by test count in file order (no hand-made file lists: a new file is never dropped).
  // - Ten shards, not five (24.10): Playwright deals shards as contiguous runs of files by test COUNT, and the files from
  //   a to j are app flows that cost ~1.4 s a test against ~0.4 s for the story files after them, so with five shards
  //   shard 2 took 12.2 min (718 tests) while shards 3 and 4 took 6 and 6.7 (main run 40077357689) and sometimes hit
  //   the globalTimeout; with eight the slowest still took 11.5 min (CI 40094702922: app-shell-guard-stories alone 6 min).
  //   Smaller runs shrink that spread; the timeout is unchanged.
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
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' }, ...(skipVisual ? { testIgnore: VISUAL_SPECS } : {}) },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' }, testIgnore: VISUAL_SPECS },
  ],
  webServer: [
    {
      command: `node tools/serve-static.mjs apps/web/storybook-static ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !isCi,
    },
    // The app itself, built in the e2e mode (test-only session source), for the app flows.
    {
      command: `npm run build:e2e -w @nestly/web && npm run preview:e2e -w @nestly/web -- --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: !isCi,
      timeout: 180_000,
    },
  ],
});
