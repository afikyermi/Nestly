# notes — preview access for checks (Afik, 14.10.2026)

**Approach**
- `.github/workflows/preview-smoke.yml`: on `deployment_status` (state success, environment `Preview`, creator
  `vercel[bot]`), one step: curl with the bypass header from stdin (`-H @-`), no `-L`, `--proto =https`. Health must be
  200 with `{"status":"ok"}`; protected `/api/anything` 401 `unauthenticated` or 503 `unavailable`.
- `tools/preview-shot.mjs`: screenshot of a protected preview; the secret goes only as a header, only to the target
  origin, through one Playwright route (not extraHTTPHeaders), never printed.
- After CRITIC (14.10, findings 1-4), this round: the secret reader has no default path; the target is confirmed against
  GitHub before the secret is read; the server drops the bypass header; `shoot()`/`main()` take injected dependencies.

**Decisions**
- Protected check matches the body too, so Vercel's own 401/302 cannot pass for the server's answer. A wrong bypass
  makes Vercel answer 302 to its login: both checks fail (fail closed).
- Hosts: unique deployment URL `nestly-<hash>-afikyermis-projects.vercel.app` (hyphen-free hash), no branch aliases;
  production alias `nestly-blue.vercel.app` in the tool only.
- Finding 1: `readSecret(file)` requires a path (TypeError without one). `envFilePath(env)` and `DEFAULT_ENV_FILE`
  stay exported (a path, not a reader); only `main()` resolves the default.
- Finding 3: `confirmTarget(target, lookup)` after the host pattern, before the secret: the origin must equal the
  `environment_url` or `target_url` of a status by `vercel[bot]` on `afikyermi/Nestly`, among the last 40
  deployments (newest first, statuses 10 each, early exit). `gh api` through execFile, no shell; candidates `gh`, then
  `C:\Program Files\GitHub CLI\gh.exe` on Windows; ENOENT on all = Refused. Lookup failure or a non-list = Refused.
- Finding 2: `plugins/strip-bypass-header.ts`, first `onRequest` hook (before authentication), deletes the header
  from `raw.headers` and `raw.rawHeaders`. The logger is off by default and Fastify's request serializer logs no
  headers. Seam: `buildApp({ logStream })` turns the logger on for a test.
- Finding 4 seam: `shoot(args, launch = launchChromium)` clears DEBUG vars, then calls `launch()`; `main(argv, deps)`
  returns the exit code, `deps` = env, lookup, launch, stdout, stderr. The CLI wrapper sets `process.exitCode`.
- curl takes the header from stdin; `--width` default 1024; status reported is the first response of the chain.
- Brief said `extraHTTPHeaders`: not used (sent to every host the page loads from; override follows redirects).

**Deliberately not done**
- Server tests for finding 2 and the finding-4 tests: the guard blocks BUILDER from writing test files. For TEST
  ENGINEER: reflect `request.headers` and `raw.rawHeaders` in an `onSend` hook, send the header in two cases on a
  public and a protected route, assert it is absent; build the app with `logStream` and assert no line holds the
  value or the header name. (Checked by hand with tsx: header absent, nothing logged.)
- Finding 5 (a deployed branch can bring its own workflow): accepted debt. Finding 6: check after the push.

**Uncertain**
- Whether Vercel's `target_url`/`environment_url` for a preview is always the unique deployment URL (seen on the last
  statuses); if it is a branch alias, the tool refuses that alias anyway by the host pattern.
- `gh` unauthenticated or rate-limited = the tool refuses (by design); the CLI tests in `preview-shot.test.mjs` that
  reach the lookup now call the real `gh` (suite went from seconds to ~95 s).

**Preview path**
- Workflow: push with an open PR, Actions, preview-smoke: `GET /api/health -> 200`, `GET /api/anything -> 401`.
- Tool, from the checkout holding the secret file: `node tools/preview-shot.mjs https://<deployment>.vercel.app/ shot.png --width 375`.

**Neighbouring**
- `tools/preview-shot.test.mjs:109`, [PS-2] asserts `readSecret()` with no argument reads PREVIEW_SHOT_ENV_FILE. That
  contradicts finding 1 and now fails (TypeError). TEST ENGINEER to change; I did not touch the file.
- The [PS-7] child-process tests with a valid-looking host now go through the real lookup; give them `main(argv,
  { lookup })` instead.
