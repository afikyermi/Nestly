# P3 — faster browser CI on the same test suite (spec)

Approved: Afik, 17.10.2026 plan (`nestly-review/comparison.md` P3) and the overnight instructions of 18.10.2026, task 2.
Path: CI/test tooling, no product code, no schema; CRITIC reviews.

Criteria:
1. `e2e/a11y.spec.ts` runs in parallel mode; its tests share no state (own page, read-only static gallery, no hooks).
   No global `fullyParallel`; no other file changes mode.
2. Timeouts by test type: per test 30 s stated (story/axe and app-flow tests ≤ 4 s on CI); the build tests keep 240/300 s;
   on CI a `globalTimeout` ends the run ≥ 2 minutes before the browser jobs' `timeout-minutes`, so a hang still reports.
3. Shard balance by measured duration, with no manual file partition (a new spec file can never be dropped): Playwright's
   count-based split in file order is kept; worker count on CI is chosen from measurement.
4. The same 2,312 tests before and after (list compared with line numbers removed); no test removed, no shared build, no
   viewport or axe reduction; retries unchanged (1 on CI).
5. `apps/server/tests/db/recovery-store.db.test.ts` c5 "B cannot change A's answers…" is deterministic: B's token is issued
   in the second of A's claim. The flake on main (17.10 18:46 UTC) was criterion 21 (a newer claim releases the older
   holder) when a second ticked — the code is right, the test was clock-dependent.
6. `tools/ci-browser.test.mjs` guards 1–2 with mutants.
Measured: slowest shard, total CI time, failures and retries, base (main runs 39069774455, 39059353456) vs head.
Not in scope: workflow.md "Test rules" text (P2 file; after P2 merges), shared Storybook build, test removal.
