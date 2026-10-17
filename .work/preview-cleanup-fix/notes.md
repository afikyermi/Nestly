# notes — Preview cleanup fix (identity_link_checks + backlog mode)

Afik 17.10.2026, `decisions/2026-10.md` "Preview cleanup" (a) and (c). Incident: `incidents.md` 2026-10-17.

**Approach**        (a) `EXPECTED_NESTLY_TABLES` gains `identity_link_checks` (nine tables = every `create table nestly.*` in
                    `supabase/migrations/` on this branch; F2.2/F2.3/F2.3b add none). The per-user transaction deletes
                    `nestly.identity_link_checks where user_id = …` just before `nestly.users`; the other eight keep their order;
                    the count shows up in the report as `identity_link_checks=N`.
                    (c) `workflow_dispatch` with input `mode` (choice: dry-run default, backlog). `parseMode` in the tool:
                    workflow_run must carry no mode (→ the per-run path, unchanged, including its refusal above 50);
                    workflow_dispatch must carry dry-run or backlog. `runBacklog`: preflight (same `decidePreflight`) → list
                    every pattern user (`email ~ TEST_EMAIL_PATTERN`, age measured by the database's `now()`) → summary (count,
                    count older than 3 h, age range in hours) → backlog only: `selectBacklog` (in-process pattern twin, older
                    than SWEEP_AGE_HOURS, oldest first, at most 50) → the same `deleteUser` transaction (lock + delete guard
                    `email ~ pattern`).
**Decisions**       The dispatch job runs only when `github.ref` is the default branch (job `if`), on top of the `preview-e2e`
                    environment's main-only restriction. `MAX_BACKLOG_PER_RUN = MAX_PATTERN_USERS` (50), cap unchanged.
                    Backlog does not refuse above 50 pattern users (that refusal is what wedges the per-run path); it is bounded
                    by the 50 per dispatch instead. Dry-run and backlog log counts and ages in hours only, never an email, id
                    or timestamp. A new test parses the migrations so a part that adds a `nestly` table without updating the
                    tool goes red in `test:tools` (standing rule (b)).
**Deviations**      One existing assertion changed: the trigger set of the cleanup workflow is now
                    `['workflow_run', 'workflow_dispatch']` (was `['workflow_run']`) — required by (c). GOOD_FACTS gains the
                    ninth table. All other existing assertions untouched.
**Deliberately not done**   No change to MAX_PATTERN_USERS, SWEEP_AGE_HOURS, MAX_SWEEP_PER_RUN, the URL guard or the credential.
                    `.claude/knowledge/data-model.md` "Approved exceptions" still says "CI only: on workflow_run" — not edited
                    (frozen `.claude/**`); ORCHESTRATOR to route.
**Uncertain**       Not run against nestly-preview (CI only, takes effect after merge to main). `inputs.mode` evaluates to '' on
                    workflow_run — standard Actions behaviour, relied on by `parseMode`.
**Preview path**    After merge: Actions → preview-e2e-cleanup → Run workflow (main) → mode dry-run: expect the preflight to
                    pass and a line "pattern users: N; older than 3 h: M; ages: …". Then mode backlog, repeated until the
                    count is ≤ 50 and the per-run cleanup passes again on the next preview-e2e run.
**Neighbouring**    none.

## Backlog cleanup on nestly-preview — 17.10.2026 (ORCHESTRATOR)
- 12:38 dry-run (run 39033280409): 168 pattern users, 88 older than 3 h, ages 0–13.8 h.
- 12:41 backlog (run 39033382704): selected 50, deleted 50, 0 failed.
- 12:44 backlog (run 39033556793): selected 46, deleted 46, 0 failed. 72 remain, all under 3 h.
- Next: a third backlog run at ~15:45 UTC once they age past 3 h, then the follow-up PR that removes backlog mode.
- 15:01 the per-run cleanup refused again: 168 pattern users (E adds about 12 per run; refusals let them pile up). Not open-PR tables.
- 15:46 dry-run (39046511255): 168, 72 older than 3 h. Backlog 39046587343: 50 deleted; backlog 39046785938: 22 deleted; 0 failed.
  96 remain, all under 3 h. The per-run refusal will recur while E runs often → Afik's decision on WORKPLAN "ממתין לך" (count only
  the run's own users); backlog stays in the tool until then; next manual round about 18:45 UTC.
