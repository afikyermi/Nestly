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

## The main flow

- **The main flow = the action plus checking its result from another user's side** (or the staff's): a post is
  seen by a friend, a chat message arrives, a report reaches the staff and its decision reaches the reported content.
  An action checked only by the user who did it is not the main flow.
- **A Regular user:** sign up through `/register` (stage, name, step 2, the recovery answers), as in
  `staff-work.flow.ts`.
- **A Professional:** `/register` → "נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי", the qualification declaration, then
  step 2 — as in `professional-followups.flow.ts`. Its pages are under `/pro/*`.
- **A staff user (Moderator / Admin): only on the Preview, never on Production** (Afik, 21.10, decision §10.1). It is
  created by the CI job with the cleanup credential (same email pattern, so the cleanup deletes it with the run), with
  the permissions the flow needs. A flow never creates staff through the app and never uses a real staff account.
- **The strict-query trap (#147):** Vercel's rewrite `/api/:path*` → `/api/index` adds a `path` query parameter. A
  route whose query schema is strict answers 400 on the Preview and in Production, though the local server and stubs
  pass. Every new route with a query goes through a flow on the Preview (see `strict-query.flow.ts`); its schema
  must accept `path`.
