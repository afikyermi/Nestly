# CRITIC (opus) — E part 2 (PR 33), saved by ORCHESTRATOR from the hand-back

verdict: Validated with Concern — 2 medium, 1 low. Knowledge entry validated on condition of 2 and 3.

1. medium — `selectVictims` (tools/preview-e2e-cleanup.ts:331-338): the cap of 10 counts own + leftovers, all-or-nothing, with no way back; once > 10 pattern users exist every run deletes nothing and fails forever (e.g. after a shared table-list preflight failure across branches). DECISION REQUEST to ORCHESTRATOR.
2. medium — preview-e2e.yml:33,59-65 + data-model entry: the BYPASSRLS credential runs with the deploying branch's own code (checkout of the deployment sha, environment without branch restriction), before review; the Playwright step on the same disk could also rewrite the cleanup code. "Only in the cleanup step" is prose, not a guardrail. Fix (a): cleanup as a separate `workflow_run` workflow on the default branch's code, secret in an environment restricted to `main`; or (b) Afik names the cost.
3. low — data-model entry writes `@gmail.com$` unescaped; use the exact pattern or point to TEST_EMAIL_PATTERN.

Checked, no finding: deletion set and order · row_security off · rollback when auth.users ≠ 1 · selection injection-safe · URL guard · preflight fails closed · secret out of Playwright and logs · errors as codes · tests trace to spec and schema.

## ORCHESTRATOR decisions (17.10)
- 1 → own users of the run are always deleted (never capped); the sweep deletes at most 10 leftovers per run, oldest first; all-or-nothing refusal only above 50 pattern users in total (an absurd count = a wrong pattern).
- 2 → fix (a): `preview-e2e-cleanup.yml` on `workflow_run` (preview-e2e completed), running main's workflow and code; run id and attempt from the event; the test job no longer declares `environment: preview-e2e`; `preview-e2e` holds `PREVIEW_DB_ADMIN_URL` and is restricted to `main` (Afik sets the branch rule). The knowledge entry states what enforces the boundary: main-only code, a main-restricted environment.
- 3 → fixed in the same round.
First real run (38875921919, before these fixes): 14/14, deleted 2 own + 8 leftovers = 10 Auth users and their rows, 0 failed, 0 remaining.
