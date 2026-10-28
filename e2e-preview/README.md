# e2e-preview

Flows that run against a deployed Preview (workflow `preview-e2e`), on Chrome at 1280x800; the few whose steps or assertions depend on the
screen size run at 375x812 too (see "Screen sizes").

- One file per feature: `e2e-preview/<feature>.flow.ts`. The config finds them by glob; no workflow edit.
- By hand, `preview-e2e` can walk some flows alone: input `flows` (names without `.flow.ts`, space-separated) and
  `project` (`both`, `desktop-1280`, `mobile-375`). Used once per merge when the full walk stopped before a feature's flow.
  `mobile-375` with a flow that is not a phone flow finds no test and fails.
- Import `test` and `expect` from `./support/fixtures.ts`, never from `@playwright/test`.
- Fixtures: `testUser` (own email, password, answers per viewport), `recoveryAttempts`, `baseURL`; use relative `page.goto`.
- Real Auth, real server. Create users only through the app; the email pattern is `support/test-user.ts`.
- Call `recoveryAttempts.recordFailedAttempt(email)` before each wrong /recovery submission (max 4 per user).
- No secrets, no logging of password or answers, no video, trace or screenshots. Retries are off. A run stops after 5 failures.
- Before any flow, a pre-check (`support/preflight.ts`) times `GET /api/health` and one refused sign-in of an unknown pattern email
  (no user is made). Either above 10 s, or a wrong answer, stops the run with the reason: the Preview is too slow to walk.
- One sign-in per serial group: a later test that does not check the sign-in itself continues with the session its group's sign-up
  kept (`support/session.ts`: `keepSession` at the end of a test, `resumeSession(page, key, path)` at the start of the next).
- Test users are deleted after each run by `preview-e2e-cleanup` (workflow_run, main's code; DR-E1). Flows never clean up.
- **A branch before its merge** (Afik 28.10.2026): dispatch `preview-e2e` with input `branch` (and `flows` / `project` as usual). The branch's
  tree is deployed through `ready/preview-check`; the flows and every step that holds a secret are main's code, so a branch's changed
  flows are not used until they are merged. A branch that is `main` or under `ready/` is refused.
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
  created by the CI job with the cleanup credential (same email pattern, so the cleanup deletes it with the run).
  Afik approved the temporary setup/cleanup on 23.10: two separate viewport Moderators, CONTENT_MODERATE only; REPORTS_VIEW was added on 24.10 for staff-rules.flow's report queue (awaiting Afik's confirmation);
  a trusted-main setup checkout, main-restricted `preview-e2e` environment, and one setup step holding the DB credential.
  `staffUser` supplies generated credentials from a private runner-temp file removed after the flows. The normal
  recovery-question gate is completed through the app. Cleanup removes only the locked pattern actor's Audit rows,
  disabling/re-enabling only the append-only trigger within that same transaction; Production is excluded by the URL guard.
  A flow never creates staff through the app and never uses a real staff account.
- **The strict-query trap (#147):** Vercel's rewrite `/api/:path*` → `/api/index` adds a `path` query parameter. A
  route whose query schema is strict answers 400 on the Preview and in Production, though the local server and stubs
  pass. Every new route with a query goes through a flow on the Preview (see `strict-query.flow.ts`); its schema
  must accept `path`.

## Screen sizes (Afik 26.10, performance plan N T5)

- A flow runs at 1280x800 only, unless its steps or assertions depend on the screen size: then it is listed in `PHONE_FLOWS`
  (`playwright.config.ts`) and runs at 375x812 too. The app's content and controls are the same at both sizes except the search
  (an icon that opens /search on a phone, a field in the top bar from 768 px); navigation and the menu move by CSS only.
- Phone flows today: `srs-audit` (People Search through the phone's top-bar icon).
- A new flow that checks a layout (what shows or hides at a width, a control reached differently on a phone) adds itself to the list.
