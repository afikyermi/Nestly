# Result — E preview-e2e

**State:** in PR 31 with F1.6 (decision "E is built inside PR 31"). Every successful Vercel Preview runs `preview-e2e`: a random test user per viewport, the feature flows from `e2e-preview/*.flow.ts`, a per-project summary. The check shows on the PR.
| | Planned | Actual |
|---|---|---|
| Criteria | 12 | 10 met; 8 and 9 (cleanup and sweep) wait on DR-E1, which is reserved for Afik. Test users stay on nestly-preview, tagged `nestly-e2e-*@gmail.com` |
| Reviews | CRITIC opus | with Concern (1 medium, 3 low) → fixes → re-check: with Concern, 2 lows and 2 concerns → debt |
| Runs | — | 38816319396 and 38817721595, both 14/14 |
**Ratio:** tests ≈ 600 lines against ≈ 450 product lines, with the F1.6 flow counted as product (CRITIC's reading 1). **SRS:** NFR-QA-001, OP-018.

**Part 2 (PR 33, DR-E1 option 1):** cleanup by SQL as `postgres` on nestly-preview, as `preview-e2e-cleanup` (workflow_run, main's code, environment `preview-e2e` restricted to main). First run of the in-job version, 38875921919: 2 own users and 8 leftovers deleted, 0 failed. CRITIC opus: with Concern (2 medium) → fixes → re-check with Concern (1 low and 2 notes → debt). The workflow_run path is first proven after the merge.
