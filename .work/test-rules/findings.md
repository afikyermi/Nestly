# findings — test-rules (CI, Playwright, process docs, SRS 2.14), CRITIC (sonnet), 15.10.2026

(Written by ORCHESTRATOR from CRITIC's return; the harness refused CRITIC's Write.)

verdict: Validated with Concern — 2 medium · 5 low

The concern: the process docs say Edge gates production, but CI runs Edge after the merge, so nothing blocks the deploy
(finding 2). The Edge job shows "skipped" on PRs.

1 (medium) e2e/visual.visual.spec.ts — `test.use({ baseURL: APP })` is file-wide; the story branch (`openStory`,
  e2e/helpers.ts:25) does a relative `page.goto('/iframe.html?...')`, so it goes to the e2e app on 4174, not Storybook on
  6007. Failure: the first `{ kind: 'story' }` entry in SCREENS times out on `body.sb-show-main`; no baseline can be made.
  Fix: no file-wide baseURL; absolute Storybook URL for the story branch (keep `open()`, which uses the absolute APP);
  one real entry or a test proving each kind reaches its own server.
2 (medium) .claude/workflow.md "Test rules — this project" (Browsers) — "Edge runs before a release to production", but
  ci.yml runs Edge after the merge to main (the push Vercel deploys) and by hand; nothing blocks production on a red Edge
  job. The ci.yml `workflow_dispatch` comment ("the Edge job before a release") gives the same impression. The SRS
  NFR-QA-001 text is accurate. Fix: say what is built — Edge on every merge to main and by hand; it does not block the
  production deploy. Keep the open question in WORKPLAN until Afik answers.
3 (low) e2e/visual-screens.ts, workflow.md, NFR-QA-001 — "blocking for every screen a feature touches" is enforced only
  for screens listed in SCREENS (opt-in); the rule text reads as if CI enforces it. Fix: say the list is opt-in and SPEC /
  TEST ENGINEER list every screen a feature touches; CRITIC checks it for 🎨 criteria.
4 (low) spec.md:85, test-engineer.md:66 — 🔴 says "personal or minors' data"; the decision says "children's/minors'
  data". "Personal data" makes nearly every form 🔴 (all six categories), defeating the ratio aim. A criterion with no type
  (config, CI, performance) is unplaced. Fix: align with the decision; infrastructure or config defaults to 🟡.
5 (low) playwright.config.ts:17 — `maxDiffPixelRatio: 0.002` ≈ 600 px at 375×812, 1,600 px at 1024×768: a tolerance, not
  stabilised noise; a one-word label change or a 1–2 px shift can pass on the phone. Fix: start tighter (0.0005, or
  maxDiffPixels + threshold), loosen only after observed flake, record why.
6 (low) .github/workflows/ci.yml:189 — the `browser` install expression still branches on `matrix.project == 'edge'`;
  dead now that the matrix is [chrome]. Fix: the literal `chrome` (the test accepts a literal), or keep it knowingly.
7 (low) tools/ci-browser.test.mjs (edgeProblems) — asserts the `push` trigger exists but not `branches: [main]`; checks
  the `if` by regex presence, not exact form (`… || true` passes). Fix: assert `on.push.branches` equals ['main'] and
  compare `if` with an exact pattern like WEB_IF.
8 (low) test-engineer.md:170-178, workflow.md:303-316 — old changelog entries rewrapped to single lines with no content
  change: diff and blame noise. Fix: restore the wrapping, add only the new lines.

Open (not defects): branch protection may still list the old check names "browser (edge, N)" — verify before merge;
`browser-edge` shows "skipped" on PRs. update-baselines.yml with SCREENS empty: the "visual:" grep matches only the
uniqueness test, writes no PNG, `if-no-files-found: error` fails the run — loud and correct, but looks like a bug; a
header comment would help.

Checked, clean: ci.yml (a PR runs only `browser` [chrome]; `browser-edge` never on a PR, every push to main and
workflow_dispatch, same `changes` filter, which leaves web=db=true for non-PR events; cancel-in-progress only on PRs;
artifact names distinct; permissions contents: read) · update-baselines.yml (read-only, no secrets, no push; grep matches
the spec names; `--update-snapshots` writes missing baselines; artifact path matches snapshotPathTemplate; the config's
webServer builds the e2e app) · Playwright (`updateSnapshots: 'none'` fails a listed screen with no baseline; edge ignores
*.visual.spec.ts; stabilisation reasonable; `open()` uses the absolute APP) · ci-browser.test.mjs (assertions describe
the new state; PR-matrix and Edge mutants each flip the result) · docs (1.6, 1.3, 1.14 carry the seven points; tie-break
clear; step 8 points to the section; no contradiction with Verdicts) · SRS (NFR-QA-001 matches ci.yml as built and
claims no pre-deploy gate; OP-018, 2.14, INDEX consistent; no open item filled) · no secrets or debug output; the slow
F1.4 test is in debt.md.

## ORCHESTRATOR (15.10) — round 1
- 1 → TEST ENGINEER: `baseURL` dropped from `test.use`; two probe tests (`visual: a story screen opens in Storybook`,
  `visual: an app screen opens in the e2e app`) prove each kind reaches its own server without a baseline. Run: 3/3 on Chrome.
- 2 → ORCHESTRATOR: `workflow.md` "Browsers" says what is built (Edge on every merge to main and by hand, after the merge,
  no deploy gate; the release gate stays an open question for Afik). BUILDER: the two ci.yml comments reworded.
- 3 → ORCHESTRATOR: `workflow.md` "Visual regression" states the opt-in list and who lists/checks the screens.
- 4 → ORCHESTRATOR: `spec.md` and `test-engineer.md` say "children's or minors' data"; `spec.md`: a criterion with no type
  of its own (configuration, infrastructure, performance) is 🟡.
- 5 → decided (decisions.md 2026-10-15): `maxDiffPixelRatio: 0.0005`, loosened only after observed CI flake. BUILDER applied it.
- 6 → BUILDER: the literal `chrome`; ci-browser.test.mjs 6/6.
- 7 → TEST ENGINEER: `EDGE_IF` exact comparison, `on.push.branches` deep-equals ['main'], mutants for `|| true`, widened
  branches and no branch filter — each caught.
- 8 → declined, with reason: `test-engineer.md` is at its line budget (180/180, tools/line-budgets.json) and `workflow.md`
  would exceed 330 with the original wrapping; the rewrap is what let 1.6 and 1.14 fit. No content changed.
- Open items: `main` has no branch protection and no rulesets (gh api, 15.10), so no required-check names exist to
  update. `update-baselines.yml` header now says the empty-list failure is intentional.
- Local after the fixes: typecheck · lint · budgets · test:tools green; `npx playwright test --project=chrome
  e2e/visual.visual.spec.ts` 3/3.
