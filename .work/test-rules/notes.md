# notes — test rules, CI side

**Approach**
- `ci.yml`: job `browser` is now Chrome only, matrix `project: [chrome]` x `shard: [1, 2]` (the install step expression is unchanged).
  New job `browser-edge` (shard 1/2, project edge, msedge) runs `if: web == 'true' && github.event_name != 'pull_request'`.
  `workflow_dispatch:` added to `on` (the `changes` job already returns web=true for any non-PR event).
- `playwright.config.ts`: `snapshotPathTemplate` `{testDir}/__screenshots__/{arg}{ext}` (no OS/project in the name), `maxDiffPixelRatio 0.002`,
  `updateSnapshots: 'none'` (a missing baseline fails; the default would write it and pass), edge project `testIgnore: /\.visual\.spec\.ts$/`.
- New `.github/workflows/update-baselines.yml` (workflow_dispatch, read-only): runs the visual specs with `--update-snapshots` on Linux Chrome and uploads `e2e/__screenshots__/` as an artifact.
- Test-side files are drafted in `.work/test-rules/visual-draft.md` (the guard blocks BUILDER from `e2e/`): TEST ENGINEER creates them.

**Decisions**
- Edge trigger: push to `main` + `workflow_dispatch`. Trade-off: it runs AFTER the merge, in parallel with Vercel's production deploy, so it
  catches an Edge regression right after merge, not strictly before the deploy. Alternatives: a `release` PR label (every PR to main is
  production-bound, so the label becomes a convention nobody is forced to follow, and `labeled` re-runs all of CI); gating the Vercel
  production deploy on Edge (needs Vercel/branch-protection changes, outside this task). Not obvious which Afik wants: see DECISION REQUEST.
- "Desktop and phone": no extra Playwright project. Every spec already sets its viewport (375 / 1024) via `test.use`; a phone project would run
  the whole suite twice. The visual spec loops over both sizes itself.
- Opt-in list (`e2e/visual-screens.ts`, `SCREENS`, empty today) rather than "assert only where a baseline exists": the latter would silently pass a
  new screen with no baseline, against the rule that a screen gets its baseline in the same PR. With the list, an unlisted screen is not compared; a listed one with no baseline fails.
- Stabilisation: fonts ready, `animations: 'disabled'`, caret hidden, `reducedMotion: 'reduce'`, `page.clock` fixed time, app screens use the e2e test-session seam for data. `maxDiffPixelRatio 0.002` is an anti-aliasing allowance, my pick; nothing is masked.

**Deviations** none (there is no spec; the decision entry is the source).

**Deliberately not done**
- The existing Q3 "story screenshots (non-blocking)" block in `e2e/part-f.spec.ts` stays (test file; baselines task).
- No baselines, no entries in SCREENS. No change to the `changes` filter (`e2e/*` and `playwright.config.ts` already trigger web).
- The spec and screens files are not written (guard); drafts only. The mechanism has NOT been run: TEST ENGINEER must run it locally with one temporary entry (Windows baselines are throw-away).

**Uncertain**
- `page.clock.pauseAt` may stall app timers; the fallback `setFixedTime` is noted in the draft.
- PRs go from 4 to 2 browser legs. `browser-edge` red on main is not a required check and blocks nothing; someone must look.

**For TEST ENGINEER: `tools/ci-browser.test.mjs` must change**
1. `browserProblems`: matrix.project expected `['chrome']` (line ~38 compares to `['chrome','edge']`); line ~40, the equality with the Playwright project names becomes "matrix projects are a subset of the config's names" (config still has chrome and edge).
2. Test "the playwright config names its projects chrome and edge" stays true: no change.
3. Mutants: `'edge dropped'` now describes the correct state: replace by `'edge added to the PR matrix'` (project `['chrome','edge']`). The last assertion `browserProblems(browser, ['chrome'])` no longer fails: use a matrix project not in the config (e.g. names `['firefox']`).
4. Titles/comments of the first test and the header ("chrome x edge ... matrix").
5. New assertions for `browser-edge`: exists; `if` has `needs.changes.outputs.web == 'true'` and `github.event_name != 'pull_request'`; needs `changes`; matrix is only shard [1,2]; `--project=edge --shard=${{ matrix.shard }}/2`; installs only `msedge`; storybook built before the test; artifact name has the shard; fail-fast false; no continue-on-error. Also: `on` has `workflow_dispatch` and `push`; the `browser` job's `if` has no event restriction.
6. `ci-path-filters*.test.mjs` and `db-workflows.test.mjs` pass unchanged (checked). Only `ci-browser.test.mjs` fails today, on the matrix.
7. Optional: `update-baselines.yml` has `permissions: contents: read` only.

**Baselines task (separate) must**
1. Add an entry per existing screen to `SCREENS` (story ids from `storiesOf`, app routes with the right session state); each gets phone + desktop.
2. Run workflow `update-baselines` on the branch, download artifact `visual-baselines`, commit the PNGs under `e2e/__screenshots__/` (never generate on Windows/macOS).
3. Delete the non-blocking Q3 block in `e2e/part-f.spec.ts` once its stories are in SCREENS.
4. Watch 2-3 CI runs for flake on app screens with dynamic data before relying on them.

**Preview path** Nothing to click. On the PR checks: `browser` shows two Chrome legs and there is no `browser-edge`. After the merge to main: `browser-edge` x2 runs. A manual run of the CI workflow (workflow_dispatch) runs Edge too.

**Neighbouring** The SRS note (NFR-QA-001 "per release, not per PR") is pending at wrap-up.

**DECISION REQUEST (ORCHESTRATOR)** Edge trigger. Implemented default: push to main + workflow_dispatch (post-merge, parallel to the prod deploy). If Afik wants Edge strictly before production, the option is a protected release branch/tag that Vercel deploys from, which changes the deploy flow.
