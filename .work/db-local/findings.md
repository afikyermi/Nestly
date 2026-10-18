# Item 9 (PR 70) — CRITIC findings, round 1 (returned as text; saved verbatim by ORCHESTRATOR)

CRITIC findings, item 9 (branch chore/db-local). One round. I did not read notes.md. I judged the diff against ci.yml, job `db`.

Verdict: no critical or high findings. The tool cannot reach a non-local host, and its shell use is safe. There are 2 medium and 4 low findings.

**Bug list**

1. MEDIUM — tools/db-local.test.mjs:210-219. The order test does not trace to ci.yml, and the spec for item 9 is "same files in same order as CI".
   - The expected arrays in `deepEqual` are copied from the implementation. Only 4 of the SQL paths are checked against ci.yml, using `ci.includes`: auth-functions, image-preflight, pgtap-setup and rls-gate.
   - Nothing checks the position or presence of auth-functions-check, 01-roles or 02-anchor-fk.
   - Scenario: someone reorders or adds a step in ci.yml (a new `supabase/ci/*.sql` step, say). The local tool silently diverges and the tests stay green, so a local pass means nothing.
   - Fix: parse the `psql ... -f <file>` sequence out of the db job in ci.yml. Assert that `setupPlan` is the in-order subsequence of it, minus the documented skips.
   - Fix: assert the skip list explicitly, so a skip cannot grow unnoticed.

2. MEDIUM — README.md:18 and the header of tools/db-local.mjs say "באותו סדר כמו ה-job db" (same order as the db job). That overstates the match. The tool skips these steps:
   - up→down→up of the newest migration, with the fingerprint checks;
   - the second-push-is-a-no-op check (criterion 6);
   - the atomicity probe (criterion 7);
   - running step 2 twice, plus `02-anchor-fk-check.sql`;
   - the Drizzle drift check (`db:drift`, criterion 20);
   - `rls-gate-fire.sql` and `rls-gate-fire-owner.sql`;
   - the RLS gate run as app_server;
   - the pg_prove pgTAP suite;
   - the P6 expand check;
   - the `ok` result of `02-anchor-fk-check`.

   Which skips are acceptable for a `test:db` run?
   - Acceptable: the drift check, rls-gate-fire, the app_server RLS gate, pg_prove, P6, the atomicity probe and the second-push check. None of them is `test:db`; they are other CI gates.
   - Not clearly acceptable: running 02-anchor-fk once, with no check. Any test:db test that relies on the anchor FK is unprotected, and nothing tells the user.
   - Not clearly acceptable: skipping the newest migration's up→down→up. The OWNER_DATABASE_URL tests (F2.3a c6) roll back and re-apply the newest migration, so a missing or broken down script surfaces only in CI.

   Fix: the README and header should say "the setup of the db job, then test:db; not the other gates". They should list the skips and say "CI remains the verdict". Consider also running `02-anchor-fk-check.sql` with an ok assertion, since it is cheap.

3. LOW — tools/db-local.mjs:126. `docker run` is outside the `try`. If the publish fails (for example port 54322 is taken by `supabase start`, or a stale process), a "Created" container named nestly-local-db is left behind. The next run's `down()` removes it, and the error message is clear, so it is harmless. Fix: start the `try` before `docker run`.

4. LOW — tools/db-local.mjs:130-135. The readiness loop never checks whether the container has exited. If the container crashes (a bad image, no memory), the loop spins for about 4+ minutes before failing. Fix: poll `docker inspect -f {{.State.Running}}` and fail fast.

5. LOW — tools/db-local.mjs:149-152. Ctrl-C, or a kill, skips `finally`, so the container stays up on 127.0.0.1:54322 until the next run or `down`. It is local-only and disposable. Fix: a `SIGINT` handler that calls `down()`, or a README line saying so.

6. LOW — tools/db-local.mjs:104-109. The CLI cache at `tmpdir()/nestly-supabase-cli-<ver>`:
   - Only the existence of `dist/supabase.js` is checked. An interrupted install leaves a partial directory that passes the check, and the tool then fails every run until the directory is deleted by hand.
   - On a multi-user machine with a shared /tmp, another user could plant `supabase.js`, which node then executes. This does not apply to single-user Windows.
   - Fix: write a marker file after a successful install, or install into a temp dir and rename it.
   - The bin path `dist/supabase.js` is verified correct for 2.120.0 (checked against the installed package.json).

7. LOW — tools/db-local.test.mjs:221-226. The test reads the tool's own source as text, using regex matches against it. It does not execute anything. It can fail, but it asserts on the code's own text. The real guarantee is `localUrl` and the constant `HOST`, and `localUrl` is tested. The source-text regex is brittle, because a rename of `HOST` breaks it with no behavioural change. Fix: drop it, or move the check onto `localUrl` and an exported docker-args builder. Also assert that the `docker run` publish argument starts with `127.0.0.1:`; today nothing asserts that.

8. LOW — sort order. JS `.sort()` on the setup file names orders by UTF-16 code unit. The CI shell glob uses the runner's locale. The two differ only for names with mixed case or punctuation, and the current files are presumably plain. The test compares against the same `.sort()`, so it cannot detect a divergence. Fix: note it, or use `localeCompare('en')` to match.

**Checked and found fine**
- Reaching a non-local host: the URLs are built only by `localUrl`. It validates the user as `[a-z_]+` and the password as 64 hex characters, and the host is a constant. The publish is bound to `127.0.0.1:`. `psql` runs inside the container via `docker exec`. No env file is read. The child env overrides DATABASE_URL and OWNER_DATABASE_URL, so values inherited from the parent shell cannot point at preview or prod. I found no dotenv, `loadEnv` or setupFiles in apps/server's vitest config or in tests/db.
- Passwords:
  - `PGPASSWORD` in `docker exec -e` is visible in the host process list for the duration of each command.
  - `POSTGRES_PASSWORD` appears in `docker inspect` of the container. CI does the same.
  - A psql error on the `alter role` statement could echo the hex password to the console, because the failure message includes stderr.
  - All of these are random per run, belong to a container that listens on loopback only, and are removed afterwards. I rate them as accepted: negligible.
- Windows shell: `npm.cmd` with `shell: true` is passed only constant args. The `supabase@${version}` string is checked by `ciPins` against `^\d+\.\d+\.\d+$` before use. The only other interpolated strings are inside docker argument arrays with no shell. No user input reaches a shell. The `--keep` and `down` arguments are only compared, never passed along.
- Exit code: `run.status ?? 1` returns non-zero when test:db fails or is killed. `finally` removes the container before the code is returned. Errors map to 1 and a usage error to 2. An existing container with the same name is removed by the `down()` at the start; that also removes a `--keep` container, which is the intended use.

**Done:** Independent review, one round, of the db-local tool against ci.yml job `db`.
**Artifact:** this report. Please save it verbatim to `.work/db-local/findings.md`. Diff reviewed: C:\Users\Afik\nestly-dblocal\.work\db-local\review.diff
**Findings:** 0 critical, 0 high, 2 medium (1, 2), 6 low (3 to 8).
**Open:**
- Is a local pass allowed to skip the up→down→up of the newest migration and the 02-anchor-fk check? If yes, the README must say so. This is the orchestrator's decision from the SRS and specialist advice, not a default I can fill in.
- Is `psql` inside the container acceptable given that host psql is denied? The inside-the-container approach looks fine to me, since it never touches host psql.
**Next owner:** BUILDER, for findings 1 and 2 (the test and the README wording). I re-check only 1 and 2 after the fix.

## ORCHESTRATOR (18.10.2026)
- Decision (CRITIC's open question, unreserved; reason: test:db needs the setup, the other gates are CI's and run on every db
  PR): the local run skips up→down→up and the other gates, and says so; it does run 02-anchor-fk-check and asserts ok = t.
- 1: the test parses the db job's SQL order from ci.yml; local order = CI order minus SKIPPED_CI, and SKIPPED_CI = exactly
  CI's files not run here. A parser self-check shows an added CI step makes it fail.
- 2: README and header: "the db job's setup, then test:db; not the other gates"; skips listed; CI remains the verdict.
- 3: docker run inside try. 4: fail fast when the container exits. 5: SIGINT removes the container. 6: install marker.
- 7: dockerRunArgs exported; the publish is asserted 127.0.0.1:54322; the HOST source regex dropped. 8: noted (code point
  order = the runner's C.UTF-8 glob).
- Proof after the fixes: `node tools/db-local.mjs test` exit 0; test:db 17 files passed, 1 skipped (640 tests); container gone.
- psql inside the container: accepted (never host psql, which stays blocked).
