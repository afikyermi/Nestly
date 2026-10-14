# notes — preview access for checks (Afik, 14.10.2026)

**Approach**
- `.github/workflows/preview-smoke.yml`: on `deployment_status`, job runs only when state is `success`, environment
  is `Preview` and the status creator is `vercel[bot]`. One step, no checkout, no install. It checks the target URL
  against `^https://nestly-[a-z0-9-]+-afikyermis-projects\.vercel\.app/?$` before building any header, then makes two
  GETs with curl reading the bypass header from stdin (`-H @-`), no `-L`, `--proto =https`. Health: 200 and body
  equal to `{"status":"ok"}` (jq). Protected `/api/anything`: 401 with `{"error":"unauthenticated"}` or 503 with
  `{"error":"unavailable"}`; anything else fails.
- `tools/preview-shot.mjs`: same shape as `tools/db-preview.mjs`. Exports `parseSecret`, `readSecret`,
  `checkTarget`, `createRouteHandler`, `parseArgs`, `envFilePath`, `scrubber`, `Refused` and the constants. `PREVIEW_SHOT_ENV_FILE`
  overrides the secret file path.

**Decisions**
- The protected check also matches the body, so a 401 from Vercel's protection (or its 302 to login) cannot pass for
  the server's own answer. Observed on 14.10: a wrong bypass makes Vercel answer **302** to vercel.com/login, so with
  a bad secret both checks fail (fail closed).
- The URL rule is the deployment-URL shape Vercel posts (`nestly-<hash>-afikyermis-projects.vercel.app`, seen on the
  GitHub deployment statuses), with a hyphen-free hash. The tool also accepts the production alias
  `nestly-blue.vercel.app`; the workflow does not (it never runs on Production).
- Fix after review (CRITIC, high): the first rule allowed hyphens, so it matched a team whose slug ends in
  `-afikyermis-projects`, and branch aliases are ambiguous (`nestly-git-x-evil-afikyermis-projects`). Branch aliases
  are now refused in both; use the unique deployment URL.
- Fix after review (medium): the route handler is the exported factory `createRouteHandler(targetOrigin, secret)`,
  so a test can pass a fake route. No behaviour change.
- curl takes the header from stdin so the secret is never in a process argument list.
- The job-level `if` also requires `creator.login == 'vercel[bot]'`, so a deployment status posted by anyone else does
  not run a step holding the secret.
- `--width` default 1024 (the brief gave the two values, not a default). Viewport heights 812 / 768; screenshot is
  full-page, so the height only shapes the first paint.
- The tool reports the status the given URL answered (first response of the redirect chain), not the final page:
  with a rejected bypass the final page is Vercel's login, which answers 200.

**Deviations**
- Brief said `extraHTTPHeaders`. Not used: Playwright sends extraHTTPHeaders to every host the page loads from
  (fonts, CDNs, a redirect target), and its `route.continue({ headers })` override also follows redirects. Instead
  one `context.route('**/*')`: same-origin requests are fetched with `route.fetch({ headers, maxRedirects: 0 })` and
  fulfilled; other origins `route.continue()` untouched. `serviceWorkers: 'block'` so nothing bypasses the route.
- Extra refusals not in the brief: user/password or port in the URL; the bypass parameter in the query string; an
  output name starting with `.env`; a secret that is not printable ASCII without spaces (header injection).
- Exit 1 also when the page ended on another host (the bypass was not accepted).

**Deliberately not done**
- No test files (TEST ENGINEER). No README/WORKPLAN changes.
- The workflow has no retry on cold start.

**Uncertain**
- The key name in Afik's file: I assumed `VERCEL_AUTOMATION_BYPASS_SECRET=<value>` (export and quotes accepted). I
  cannot read the file. If he wrote a bare value, the tool refuses with a message naming the expected line.
- The success path with the real secret is untested: the file sits at the main checkout root, and the tool reads the
  root of the checkout it runs from. Run with a fake secret against a live preview: status 302, exit 1, screenshot of
  Vercel's login page, nothing printed beyond status/path/the off-host line.
- Whether Vercel could ever let another account own a `*-afikyermis-projects.vercel.app` name. I believe the team
  suffix is reserved; if not, the host rule is weaker than it looks.
- Whether `deployment_status.environment` stays exactly `Preview` (seen on the last statuses). If Vercel changes it,
  the job silently does not run — a skipped check, not a leak.
- Playwright's handling of a fulfilled 3xx: observed working (the redirect to vercel.com was followed and the chain
  was readable via `redirectedFrom`).

**Preview path**
- Workflow: push the branch with an open PR → Vercel posts a Preview deployment_status → Actions → preview-smoke →
  two lines `GET /api/health -> 200`, `GET /api/anything -> 401` (or 503 while auth config is missing in Vercel).
  Note: deployment_status runs the workflow file from the deployed commit, so it only exists for commits that contain
  it.
- Tool (from the main checkout, where `.env.vercel` is):
  `node tools/preview-shot.mjs https://<deployment>.vercel.app/ shot.png --width 375` → `status: 200`, `saved: shot.png`.
  Needs the Playwright Chromium build (`npx playwright install chromium`) if it is not already installed.

**Neighbouring**
- none
