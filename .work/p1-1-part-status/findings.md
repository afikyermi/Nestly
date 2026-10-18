# P1.1 — CRITIC findings, round 1 (returned as text; saved verbatim by ORCHESTRATOR)

CRITIC findings, P1.1 part-status (branch chore/p1-1-part-status). Read: spec.md, review.diff, tools/part-status.mjs (full), the changes/schema-gate/db parts of .github/workflows/ci.yml, and PRODUCT in tools/schema-gate.mjs. I did not read notes.md. I ran nothing, so every scenario below comes from reading the code.

F1 — severity HIGH — The automatic skip also covers the required CI jobs, so a PR can disable its own gate and get green.
- Where: `ownSkip` in `evaluate` (tools/part-status.mjs lines 76-79). It adds any skipped github-actions check to `expectedSkips` by name. It never checks that the name is one of the jobs the `changes` filter can legitimately skip.
- Why it matters: only db, storybook, browser and browser-edge carry an `if` driven by `changes`. The required CI_NAMES are `changes`, `typecheck`, `lint`, `test`, `build` and `schema-gate`. The required-check loop passes a skipped check when `expectedSkips[name]` is set, so those names become skippable too.
- Failure scenario:
  1. A PR edits its own ci.yml, which is the copy that runs on the PR, and adds `if: false` to `test`, `typecheck`, `lint`, `build` or `schema-gate`.
  2. The run ends with conclusion `success`, because a skipped job does not fail a run.
  3. The skipped check's URL names that run's id.
  4. `ownSkip` is satisfied, and the tool prints "Expected skip: test — skipped by its successful CI run ...". The required check passes and the blocker is gone.
- Before P1.1 this blocked. The code comment at line 35 says the schema gate must block "even if its ci.yml dropped the job"; this reopens that for the skip variant.
- The test at lines 209-211 only covers a required check skipped outside the run. A required check skipped inside the run has no test.
- Fix direction: restrict the automatic skip to an explicit allowlist of filterable jobs, and exclude every CI_NAMES job. That is a decision for the builder.

F2 — severity MEDIUM — The superseded-cancellation rule can hide an older real failure on main, because `collect` and `mainHealth` disagree about which runs are read.
- Where: the `collect` loop (lines 246-256) and `superseded` in `mainHealth`.
- Why it matters: `collect` seeds `groups` with only the skipped job names of the newest run in a workflow and event group. Once that set is empty, `collect` skips fetching every older run in the group. A run whose jobs are cancelled, or a run with no jobs, yields an empty set. `mainHealth` then drops that cancellation as superseded.
- Failure scenario:
  1. An older main run of workflow W failed.
  2. A newer run of W on an older main SHA was cancelled, or has no jobs.
  3. The older failed run is never fetched into `mainRuns`, and the cancellation is passed over.
  4. main health is empty and the unresolved failure is gone.
- The test at line 191 only passes because it hand-builds both runs. It never goes through `collect`, so it does not show that "an older failure under it still shows" (spec criterion 2) holds live.
- Fix direction: `collect` should treat a superseded cancellation as unresolved, the same as a skip.

F3 — severity MEDIUM — A cancellation on an older SHA is passed over without checking that a newer run of the same workflow ever succeeded.
- Why it matters: concurrency supersession only justifies passing it over when a newer run of that workflow and event exists. The rule is a plain `head_sha !== mainSha`.
- Failure scenario:
  1. A job or workflow that does not fire on every main push is cancelled on an older SHA. This could be a manual cancel, a runner loss, or a workflow that triggers only on certain paths, such as migrate.yml's db-production.
  2. Later main commits do not re-trigger that workflow.
  3. The only evidence that the workflow never completed is the cancelled run. `mainHealth` passes it over and nothing is reported.
- Within `mainHealth`'s own input, the rule should apply only when a newer run of the same `workflow_id:event` exists.
- Test coverage: line 188 asserts the pass-over for a lone old-SHA cancellation, so the test enshrines this behaviour. It does follow criterion 2 as written, so the spec itself is part of the problem.

F4 — severity MEDIUM — The PREVIEW_INPUT list misses files that change what the Preview builds, so E can be waived for them.
- Where: the `nothingToPreview` condition (line 108), which relies on PRODUCT plus PREVIEW_INPUT.
- Missed: `apps/web/vite.config.*`, `tailwind` and `postcss` configs, `apps/web/tsconfig*.json`, `tsconfig.base.json`, `.nvmrc`, `.npmrc`, `.vercelignore`, and `apps/server/` files outside `src/` and `api/`.
- Why it matters: PRODUCT covers only `apps/web/(src|public|index.html)`. ci.yml's own `changes` filter treats `apps/web/*`, `apps/server/*`, `tsconfig.base.json`, `.nvmrc`, `playwright.config.ts` and `e2e/*` as inputs, so the repo already knows the wider set.
- Failure scenario: a PR from a non-Preview branch changes `apps/web/vite.config.ts` or `tsconfig.base.json`. `nothingToPreview` stays true, so the tool prints "E not required" and the Preview build is never exercised.
- Fix direction: invert the list. Require E unless every changed file is on a known-safe list (docs, `.work/`, `.claude/`, `tools/`, md files and similar), or at least reuse the ci.yml `changes` set.

F5 — severity LOW — Two silent edges around coverage.
- (a) The main-health limitation is stated ("covers the newest N main runs only") but it only says how many runs were read. It does not say that a failure in an infrequent workflow, pushed past run 100 by busy CI, is invisible. LIMIT lines do not affect the exit code, so a PR can exit 0 while an old unresolved failure sits on main. Naming this in the text would make it a real disclosure.
- (b) The file list uses `all()` with a 10-page cap, so a list past 1,000 files does give an error blocker, which is correct. GitHub's `pulls/files` endpoint is itself capped at 3,000 files and returns no marker. A PR over that cap would have a truncated list with no error. The waiver in F4 trusts that list. Treat a list of exactly 3,000 files as unread.

F6 — severity LOW — The merged-PR CI lookup can pick a run that is not this PR's.
- Where: `ofThisPr` (lines 236-237).
- Failure scenario: it matches on head SHA, `head_branch === pull.head.ref`, and an empty `pull_requests` list. A closed-then-reopened PR, or a second PR from the same branch name at the same SHA, can borrow the other PR's run.
- Impact: both runs are for the same commit, so the CI outcome is equal in practice. This cannot make a different commit look green. A fork PR whose branch is named `main` would also match on `head_branch`, but the exact-SHA match limits the damage.
- Re-run attempts keep the same run id, and the check URL contains `/actions/runs/<id>/` with a trailing slash. A run-id prefix match (7 vs 77) is therefore handled, and the test at line 208 covers it.

Checked and sound:
- Criterion 1: an invalid page still blocks, because the 'Invalid response' error is pushed.
- E is never waived when an E ran (`!eChecks.length`), when the file list is unread or empty, or when the branch is `ready/**` or has no policy.
- Renames are covered, because both `filename` and `previous_filename` go into `files`.
- A PR that edits vercel.json is covered, because it is in PREVIEW_INPUT.
- A fork PR with a product change still requires E.
- The tests trace to the spec criteria.

Done: review of P1.1 complete. F1 is high, F2 and F3 are medium (BUILDER to fix, then I re-check only those), F4 is medium, F5 and F6 are low.
Artifact: this report, which ORCHESTRATOR saves to C:\Users\Afik\nestly-p11\.work\p1-1-part-status\findings.md. Reviewed C:\Users\Afik\nestly-p11\tools\part-status.mjs and C:\Users\Afik\nestly-p11\tools\part-status.test.mjs.
Findings: F1 high; F2, F3, F4 medium; F5, F6 low.
Open:
- DECISION REQUEST for ORCHESTRATOR: F3 contradicts spec criterion 2 as written ("an older main SHA is passed over like a skip"). Change the spec to "when a newer run of the same workflow exists", or record why it is accepted.
- F4's fix direction is a design choice (deny-list or allow-list). Default: allow-list of known-safe paths.
Next owner: BUILDER (fix F1-F4, add tests for a required job skipped inside the successful run, and for `collect` with a cancelled newest run over an older failure), then CRITIC re-checks only those findings.

## ORCHESTRATOR (18.10.2026)
- F1 (high): the automatic skip is limited to FILTER_SKIPPABLE (storybook, browser, browser-edge, db — the jobs whose `if`
  reads needs.changes) and never a CI_NAMES or required context. Tests: each CI job and `audit` skipped inside the
  successful run blocks; db made required blocks.
- F2: collect treats a cancelled job (or a cancelled no-jobs run) like a skip: the group stays unresolved and older runs are
  read. Test through collect, for a no-jobs run and a cancelled job, with an older failure.
- F3 (decision request; unreserved, decided): spec criterion 2 amended — passed over only when a newer run of the same
  workflow_id:event exists (any conclusion: the workflow fired again); the group's newest run always counts. Tests updated.
- F4 (decision: allow-list, CRITIC's default): NO_PREVIEW_FILE; every changed file must be on it. Tests for vite/tailwind/
  tsconfig/.nvmrc/.npmrc/.vercelignore/apps/server outside src/e2e/playwright/preview & vercel tools and workflows.
- F5a: the limitation text says an older unresolved failure is not seen. F5b: a list at 3,000 files is not trusted.
- F6: accepted — same commit by exact SHA, so the outcome is the same; noted.
- Live after the fixes: PR 68 E not required, 4 expected skips, 0 main jobs (only the worktree self-check); PR 69 E required
  (package.json changed).
