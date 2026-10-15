# schema — F1.5 part a: a stopped account reads its own `users` row

**Gate 2: approved** by ORCHESTRATOR, 15.10.2026. Finding 7 confirmed: not a change to the security model (the enforcement point is unchanged; a stopped account sees only its own account row). The code and the migration roll back together (finding 2).

**Author** DATA ARCHITECT, 15.10.2026 · **Spec** `.work/login-session/spec.md` criteria 1–4 · **Decision** DR-1 A
(`decisions/2026-10.md`, "F1.5 Gate 1") · **Gate 2 owner** ORCHESTRATOR (reversible; not reserved, see "Reversible?")

---

**Change**
One policy, two comments. No table, column, type, constraint, grant, function, index or role changes.

| Object | Before | After |
|---|---|---|
| `nestly.users` policy `users_select_own` (FOR SELECT TO authenticated) | `using (id = (select auth.uid()) and status = 'active')` | `using (id = (select auth.uid()))` |
| `comment on policy users_select_own` | "An active account reads its own row only (NFR-SEC-002, layer 1). Status checked inline: no function that reads users." | "An account reads its own row only, whatever its status (NFR-SEC-002, layer 1; F1.5 DR-1 A): the caller learns its own state and nothing more. Every other table gates on is_active_account() (platform rule 15). No function that reads users." |
| `comment on column nestly.users.status` | "...Anything but active reads nothing, from the next statement (platform rule 15). A warning is not a status." | "...Anything but active reads nothing but its own users row, from the next statement (platform rule 15; F1.5 DR-1 A). A warning is not a status." |

The meaning of `users.status` does not change (still active / suspended / banned, FR-MOD-002, BR-024). What changes is
who can see the value: the owner, in every state.

**Why**
Spec criteria 1, 2 and 4 (DR-1 A). `GET /api/me` must answer `active` / `unavailable` / `unregistered` under RLS with the
caller's identity. Under the current policy a suspended or banned caller and an Auth user with no row both read zero
rows, so the server cannot tell them apart without a bypass. Dropping the status clause lets the owner see its own row;
nothing else becomes visible.

Rejected here (not re-opened, recorded for CRITIC): a SECURITY INVOKER `account_state()` function — it reads through the
same policy, so it sees nothing more; a SECURITY DEFINER one — an exception to rule 10 to do what a one-clause policy
change does, with the enforcement point moved out of RLS.

**Authorization**
- Enforcement point (unchanged, one place): RLS policy `users_select_own` on `nestly.users`, FORCE RLS, TO
  authenticated. The server reaches it only as `authenticated` inside the identity transaction
  (`apps/server/src/db/identity-transaction.ts`: `set local role authenticated` + `request.jwt.claims`). No service_role,
  no BYPASSRLS, no definer function, no view.
- Who reads what after the change:
  - any authenticated identity with a `users` row → exactly its own row (id, account_type, status, created_at), any status;
  - another account → zero rows of it (`id = auth.uid()` is untouched; layer 13 holds);
  - an identity with no row → zero rows;
  - `anon` → 42501 (no USAGE on `nestly`, no grant; unchanged).
- Rule 15 still holds for everything else: `regular_profiles`, `journey_contexts`, `children`, `legal_consents` gate their
  SELECT and INSERT on `(select nestly.is_active_account())`, and `is_active_account()` checks `id = auth.uid()` **and**
  `status = 'active'` in its own body (Gate 2 F1.1, D1). A stopped account therefore still reads zero rows of every
  other table and writes nothing, from the next statement, with the same token.
- Writes: unchanged. `users_insert_own` still pins id/type/status; no UPDATE/DELETE grant or policy exists. A stopped
  user cannot alter its status (file 12 stays green).
- **New invariant the code must respect** (it was implicitly true before and is false now): *visibility of the own
  `users` row no longer means "active".* Server code that needs "is the caller active" must use
  `nestly.is_active_account()` or rely on the other tables' policies — never `exists(select from users)`. The one
  existing consumer that did this is `accountExists()` (see Blast radius); its outcome stays correct, its comment and
  tests change.

**Security-model flag (for ORCHESTRATOR).** This widens one read for one population: a stopped account now reads its own
four `users` columns. No other user's data, no new grant/role/function/bypass, enforcement point unchanged. It does
change a written invariant ("a stopped account reads nothing" → "reads nothing but its own account row") in the column
comment, in `.claude/knowledge/data-model-tables.md` (users "Authorization" row) and in F1.1 c15's test text. My
professional reading agrees with the Gate 1 record: this is not a change to the security model (layers, enforcement
layer, who-may-see-whom), so it is not reserved for Afik. It is ORCHESTRATOR's call; I am flagging, not deciding it.

**Migration** — `supabase/migrations/20261015100000_users_select_own_any_status.sql`
Header in the house form (source schema.md, SRS ids FR-AUTH-002 · FR-MOD-002 · BR-024 · NFR-SEC-002, platform rules
10, 14, 15; applied by the CLI as app_owner in one transaction with its history row; down script path). Body, in order:

```sql
alter policy users_select_own on nestly.users
  using (id = (select auth.uid()));

comment on policy users_select_own on nestly.users is '<After text above>';
comment on column nestly.users.status is '<After text above>';
```

`ALTER POLICY ... USING` keeps the name, command, role list and permissiveness, so `20_registration_structure.sql`'s
exact policy list and the "TO authenticated only / permissive" assertions are untouched. Takes an ACCESS EXCLUSIVE lock
on `nestly.users` for a catalog-only change: milliseconds, no rewrite. Transactional; nothing non-transactional.
Becomes the newest migration, so CI runs its up → down → up with the catalog fingerprint (the fingerprint covers
`pg_get_expr(polqual)`; comments are not in it, which is fine — the down restores them anyway).

**Rollback** — `supabase/rollback/20261015100000_users_select_own_any_status.down.sql`
Same convention as the two existing down scripts: `begin;` · refuse unless `current_user = 'app_owner'` · then

```sql
alter policy users_select_own on nestly.users
  using (id = (select auth.uid()) and status = 'active');
comment on policy users_select_own on nestly.users is '<the exact Before text>';
comment on column nestly.users.status is '<the exact Before text>';
delete from supabase_migrations.schema_migrations where version = '20261015100000';
commit;
```

No data guard is needed: it touches no row and destroys nothing. The restored qual must be written exactly as in
`20261014100000` line 81 so the fingerprint after down equals the one before up.
Header must state two things:
1. On nestly-preview / nestly-prod the rollback is level 1 — a new forward migration with the old `USING`, through CI
   (prod after Afik's `db-production` approval) — not this script; this script is for CI and the disposable database.
2. **Roll back the code with it.** With the old policy and `/api/me` still deployed, a stopped account answers
   `unregistered`, is sent into completion (criterion 16), gets 409, asks `/api/me` again and gets `unregistered` again:
   no data leaks (everything still fails closed) but the user loops. Revert part a's route together with the policy.

**Backfill** None. No row changes.

**Indexes** None added. `/api/me`'s read is served by `users_pkey`: the planner turns the policy qual
`id = (select auth.uid())` into an index lookup (InitPlan once per statement). Removing `status = 'active'` removes a
filter, it does not make any query unindexed.

**Integrity** No constraint, FK or cascade changes. Orphan risk: none introduced. The orphan *Auth* user (Auth user with
no `users` row) is now distinguishable from a stopped account, which is the point (DR-2).

**Blast radius** — every reader of `nestly.users`:

| Consumer | Effect | Change needed in part a |
|---|---|---|
| `nestly.is_active_account()` | reads the own row now for stopped accounts too; its own `status = 'active'` keeps it false | none (D1 already pins the self-check) |
| policies of `regular_profiles`, `journey_contexts`, `children`, `legal_consents` | through `is_active_account()`; unchanged | none |
| `apps/server/src/repositories/registration-repository.ts:28-31` `accountExists()` → `services/registration-service.ts:22-25` `hasAccount()` → `routes/register.ts:55` | now **true** for a stopped account, so `POST /api/register` returns 409 `already_registered` at the pre-check instead of after the insert's 23505. Same status and body; no write either way | fix both doc comments ("RLS: own and active. A suspended account reads false" / "A suspended account is not") |
| `apps/server/src/db/schema.ts:25` doc comment on `users` | says "Read own row only, while active (RLS)" | update the comment |
| `.claude/knowledge/data-model-tables.md:45` users "Authorization" | says "only while status = 'active'" | update, as a knowledge promotion: proposed here, validated by CRITIC (CLAUDE.md "Knowledge") |
| pgTAP and server db tests | see "Tests that must change" | TEST ENGINEER |

Not affected: SRS text (no FR/BR states the policy; nothing to change there), `20_registration_structure.sql` policy
list, the RLS gate in `supabase/ci/`, the Drizzle drift check (no column change).

**Reversible?** **Yes.** Catalog-only, no data touched, the down script restores the exact previous qual. Not reserved
for Afik on reversibility. Gate 2 is ORCHESTRATOR's.

---

## Tests that must change, and why

The reason is the same for all: each asserted "a stopped account reads 0 rows of `nestly.users`, its own included". It
now reads exactly 1, its own, with its true status. Every assertion on any **other** table, on `is_active_account()`, on
B's view, on `c` (no row) and on `anon` stays as it is.

**`supabase/tests/13_identity_account_status.sql`** (F1.1 c15)
- line 33 — keep the assertion; change the text "(so 0 below is the policy)" to "(so what is read below is the policy)".
- line 36 (suspended A, `count(*)` users) `'0'` → `'1'`; add: what A reads is its own id and `status = 'suspended'`
  (`select string_agg(id::text||'/'||status, ',') from nestly.users` → `<A>/suspended`).
- line 41 (suspended A by own id) `'0'` → `'1'`.
- line 56 (banned A) `'0'` → `'1'`; add the same id/status read → `<A>/banned`.
- line 78 (active → banned) `'0'` → `'1'`; line 80 (banned → suspended) `'0'` → `'1'`.
- line 87 (S) `'0'` → `'1'`; line 92 (X) `'0'` → `'1'`. The paired `regular_profiles` assertions (lines 89, 94) stay `'0'`.
- line 98 (S, both tables in one statement) — `'0'` → `'1'`, and re-describe it as "only its own users row, nothing
  from regular_profiles"; or split it into users `= 1` and profiles `= 0`.
- line 106 (X still banned) `'0'` → `'1'`, text "reads its own User row and nothing else".
- Descriptions on those lines: "returns 0 rows, A's own row included" → "returns only its own row".
- Unchanged: lines 25, 28, 30, 38, 43, 47–52, 58, 60, 65–74, 82–83, 104–105, all of c16 and c18.
- **Add (criterion 1):** with A suspended and again banned — B reads 0 rows of A (`where id = <A>`); A reads 0 rows of
  `journey_contexts`, `children`, `legal_consents` (A has 2/2/1 in `20_registration_fixtures.sql`, so zero is not
  vacuous; S and X have none, so use A); `anon` → `ERR:42501`; `c` → 0.
- **Add (structure, criterion 1 "no new grant, column or function"):** `pg_get_expr(polqual)` of `users_select_own`
  equals exactly the new expression and does not match `status`; `has_function_privilege` / column list / grant counts
  are already pinned by files 10 and 20 and stay green unchanged.

**D1 block (lines 166–193) stays valid and unchanged.** With the permissive `zz_d1_open_select` added, S and `c` still
read ≥ 1 row (regex holds), and S/X/c are still told `false`, A/B `true`. It loses nothing: D1 exists to prove the
function checks `id` and `status` itself. The status half is now proved even without D1 (S reads its own row through
the real policy and is still told false); the `id` half still needs D1's permissive policy (other accounts' rows
visible), and D1 still provides it.
One nuance, no edit required: line 178 (S reads >= 1 row) is now true even without the permissive policy, so it no
longer proves on its own that the permissive policy took effect; line 180 (`c`, who has no row, reads >= 1) still proves
it. If TEST ENGINEER wants line 178 to keep its own force, assert S reads at least 2 rows (more than its own); optional.

**`supabase/tests/11_identity_reads.sql`** (F1.1 c16)
- lines 155–165: the cross join asserts `'0'` for S on both `nestly.users` and `nestly.regular_profiles` under lying
  claims. Split it: `nestly.users` → `'1'` and the row read says `suspended` (claims cannot make it say active —
  that is the point of c16); `nestly.regular_profiles` → `'0'` unchanged.
- lines 167–169: X with lying claims — same split (`users` → `'1'`, status `banned`; profiles `'0'`).
- Unchanged: c17 for `c` (lines 195–203), all A/B/anon/role-claim assertions.

**`supabase/tests/12_identity_writes_refused.sql`** (F1.1 c13)
- line 153: "suspended S still reads 0 rows afterwards" → `'1'`, and better: S reads its own row with status still
  `suspended` (the write attempts did not reactivate it). Line 151 and the `fx_state()` / `fx_user` checks unchanged.

**`supabase/tests/22_registration_owner_only.sql`** (F1.4-a c14)
- lines 163–166: the cross join of `s`, `x` × five tables includes `nestly.users` with `'0'`. Remove `nestly.users` from
  that list and assert it separately as `'1'` (own row). The other four tables stay `'0'`. Lines 205–215 unchanged.

**Server db tests (Vitest against the real database)**
- `apps/server/tests/db/identity.db.test.ts:294-310` (F1.1-c c25, same token across suspension): `q=users` after
  suspend/ban → `[ACCOUNT_A]`, not `[]`. Line 312–318 (profiles hidden on suspension) unchanged.
- `identity.db.test.ts:320-331`: split the table — `s` and `x` get their own row (with or without lying claims); `c`
  still gets `[]`.
- `apps/server/tests/db/registration.db.test.ts:373` `hasAccount(suspended)` → `true`; lines 392–397: true for a, b, s,
  x; false only for no-row identities. Line 374–375 (still `already_registered`, nothing written) unchanged.
- `apps/server/tests/db/register.db.test.ts:258`: the 409 expectation holds; only the title "(it cannot see its own
  row)" is wrong now.

---

## `GET /api/me` — what it may read and how it decides

- **Reads:** `nestly.users.status`, and nothing else — not id, account_type or created_at; no other table; no
  function call needed. One statement, inside `inIdentityTransaction(database, identity, ...)` (role `authenticated`,
  the caller's claims; no bypass), through the Drizzle `users` table object, e.g.
  `tx.select({ status: users.status }).from(users).limit(2)`. **No `where` clause and no id from anywhere**: RLS returns
  the caller's own row or nothing (CLAUDE.md: application code never filters rows for permission; the route takes no id).
- **Decides:**
  - 0 rows → `unregistered`: the identity is a valid Auth user with no `nestly.users` row. (Before this migration a
    stopped account also gave 0 rows; that ambiguity is what the policy change removes.)
  - 1 row, `status === 'active'` → `active`.
  - 1 row, any other value → `unavailable` (fail closed: an unknown value can never become `active`; the CHECK makes it
    impossible anyway). suspended and banned produce the same body.
  - 2 or more rows → treat as a fault (500 `internal`), never as `active`: impossible with the PK and the policy, so seeing
    it means the policy is wrong.
- **Same answer as `is_active_account()`** by definition (`status = 'active'` on the own row). If BUILDER prefers one
  definition of "active", `select nestly.is_active_account()` plus the row count is acceptable too; reading `status`
  directly is simpler and needs no raw SQL. Either way the status *word* never leaves the server (criterion 2).
- **No caching** across requests (criterion 4): each call is a new transaction, so a status change by the next statement
  is seen by the next request.
- Concurrency: an orphan finishing registration in another request is seen once that transaction commits (read
  committed); a stale `unregistered` resolves through criterion 16's 409 → re-ask path.

---

## Required checks

| Check | Result |
|---|---|
| Rollback exists | yes — down script + level-1 forward migration on shared environments; code rollback must accompany it |
| One enforcement point, named, nothing bypasses it | `users_select_own` (RLS); identity transaction as `authenticated`; no definer, view or privileged role |
| No spec-open item filled | none touched: no retention, limit or field set decided here |
| Nullability/defaults/constraints of new fields | no new field |
| Cascades of new relations | no new relation |
| Index decision for new FK / filter / sort | none new; `users_pkey` serves `/api/me` |
| Backfill on live data | none |
| Existing consumers enumerated | Blast radius table |
| Temporal fields | none new |
| No existing query becomes unindexed | correct — a filter is removed, the PK lookup remains |
