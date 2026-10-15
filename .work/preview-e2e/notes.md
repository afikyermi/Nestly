# notes - E: automated Preview E2E (build run 1: harness, workflow, guard)

**Approach**  Workflow `.github/workflows/preview-e2e.yml` (deployment_status only, same `if` as preview-smoke, `environment:
preview-e2e`, `concurrency: preview-e2e` no cancel, `permissions: contents: read`, checkout of `github.event.deployment.sha`,
Chrome only). URL guard first (`tools/preview-e2e-url-guard.ts`, CLI; rule in `tools/preview-e2e-url-check.ts`, pure, also
imported by the Playwright config, which re-checks). The bypass secret is in the env of the one Playwright step. The job
timeout is 20 min, the Playwright step 12. A final `if: always()` Summary step says plainly that test users are NOT yet
deleted (DR-E1 pending). No cleanup, sweep, DB URL or admin key anywhere; nothing matches `SUPABASE_SECRET`.

**Harness API** (TEST ENGINEER writes `e2e-preview/<feature>.flow.ts`, e.g. `password-recovery.flow.ts`)
```ts
import { test, expect } from './support/fixtures.ts';   // never from @playwright/test
test('...', async ({ page, testUser, recoveryAttempts }) => {
  await page.goto('/register');            // relative: baseURL is the validated Preview URL
  testUser.email; testUser.password;       // nestly-e2e-<run>-<attempt>-<16hex>@gmail.com; base64url, 24 chars
  testUser.answers.pet; testUser.answers.nickname;   // random 12 hex; RECOVERY_QUESTION_IDS = pet, nickname
  recoveryAttempts.recordFailedAttempt(testUser.email);  // call BEFORE each wrong /recovery submit; 5th throws
});
```
- `testUser` and `recoveryAttempts` are worker-scoped: one user per project (375 and 1280), shared by all tests of that
  project, so the flow steps 1-6 can be serial tests or one test using the same user. `workers: 1`, `fullyParallel: false`.
- `context`/`page` already route the deployment origin with the bypass headers (`support/bypass.ts`); other hosts untouched.
- Exports for unit tests: `tools/preview-e2e-url-check.ts` `checkDeploymentUrl`; `support/test-user.ts` `TEST_EMAIL_REGEX`,
  `TEST_EMAIL_PATTERN`, `generateTestUser(runId, runAttempt)` (throws unless both numeric); `support/recovery-attempts.ts`
  `createRecoveryAttempts`, `MAX_FAILED_RECOVERY_ATTEMPTS` (4); `support/bypass.ts` `createBypassRouteHandler(origin, secret)`.
- Config `e2e-preview/playwright.config.ts`: testDir `.`, testMatch `**/*.flow.ts`, retries 0, timeout 90 s, projects
  `mobile-375` / `desktop-1280` (Chrome channel), video/trace/screenshot off, reporter list. Run needs `PREVIEW_E2E_BASE_URL`,
  `VERCEL_AUTOMATION_BYPASS_SECRET`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`.
- Root config `testDir: ./e2e`, so `npm run e2e`/CI never see `e2e-preview/`. `tsconfig.e2e-preview.json` is new, added to
  `npm run typecheck` and to the ESLint project list.

**Decisions**  Node strips the .ts types at run time (engines >= 22.22), so the guard CLI needs no build; the check lives in
its own file because Playwright loads the config as CommonJS and `import.meta` would fail there. The bypass secret is deleted
from `process.env` in the worker right after reading, so flow code cannot read it (spec criterion 11 says flows must not
see the secrets; the Playwright process itself must receive the bypass, so "not in its env" is met only per worker).

**Deviations**  No unit-test file written: the BUILDER hook forbids writing tests, and none was added to `test:tools`.
Verified by hand instead: tsc and eslint clean; guard CLI exit 0/1 and GITHUB_OUTPUT; generator regex; 5th attempt throws;
config loads and refuses a bad URL; the YAML parses with `tools/workflow-yaml.mjs`; preview-smoke and ci-path-filters tests pass.
TEST ENGINEER should cover criteria 1, 2, 12 (YAML/config), 3, 4 (stubbed route, per-host), 5, 7 and add the file to `test:tools`.

**Deliberately not done**  cleanup, sweep, DB connection, criteria 8-9 (DR-E1); the F1.6 flow; commit status/check run (A3).

**Uncertain**  (1) Cloud: `with: ref: ${{ github.event.deployment.sha }}` runs PR code with the environment's secret; the
`preview-e2e` environment protection is the control. (2) `route.fetch` with `maxRedirects: 0` is copied from preview-shot;
untested against a real Vercel protection page here. (3) `.nvmrc` is 22.22, type stripping default on from 22.18.
(4) Not run: the workflow itself, Chrome install, any flow.

**Preview path**  Nothing to click yet. First real run: push, wait for the Vercel Preview, check `gh pr checks` shows
`preview-e2e`; with no flow file it will fail "No tests found" - expected until the F1.6 flow exists.

**Neighbouring**  `node --test tools/critic-diff.test.mjs` fails 9 of 9 here ("tools/critic-diff.mjs is missing", and
`.claude/hooks/notes-name.js` not found) - not caused by this change; it appeared in output of an earlier command, check.
