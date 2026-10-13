## Part a — CRITIC (opus), 14.10.2026, CI run 38477920818

verdict: Validated with Concern

concern (to debt.md): the RLS gate is vacuous today (schema nestly absent) and narrower than its purpose after part b (one schema by name, materialized views skipped). The production credential has one libpq error path that can print the password into a public log. Fix findings 1–4 before the first db-production approval; finding 5 is part b's entry list.

--- finding ---
severity: medium
file:     tools/migrate-url-guard.mjs (password never validated) · .github/workflows/migrate.yml (psql steps)
claim:    WHATWG URL accepts a password with invalid percent-encoding; psql's libpq then rejects it with an error that quotes the decoded password component, which GitHub's whole-secret masking does not cover.
failure:  a raw "%" (or "%00") in the pasted prod password → guard passes → psql prints `invalid percent-encoded token: "<password>"` in a public log. db-check.yml already discards psql output for this reason and sets PGSSLMODE=require; migrate.yml does neither.
fix:      guard rejects a password that fails decodeURIComponent or contains %00 after decoding (+ tests); PGSSLMODE=require on both migrate psql steps.
--- end ---

--- finding ---
severity: medium
file:     tools/db-workflows.test.mjs
claim:    the workflow tests miss `|| true` on migrate's push and hash-check steps, `|| :` in the db job, and a step-level `if:` that skips a step.
failure:  `supabase db push … || true` in the preview job → failed preview, green job, db-production offered for approval; every test green. Same for the hash check (drift gate gone) and `if: false` on pg_prove.
fix:      "no step swallows a failure" over every step of both migrate jobs; match `\|\|\s*(true|:|exit\s+0)(\s|$)`; forbid step-level `if` in the db job and migrate except `failure()` on the log step.
--- end ---

--- finding ---
severity: medium
file:     supabase/tests/02_rls_gate_fires.sql · spec criterion 4
claim:    three checks are never shown to fire: relation_in_public (probe skips, counted as pass), anon privilege on the schema itself, schema ownership.
failure:  delete any of those three branches from tests.rls_gate → all 62 tests pass.
fix:      fire them as postgres in the CI step that already runs as postgres (begin; create violation; assert the gate names it; rollback; fail if missing), or make the probe fail instead of skip.
--- end ---

--- finding ---
severity: medium
file:     supabase/ci/rls-gate.sql (relkind filters)
claim:    a materialized view or foreign table in the product schema cannot carry RLS, and the gate passes it if app_owner owns it and anon has no grant.
failure:  `create materialized view nestly.profile_stats as select * from nestly.users; grant select … to authenticated;` → gate green, every signed-in user reads every user's rows.
fix:      report every 'm' and 'f' relation in the product schema unless listed in data-model "Approved exceptions"; fire test as postgres.
--- end ---

--- finding ---
severity: low
file:     supabase/ci/rls-gate.sql · supabase/tests/01_rls_gate_clean.sql · ci.yml
claim:    the gate inspects one schema by name and passes vacuously when it is absent; bootstrap step 2 skips with a notice when its file is missing.
fix:      part b entry list: assert nestly exists with the expected tables; gate every schema app_owner owns (or assert it owns only nestly); step-2 "skipped" fails once supabase/migrations is non-empty.
--- end ---

--- finding ---
severity: low
file:     tools/migrate-url-guard.mjs
claim:    the URL fragment is not checked (libpq has no fragment: `#?host=…` is applied by psql); TLS not required; the host check has no failing test.
fix:      reject a non-empty hash or raw "#"; sslmode absent or require/verify-full; PGSSLMODE=require; tests incl. a non-pooler host.
--- end ---

--- finding ---
severity: low
file:     .github/workflows/migrate.yml
claim:    the job holding the prod owner credential runs actions and the supabase CLI pinned only by mutable tags / a same-release checksum.
fix:      pin both actions to SHAs in migrate.yml; verify the CLI binary against a committed SHA-256 before any step holds the secret.
--- end ---

--- finding ---
severity: low
file:     .github/workflows/migrate.yml (dispatch to preview)
claim:    a migration edited after preview applied it is silently skipped on preview, while prod applies the new body.
fix:      compare recorded statements with the local file before push and fail on difference, or forbid editing a dispatched migration (rename = new version); record the choice.
--- end ---

Checked, no finding: triggers · job gating (`needs: preview`, main-only `if`, literal environment) · secret scoped per step, no set -x/GITHUB_ENV/outputs/artifacts · prod hash check read-only · db job: no secret/environment/vars, masked per-run values, ON_ERROR_STOP, gate fails on any row, empty suite fails · fire tests for every other check · approved definer list empty = data-model · brief's three mutations caught except `|| true` on migrate push (finding 2) · test hygiene. Not verifiable from the repo: db-production's required reviewer and main-only branch rule — confirm once in GitHub settings.

Open for part b: spec line 58 and criterion 18 still say `is_active_account()` is DEFINER and listed in "Approved exceptions"; Gate 2 decided INVOKER. Part b reconciles criterion 18 with that decision; the gate's list stays equal to data-model.

(Written by ORCHESTRATOR verbatim in substance from CRITIC's returned text; CRITIC cannot write files.)
