# schema — register-account-create (I1 · F1.4), part a

**Gate 2:** ✅ passed by ORCHESTRATOR, 14.10.2026 (`decisions/2026-10.md`).  Amendment 1 (column-level INSERT) approved by ORCHESTRATOR, 14.10. Criterion 14 narrowed per the DECISION REQUEST default; questions 1–3 at their defaults.

**Author:** DATA ARCHITECT · 14.10.2026 · **Gate 2**, approved by ORCHESTRATOR (nothing here is irreversible or reserved;
see "Reversible?"). Tags: `[PG]` standard PostgreSQL behaviour · `[A]` assumption, with the test that proves it.
Conventions: data-model.md "Schema conventions — DECIDED" (F1.1 Gate 2), applied unchanged. Style and test layout follow
`.work/identity-platform/schema.md`.

---

**Change**  Three new tables in `nestly`; write policies and INSERT grants on the two F1.1 tables. Before: `users` and
`regular_profiles` are read-only to `authenticated`, nothing else exists.

`nestly.journey_contexts` — SRS JourneyContext (§13), one row per stage the parent ticked (VAL-039)

| column | type | null | default | constraint · meaning |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK. Stable handle for later references (trackers, I6) |
| `user_id` | uuid | not null | `auth.uid()` | owner. `journey_contexts_user_id_fkey` → `regular_profiles(user_id)` ON DELETE CASCADE |
| `stage` | text | not null | none | `journey_contexts_stage_check`: `planning` · `pregnant` · `has_child` (VAL-039; = `JOURNEY_STAGES`) |
| `due_date` | date | null | none | estimated due date (§13, health-related). `journey_contexts_due_date_check`: `due_date is null or stage = 'pregnant'`. NULL = not given (optional, spec criterion 8) |
| `created_at` | timestamptz | not null | `now()` | row creation, UTC |

Plus `journey_contexts_user_id_stage_key` UNIQUE (`user_id`, `stage`) — at most one journey per stage per user — and the
partial unique index `journey_contexts_user_id_planning_pregnant_key` ON (`user_id`) WHERE `stage in ('planning','pregnant')`
— at most one of those two per user, i.e. VAL-039's "planning never with pregnant", decided in the SRS, so the database
holds it too at the cost of one tiny index.

`nestly.children` — SRS Child (§13), minors' data: **exactly** the three fields the spec stores, plus mechanics

| column | type | null | default | constraint · meaning |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | the parent (owner). `children_user_id_fkey` → `regular_profiles(user_id)` ON DELETE CASCADE — only a Regular account holds children (BR-016) |
| `slot` | smallint | not null | none | the child's position in the parent's list, 1–10. `children_slot_check`: `slot between 1 and 10` (VAL-040, = `MAX_CHILDREN`). Means nothing beyond order and the limit. Not data about the child |
| `name` | text | not null | none | `children_name_check`: `char_length(btrim(name)) between 1 and 60` (DR-2 of F1.3; = `CHILD_NAME_MIN/MAX_LENGTH`; code points, U+0020 trimmed only — same counting as VAL-001) |
| `sex` | text | not null | none | `children_sex_check`: `boy` · `girl` · `unknown` (VAL-006; = `CHILD_SEXES`). Required |
| `birth_date` | date | not null | none | `children_birth_date_check`: `birth_date >= date '1900-01-01'` (= `CHILD_BIRTH_DATE_FLOOR`). "Not in the future" (VAL-005) is clock-dependent: server only, below |
| `created_at` | timestamptz | not null | `now()` | row creation, UTC |

Plus `children_user_id_slot_key` UNIQUE (`user_id`, `slot`).

`nestly.legal_consents` — SRS LegalConsent (§13, FR-REG-004, BR-068): one row per acceptance event, append-only

| column | type | null | default | constraint · meaning |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | the account that accepted. `legal_consents_user_id_fkey` → `users(id)` ON DELETE **RESTRICT** (any account type; FR-PROREG-002 reuses it) |
| `terms_version` | text | not null | none | the Terms of Use version accepted. `legal_consents_terms_version_check`: `char_length(terms_version) between 1 and 64`. Comes from `CONSENT_TERMS_VERSION` (server), never the client |
| `privacy_version` | text | not null | none | the Privacy Policy version accepted. Same check, `CONSENT_PRIVACY_VERSION` |
| `has_declared_18_plus` | boolean | not null | none | the 18+ declaration was made in this acceptance (BR-068). `legal_consents_has_declared_18_plus_check`: `= true` — a row without the declaration cannot exist |
| `accepted_at` | timestamptz | not null | `now()` | when the user accepted: **the database's clock**. Enforced by the INSERT policy (`accepted_at = now()`), so an explicit value from the server is refused |

Plus `legal_consents_user_id_versions_key` UNIQUE (`user_id`, `terms_version`, `privacy_version`): the same version pair
is never recorded twice for one account; a new version pair (I9 re-consent) is a new row, with no contract change.

**Shape chosen: one row per acceptance event** holding the full set accepted (both versions + the declaration), as the
spec's criterion 8 counts it ("1 LegalConsent"). The latest row is the account's current consent state.
*Rejected:* one row per document (`document in ('terms','privacy','age_18_plus')`, 3 rows at registration) — closer to
§13's wording, but it changes criterion 8's count, needs a version for the age declaration that does not exist, and the
UI has one checkbox for all three (Q5), so the three are always accepted together.

**Not stored, deliberately:** JourneyContext's "active status" (§13) — see QUESTION 2. A journey type "מחזור וביוץ" (§13
lists it, VAL-039 does not) — the CHECK holds VAL-039's three; widening a CHECK list later is expand-only. No link
between a `has_child` journey and the children (not in the spec). Nothing about a child beyond name, sex, birth date (no
photo, nickname, id number, birthday visibility — ChildBirthdayVisibility is its own entity, later). No email, password
or hash anywhere in `nestly`.

**Why**  spec "Data touched" and criteria 8–11, 14; §13 Child, JourneyContext, LegalConsent; VAL-005, VAL-006, VAL-039,
VAL-040; BR-068, AC-084, AC-088; platform rules 11–15.

---

**Authorization**  Enforcement point: RLS on each table (layer 9, owner-only), nothing else. The server filters nothing.

- All three new tables: `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- **Grants (to `authenticated` only; `app_server` reaches them only through `SET LOCAL ROLE authenticated`, rule 2–3):**
  `SELECT, INSERT` on `journey_contexts`, `children`, `legal_consents`; **add** `INSERT` on `users` and
  `regular_profiles`. Nothing to `anon`, `PUBLIC`, `service_role`, `app_server` directly, or `app_jobs`. No UPDATE,
  DELETE, TRUNCATE, REFERENCES or TRIGGER on any `nestly` table to anyone but the owner. `anon` keeps no USAGE on
  `nestly`: the guest route's database write runs as `authenticated` under the newly created user's verified token.
- **Policies — new (all `to authenticated`):**

```sql
-- the account itself: only a Regular, active account, and only one's own id (rules 12, 14)
create policy users_insert_own on nestly.users for insert to authenticated
  with check (id = (select auth.uid()) and account_type = 'regular' and status = 'active');

create policy regular_profiles_insert_own on nestly.regular_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy journey_contexts_select_own on nestly.journey_contexts for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy journey_contexts_insert_own on nestly.journey_contexts for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy children_select_own on nestly.children for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy children_insert_own on nestly.children for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy legal_consents_select_own on nestly.legal_consents for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy legal_consents_insert_own on nestly.legal_consents for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()) and accepted_at = now());
```

- **Why `users_insert_own` pins `account_type` and `status`:** without it, any holder of a valid token could create
  an `admin` account through a server bug (rule 14). Professional registration widens it to `'professional'` in its own
  Gate 2. No default on either column (F1.1): the server sets both, the policy refuses anything else.
- **Status gate:** on `users` there is none at insert (the row does not exist yet; a second row is refused by the PK).
  On every other table `(select nestly.is_active_account())`, which reads the `users` row inserted by an earlier
  statement of the same transaction `[PG]` (a STABLE function sees the calling statement's snapshot). Hence the write
  order below is part of the design. A suspended or banned account reads zero rows and inserts none (rule 15).
- **Consent immutability:** no UPDATE or DELETE grant and no policy behind one → refused by privilege (42501) for every
  runtime role, the owner A included. Only `app_owner` (migrations) can change a row; the deletion flow (I9) gets its
  own reviewed path.
- **Consent time and version:** the time is the database's (`default now()` + `accepted_at = now()` in WITH CHECK;
  `now()` is the transaction start `[PG]`, identical in both, so the default passes and any explicit value fails). The
  database **cannot** know where a version string came from: that rule's enforcement point is the server — the strict
  body schema rejects a `consent` version key (criterion 2) and the service reads only the shared constants (criterion
  9). The database guarantees non-empty, bounded text only.
- `INSERT … RETURNING` needs the SELECT policy to pass too `[PG]`; every new row passes it (own, active).
- **No new SECURITY DEFINER function, no trigger, no view, no `TO app_jobs` policy, no exception for the approved list.**

**Write order inside the one identity transaction (rule 11; BUILDER, repository):** `users` → `regular_profiles` →
`journey_contexts` → `children` (slots 1..n in entry order) → `legal_consents`. Any failure rolls the transaction back:
no partial account exists in any state, so a retry (criterion 11) always starts from nothing. Isolation: the default
READ COMMITTED; nothing here depends on a higher level.

---

**Limits and idempotency — enforced by the database, concurrency-safe by unique indexes**

| Invariant | Mechanism | Two concurrent writers |
|---|---|---|
| one account per Auth user (repeat-safe) | `users_pkey` (id = `auth.uid()`) | the second insert waits on the first's index entry, then fails 23505 `users_pkey` when it commits `[PG]`; its whole transaction rolls back. The route maps 23505 on `users_pkey` to 409 `already_registered` (covers the suspended account, whose row its own pre-check cannot see) |
| ≤ 1 journey per stage | `journey_contexts_user_id_stage_key` | same: second fails 23505 |
| never planning + pregnant | partial unique `journey_contexts_user_id_planning_pregnant_key` | same |
| ≤ 10 children | `children_slot_check` (1–10) + `children_user_id_slot_key` | an 11th child needs slot 11 (23514) or a taken slot (23505); two concurrent inserts of the same slot serialize on the index and the second fails |
| one consent row per version pair | `legal_consents_user_id_versions_key` | same |

*Rejected for ≤10:* a count trigger with an advisory lock (correct only under READ COMMITTED, one more function to
review per table); a count trigger locking the parent row `FOR UPDATE` (needs UPDATE privilege on `regular_profiles`,
which `authenticated` must not have); a counter column on the profile (needs UPDATE, and is denormalization). The slot
also gives the children a stable order, which `created_at` cannot — every child of one registration shares one `now()`.
Cost accepted: I2's "add a child" picks the lowest free slot and retries once on 23505.

**What the DB CHECKs mirror, and what stays server-only** (closes the F1.3 debt line "must close at F1.4 Gate 2"
together with criterion 2):

| Rule | Database | Server (Zod, `packages/shared`) |
|---|---|---|
| stage values, one per stage, planning ⊕ pregnant | CHECK + 2 unique indexes | yes (VAL-039) |
| due date only on pregnant | CHECK | yes |
| due date within today −30 … +300 days | **no** — clock-dependent; a CHECK would turn valid rows invalid over time | yes (DR-1 of F1.3) |
| child name 1–60 code points after U+0020 trim | CHECK (parity test, as F1.1's file 15) | yes |
| child sex values | CHECK | yes |
| birth date ≥ 1900-01-01 | CHECK | yes |
| birth date not in the future (+1 day, Q4) | **no** — clock-dependent | yes |
| ≤ 10 children | slot CHECK + unique | yes, and the raw `children` array ≤ 10 before parsing |
| `has_child` ⇒ ≥ 1 child; children only with `has_child` | **no** — cross-table; accepted, not authorization | yes |
| full name 2–60, parent gender values | existing F1.1 CHECKs | yes |
| consent version 1–64 chars, declaration true | CHECK | constants (must be ≤ 64 chars) and literal `true` |
| unknown keys rejected; raw size bounds (name 600 units, email 512, password 1024, `stages` ≤ 3, `children` ≤ 10) before code-point splitting | **no** — transport concern; the DB only ever sees parsed values | yes, `.strict()` + `.max()` on raw strings and arrays (criterion 2) |

The strict schema must reject unknown keys **inside** `dueDate`, each child and each child's `birthDate` too.

---

**Migration**  One file: `supabase/migrations/20261014200000_registration_account.sql` (after
`20261014100000_identity_schema.sql`). Applied by the Supabase CLI as `app_owner`, file and history row in one
transaction (proven in F1.1). Order: `journey_contexts` → `children` → `legal_consents` (columns, checks, FKs, uniques)
→ partial unique index → RLS + FORCE on the three → the eight policies above → grants → comments on every table, column,
policy and constraint that carries meaning. No `CONCURRENTLY`, no non-transactional statement. Header comment states:
source (this file), SRS ids, the write order, "no UPDATE/DELETE grant: I2".

**Expand-only:** additive tables, policies and grants. Running code (F1.1–F1.3 on main) reads `users` and
`regular_profiles` only and is unaffected. Deploy order per environment: migrate → then the part-b server may deploy.
The server that ships first (part b) must not write before the migration exists on that environment.

Drizzle (`apps/server/src/db/schema.ts`): the three tables, typing only, enums from the shared constants; the CI catalog
drift check must pass. No `defaultNow()`/`$defaultFn` on `accepted_at` that sends a value — omit it, or the policy
refuses the insert (which is the point).

**Rollback**
- **Level 1 — disable the write path, keep the data (always safe):** a new forward migration that drops the five
  `*_insert_own` policies and revokes the INSERT grants. Reads keep working; nothing is destroyed. This is the
  rollback once real registrations exist.
- **Level 2 — full down script** `supabase/rollback/20261014200000_registration_account.down.sql`, run as `app_owner` in
  one transaction: refuse unless `current_user = 'app_owner'`; lift FORCE on the three tables (as F1.1's down does, so
  the count is real); **refuse if any of the three holds a row** ("destroys minors' and consent data: Afik"); drop the
  five new `users`/`regular_profiles` insert policies, revoke INSERT on those two, drop the three tables; delete history
  row `20261014200000`. Must return the catalog fingerprint to the pre-migration state (CI up → down → up, newest
  migration). Accounts already created (users + profile rows) are left in place: level 2 destroys nothing that existed
  before this migration.
- F1.1's down script (`drop schema nestly cascade`) is no longer valid on its own once this migration is applied: it
  would leave this migration's history row behind. BUILDER adds a guard to it: raise if `nestly.legal_consents` exists
  ("run 20261014200000's down script first").

**Backfill**  None. New, empty tables; no existing row changes.

**Indexes**  (each a btree written on every insert of its table; all accepted — rows are written once at registration)
- `journey_contexts_pkey` (id), `children_pkey` (id), `legal_consents_pkey` (id) — row identity.
- `journey_contexts_user_id_stage_key` — the per-stage limit; serves the owner policy `user_id = auth.uid()` and the
  cascade lookup from `regular_profiles` (leading `user_id`).
- `journey_contexts_user_id_planning_pregnant_key` (partial) — VAL-039 only; at most one row per user.
- `children_user_id_slot_key` — the ≤10 limit; serves owner reads ordered by slot and the cascade lookup.
- `legal_consents_user_id_versions_key` — no duplicate acceptance; serves owner reads and the RESTRICT check from
  `users`.
- No separate `user_id` index anywhere: each unique above leads with it. No index on `stage`, `birth_date`,
  `due_date`, `accepted_at`: no query filters or sorts by them across users yet (I6 "My Stage" will decide).

**Integrity**
- `journey_contexts`, `children` → `regular_profiles`: ON DELETE CASCADE. They are part of the parent's account (OP-028
  direction: children and profile deleted in full). A cascade can only start from the orderly deletion flow: nobody at
  runtime can DELETE a profile or user, and the Auth anchor is RESTRICT.
- `legal_consents` → `users`: ON DELETE **RESTRICT**. Whether a consent record outlives the account (proof of consent)
  is a legal retention question (§13.4 TBD, reserved for Afik), so the schema decides nothing: the deletion flow must
  handle consents explicitly before it can remove the account.
- Ids never update (no UPDATE grant). Orphans: impossible by FK. A `users` row without its profile, journeys or consent
  cannot be created by the server (one transaction); fixtures may create one.
- Temporal: `created_at`, `accepted_at` `timestamptz`, µs, UTC, database clock. `birth_date`, `due_date` are calendar
  `date`s with no zone (what the parent typed); "today" comparisons are the server's, Q4.

**Blast radius**  Readers of the changed tables: F1.2's server code reads `users` (unaffected — additive). Files that
must change with part a:
- `supabase/tests/10_identity_structure.sql` — the exact policy and grant lists on `users`/`regular_profiles` grow.
- `supabase/tests/12_identity_writes_refused.sql` — its catalog assertion "no INSERT" becomes "no UPDATE, DELETE,
  TRUNCATE, REFERENCES, TRIGGER"; its INSERT attempts become: own row → allowed only as regular/active (moved to file
  21), another's id / other type / other status → 42501. UPDATE and DELETE stay refused (F1.1 criterion 13 holds).
- `supabase/tests/setup/10_identity_fixtures.sql` — `tests.fx_state()` must cover the three new tables (or a new
  setup file `20_registration_fixtures.sql` replaces it, `create or replace`).
- `supabase/ci/catalog-columns.sql` drift check, `apps/server/src/db/schema.ts`, F1.1's down script (guard above),
  `.claude/knowledge/data-model.md` "Entities" (DATA ARCHITECT, same unit of work, after merge-ready).
- Bootstrap step 2: unaffected; deleting an Auth user still fails while its `users` row exists (now also while a consent
  exists).

**Reversible?**  **Yes.** Additive; level 1 is always safe, level 2 is safe while the new tables are empty (in CI: every
run). Once a registration exists on preview or prod, the destructive level 2 is Afik's (hard rule 7) and level 1 is the
rollback. ORCHESTRATOR approves this Gate 2; nothing here is reserved.

---

## pgTAP — files, run as `app_server` by `pg_prove` (CI `db` job), tags in the test names

`setup/20_registration_fixtures.sql` (CI only, as postgres, like file 10): committed rows for `a` (two journeys:
`pregnant` with a due date, `has_child`; two children; one consent) and `b` (one journey, one child, one consent);
`tests.fx_state()` extended to the three tables; observers `tests.fx_counts(id)` → `'u/p/j/c/l'` row counts for one
user, unfiltered by RLS. No fixture consent on `c`, `p`, `f1..f5` (RESTRICT would block any test that deletes them).
Multi-statement writes as a user run as one `DO` block through `tests.dml_as('authenticated', claims, 'do $$ … $$')` —
`[A]` `authenticated` has USAGE on `plpgsql` (PUBLIC default); file 21's first test proves it.

| File | Asserts | Criterion |
|---|---|---|
| `20_registration_structure.sql` | the three tables, every column's type / nullability / default; RLS and FORCE on all five `nestly` tables; the exact policy list per table (names, command, role); grants: `authenticated` holds exactly SELECT + INSERT on each of the five tables, no UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER at table or column level; `anon`, `PUBLIC` nothing on `nestly`; every named CHECK, unique and the partial index exist; FK targets and actions (2× CASCADE → `regular_profiles`, RESTRICT → `users`); no trigger on the new tables; no SECURITY DEFINER function in `nestly` | 14 (structure), rule 1, 8, 10 |
| `21_registration_create.sql` | as `f1`: the full creation block → `fx_counts` = `1/1/2/3/1`, consent `accepted_at = now()`, `has_declared_18_plus`; a second full block → 23505 and `fx_counts` unchanged (**idempotent**); for `f2`, three runs each forcing one failure — a child with slot 11, a second journey of the same stage, a consent with `has_declared_18_plus = false` — each → error and `fx_counts(f2) = 0/0/0/0/0` (**atomicity**); a profile insert before the users insert → 42501 (status gate, write order); `users` insert with `account_type` `admin`/`professional` or status `suspended` → 42501 (rule 14); every table: a row with another user's `user_id`/`id` → 42501 (rule 12); consent with an explicit `accepted_at` → 42501; no claims (`auth.uid()` null) → refused | 10, 14 (rules 12–14), 8 (DB side) |
| `22_registration_owner_only.sql` | `a` reads its own journeys, children, consent (counts); `b` sees zero of `a`'s rows in every table; UPDATE and DELETE of `a`'s rows on the three tables as `a` and as `b` → 42501, `fx_state()` unchanged (consent: "A's update or delete of A's consent changes nothing"); `anon` → 42501 on every table; `s` (suspended) and `x` (banned) read zero rows and their inserts → 42501; mid-test `set_status(a,'suspended')` → `a` reads zero from the next statement; `p` (professional) inserting a child or journey → 23503 (FK to `regular_profiles`) | 14 (layer 9, rules 13, 15) |
| `23_registration_limits.sql` | 10 children (slots 1–10) OK; slot 11 and slot 0 → 23514; a duplicate slot → 23505; second `pregnant` → 23505; `planning` with `pregnant` → 23505; due date on `planning`/`has_child` → 23514; stage `cycle` → 23514; sex `''`/`male` → 23514; birth date 1899-12-31 → 23514, 1900-01-01 OK; version `''` and 65 chars → 23514, 64 OK; duplicate version pair → 23505; child-name parity table (same rows as the shared Zod test for `CHILD_NAME_*`, in the style of file 15) | 14 (limits), F1.3 debt mirror |

Concurrency is proven by construction (unique indexes), not by a test: pgTAP runs in one session. If TEST ENGINEER wants
a two-connection proof, it belongs in the server integration tests (two parallel registrations with one token → one
201 and one 409).

---

## Open

**DECISION REQUEST → ORCHESTRATOR (unreserved: the change makes authorization stricter, not looser). Criterion 14's
"A … updates A's profile, journeys and children."** The approved spec says both "readable, writable and deletable by
their owner" (Authorization) and "Editing or deleting children and journeys — out of scope (I2)". This design grants
**INSERT and SELECT only**; UPDATE and DELETE are refused by privilege for everyone.
*Recommended default:* keep it so, and reword criterion 14: "A reads A's rows; A's and B's UPDATE and DELETE of A's rows
are refused and change nothing". Reasons: no code path in F1.4 updates or deletes; granting UPDATE now would need
column-level UPDATE that excludes `user_id`, `slot` and (on users) `account_type`/`status`, designed before I2 states
the edit rules; DELETE of a child or journey decides hard vs soft delete, which §13.4 leaves TBD; an update of `stage`
could break VAL-039 combinations that only Zod checks across rows. *Alternative:* owner UPDATE/DELETE policies now —
rejected for those reasons. I2's Gate 2 adds them.

**QUESTION 1 (default stated).** The consent shape is one row per acceptance event (above). Default: as designed; it
matches criterion 8. If ORCHESTRATOR prefers §13's per-document reading, criterion 8's count changes — say so before part a.

**QUESTION 2 (default stated).** §13 JourneyContext has an "active status". Its meaning (can a journey end? which is
shown first — OP-003, I6) is not decided. Default: not stored now; every row is a current journey. Added expand-only
(`is_active boolean not null default true` or a status) when I2/I6 define it. Filling it now would design around OP-003.

**QUESTION 3 (default stated).** §13 lists a journey type "מחזור וביוץ" that VAL-039 does not. Default: the CHECK holds
VAL-039's three; an SRS consistency note for wrap-up.

**Criterion 6 room:** nothing here is designed for a rate limiter, and nothing precludes one. If option A needs the
database-counter limiter, it is a separate table and Gate 2 (a guest-side counter needs either an `anon` policy or an
approved definer function — that choice belongs to that gate).

No BLOCKER. No new SECURITY DEFINER, no service_role, no BYPASSRLS, no column about a minor beyond the spec.

---

## Amendment 1 — CRITIC part a finding 1 (DATA ARCHITECT, 14.10.2026)

Source: `.work/register-account-create/findings.md`, finding 1 and its concern. This falls within DATA ARCHITECT's
decision rights (grants and constraints, given the chosen enforcement layer). It makes authorization stricter. It
changes no field's meaning, no policy and no behaviour the spec approves. Nothing here is reserved. The migration has
not been applied outside CI, so it is edited in place and gets no new file.

**Decision: grant INSERT per column.** Table-level INSERT is rejected and is **not** recorded as the convention.

Why:
- **Rule 13 (and rule 12) hold in the database, not in the server.** Under a table-level grant, only part b's strict
  body schema protects `id` and `created_at`, and every later write path (I2 edit, trackers, posts) would copy that.
  With column grants, a statement that *names* `id`, `user_id`, `created_at`, `accepted_at` or
  `regular_profiles.account_type` is refused by privilege (42501, `permission denied for table …`). The check runs when
  the executor starts `[PG]`, before any row or constraint is evaluated. The value does not matter and no unique index
  is consulted, so the **23505-vs-42501 oracle is gone**: a client-chosen id is refused the same way whether it exists
  or not.
- **The cost is small now and large later.** Today it is five grant lines and some test changes. Once rows and copied
  repositories exist, every table must be re-granted and every insert rewritten.
- **The policies stay unchanged**, as a second fence. No runtime statement can reach the owner clauses (`= auth.uid()`)
  or `accepted_at = now()` any more, because no granted column carries those values. They stay because they cost
  nothing and still hold if a later grant is widened by mistake. `users_insert_own`'s `account_type`/`status` pins and
  every `is_active_account()` gate remain the **first** fence, because those columns are granted.

**Drizzle behaviour, checked in the source** (`node_modules/drizzle-orm/pg-core/dialect.js`, `buildInsertQuery`,
drizzle-orm 0.45.4). Drizzle builds the column list from **every** column of the table object it inserts into, except
generated-always columns. A column the caller leaves out is sent as the keyword `default` (or as its `$defaultFn`
value). Naming a column in an INSERT needs INSERT privilege on that column, even when its value is `DEFAULT` `[PG]`.
So `tx.insert(children).values({...})` through today's read-side `children` object would send
`"id", "user_id", …, "created_at"` and fail with 42501. **The repository must insert through an object that names
only the granted columns.** The drift check allows this. `apps/server/scripts/drift.ts` compares only the columns
Drizzle names, and `legalConsents` already leaves out `accepted_at` for the same reason. Rejected: marking `id` as
"generated always" in Drizzle to hide it. That type would lie about the column.

`INSERT … RETURNING` needs SELECT on the returned columns. SELECT is granted at table level on all five tables. The row
must also pass the SELECT policy, and every new row does. Part b needs no RETURNING, because registration returns no row
ids. A later feature that needs a generated id back (for example I2's "add a child") returns it with
`.returning({ id: children.id })`, using the read-side column. `[A]` It renders as plain `"id"` without naming `id` in
the column list. That feature's integration test proves this; it is not assumed here.

### The exact grants (replace section 6 of the migration)

```sql
-- 6. Grants — authenticated only. SELECT per table; INSERT per column, only on the columns the server sends, so id,
--    user_id, created_at, accepted_at and regular_profiles.account_type always take their defaults (platform rules
--    12, 13). No UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER to anyone.
grant select on table nestly.journey_contexts, nestly.children, nestly.legal_consents to authenticated;

grant insert (account_type, status)                                 on table nestly.users            to authenticated;
grant insert (full_name, gender)                                    on table nestly.regular_profiles to authenticated;
grant insert (stage, due_date)                                      on table nestly.journey_contexts to authenticated;
grant insert (slot, name, sex, birth_date)                          on table nestly.children         to authenticated;
grant insert (terms_version, privacy_version, has_declared_18_plus) on table nestly.legal_consents   to authenticated;
```

| table | INSERT granted | never granted (default always applies) |
|---|---|---|
| `users` | `account_type`, `status` | `id` (`auth.uid()`), `created_at` |
| `regular_profiles` | `full_name`, `gender` | `user_id` (`auth.uid()`), `account_type` (`'regular'`), `created_at` |
| `journey_contexts` | `stage`, `due_date` | `id`, `user_id`, `created_at` |
| `children` | `slot`, `name`, `sex`, `birth_date` | `id`, `user_id`, `created_at` |
| `legal_consents` | `terms_version`, `privacy_version`, `has_declared_18_plus` | `id`, `user_id`, `accepted_at` |

`gender` is nullable. Leaving it out of the statement gives NULL, which means "not given" (F1.1).

The users row's id is still `auth.uid()` by default, so 23505 on `users_pkey` remains the only "already registered"
signal, and it can fire only for the caller's own id.

### BUILDER — migration and code (part a branch)

1. `supabase/migrations/20261014200000_registration_account.sql`: replace section 6 (lines 112–114) with the block
   above. Add to the header comment, after the write-order lines: "INSERT is granted per column: identifiers, owners
   and clocks are never named by a runtime statement (rules 12, 13); the repository inserts through write-model
   objects that name only the granted columns." Optionally, the five `*_insert_own` policy comments can say "second
   fence" for the owner and clock clauses. The policy text does not change.
2. `supabase/rollback/20261014200000_registration_account.down.sql`: no change. `revoke insert on table …` also revokes
   the column privileges `[PG]`, and the up → down → up fingerprint (it includes `attacl`) proves it. Line 42 revokes on
   `users` and `regular_profiles` only, which is enough because the three new tables are dropped.
3. `apps/server/src/db/schema.ts`: add five write-model objects. Each has exactly the granted columns, with the same
   types and nullability: `usersInsert` · `regularProfilesInsert` · `journeyContextsInsert` · `childrenInsert` ·
   `legalConsentsInsert`, each `nestly.table('<same table>', { … })`. Give each the comment "INSERT target only. Names
   exactly the columns granted INSERT (migration 20261014200000 §6); Drizzle names every column of the object it
   inserts into." The read-side objects stay as they are. The CI drift check covers the write models automatically.
   **Part b's repository inserts only through the `*Insert` objects.**

### TEST ENGINEER — test changes (part a branch)

**File 20 (`20_registration_structure.sql`)**
- Lines ~240–244, "authenticated can INSERT into all five tables": replace it with two assertions.
  (a) `has_table_privilege('authenticated', c.oid, 'INSERT')` is true on **no** `nestly` table (the list is empty).
  (b) The exact column-INSERT set. Take `string_agg(relname || '.' || attname order by relname, attnum)` over the
  columns where `has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')`. It must equal
  `children.slot, children.name, children.sex, children.birth_date, journey_contexts.stage, journey_contexts.due_date,
  legal_consents.terms_version, legal_consents.privacy_version, legal_consents.has_declared_18_plus,
  regular_profiles.full_name, regular_profiles.gender, users.account_type, users.status`. Exact equality, so an added
  column grant fails the test.
- Lines ~252–258, "no column-level grant exists on any nestly table": replace it with "the only column-level ACL entries
  in `nestly` are INSERT for `authenticated` on the 13 columns above". `attacl is not null` on exactly those 13
  columns, and for each one `aclexplode(attacl)` yields only (grantee `authenticated`, privilege `INSERT`). No role has
  column-level SELECT, UPDATE or REFERENCES on any column.
- Add: none of the never-granted columns holds INSERT. Name each one: `users.id`, `users.created_at`,
  `regular_profiles.user_id`, `regular_profiles.account_type`, `regular_profiles.created_at`, and
  `id`/`user_id`/`created_at` (`accepted_at` on consents) on the three new tables. `has_column_privilege(..., 'INSERT')`
  must be false for each. Tag `[F1.4-a c14 rules 12, 13 · CRITIC a-1]`.
- The assertion "only id, user_id and the clock column have defaults" (line ~94) stays. It is now what lets the
  ungranted columns be filled at all.

**File 10 (`10_identity_structure.sql`)**
- Lines 329–336, "authenticated can INSERT into users and regular_profiles": the `has_table_privilege(..., 'INSERT')`
  count becomes 0. Replace it with "no table-level INSERT on either". The exact column set lives in file 20. Keep a
  single exact-set assertion, so the list has one source.
- Lines 338–344 stay as they are.

**File 12 (`12_identity_writes_refused.sql`)**
- Line 36's label becomes "… (INSERT was granted by F1.4 per column — account_type, status / full_name, gender — and
  is bounded by the policies)".
- The attacks at lines 46–55, 89–93 and 111–121 still expect 42501 and still pass. Most now fail by privilege because
  they name `id` or `user_id`. Keep them. The policy-reaching attacks that use granted columns only (`account_type`
  admin, status suspended) are already in file 21 as `f3`. Cite them in a comment rather than duplicating them.

**Fence-specific assertions (files 21, 22).** `tests.dml_as` returns only `ERR:<sqlstate>`, and both fences raise 42501.
The finding is about *which* fence holds, so a subset of the tests must assert the message too. You choose the
mechanism, for example a variant `tests.dml_as_msg` that returns `ERR:<sqlstate>:<sqlerrm>`. Required:
- **Privilege fence** (`permission denied for table <t>`):
  - file 21: the client-sent `id` on users (lines ~209–215), `user_id` on each dependent table (~234–246), and the
    explicit `accepted_at` (~249–253);
  - file 21 line ~290: `regular_profiles.account_type = 'professional'` now fails by privilege, and its label should
    say so;
  - file 22: lines 131–133 and 157.
- **Policy fence** (`new row violates row-level security policy for table <t>`):
  - the users `account_type`/`status` pins (file 21, ~196–206);
  - the status gate (a profile before the users row; the `s`/`x` inserts in file 22);
  - no claims on users.
- The explicit-NULL cases (`id = null`, `accepted_at = null`) now fail by privilege only. Tighten
  `in ('ERR:42501', 'ERR:23502')` to the privilege message.
- **Add the oracle test (CRITIC a-1).** As `f1`, run `insert into nestly.children (id, slot, name, sex, birth_date)`
  twice: (i) with the id of one of `b`'s **existing** children, and (ii) with a fresh `gen_random_uuid()`. Both must
  return the identical `ERR:42501:permission denied for table children`, never 23505, and `fx_state()` must be
  unchanged.

**Part b (carried in its spec, not part a):** the repository-level creation test (finding 2) runs every write through
the `*Insert` objects against the CI database. It also proves that each write model matches the grants, since a mismatch
is 42501 on the first registration. No extra drift machinery is needed.

### Proposed convention for `.claude/knowledge/data-model.md` (needs a different validator: CRITIC)

Add one row to "Schema conventions — DECIDED", after "Status gate placement":

```
| Write grants | INSERT (and, when it comes, UPDATE) is granted **per column**, only on the columns the client's data fills. Identifiers, owner columns, clocks and pinned columns are never granted, so their defaults always apply: rules 12–13 are held by privilege, and the policy's WITH CHECK is the second fence. SELECT stays table-level. In Drizzle every write goes through a write-model object (`<table>Insert`) in `schema.ts` that names exactly the granted columns: Drizzle names every column of the object it inserts into, and naming an ungranted column is 42501. Decided F1.4 part a (CRITIC finding 1) |
```

It is promoted after CRITIC validates it and the branch is merge-ready, together with this unit's "Entities" update.
