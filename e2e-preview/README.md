# e2e-preview

Flows that run against a deployed Preview (workflow `preview-e2e`), on Chrome at 375x812 and 1280x800.

- One file per feature: `e2e-preview/<feature>.flow.ts`. The config finds them by glob; no workflow edit.
- Import `test` and `expect` from `./support/fixtures.ts`, never from `@playwright/test`.
- Fixtures: `testUser` (own email, password, answers per viewport), `recoveryAttempts`, `baseURL`; use relative `page.goto`.
- Real Auth, real server. Create users only through the app; the email pattern is `support/test-user.ts`.
- Call `recoveryAttempts.recordFailedAttempt(email)` before each wrong /recovery submission (max 4 per user).
- No secrets, no logging of password or answers, no video, trace or screenshots. Retries are off.
- Test users are deleted after each run by `preview-e2e-cleanup` (workflow_run, main's code; DR-E1). Flows never clean up.
- Run: `npx playwright test -c e2e-preview/playwright.config.ts` with `PREVIEW_E2E_BASE_URL`,
  `VERCEL_AUTOMATION_BYPASS_SECRET`, `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT` set.
