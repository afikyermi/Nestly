# P6 — schema before code, and a schema-dependent merge gate (spec)

Approved: Afik, 17.10.2026 plan (`nestly-review/comparison.md` §3 A and P6); overnight task of 18.10.2026: built on P2's
branch, merge after #58. No dispatch, no production action. CRITIC reviews.

Criteria:
1. A PR that adds a migration changes no deployed product code (api/, apps/server/src|api, apps/web/src|public|index.html,
   packages/shared/src); otherwise CI `schema-gate` fails with "split it".
2. A PR that changes product code passes only when every migration in its tree is applied by a successful `db-production`
   job of migrate.yml (workflow_dispatch on main), matched by name and git blob id; stale/other content, no apply, or
   unreadable evidence fail ("missing, not green"). Production ahead of the branch passes.
3. A migration already on main cannot be changed or deleted in a PR.
4. On a PR that adds a migration, the db job runs main's server integration tests, unchanged, on the PR's schema
   (old code, expanded schema); no step-level `if`; after the PR's own tests; before the failure-only log step.
5. Read only: no secret, job token with contents/actions read; never dispatches.
6. Process: workflow.md (Batched approvals) and DATA ARCHITECT state expand → apply → code → contract; migrate.yml's header
   no longer claims daily batching.
Test cases from the plan: old code + expanded schema (4) · failed apply / no apply (2) · candidate pointing at stale or
mismatched evidence (2) · PR with no migration change (2) · new schema not yet applied (2). App rollback stays possible in
the expand window because main's code passes on the new schema (4). Live proof needs a real schema PR (I3 F3.0).
