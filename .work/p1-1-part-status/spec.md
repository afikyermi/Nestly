# P1.1 — part-status says green for a correct PR (audit 18.10 A1; Afik's item 4, 18.10.2026)

Path: Standard (tooling, > 30 lines; no risk flag). Owner of the decision: ORCHESTRATOR (unreserved tool detail).

Problem (A1): on merged green PRs, part-status printed false blockers and took 6–13 minutes.

Acceptance (each is a test in tools/part-status.test.mjs, `[P1.1]`, both ways: false block gone, real protection kept):
1. main health reads one page (the newest 100 main runs): a stated limitation, never "Pagination limit"; an invalid page
   still blocks.
2. `mainHealth(runs, mainSha)`: a cancelled job or no-jobs run on an older main SHA is passed over like a skip only when a
   newer run of the same workflow and event exists (amended after CRITIC F3) — for a cancelled job, a newer non-skipped
   execution of that job (N2); as the group's newest run, or on the current
   main SHA, it blocks; an older failure under it still shows, also through `collect` (F2).
3. A check skipped inside this head's successful ci.yml run (its URL names that run) is an expected skip with the reason,
   only for the jobs the `changes` filter gates (storybook, browser, browser-edge, db) and never a CI or required job
   (amended after CRITIC F1); a skip from another run, a failed/absent CI run, or any other skip still blocks.
4. E is "not required" when the head branch gets no Preview by its vercel.json policy, E never ran, and every file in the
   read list (non-empty, under GitHub's 3,000 cap) is on the allow-list NO_PREVIEW_FILE: `.work/`, `.claude/`, `docs/`,
   `archive/`, `decisions/`, `.githooks/`, root `*.md`, top-level `tools/*` and `.github/workflows/*` except Preview and
   Vercel ones (amended after CRITIC F4: an allow-list, not a deny-list). Anything else still requires E.
5. A merged PR's CI run is found by head SHA + head branch when GitHub dropped the PR link; an open PR still needs the
   link; another branch or another PR on the same commit does not count.

Live proof (worktree, so the self-check "differs from main" blocker is expected): PR 68 — no other blocker, E not
required, 4 expected skips, 0 main jobs; PR 69 — 54 s (was 6 m 39 s), only E (package.json changed: by design).
