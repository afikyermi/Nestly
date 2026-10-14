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

## Part b — CRITIC (opus), 14.10.2026, PR 16, CI run 38487219359

### Re-check of part a findings 1–4 (the one re-check, Afik's round limit)
1 — CLOSED. The guard refuses a password that fails decodeURIComponent or decodes to NUL, a raw "#" or fragment, and any sslmode but require/verify-full; tests include no password/URL in output. Both hash-check psql steps set PGSSLMODE=require and first connect with all output discarded (also covers libpq errors quoting the URL, e.g. a raw "@").
2 — CLOSED. SWALLOW regex as asked; step-level `if` forbidden except the one-line failure() docker-logs step, which must be last; continue-on-error, set +e, custom shells without -e flagged; mutation table shows the check fails. Recorded, not reopened: `|| echo …`, `|| /bin/true`, `if cmd; then :; fi` undetected (heuristic).
3 — CLOSED. rls-gate-fire.sql (as postgres) fires relation_in_public, anon_privilege on a schema (scratch and nestly), not_owned_by_app_owner on a schema; raises if the gate misses one; green in CI.
4 — CLOSED. matview_or_foreign_table over relkind 'm' and 'f'; both fired as postgres.
(5 closed: product_schema_missing, rls_gate_product() over every schema app_owner owns (fired as app_owner), missing step 2 fails once a migration exists. 6 closed by the guard changes. 7, 8 in debt.md.)

### Part b
verdict: Validated with Concern

concern (to debt.md): rule 15 for every later table rests on is_active_account()'s own status check, untested today and the only guard once F1.5 widens the users policy (b-1); enum value lists in two places with no link (b-2).

--- finding --- severity: low · b-1 · migration :64-74, tests/13
claim: is_active_account()'s own `u.id = auth.uid()` and `u.status = 'active'` are untested; under users_select_own, removing them changes nothing.
failure: body `select exists (select 1 from nestly.users)` → 394/394 pass; after F1.5 lets a suspended user read their own row, the function returns true for suspended/banned and every table it gates opens.
fix: rolled-back fixture adds a permissive `for select to authenticated using (id = auth.uid())` policy; assert S and X false, A true.
--- end ---
--- finding --- severity: low · b-2 · packages/shared constants · apps/server/src/db/schema.ts · migration CHECKs
claim: Drizzle's enum types and the CHECK value lists are separate; drift compares name, type, nullability only.
failure: a migration adds status 'deactivated' without changing ACCOUNT_STATUSES → Drizzle's type lies, CI green (CLAUDE.md consequence 1).
fix: emit each named CHECK's values from the catalog; db-drift compares with enumValues.
--- end ---
--- finding --- severity: low · b-3 · bootstrap/02-anchor-fk.sql · ci.yml step 2
claim: refusal paths never exercised: another role (criterion 9), "exists but differs → raise", unexpected nestly→auth FK.
failure: an edit to drop-and-re-add stays green; on prod an FK changed outside the script would be silently replaced (the check script still catches ON DELETE ≠ restrict).
fix: run as app_owner and expect the role error; swap to CASCADE, expect "differs" and unchanged FK, restore; add a scratch nestly→auth FK, expect "unexpected FK".
--- end ---
--- finding --- severity: low · b-4 · rollback/20261014100000_identity_schema.down.sql :20-31
claim: refuses only on rows in the two F1.1 tables; doesn't check it is the newest applied migration, yet drops schema nestly cascade.
failure: run after F1.4 reaches preview → F1.4's tables dropped, history row stays, db push sees nothing pending.
fix: refuse unless max(version) = '20261014100000'.
--- end ---
--- finding --- severity: low · b-5 · .claude/knowledge/data-model.md "Text limits"
claim: a convention promoted without approval (not in Gate 2 or decisions), naming the wrong feature (F1.4 vs F1.3); JS .trim() strips all Unicode whitespace, btrim only spaces.
fix: remove the row, or move it to F1.3's spec as a recommendation. → **Done by ORCHESTRATOR:** row removed; recommendation added to the I1 initiative file for F1.3's SPEC.
--- end ---

Checked, no finding: own-row reads only (joins, unions, subqueries, guessed ids, enumeration) · no write grant or policy for anyone but the owner, table or column level · no other account's status reachable · app_server without role 42501 · anon, PUBLIC, service_role, app_jobs hold nothing · claims beyond sub ignored · FORCE RLS on both tables · is_active_account INVOKER, search_path '', STABLE, EXECUTE to authenticated only, no recursion · anchor FK RESTRICT, validated, the only nestly→auth FK, RESTRICT works under FORCE (tested) · step 2 one transaction, postgres only, idempotent by fingerprint · down script app_owner only, lifts FORCE in-transaction, refuses on rows · up→down→up fingerprint covers ACLs, default ACLs, policies, function bodies · Drizzle mirrors schema.md, no casts/any; drift fails on missing column, type, nullability, malformed catalog, empty schema · VAL-001 2–60 matches SRS 2.12 · VAL-006, BR-016 composite FK correct · mutations caught: drop FORCE, `or true` on a policy, grant UPDATE, DEFINER; not caught: b-1 · criteria 8–20 covered (9 partly, b-3; 18 as amended) · test hygiene · data access bounded to one row · knowledge promotion accurate apart from b-5.

## Part c — CRITIC (opus), 14.10.2026, local review on 53198e0 (CI db green)

verdict: Validated with Concern

--- finding --- severity: low · c-1 · apps/server/src/app.ts:18 (Fastify() with no logger), plugins/authentication.ts
claim: every log.warn/log.error is a no-op; config failures and 500s are recorded nowhere. When C4 enables a logger, these calls log the whole error object — jose's claim errors carry the token payload (email, metadata) → personal data in a log.
fix: debt for C4: log the rejection reason and jose `code` only, never the error object or cause; until then report config issues where they are seen (stderr at startup), incl. a partly-set auth config. → debt.md.
--- end ---
--- finding --- severity: low · c-2 · tests/identity.test.ts, tests/db/identity.db.test.ts
claim: two security mutations survive: (1) ALGORITHMS widened to HS256 or dropped — alg-none/HS256 still 401 because the EC-only JWKS has no oct key; (2) the whole token payload passed into request.jwt.claims (rule 14) — auth.uid()/role() still green.
fix: (1) serve an in-set key of another algorithm and expect 401; (2) assert request.jwt.claims keys are exactly {sub, role}. → TEST ENGINEER, before the push.
--- end ---
--- finding --- severity: low · c-3 · tests/credentials.static.test.ts
claim: reads app source as text (hygiene rule); the client-options half is a grep a second client or a comment fools.
fix: client options via the exported interface (client.options.max/prepare) → TEST ENGINEER, before the push. The repository credential scan (criterion 27) is a property of the repository's text: **named exception to the TEST ENGINEER hygiene rule, ORCHESTRATOR 14.10.2026** (like the line budgets).
--- end ---

Checked, no finding: deny by default on the root instance before any route (404, HEAD, OPTIONS, bad URLs, prefix/case variants) · one 401 body, no backtracking · jose allow-list checked before key lookup; issuer, audience (lists), exp, sub UUID, nbf tolerance 0; kid refetch ≤ 1/30 s; https or loopback http; role/metadata never read · identity transaction: SET LOCAL ROLE + set_config(…, true) with {sub, role} as a parameter; c24 catches session-level settings · fail closed 503, health 200, non-app_server URL refused · client max 1, prepare false · error handler never echoes DB/library text · no any/casts/suppressions · no TBD filled. Criteria 21–27 met and tested; 28 is ORCHESTRATOR's (7.0 "not yet exercised"; branch Preview behind Vercel protection).
