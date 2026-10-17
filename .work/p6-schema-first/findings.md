# P6 schema-first: CRITIC findings (round 1)

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own Write ("Subagents should return findings as text").
CRITIC (opus) reviewed cold, one round, without notes.md. No critical or high; 2 medium, 4 low.

## Bug list

### 1. medium: quoted git paths make a migration invisible to the gate
- **Where:** tools/schema-gate.mjs:21 (`parseTree` regex), :30 (`parseChanges`), :94-96 (`git diff --name-status` and `git ls-tree` run without `-z`)
- **Defect:** Git's default `core.quotePath` prints any path with a non-ASCII or special character inside double quotes, with octal escapes. Such a path matches neither `MIGRATION` nor `PRODUCT`, so the gate never sees the file.
- **Failure scenario:** A PR adds `supabase/migrations/20261020100000_הוספת_עמודה.sql` together with apps/server/src code that uses it (the Supabase CLI accepts `<digits>_<anything>.sql`). `ls-tree` prints the name in quotes, so `added` is empty and the PR is classified `code`. Every visible migration is already applied, so the gate is green and "split it" never fires. The PR merges, Vercel deploys code that needs a column production does not have, and the migration waits for a dispatch. The evidence tree has the same blind spot.
- **Fix:** Use `-z` on `ls-tree` and on `diff --name-status`, as the `changes` job already does (ci.yml:55), and parse NUL-separated records. Fail the gate on any entry under `supabase/migrations/` that cannot be parsed. Add a test with a non-ASCII migration name.

### 2. medium: the gate runs code from the PR it is judging, and a missing gate counts as no failure
- **Where:** .github/workflows/ci.yml:244-262 (job `schema-gate` runs `node tools/schema-gate.mjs` from the merge checkout)
- **Defect:** The pull request controls both `tools/schema-gate.mjs` and the `schema-gate` job definition, so a PR that edits either one judges itself. Branch protection is off and the check is not required, so a deleted job shows as missing, not as failing.
- **Failure scenario:** A PR changes apps/server/src to use a migration that has not been applied. In the same PR it "fixes" the red gate: it relaxes `PRODUCT`, short-circuits `evaluate`, or adds `if: false` or removes the job. The wiring test in tools/schema-gate.test.mjs is also read from the PR tree, so it can be edited in the same commit. part-status sees no failing Actions check, ORCHESTRATOR merges on green CI, and production serves code without its schema.
- **Fix:** Run the gate from the base commit: `git show HEAD^1:tools/schema-gate.mjs > "$RUNNER_TEMP/gate.mjs"`, then `node "$RUNNER_TEMP/gate.mjs"`. Fail a PR that changes product code and also changes `tools/schema-gate.mjs` or the `schema-gate` job. Have part-status treat a missing `schema-gate` check on a PR as a blocker.

### 3. low: the expand check can be stale at merge time
- **Where:** ci.yml:597-619 (the check uses `HEAD^1` as of when CI ran); workflow.md:342-343 (the rebase rule exists only in prose); tools/part-status.mjs (no check that a PR is current with main)
- **Defect:** The check proves only that main as it was at CI time works on the new schema. Nothing checks at merge time that the schema PR still contains current main.
- **Failure scenario:** Session A's schema PR Y goes green against main at t0. Session B then merges code PR Z, which needs no new migration but adds a new insert path into the same table. Y merges without a re-run, the dispatch applies it, and Z's path breaks in production. The spec's claim that "app rollback stays possible" (criterion 4) is then false.
- **Fix:** For a PR that adds a migration, part-status (or the gate) requires the base SHA of its latest CI run to equal current `main`; otherwise it reports "rebase and re-run" as a blocker.

### 4. low: the expand check runs main's tests with the PR's fixtures
- **Where:** ci.yml:546-548 (PR-tree `supabase/tests/setup/*.sql` loaded as `postgres`) with ci.yml:615-619
- **Defect:** Main's unchanged tests run against fixture helpers from the PR, and those helpers run as `postgres` and can change product objects.
- **Failure scenario:** False block: a valid expand PR changes a helper that main's tests call, such as `tests.fx_privacy_columns`, and goes red. Mask: a PR fixture sets a default on the new NOT NULL column in the CI database; main's register path passes in CI and fails in production.
- **Fix:** Re-run main's own setup files (`create or replace`) from the base worktree before main's tests. Assert that the fixture step leaves the `nestly` catalog fingerprint (`supabase/ci/catalog-fingerprint.sql`) unchanged.

### 5. low: the workflow text dropped the replaced-dispatch caveat while adding "re-run once"
- **Where:** .claude/workflow.md:333-337. The removed line was "a later push run can replace a pending dispatch, so a cancelled or skipped batch is dispatched again".
- **Defect:** migrate.yml's `concurrency: migrate` keeps only one pending run. The new text allows several schema PRs to share one dispatch and allows one re-run of the gate, which makes a replaced dispatch more likely, and nothing tells ORCHESTRATOR what to do then.
- **Failure scenario:** Y1's push run is in progress and ORCHESTRATOR's dispatch is pending. Y2 merges and its push run replaces the pending dispatch, so db-production never runs. The single gate re-run stays red ("not applied") and the code PR stalls with no next step. The gate stays fail-closed, so nothing unsafe merges.
- **Fix:** Restore the sentence. Re-run the gate only after `gh run view` shows `db-production` succeeded for that dispatch, and re-dispatch if it was cancelled or skipped.

### 6. low: some tests assert source wording and leave out spec cases
- **Where:** tools/schema-gate.test.mjs:368-372 and :384-385 (`/not applied in production/`, `/no successful db-production/`, `/immutable/`, `/deleted/`)
- **Defect:** These expected strings come from the source messages; spec.md names only "split it" and "missing, not green". The spec's "failed apply" case (`conclusion: 'failure'`) is not tested. `main()`'s fail-closed path is not tested, and neither is its `needsEvidence` copy of `evaluate`'s classification.
- **Failure scenario:** A rewording breaks the tests while behaviour is unchanged. Separately, `needsEvidence` can drift from `evaluate` (evidence needed but never fetched) and no test catches it.
- **Fix:** Assert `problems.length > 0` plus the spec phrases, not source text. Add a run with `conclusion: 'failure'`. Test `main` with injected git and fetch.

## Checked, no finding
- Evidence selection: scoped to `migrate.yml`, branch=main, event=workflow_dispatch, both in the API and in the loop. The jobs endpoint returns the latest attempt. Push runs never run production. A `db-production` job in another workflow or on another branch does not count. `head_sha` is checked as hex before the fetch. 20 runs is enough.
- Fail-closed: API errors, timeouts, bad response shapes and fetch errors all turn the gate red. A git error rejects the top-level await (exit 1), and a bad repo name gives exit 2. A head with no migrations cannot occur for a PR to main.
- Renames: with `--no-renames` a rename shows as a delete plus an add, and the deleted name is caught by immutability.
- No false blocks for records-only, test-only, tools, workflow or package.json-only PRs, or for a schema PR's own tests.
- Base rollback test: privacy-backfill.db.test.ts:31-41 skips on the expanded database.
- Token: read-only, no secret, `persist-credentials: false`. Fork PRs get a read-only token.
- Authority: nothing in the diff dispatches; dispatch stays ORCHESTRATOR's delegated path. migrate.yml's header no longer claims daily batching.
- Product paths match spec criterion 1: `api/`, `apps/server/api`, `apps/server/src` (vercel.json includeFiles) and `packages/shared/src`.

## Done · Artifact · Findings · Open · Next owner
- Findings: 6 — 2 medium (#1, #2), 4 low (#3–#6).
- Open: (a) job time — the expand step adds a second `npm ci` and full `test:db` to the 20-min `db` job, unmeasured; default: measure on the first live schema PR (I3 F3.0), raise if over 15 min. (b) `test:db` has never been shown to pass twice on one database; default: the first live schema PR is the proof; a red result there is triaged as a test-isolation bug. (c) Branch protection is off, so `schema-gate` is enforced only by part-status and process; making the check required on main is Afik's decision.
- Next owner: BUILDER for #1 and #2; CRITIC re-checks only those two.

## ORCHESTRATOR's handling (18.10.2026)
- 1 (medium): `-z` for ls-tree and diff, NUL parsing, unreadable records throw → red; any non-`.sql` path under
  supabase/migrations is a problem; tests with a Hebrew migration name.
- 2 (medium): CI runs the BASE commit's copy of the gate (`git show HEAD^1:tools/schema-gate.mjs`; only the PR that adds
  the gate runs its own); product code changed with `tools/schema-gate.mjs` or `ci.yml` in one PR → "split it";
  part-status's CI_NAMES include `schema-gate`, so a missing check blocks. The gate file must stay import-free (tested).
- 3 (low): workflow text says a schema PR is rebased on current main and re-run before merging; enforcement → debt.md.
- 4 (low): debt.md. 5 (low): the replaced-dispatch sentence restored; re-run only after `db-production` succeeded.
- 6 (low): spec phrases + `problems.length`, a `failure` production job, and `main()` with injected git/GitHub
  (evidence fetched only when needed; API, fetch and git errors → exit 1).
- Open (a)(b): measured on the first live schema PR (I3 F3.0). (c): required check on main → Afik's question list.
- Re-check (findings-recheck.md): #1 fixed; #2 one vector left (the PR's ci.yml run line, e.g. `|| true`, beside product
  code) → part-status now reads the PR's file list (API, both sides of a rename) and blocks product code changed together
  with `.github/workflows/ci.yml` or `tools/schema-gate.mjs`; part-status runs from ORCHESTRATOR's checkout, not the PR.
  N1 (low): the test now copies the gate to a temporary directory, imports and runs it there; ci.yml documents the
  recovery (Afik merges the one gate-only fix by hand; never fall back to the PR's copy).
- Re-check 2 (findings-recheck2.md): #2 precondition → mechanism: part-status compares its own file and the gate with
  the PR base's copies through the API (`contents/<file>?ref=<base sha>`) and blocks on any difference or unreadable copy
  ("run part-status from an up-to-date main checkout"); tests. N3: the file list is read before `headAfter`.
