# notes — identity-platform (I1 · F1.1), part a

**Approach**
- `.github/workflows/ci.yml`: a new `db` job replaces the "not built yet" comment block. Each run starts a
  `supabase/postgres:17.11.0.004` container. That is the image the pinned CLI 2.120.0 embeds, and PostgreSQL 17.11
  is the minor recorded for nestly-preview/prod. The job then runs, in order:
  1. installs psql, pg_prove (apt) and the CLI (npm, pinned)
  2. generates random per-run passwords, masked
  3. runs a preflight that proves schema.md's `[A]`: roles `anon`/`authenticated`, `auth.users(id uuid)`,
     `auth.uid()`/`auth.role()` reading `request.jwt.claims`, pgTAP available, PG ≥ 17
  4. bootstrap step 1 as `postgres`, then sets the passwords
  5. `supabase db push` as `app_owner`
  6. criterion 6: a second push, with a catalog fingerprint before and after
  7. criterion 7: pushes a fixture migration whose last statement raises, then checks the error message and that the
     fingerprint is unchanged
  8. bootstrap step 2, twice with a fingerprint comparison, plus its check script. This step is skipped (with a
     notice) until the file exists.
  9. installs pgTAP and the gate as `postgres`, plus `supabase/tests/setup/*.sql` when present
  10. runs the RLS gate as `app_server`
  11. runs `pg_prove` as `app_server` over `supabase/tests/**/*.sql` (minus `setup/`), in name order, with
      `PGOPTIONS=-c search_path=pgtap,tests`
- `supabase/ci/`: CI-only SQL, never a migration. It holds `image-preflight.sql`, `catalog-fingerprint.sql`,
  `pgtap-setup.sql`, `rls-gate.sql` and `fixtures/99990101000000_atomicity_probe.sql`.
- `tests.rls_gate(p_schema name default 'nestly')` returns one `(check_name, object)` row per violation. The check
  names are `rls_disabled`, `force_rls_disabled`, `no_policy`, `not_owned_by_app_owner`, `view_not_security_invoker`,
  `definer_not_approved`, `definer_without_search_path`, `anon_privilege` and `relation_in_public`. The approved
  definer list is `tests.approved_security_definer()`, which is empty, matching data-model.md.
- `.github/workflows/migrate.yml` triggers on a push to main (`paths: supabase/migrations/**`, Q3) and on
  `workflow_dispatch`.
  - The `preview` job runs on `db-preview`.
  - The `production` job runs on `db-production`, with `needs: preview` and `if: github.ref == 'refs/heads/main'`.
  - Each job reads only `APP_OWNER_DATABASE_URL`. `tools/migrate-url-guard.mjs <env>` checks it first, and only then
    does `supabase db push` run.
  - The CLI is installed in a step that does not hold the secret.
- `tools/migrate-url-guard.mjs` exports `checkMigrationUrl(raw, environment)` and `PROJECT_REFS` for unit tests. It
  refuses a URL when any of these holds:
  - the user is not `app_owner.<ref>`
  - the port is not 5432
  - the host is not a single `*.pooler.supabase.com` host (as in db-check.yml)
  - there is no password
  - the scheme is wrong
  - there is a query key other than `sslmode`
- Local check: an uncommitted script ran 18 fake-URL cases and confirmed that a refusal reason never contains the
  password or the host.

**Decisions**
- **The container is started by a step (`docker run`), not `services:`.** A service container starts before any
  step, so its superuser password could not be random per run. Started from a step, the password is random and the
  port is bound to 127.0.0.1 only.
- **Pins.** CLI 2.120.0 is the version T5 used (`tools/probes/t5.mjs`). I took the image tag from that CLI binary
  itself, by grepping it for `supabase/postgres:`, and it reports PG 17.11, which matches the recorded prod minor. Both
  workflows carry the same CLI pin.
- **The CLI comes from npm into `$RUNNER_TEMP`, not `supabase/setup-cli`.** This avoids a third-party action in a
  workflow that holds a production secret, and it is the same package T5 ran.
- **No `config.toml`.** I checked locally that `db push --db-url` gets as far as connecting without one. The test used
  a closed port, so nothing was reached.
- **Flags.** `--skip-vault` is on every push, because this CLI otherwise updates vault secrets from config.toml.
  `--agent no` gives plain text output.
- **Fingerprint for criteria 6, 7 and 9.** It covers the structure of every non-system schema, plus the applied
  migration versions. The CLI's own `supabase_migrations` schema is left out, since the CLI may create it lazily on
  the first push. The criterion 7 step also requires the fixture's own error text in the CLI output, so a push that
  fails for another reason does not count as proof.
- **`relation_in_public` ignores its argument** and always looks at `public`.
- **The gate runs as SECURITY INVOKER with `search_path = ''`**, so `app_server` can call it. Fire-tests (criterion 4)
  can build violating objects in their own temp schema as `app_server` (temp table, view, sequence, `pg_temp`
  function, a grant to anon) and call `tests.rls_gate(pg_my_temp_schema()::regnamespace::text)`.

**Deviations**
- **The guard blocks me from writing a criterion 3 pgTAP file.** The brief asked for criterion 3 as pgTAP tests over
  `nestly`, but `.claude/hooks/guard.js` blocks BUILDER from writing anything under `supabase/tests/`. Instead:
  - the checks are callable functions in `supabase/ci/rls-gate.sql`
  - the `db` job enforces them in its own step, which emits one `::error::RLS gate: <check>: <object>` per violation
    and turns CI red
  - a pgTAP wrapper over `nestly`, if one is wanted, and the criterion 4 fire-tests are TEST ENGINEER's.
- **The suite step fails when no test file exists** under `supabase/tests/`. CI stays red on that step until TEST
  ENGINEER's files land. This is deliberate: a suite that silently has zero tests would pass forever.

**Deliberately not done**
- **Criterion test files.** Criterion 2 (the `session_user` assertion), criterion 4's fire-tests, the workflow-parse
  test and the URL-guard unit tests are TEST ENGINEER's. The guard's test would also need adding to `test:tools`.
- **Part b mechanics.** The up → down → up migration run, the anchor FK assertions, and the snapshot of step 2's own
  check output.
- **`01-roles-check.sql` is not run in CI.** Its expected grantor (`supabase_admin`) is hosted-Supabase-specific and
  may differ in the image, so it would only add noise.
- **Nothing touched nestly-preview or nestly-prod.** No workflow was run and nothing was pushed (ORCHESTRATOR's
  instruction this round).

**Uncertain** (none of this ran: there is no Docker, psql or pg_prove on this machine)
- **The image itself:**
  - whether `postgres` is a superuser there. The preflight prints `rolsuper`.
  - whether POSTGRES_PASSWORD sets `postgres`'s password
  - whether readiness needs more than three consecutive logins
  - whether `public` is empty. If not, `relation_in_public` fires on the first run.
- **The apt package name** `libtap-parser-sourcehandler-pgtap-perl` on ubuntu-latest.
- **CLI 2.120.0** is the new TS-based CLI. Whether it applies a migration in one transaction is exactly what the
  criterion 7 step proves. If it fails, it is MATERIAL CHANGE to DATA ARCHITECT per schema.md.
- **With an empty `supabase/migrations`**, the first push may not create the history table. That is harmless here.
- **On a connection failure the CLI prints `host=… user=…`, never the password.** The guard and the workflow never
  print the URL, and GitHub masks the secret value. Strictly, a user name and host can still appear in a CLI error.
- **`concurrency: migrate` keeps one pending run.** A third queued run replaces the pending one. That is harmless
  because each push applies everything pending, but it is worth knowing.

**Preview path**
- **No UI.** After the rebase and the draft PR, check these in Actions → CI → `db`:
  - the preflight step logs `image preflight OK: PostgreSQL 17.11 …`
  - "Bootstrap step 2" shows the "skipped" notice
  - the criterion 6 and 7 steps are green, and criterion 7's log shows `atomicity probe: intended failure`
  - "RLS gate" logs `no violation`
- **Known not to work yet:** "pgTAP suite" fails with "no pgTAP test file" until TEST ENGINEER's tests exist.
- **`migrate`** can only be exercised by a dispatch, which touches nestly-preview. That is ORCHESTRATOR's call, not
  mine.

**Neighbouring**
- **The gate does not cover materialized views or foreign tables.** Neither can carry RLS, so a materialized view in
  `nestly` would serve its rows to anyone granted SELECT. The gate checks their owner and anon grants only. DATA
  ARCHITECT should decide whether to ban them in `nestly`. Not in the spec, so not added.
- **`anon_privilege` does not look at types.** PUBLIC holds USAGE on types by default; without USAGE on the schema
  that is harmless.
- **Order of the pgTAP files.** pg_prove gets the files in lexical path order, so criterion 2's `session_user` file
  should sort first (for example `000-…`).

---

## Round 2 — schema.md Addendum 1 (CI auth functions), after CI run 38471909340 failed at image-preflight.sql:55

**Approach**
- `supabase/ci/auth-functions.sql`: one transaction. It refuses unless `session_user` is a superuser and
  `supabase_auth_admin` exists. Then it runs `create or replace` for `auth.uid()`, `auth.role()` and `auth.jwt()`,
  sets each owner to `supabase_auth_admin`, and grants EXECUTE to PUBLIC.
  - The function text is copied verbatim from nestly-preview. It was read on 14.10.2026 with `tools/db-preview.mjs`,
    using one `begin read only` select of `pg_get_functiondef`, owner and ACL. That includes the trailing space after
    `select`.
  - The normalized hashes on preview equal the three in the addendum.
- `supabase/ci/auth-functions-check.sql`: `begin read only`, then one `do` block, then `commit`.
  - The three pinned hashes live only in this file.
  - For each function: exists, normalized sha256 equals the pin, and `authenticated` has EXECUTE. It also checks that
    `authenticated` has USAGE on `auth`.
  - It raises one error listing every problem, with the target's normalized definition for any hash mismatch.
- `ci.yml` `db` job: two new steps between "Start" and the preflight.
  - Install, as `supabase_admin` with `POSTGRES_PASSWORD` (the addendum's first option).
  - Check, as `postgres`.
  - `image-preflight.sql` is unchanged.
- `migrate.yml`, both jobs:
  - `postgresql-client` is installed in the install step, which holds no secret.
  - A new step runs `psql "${APP_OWNER_DATABASE_URL}" … -f supabase/ci/auth-functions-check.sql` after the URL guard
    and before `db push`.

**Decisions**
- **The check finds each function in `pg_proc` joined to `pg_namespace`, not with `to_regprocedure('auth.uid()')`.**
  Name resolution needs USAGE on schema `auth`. A catalog join needs nothing, so the check runs as any role that can
  read the catalogs, as the addendum requires.
- **No automatic fallback to `docker exec` in the install step.** The first option was tried on CI. The fallback is
  applied only if CI shows the login is refused (see the CI log below), so the job always runs one path.

**Uncertain**
- **The check has not run against nestly-preview or nestly-prod.** My instruction allowed only the
  `pg_get_functiondef` read on preview. The hash expression is identical to the one that read gave, but the two
  privilege checks run there for the first time in the next `migrate` run.
- **`psql` from apt on ubuntu-latest is version 16 against PG 17.** That is enough for `-f` with plain SQL.

**CI log**
- Run 38474691283 (commit adf2351): the auth functions installed as `supabase_admin` over TCP with `POSTGRES_PASSWORD`,
  so no `docker exec` fallback was needed. The check logged `auth functions check OK`, and the preflight logged
  `image preflight OK: PostgreSQL 17.11, postgres rolsuper = f`. Bootstrap 1 and both criterion 6 pushes were green.
- The criterion 7 step then failed with "left behind". **The cause was my fingerprint, not the CLI.**
  - The pushes with nothing pending never create `supabase_migrations.schema_migrations`.
  - The probe push creates it, in plain statements before and outside the migration.
  - The `history` item read `''` for an absent table but a non-empty XML wrapper for an empty one.
  - Fix in `catalog-fingerprint.sql`: the history item is now the array of versions, so absent and empty both read
    `{}`. The schema, relation and function items that would catch a leftover `ci_atomicity_probe` are unchanged, and
    so is the version list. On a mismatch the step now also prints whether the probe schema exists.
- Run 38476223870 (commit 88a1a7f) passed everything up to pg_prove:
  - the auth functions, their check and the preflight
  - bootstrap 1, migrations, and criteria 6 and 7, with the fingerprint fix
  - the RLS gate ("no violation")
  - `00_session_is_app_server` and `01_rls_gate_clean`
- `02_rls_gate_fires.sql:87` then failed with `"zz_v_plain" is not a sequence`, raised inside `tests.rls_gate`.
  **The bug was mine, in `rls-gate.sql`, not in the test.** The sequence branch of `anon_privilege` relied on
  `kind = 'S' and has_sequence_privilege(...)` short-circuiting. SQL does not fix the order AND evaluates in, so a
  view reached `has_sequence_privilege`. It is now guarded with `CASE`.
- Run 38477920818 (commit 655d07e): **all 8 jobs green.** In `db`:
  - auth functions check OK, preflight OK
  - criterion 7 shows `atomicity probe: intended failure`, with the fingerprint unchanged
  - bootstrap step 2 skipped with its notice
  - RLS gate: no violation
  - pg_prove: 3 files, 62 tests, PASS
