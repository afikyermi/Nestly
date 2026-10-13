# schema — identity-platform (I1 · F1.1), part b + migration mechanics of part a

**Gate 2 approved** 13.10.2026 by ORCHESTRATOR, all but "For Afik — ON DELETE": `is_active_account()` INVOKER;
criterion 11 and up→down→up take DATA ARCHITECT's defaults (`decisions/2026-10.md`, "F1.1 Gate 2").
**ON DELETE decided by Afik, 13.10.2026: B — RESTRICT** (`decisions/2026-10.md`, "I1 open points"). Bootstrap step 2
uses `on delete restrict`; data-model.md's "deleting the Auth user cascades" sentence is reworded in part b.

**Author:** DATA ARCHITECT · 13.10.2026 · **Gate 2.** ORCHESTRATOR approves everything except the last section,
which is Afik's. Tags: `[PG]` standard PostgreSQL behaviour · `[A]` assumption, with the test that proves it.

---

## Conventions (data-model.md → "Schema conventions"; recorded there once approved)

| Topic | Decision | Why |
|---|---|---|
| Product schema | **`nestly`**, owned by `app_owner`. Never `public` | rule 7; a name nobody confuses with Supabase's schemas |
| Identifier | **`uuid`**. Generated ids use **`gen_random_uuid()`** (UUID v4: 122 bits from PG's strong random source, OpenSSL CSPRNG `[PG]`). No sequence, identity or counter anywhere in `nestly` | meets Q2 (≥64 CSPRNG bits) with margin. UUIDv7 rejected: it carries the creation time and orders ids, which is the opposite of non-guessable; no native generator on PG 17 |
| Owner / person ids | a person's id **is** the Supabase Auth user id (`auth.uid()`, the JWT `sub`), set by `default auth.uid()` (rule 12). It is issued by Supabase Auth (UUID v4, crypto random `[A]`), never by the client | rules 12–13: policies compare to `auth.uid()` directly, with no lookup table between the token and the row |
| Time | **`timestamptz`** only, default `now()`, microsecond precision, stored UTC. Calendar dates (birth date, due date) are `date`. Never `timestamp without time zone` | an instant is unambiguous; the UI converts to Asia/Jerusalem |
| Naming | snake_case, **plural** tables (`users`, `regular_profiles`, later `children`); singular `<entity>_id` FK columns; `is_`/`has_` booleans; `_at` instants, `_date` dates; constraints `<table>_<column>_<check\|key\|fkey>`; policies `<table>_<command>_<who>`. Never a quoted identifier. Every table and column gets a `COMMENT` with its meaning and SRS id | `user` is a reserved word, so singular breaks on the first table; plural is the common Postgres reading. Comments carry the definition into the database, where raw SQL is written |
| Enums | **`text` + a named `CHECK (… in (…))`**, lowercase snake_case values. The value list lives once in `packages/shared` as a constant; Drizzle declares `text(…, { enum })` from it | a Postgres ENUM cannot drop a value, and `ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it (breaks atomic migrations). A lookup table needs its own RLS for no gain |
| Delete | F1.1 deletes nothing; no `deleted_at`. Account lifecycle lives in `users.status`. When an entity needs soft delete, it is a nullable `deleted_at timestamptz` hidden by its policy — decided per entity against §13.4, never by default | §13.4 retention is TBD |
| RLS helpers | in `nestly`, `language sql`, `STABLE`, **no argument that names a user** (they answer for the caller only), `set search_path = ''` with every name schema-qualified, EXECUTE revoked from PUBLIC and granted to `authenticated` only, called in policies as `(select nestly.fn())`. SECURITY INVOKER unless an approved exception says otherwise | rules 10, 16; one evaluation per statement |
| Status gate placement | on **`users`** the active check is an inline column predicate; on **every other table** it is `(select nestly.is_active_account())`. A table's policy never calls a function that reads the same table | this is what removes the recursion (below) |
| Migrations | hand-written SQL files in `supabase/migrations/`, applied by the Supabase CLI. One file = one unit: table + RLS + FORCE + policies + grants + comments together. No non-transactional statements (`CONCURRENTLY`, enum `ADD VALUE`). Each has a down script in `supabase/rollback/` (outside the CLI's path) | the decided path (2026-10-11); schema and policy are one unit |
| Drizzle | `pgSchema('nestly')` mirrors columns, types and nullability for typing only. **drizzle-kit does not generate or push migrations** (stays under ask). Policies and functions are SQL only | one DDL source of truth; criterion 20 catches drift |

---

**Change**  New schema `nestly`; two tables; one helper function; default privileges for `app_owner`. Before: nothing.

`nestly.users` — SRS User (the anchor)

| column | type | null | default | constraint · meaning |
|---|---|---|---|---|
| `id` | uuid | not null | `auth.uid()` | PK. The person's account id = the Supabase Auth user id. FK → `auth.users(id)` added by bootstrap step 2 |
| `account_type` | text | not null | none | `users_account_type_check`: `regular` · `professional` · `admin` · `moderator` (SRS Role, §3, BR-016). Fixed at creation; never changes (separate accounts, BR-016) |
| `status` | text | not null | none | `users_status_check`: `active` · `suspended` · `banned` (FR-MOD-002, BR-024). Whether the account may use the product now. A warning is not a status. Suspension end dates live in AccountEnforcement, later |
| `created_at` | timestamptz | not null | `now()` | when the Nestly account row was created (not the Auth sign-up) |

Plus `users_id_account_type_key` UNIQUE (`id`, `account_type`) — the target of the subtype FK below.
No default on `account_type` and `status`: F1.4's creation path sets both explicitly, so nothing becomes `regular` or
`active` by accident. **Not stored:** email and login details stay in `auth.users`, reached through the anchor; BR-045
uniqueness is Auth's. A copy would be denormalization → a `DECISION REQUEST` when a feature needs another user's email.
No password or hash (NFR-SEC-001).

`nestly.regular_profiles` — SRS RegularProfile, 1:1 with a `regular` user

| column | type | null | default | constraint · meaning |
|---|---|---|---|---|
| `user_id` | uuid | not null | `auth.uid()` | PK. Shared with `users.id` |
| `account_type` | text | not null | `'regular'` | `regular_profiles_account_type_check`: `= 'regular'`. With `regular_profiles_user_fkey` FK (`user_id`, `account_type`) → `users(id, account_type)` ON DELETE CASCADE, a profile can only belong to a Regular account (BR-016, layer 2) |
| `full_name` | text | not null | none | `regular_profiles_full_name_check`: `btrim(full_name) <> ''` (VAL-001 "required"). **No length limit** — VAL-001 is TBD |
| `gender` | text | null | none | `regular_profiles_gender_check`: `woman` · `man` · `other` · `prefer_not_to_say` (VAL-006, OP-004 closed). NULL = not answered; `prefer_not_to_say` is an answer |
| `created_at` | timestamptz | not null | `now()` | row creation |

Not here: the stage and the due date belong to JourneyContext, the children to Child (§13). Both are F1.4 tables, and
JourneyContext's shape waits on OP-003. My F1.4 lean, not decided: Child references `regular_profiles(user_id)`, so only a
Regular account can hold children.

**Why**  spec part b; §13 User and RegularProfile; NFR-SEC-001/002/006(4); FR-MOD-002; VAL-001, VAL-006.

**Authorization**  Enforcement point: RLS on each table, nothing else.
- Both tables: `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- Grants: `USAGE on schema nestly` and `SELECT` on both tables → `authenticated` only. Nothing to `anon`, `PUBLIC`,
  `service_role`, `app_server` or `app_jobs`. No INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER to anyone but
  the owner (criterion 13 is refused by privilege first, and there is no policy behind it either).
- Migration also runs `alter default privileges revoke execute on functions from public` for `app_owner`, so no future
  function is born executable by `anon`.
- Policies (the only two):

```sql
create policy users_select_own on nestly.users for select to authenticated
  using (id = (select auth.uid()) and status = 'active');
create policy regular_profiles_select_own on nestly.regular_profiles for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
```

**`is_active_account()` — recommended SECURITY INVOKER, so no approved exception**

```sql
create function nestly.is_active_account() returns boolean
  language sql stable security invoker set search_path = ''
  as $$ select exists (select 1 from nestly.users u where u.id = auth.uid() and u.status = 'active') $$;
revoke execute on function nestly.is_active_account() from public;
grant  execute on function nestly.is_active_account() to authenticated;
```

- **Recursion is removed by placement, not by privilege:** the `users` policy checks its own `status` inline and never
  calls the function, so reading `users` from inside the function cannot re-enter it.
- **Invoker is enough:** the caller already reads its own active row through `users_select_own`. Under FORCE RLS a
  definer owned by `app_owner` inherits the same `TO authenticated` policy (P3) and sees exactly what the caller sees —
  it would gain nothing and cost an exception.
- **The body checks `id = auth.uid()` and `status` itself, not trusting the policy,** so if F1.5 lets a suspended user
  read their own row (to be told why), the function still answers false.
- Criterion 18 holds: no argument, caller only. Criterion 19: `anon` has no USAGE on `nestly` and no EXECUTE.
- **Fallback if ORCHESTRATOR keeps rule 16's wording (definer):** same body, `security definer`, owned by `app_owner`,
  listed in "Approved exceptions". It works for the same reason (no recursion: inline gate on `users`) and reads `users`
  through the inherited `users_select_own`.
- **The open note under rules 16–17, resolved for this class:** caller-only helpers (`is_active_account`, and likely
  `has_permission`) are invoker and read through the caller's own-row policies. Definer functions that must reach
  *other* users' rows (rules 17–19) are still open; the candidate is a named `TO app_owner` policy per table, listed as an
  exception, decided with the first one. A backfill pattern is also still open (none here).

**Migration**  (part a mechanics, then part b)

*Tool:* Supabase CLI, `supabase db push --db-url <url>`, pinned version, same command in CI `db` and in `migrate`.
History in `supabase_migrations` (app_owner owns it, via CREATE on the database).

*CI `db` job (criterion 1), disposable, no secrets:*
1. Service container `supabase/postgres`, PG 17 tag pinned to prod's minor. `[A]` it ships roles `anon`/`authenticated`,
   schema `auth` with `auth.users` and `auth.uid()`, and pgTAP. Part a proves this first; if it fails, fall back to the
   CLI local stack with an empty migrations directory. Neither → `MATERIAL CHANGE` back to me.
2. As `postgres`: `01-roles.sql`, then random per-run passwords for `app_owner` and `app_server` (`openssl rand`; never a
   real one).
3. As `app_owner`: `supabase db push --db-url <app_owner URL on localhost:5432, the per-run password>`.
4. As `postgres`: `02-anchor-fk.sql` **twice** + `02-anchor-fk-check.sql`; the second run must leave a catalog snapshot
   unchanged (criterion 9).
5. As `postgres`, CI only: pgTAP into a test-only schema, plus a `tests` schema with fixture helpers (create Auth users,
   set a status — criterion 15 flips status mid-test). Migrations never create these; the structural checks cover
   `nestly` only; none of it reaches any real environment. Grant `app_server` USAGE on them.
6. `pg_prove` connected **as `app_server`** (criterion 2: `session_user`, which SET ROLE cannot fake).

*Atomicity (criterion 7):* `[A]` the CLI runs each file and its history row in one transaction. The criterion 7 test
(a fixture migration whose last statement fails) proves it. If false, `MATERIAL CHANGE` to me — do not add `begin;`
to files by improvisation.

*Part b, one migration file* `supabase/migrations/<ts>_identity_schema.sql`: create schema → default privileges →
`users` → `regular_profiles` → checks, FKs, unique → RLS + FORCE → function → policies → grants → comments.

*Bootstrap step 2* `supabase/bootstrap/02-anchor-fk.sql` (+ `02-anchor-fk-check.sql`), same style as step 1:
- one transaction; `raise exception` unless `current_user = 'postgres'`; requires `nestly.users` to exist and be owned
  by `app_owner`;
- if `users_id_fkey` is absent: `alter table nestly.users add constraint users_id_fkey foreign key (id) references
  auth.users (id) on delete <AFIK'S CHOICE>`, run as `postgres` itself (not `set role`);
- if present and identical (target, columns, action, validated): no-op. If present and different: **raise, never
  repair** (it means something else changed it).
- Check script: one row — exists, target `auth.users(id)`, action, `convalidated`, owner still `app_owner`, and it is the
  only FK from `nestly` to `auth`. pgTAP asserts the same (criterion 8).
- Order per environment: migrate → step 2 → only then may F1.4 (the first writer) deploy.

**Rollback**
- Migration: `supabase/rollback/<ts>_identity_schema.down.sql` — `drop schema nestly cascade` (takes the tables, the
  anchor FK, policies, function), restore the default privilege, delete the history row (equivalently
  `supabase migration repair --status reverted <ts>`). Safe **only while the tables are empty**, i.e. until F1.4 writes.
  After that it destroys personal data → Afik. QUESTION below: CI runs up → down → up once.
- Bootstrap 2: `alter table nestly.users drop constraint users_id_fkey`. Re-adding needs `postgres`.
- CI job, workflow: revert the commit.

**Backfill**  None. New, empty tables.

**Indexes**  `users_pkey` (id) — every policy and `is_active_account()` look up by id. `users_id_account_type_key` —
target of the subtype FK; one extra small btree per account insert, accepted. `regular_profiles_pkey` (user_id) —
own-row reads, and the cascade lookup from `users`. No index on `status`: no query filters by it yet.

**Integrity**
- `regular_profiles` → `users`: ON DELETE CASCADE (the profile is part of the account), ids never update.
- `users` → `auth.users`: **Afik's choice, last section.**
- Orphans: a Nestly user without an Auth user is impossible once step 2 runs. An Auth user without a `users` row is
  allowed and reads nothing (criterion 17). A `regular` user without a profile is possible; F1.4 creates both in one
  transaction (rule 11).
- `account_type` and `status` are unwritable by `authenticated`. When I2 adds UPDATE, it grants column-level UPDATE that
  excludes both.

**Blast radius**  Nothing reads `nestly` today. New consumers: part c (Drizzle), pgTAP, the structural checks. On
`auth.users`, the FK adds hidden triggers: from step 2 on, deleting an Auth user (dashboard or Auth admin API) follows
Afik's ON DELETE choice.

**Reversible?**  **Yes, until F1.4 writes the first row.** The migration and step 2 both have down scripts. The
ownership point (`app_owner` owns `nestly`) can be undone while it is empty. The anchor's ON DELETE choice is
reversible as a setting, but a cascade that has already run is not.

---

## For Afik — ON DELETE

**What this decides.** Every Nestly account is tied to its login in Supabase Auth (the "login record": email and
password). This choice decides what happens to the person's Nestly data when that login record is deleted — by you in
the Supabase dashboard, or later by a "delete my account" feature. Today that data is the account and profile (name,
gender). From F1.4, the children's names and birth dates, the journey and the consents hang off the same account.

**A. Delete along ("cascade").** Deleting the login instantly deletes the Nestly account and everything chained to it.
- *Now:* the account and profile disappear with the login. One click, nothing left behind.
- *With children (F1.4):* the children's records go too, unless their own link is set to something else.
- *Risk:* no undo. The Free plan has no backups, so a wrong click in the dashboard erases a family's data for good.
  It also decides retention (§13.4, still TBD) by accident: "deleted at once".

**B. Refuse ("restrict").** The login cannot be deleted while a Nestly account still exists. Deleting a person becomes
a deliberate two-step process: Nestly first deletes or anonymises its data, then the login is deleted.
- *Now:* deleting a user in the dashboard fails with an error until their Nestly row is removed first. For test users
  that is one extra step.
- *With children (F1.4):* nothing is lost by accident. The future account-deletion feature (USER_DATA_EXPORT_DELETE)
  decides what goes, what is kept and for how long, once §13.4 is decided.
- *Cost:* that deletion feature must exist before launch, or nobody can be deleted cleanly.

**C. Keep and mark ("soft delete").** The account stays, is marked closed and hidden, and is purged after a retention
period. Not available as a database setting here, because the Nestly id *is* the login id. It is option B plus a
"closed" status, added when retention is decided. Choosing B now keeps C open.

**My recommendation: B (refuse).**
- Retention is TBD, so the safe setting is the one that decides nothing by itself.
- Children's data should never be destroyed, or kept, as a side effect of a dashboard click.
- B → A later is a one-line change you run. A → B after a deletion cannot bring data back.

If you choose B, the sentence in `data-model.md` that says deleting the Auth user cascades gets reworded.
Only bootstrap step 2 waits on this; everything else proceeds.

---

## Addendum 1 — CI auth functions

**Approved** 14.10.2026 by ORCHESTRATOR (MATERIAL CHANGE on [A], not reserved): option (a), with the hash check also before every `db push` on preview and prod (read-only catalog query inside the approved job).

**Author:** DATA ARCHITECT · 14.10.2026 · answers the `MATERIAL CHANGE` from PR 15, CI run 38471909340, job `db`
(`image-preflight.sql:55`). Replaces assumption `[A]` of "CI `db` job" step 1 for `auth.uid()` / `auth.role()` only;
`auth.users`, the roles and pgTAP passed and stay as written. **Reversible:** yes — CI-only files and steps, no data.

**What failed.** `supabase/postgres:17.11.0.004` ships `auth.uid()` and `auth.role()` from its own init scripts, which
do not read `request.jwt.claims`. A real project gets newer definitions from the Auth service's migrations. Read
read-only from nestly-preview on 14.10.2026 (`tools/db-preview.mjs`, `begin read only`; PG 17.11, all three
`LANGUAGE sql STABLE`, SECURITY INVOKER, no `SET`, owner `supabase_auth_admin`, EXECUTE to PUBLIC):

| function | returns | body (whitespace aside) | normalized sha256 on preview |
|---|---|---|---|
| `auth.uid()` | uuid | `select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid` | `d6dbd1274f41320d098fa39bbf8a1949bc608a6092e7d996ba21453e068f644b` |
| `auth.role()` | text | same shape, `request.jwt.claim.role` / `->> 'role'`, `::text` | `63428ce1089b4f6517fbbc1c7ddd0d710b335032d20210d750353229e48a64cb` |
| `auth.jwt()` | jsonb | `select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb` | `96c51f009347aad9a3e8292d05dd1fc6ffda46bf4b641335d452909994750bee` |

Normalized sha256 = `encode(sha256(convert_to(btrim(regexp_replace(pg_get_functiondef(oid), '\s+', ' ', 'g')), 'UTF8')), 'hex')`.
Whitespace is collapsed so an editor stripping trailing spaces (preview's body has `select ` with one) or a line-ending
change cannot fail it; any change to a name, a setting key, a cast, volatility, `SECURITY DEFINER` or a `SET` does.
Also on preview: `postgres` is **not** a superuser, `supabase_admin` is.

**Decision: option (a), with the drift check made a gate rather than a note.**

1. **`supabase/ci/auth-functions.sql`** — pinned copy, CI only, never in a migration. Header: source (nestly-preview,
   14.10.2026, this addendum), "do not edit by hand; re-pin per 4". One transaction: `raise exception` unless
   `session_user` is a superuser and role `supabase_auth_admin` exists; `create or replace function` for `auth.uid()`,
   `auth.role()`, `auth.jwt()` with exactly the definitions above (signature, return type, `language sql stable`,
   body — copy the text from preview, not from this table); `alter function … owner to supabase_auth_admin`;
   `grant execute … to public`. `auth.jwt()` is included although no part-a/b policy uses it: it costs nothing,
   the L2 analysis already lists it beside `auth.uid()` (`.work/infra-7.3/owner-role.md`), and the first policy that reads a claim would otherwise hit the same
   wall. `auth.email()` is not included — no policy may key on email.
2. **`supabase/ci/auth-functions-check.sql`** — read-only, runs anywhere: `begin read only;` a `do` block that, for
   each of the three functions, compares the normalized sha256 with the pinned value (the three literals above, held
   once in this file) and checks `has_schema_privilege('authenticated', 'auth', 'USAGE')` and
   `has_function_privilege('authenticated', <fn>, 'EXECUTE')`; on any mismatch it raises one error naming the function
   and printing the target's normalized definition (public Supabase code, no secret), so a re-pin can be made from the
   log; `commit;`. Runs as any role that can read the catalogs (`postgres`, `app_owner`).
3. **CI `db` job, new order:** start → **install** `auth-functions.sql` as `supabase_admin` (the image's superuser;
   `[A]` its password is `POSTGRES_PASSWORD`; if that login is refused, run the same file with
   `docker exec -i nestly-ci-db psql -U supabase_admin` over the container socket; if neither works → `BLOCKER` to me,
   do not try other roles) → **check** `auth-functions-check.sql` as `postgres` → existing `image-preflight.sql`
   unchanged (it now proves behaviour: `auth.uid()`/`auth.role()` read `request.jwt.claims`) → bootstrap step 1 → as
   before. `supabase_admin` is used for this one setup step of a disposable database only; the suite still runs as
   `app_server`, and nothing at runtime gains a role.
4. **`migrate` workflow, both jobs:** install `postgresql-client` in the install step (before the secret is in any
   step), then, after the URL guard and **before** `supabase db push`:
   `psql "${APP_OWNER_DATABASE_URL}" -X -q -v ON_ERROR_STOP=1 -f supabase/ci/auth-functions-check.sql`.
   A mismatch stops the job before anything is applied. This is a catalog read on prod inside the job Afik already
   approves on `db-production`; it writes nothing.

**Why this still proves platform rule 3 against production behaviour.** RLS outcomes depend on what `auth.uid()`
returns for a given `request.jwt.claims`. CI no longer trusts the image for that: it installs the deployed
definition, and the same hash check that passes in CI must pass on nestly-preview and on nestly-prod before any
migration reaches them. So every pgTAP result was produced by function text proven identical (modulo whitespace) to
the text the migration's target runs, at the moment of migrating. The rest of what rule 3 needs is PG itself
(`SET LOCAL ROLE`, `set_config(…, true)`, FORCE RLS), which the image runs at prod's minor, 17.11.

**How drift is caught.**
- *Pinned copy vs pinned hashes:* every CI run (step 3). A hand edit that changes meaning fails CI.
- *Supabase changes the functions on the platform:* the next `migrate` run on preview or prod fails before push.
  Residual, accepted: a platform change between two migrations is seen at the next migration, not the day it happens;
  no CI result is relied on in between.
- *CLI / image bump:* nothing to re-check for these functions — the image's own definitions are overwritten. The
  existing preflight still checks the rest of `[A]` on the new image. If a bump makes `create or replace` fail (a
  changed signature or owner), CI says so.
- *Preview and prod disagree:* the pinned file can match only one, so one migrate job fails → `MATERIAL CHANGE` to me.
- **Re-pin procedure (internal change, not a gate):** read the definitions from preview with `tools/db-preview.mjs`
  read-only (or from the migrate log for prod), update both files and the hashes, record it in `notes.md`. **If the new
  definition no longer reads the `sub` / `role` of `request.jwt.claims`, it is a `MATERIAL CHANGE` to me** — rule 3
  depends on it.

**Rejected.**
- (b) CLI local stack — its Auth container applies the migrations of the CLI's pinned Auth version, not the hosted
  one, so fidelity to prod would still be unproven without this same hash check; it adds ~6 images and minutes per run,
  a `config.toml`, and a stack that applies `supabase/migrations` itself on start, which muddies "migrations as
  app_owner through `db push`" (criteria 1, 6, 7).
- Our own stub functions in CI — a second definition of the current user that can drift from `auth.uid()`; the
  reason L2 was rejected (decisions 2026-10, owner role). The pinned copy is not ours; it is hash-bound to the target.
- Changing `image-preflight.sql` to accept the legacy keys — would test a behaviour the platform does not have.

**Rollback.** Remove the two files and the steps; CI returns to the failing preflight. No database outside CI is
touched.
