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

---

# notes — identity-platform, part b (identity schema) + part a's CRITIC findings

**Approach**
- **Part a findings first** (commit 1b09f97):
  - Finding 1 and low 6, `tools/migrate-url-guard.mjs`. It now refuses:
    - a password that `decodeURIComponent` rejects, or one that decodes to a NUL
    - any raw `#`, and a non-empty fragment
    - an `sslmode` other than `require` / `verify-full`. Absent is allowed, because the workflow sets PGSSLMODE.

    No refusal reason names the password.
  - `migrate.yml`, both jobs:
    - `PGSSLMODE: require` on the psql step
    - first a connection (`select 1`) with every line of psql output discarded
    - then the hash check with its output kept, so a re-pin can still be made from the log
  - Finding 4, `rls-gate.sql`: a new check, `matview_or_foreign_table`, for any `m` / `f` relation in the schema. There
    is no approved list: data-model's "Approved exceptions" has none, and a list is one function away once one is
    approved.
  - Finding 5:
    - `tests.rls_gate_product()` runs the gate over `nestly` and over every other schema `app_owner` owns. The CLI's
      `supabase_migrations` is the one exception.
    - It adds `product_schema_missing`, and `history_schema_unexpected`. The second covers any function in
      `supabase_migrations`, and anything there other than `schema_migrations` / `seed_files`.
    - The CI gate step now calls it.
    - A skipped bootstrap step 2 now fails once `supabase/migrations` has a file.
  - Finding 3: `supabase/ci/rls-gate-fire.sql`, run as `postgres` in the step that installs the gate. It is one
    transaction, rolled back, and it creates:
    - a table in public
    - a scratch schema owned by postgres, with anon USAGE (fires the schema-ownership and anon-on-schema checks)
    - anon USAGE on `nestly`
    - a materialized view and a foreign table (postgres_fdw) in `nestly`
    - a table in `supabase_migrations`

    It then drops `nestly`. It raises, naming every expected row the gate did not return.

    `rls-gate-fire-owner.sql` runs as `app_owner` for the one case postgres cannot build: a second schema owned by
    `app_owner`. Postgres holds `app_owner` with SET FALSE.
- **Part b** (commit 0a1e910):
  - `supabase/migrations/20261014100000_identity_schema.sql`, as in schema.md:
    - the schema and its default privileges
    - the two tables, with named constraints inline
    - RLS + FORCE
    - `is_active_account()`, INVOKER
    - the two policies and the grants
    - comments on the schema, the tables, every column, the function and the policies
  - `supabase/rollback/20261014100000_identity_schema.down.sql`, run as app_owner.
  - `supabase/bootstrap/02-anchor-fk.sql` and `02-anchor-fk-check.sql`. The README gains step 2 and its rollback.
  - CI `db` job, the migration step now:
    1. applies all but the newest migration
    2. takes a fingerprint
    3. applies the newest
    4. runs its down script and requires the fingerprint from before it
    5. applies it again and requires the first "up" fingerprint

    The step-2 check must print `ok = t`. A new step runs the Drizzle drift check (criterion 20).
  - `apps/server/src/db/schema.ts`: `pgSchema('nestly')` and the two tables. The enums come from `packages/shared`
    (`ACCOUNT_TYPES`, `ACCOUNT_STATUSES`, `PARENT_GENDERS` in `constants/identity.ts`).
  - The drift check:
    - `supabase/ci/catalog-columns.sql` prints every non-system column as JSON.
    - `apps/server/scripts/drift.ts` is pure: `drizzleColumns`, `normalizeType`, `compareColumns`, `parseCatalog`.
    - `scripts/db-drift.ts` is the entry point: `npm run db:drift -w @nestly/server -- <file>`.
    - It exits 1 with one problem line each, and 2 on unreadable input. It also fails when Drizzle declares no column
      at all.

**Decisions**
- **VAL-001 length in the CHECK** (from the brief; ORCHESTRATOR decided the length on 13.10, SRS 2.12):
  - `regular_profiles_full_name_check` is `char_length(btrim(full_name)) between 2 and 60`. It replaces schema.md's
    `btrim(full_name) <> ''`.
  - This is an internal how: the SRS decided the length after Gate 2.
  - `btrim` trims spaces only, as VAL-001 says (spaces at the edges). `char_length` counts code points.
- **The down script lifts FORCE RLS in its own transaction before it counts rows.** With FORCE on and no policy TO
  app_owner, the owner sees zero rows whatever the table holds, so the count would always say "empty". The script
  refuses if any row exists.
- **Up -> down -> up covers whichever migration is newest**, not only this one. A newest migration without a down
  script fails CI. The fingerprint after the down must equal the one from before the migration, which also proves that
  the default privilege is restored.
- **Step 2 also raises if any other FK from `nestly` reaches into `auth`** (data-model: exactly one). Like step 1, it
  checks `current_user` only.
- **In CI only, `app_owner` gets USAGE on `tests` and EXECUTE on its functions**, for the owner fire-test.
- **Drizzle declares the defaults** (`auth.uid()` via `sql`, `defaultNow()`, `'regular'`), so insert types leave them
  optional. drizzle-kit is not installed, and nothing generates DDL from this file.
- **The drift check reports only what criterion 20 names**: a Drizzle column that is missing, or that differs in type
  or nullability. It does not compare:
  - database columns that Drizzle does not name
  - enum value lists against the CHECKs
  - defaults
- **The scripts live in `apps/server/scripts/`.** They are typechecked (tsconfig include) and linted, but sit outside
  the build's `src` rootDir, so they do not ship.
- **migrate.yml's probe is a shell function**: `probe` runs psql with the URL, and the next line runs
  `probe >/dev/null 2>&1`. The workflow test "nothing writes the URL to a file" flags any `>` on a line that names the
  URL, `/dev/null` included.
- **Server dependencies**: `drizzle-orm` ^0.45.4 (the spec lists it as already decided) and `@nestly/shared` (a
  workspace). In this part, the server's runtime entry does not import either.

**Deviations**
- schema.md's full-name CHECK, which had no length: replaced (see Decisions). Nothing else differs from schema.md or
  the spec.

**Deliberately not done**
- **Tests.** They are TEST ENGINEER's, and the guard blocks me from writing them anyway:
  - the pgTAP tests of criteria 8 and 10–19, plus the fixture helpers under `supabase/tests/setup/`
  - unit tests of the new guard refusals (finding 1 asks for "+ tests")
  - unit tests of `scripts/drift.ts`, and a fire-test for the drift check
  - finding 2's workflow tests
- **`data-model.md`.** All of these are DATA ARCHITECT's, and `.claude/**` is frozen for me:
  - the sentence "deleting the Auth user cascades"
  - the wording of rule 16
  - the conventions and the entities
  - the "Approved exceptions" note
- **Lows 7–8** (action SHA pins and a CLI checksum; a migration edited after a preview dispatch): left for debt.md.
- **Zod or length constants for VAL-001** belong to F1.3. I added no `FULL_NAME_*` constant.
- Nothing ran against nestly-preview or nestly-prod.

**Uncertain**
- **Grapheme vs code point for "60 characters."** In a Hebrew name with niqqud, each mark counts as a character. F1.3's
  Zod check should count the same way as the CHECK does.
- **`seed_files`** is on the history schema's allowed list in case the CLI creates it. That is harmless if it never
  does.
- The CI log section below records what CI resolved: postgres_fdw and postgres's REFERENCES on `auth.users` in the
  image, and the default-ACL entry after the down script.

**Preview path**
- Part b has no UI and no route. In Actions → CI → `db` on PR 16, check that:
  - the migrations step ends with `20261014100000_identity_schema: up -> down -> up OK`
  - "Bootstrap step 2" logs `users_id_fkey added`, then `already present and identical`, then the row
    `t | t | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT | restrict | t | app_owner | 1`
  - the Drizzle step logs `drizzle drift: none (9 columns in 2 tables match the database)`
  - the postgres step logs `rls-gate-fire (violations): all 7 expected violations reported`, then the
    `(nestly absent)` and `(app_owner)` lines
  - "RLS gate" reports no violation
- After the merge, `migrate` applies the migration to nestly-preview, then waits for Afik on db-production. Bootstrap
  step 2 then runs once per environment (see the README).

**Neighbouring**
- `tools/db-workflows.test.mjs`, in "writes the URL to a file", treats `>/dev/null` as a file write (see Decisions).
  This is a FINDING for TEST ENGINEER; I did not change the test.

**CI log**
- Run 38483560356 (commit 0a1e910, PR 16) passed all 8 jobs on the first run. In `db`:
  - The migrations step logged `20261014100000_identity_schema: up -> down -> up OK`. The fingerprint after the down
    equals the one from before the migration, so the default-ACL entry is gone again after the down.
  - Bootstrap step 2: `users_id_fkey added`, then `already present and identical`, and the check row was
    `t | t | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT | restrict | t | app_owner | 1`. So in the
    image, postgres holds REFERENCES on `auth.users`.
  - Drift: `drizzle drift: none (9 columns in 2 tables match the database)`.
  - Fire harness:
    - `rls-gate-fire (violations): all 7 expected violations reported`. postgres_fdw worked as postgres.
    - `(nestly absent): all 1`
    - `(app_owner): a second schema owned by app_owner is gated`
  - RLS gate: no violation. pg_prove: 3 files, 62 tests, PASS. TEST ENGINEER's part b tests are not in yet.

---

# notes — identity-platform, part c (server identity)

**Approach**
- `apps/server/src/lib/config.ts`: `readConfig(env)` reads four names, never a value: `SUPABASE_JWKS_URL`,
  `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `DATABASE_URL`. Anything missing or unusable is `undefined`, and the
  problem goes to `issues` (names only). The JWKS URL must be https (http only on a loopback host). `DATABASE_URL` must be
  a postgres URL whose user is `app_server` or `app_server.<ref>`; any other user is refused (rules 1, 2).
- `src/lib/token-verifier.ts`: `createTokenVerifier(auth)` → `jose.jwtVerify` with `createRemoteJWKSet`,
  `algorithms: ['ES256']`, issuer, audience, `requiredClaims: ['sub', 'exp']`; `sub` must be a uuid. Only `sub` is
  kept. It throws `TokenRejected('token')` for jose's token failures, and `TokenRejected('unavailable')` for anything
  else (JWKS unreachable, timeout, non-200, not a key set).
- `src/db/client.ts`: `createDatabase(url)` → postgres-js `{ max: 1, prepare: false }` + Drizzle. Lazy: nothing connects
  until the first query.
- `src/db/identity-transaction.ts`: `inIdentityTransaction(database, identity, work)` → one Drizzle transaction that
  runs `set local role authenticated`, then `set_config('request.jwt.claims', '{"sub":…,"role":"authenticated"}', true)`,
  then `work(tx)`.
- `src/plugins/authentication.ts`: a root `onRequest` hook. `PUBLIC_ROUTES` = `{'GET /api/health'}`, matched on
  method + route pattern; anything else, including unmatched paths (404s) and `HEAD /api/health`, is protected.
  - auth config or database missing → 503 `{"error":"unavailable"}`, before the token is read
  - no `Authorization: Bearer <token>`, or any token failure → 401 `{"error":"unauthenticated"}` + `WWW-Authenticate:
    Bearer`
  - JWKS unusable → 503 `{"error":"unavailable"}`
  - success → `request.identity = { userId }`; the handler runs queries with `request.inIdentityTransaction(tx => …)`.
- `src/app.ts`: `buildApp({ config?, database? })`. Defaults: `readConfig(process.env)`, and a client created from
  `DATABASE_URL` and closed in `onClose`. An error handler replaces Fastify's default body (which carries
  `error.message`, e.g. a Postgres "permission denied for table users") with `{"error":"bad_request"}` (4xx) or
  `{"error":"internal"}`.
- Dependencies: `jose` ^6.2.12, `postgres` ^3.4.9 (both decided; spec "Risk flags").
- CI: `apps/server` `test` excludes `tests/db/`; `test:db` runs only it. The `db` job builds `CI_APP_SERVER_DB_URL`
  (masked) and, after pgTAP, runs `npm run test:db -w @nestly/server` with `DATABASE_URL` set to it.

**Test seams (for TEST ENGINEER)** — no test-only branch in production code:
- `buildApp({ config: { auth: { jwksUrl, issuer, audience }, databaseUrl: undefined, issues: [] }, database })`. A
  local JWKS on `http://127.0.0.1:<port>/…` is accepted (by `readConfig` too). Generate keys with jose
  `generateKeyPair('ES256')`; serve `{ keys: [{ ...exportJWK(pub), kid, alg: 'ES256' }] }`.
- Register a test route on the returned app before `ready()`/`inject`; it is protected because it is not on the list
  (criterion 21). Read the caller's row with `request.inIdentityTransaction(tx => tx.select().from(users))`
  (`src/db/schema.ts`).
- Criterion 24: create the database with `createDatabase(process.env.DATABASE_URL)` and pass it in; with `max: 1`
  `database.client` is the same single connection, so `` database.client`select current_user, current_setting('request.jwt.claims', true)` ``
  after a request inspects exactly that connection. Close it yourself (an injected database is the caller's).
- Criterion 25/22 "no query runs / no transaction opens": the hook rejects before any handler, and a handler is the only
  place that opens one. Observable, e.g., via `pg_stat_database.xact_commit` or by a handler counter.
- Fixtures: `tests.set_status`, `tests.fx_id` (supabase/tests/setup/10_identity_fixtures.sql) are callable by app_server
  — on a separate `createDatabase` client, not the app's.
- Criterion 26 JWKS unreachable: point `jwksUrl` at a closed loopback port → 503. Missing config: `auth: undefined` /
  `databaseUrl: undefined` → protected 503, health 200.
- DB tests go in `apps/server/tests/db/` (they run only in the CI `db` job); the rest in `apps/server/tests/`.

**Decisions**
- **The claims the database sees are `{sub, role: 'authenticated'}` only**, not the whole payload with `role`
  overwritten. Rule 14 lets nothing beyond the user id come from the token, so no policy can come to rely on
  `app_metadata`. A future need for e.g. `aal` (MFA) adds that claim explicitly.
- **503 vs 401.** A token failure is 401; a check that could not be made (config missing, JWKS down) is 503. Both bodies
  are fixed. 401 for a JWKS outage would tell the client its session is bad (F1.5 would sign the user out).
- **Missing config is checked before the token**, so a misconfigured instance answers the same for every request.
- **`DATABASE_URL` with another role's user is treated as unset** (protected routes 503, health 200), and logged as an
  issue by name — rather than crashing the function and losing `/api/health`.
- **No clock tolerance**: jose's default (0). Not a spec value; a tolerance would be a decision.
- **Error code strings** `unauthenticated`, `unavailable`, `bad_request`, `internal`: §10 has no ERR entry for a bad
  token; the web app maps them when F1.5 needs it.

**Deviations** — none from spec.md. The error handler goes slightly beyond criterion 22 (see Approach); it exists so a
Postgres message from the identity transaction never reaches a response (conventions, "User-facing errors").

**Deliberately not done**
- Tests (TEST ENGINEER's): criteria 21–27, unit (`tests/`) and integration (`tests/db/`).
- No `/api/me` (Q1). Rate limiting, log policy (C4): out of scope; `app.log` is Fastify's default (off), so `issues`
  and rejection warnings are silent until C4.
- `DATABASE_URL` and the three `SUPABASE_*` names are not set on Vercel (Q1: no deployed route needs them). Until they
  are, every protected route on the Preview answers 503, which is the fail-closed behaviour.
- 7.0: the server's runtime path does not import `@nestly/shared` (only `src/db/schema.ts` does, and nothing at runtime
  imports it yet) → "not yet exercised".

**Uncertain**
- Fluid compute may run concurrent requests in one instance; with one connection they queue. That is rule 5 as decided.
- postgres-js with `max: 1` never reconnects proactively after a pooler-side idle close; the next query reconnects.
  Not observed yet against the real pooler (port 6543), only by reading.

**Preview path**
- After the draft PR's Preview deploys: `GET /api/health` → 200 `{"status":"ok"}`; `GET /api/anything` → 503
  `{"error":"unavailable"}` (no auth config on Preview). No UI.
- CI → `db` → "Server integration tests as app_server (part c)" fails with "No test files found" until TEST ENGINEER's
  `tests/db/` files land. Everything before it should be green.

**Neighbouring** — none found.
