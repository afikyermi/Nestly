# notes — register-account-create, part a (database)

**Approach**  Migration `20261014200000_registration_account.sql` as schema.md wrote it (three tables, partial unique index, RLS+FORCE, eight new policies, grants, comments). Level-2 down script. F1.1 down script got the guard. Drizzle `schema.ts` has the three tables, `accepted_at` omitted. `catalog-columns.sql` needed no change (it reads every table generically).

**Decisions**  Drizzle `date` columns use `mode: 'string'` (no JS Date, avoids timezone shifts on a calendar date). `legalConsents` has no `acceptedAt` column at all (schema.md). The down script lifts FORCE on the three tables before counting, like F1.1's.

**Deviations**  None in the migration. The pgTAP/fixture part is NOT done, see Uncertain.

**Deliberately not done**  Behavioural pgTAP (files 21-23), shared Zod, route, UI.

**Uncertain**
- BLOCKED by the guard: `.claude/hooks/guard.js` refuses BUILDER writing anything under `supabase/tests/**` ("BUILDER does not write tests"). So these blast-radius items are NOT done and need TEST ENGINEER (or a guard exception from ORCHESTRATOR):
  1. New `supabase/tests/setup/20_registration_fixtures.sql` - complete draft at `.work/register-account-create/20_registration_fixtures.sql.draft`, move unchanged.
  2. `supabase/tests/10_identity_structure.sql` lines 263-269: assertion "no INSERT, UPDATE, DELETE or ALL policy exists in nestly" now fails (five INSERT policies exist). Must become the exact policy list.
  3. `supabase/tests/12_identity_writes_refused.sql`: line 29-36 catalog assertion (has no INSERT) now fails; attempts that are no longer 42501: `c` insert into users (allowed, c is a free Auth user), `a` insert into users (now 23505), `a` second profile insert (now 23505).
  4. NOT in schema.md's blast radius: `apps/server/tests/drift.test.ts` fails ("exits 0 when the database has exactly the columns of schema.md"): its `APPROVED` catalog lists only users and regular_profiles, and the real Drizzle schema now names three more tables. Add the new tables' columns to `APPROVED` (types in interface.md).
- No local DB or Docker here: the migration, down script and fixtures have never run. CI `db` job is the first run. Not verified locally: up->down->up fingerprint, that the F1.1 down guard parses.
- Unit tests: 164 of 165 pass; the one failure is item 4.

**Preview path**  None (database only). Part b must not deploy to an environment before this migration is applied there.

**Neighbouring**  none
