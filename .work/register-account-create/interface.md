# interface — register-account-create, part a (database)

Schema `nestly`. Runtime role `authenticated` (via `SET LOCAL ROLE`); suite session `app_server`.

## Tables and columns (name:type:nullability:default)
- `journey_contexts`: id uuid nn gen_random_uuid(); user_id uuid nn auth.uid(); stage text nn; due_date date null; created_at timestamptz nn now()
- `children`: id uuid nn gen_random_uuid(); user_id uuid nn auth.uid(); slot smallint nn; name text nn; sex text nn; birth_date date nn; created_at timestamptz nn now()
- `legal_consents`: id uuid nn gen_random_uuid(); user_id uuid nn auth.uid(); terms_version text nn; privacy_version text nn; has_declared_18_plus boolean nn; accepted_at timestamptz nn now()
- Drizzle exports (apps/server/src/db/schema.ts): `journeyContexts`, `children`, `legalConsents` (no accepted_at). Types for the drift test: uuid, text, `date`, `smallint`, `boolean`, `timestamp with time zone`.

## Constraints and indexes
- journey_contexts: journey_contexts_pkey; journey_contexts_user_id_fkey -> regular_profiles(user_id) CASCADE; journey_contexts_stage_check; journey_contexts_due_date_check; journey_contexts_user_id_stage_key UNIQUE(user_id, stage); partial unique index journey_contexts_user_id_planning_pregnant_key ON (user_id) WHERE stage in ('planning','pregnant')
- children: children_pkey; children_user_id_fkey -> regular_profiles(user_id) CASCADE; children_slot_check; children_name_check; children_sex_check; children_birth_date_check; children_user_id_slot_key UNIQUE(user_id, slot)
- legal_consents: legal_consents_pkey; legal_consents_user_id_fkey -> users(id) RESTRICT; legal_consents_terms_version_check; legal_consents_privacy_version_check; legal_consents_has_declared_18_plus_check; legal_consents_user_id_versions_key UNIQUE(user_id, terms_version, privacy_version)

## Policies (all TO authenticated; command)
- users: users_select_own (select, F1.1), users_insert_own (insert)
- regular_profiles: regular_profiles_select_own (select, F1.1), regular_profiles_insert_own (insert)
- journey_contexts: journey_contexts_select_own (select), journey_contexts_insert_own (insert)
- children: children_select_own (select), children_insert_own (insert)
- legal_consents: legal_consents_select_own (select), legal_consents_insert_own (insert)
- All five tables: RLS enabled and forced.

## Grants
- authenticated: SELECT (table-level) on users, regular_profiles (F1.1), journey_contexts, children, legal_consents. No table-level INSERT on any nestly table. INSERT per column (Amendment 1), exactly 13 columns:
  - users: account_type, status
  - regular_profiles: full_name, gender
  - journey_contexts: stage, due_date
  - children: slot, name, sex, birth_date
  - legal_consents: terms_version, privacy_version, has_declared_18_plus
  - Never granted (default always applies): users.id, users.created_at; regular_profiles.user_id, account_type, created_at; id, user_id, created_at on the three new tables; legal_consents.accepted_at.
  - Column-level ACL (attacl) exists only for those 13 columns, INSERT to authenticated only.
- No UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on any nestly table to any role.
- Drizzle write models (apps/server/src/db/schema.ts), insert targets naming exactly the granted columns: `usersInsert` (accountType, status), `regularProfilesInsert` (fullName, gender), `journeyContextsInsert` (stage, dueDate), `childrenInsert` (slot, name, sex, birthDate), `legalConsentsInsert` (termsVersion, privacyVersion, hasDeclared18Plus). Read-side objects unchanged. Inserting through a read-side object names ungranted columns and fails 42501.
- Privilege refusal vs policy refusal (both SQLSTATE 42501): privilege (a statement names an ungranted column, checked before any row or constraint) raises `permission denied for table <table>`; policy WITH CHECK raises `new row violates row-level security policy for table <table>`. A client-sent id never reaches 23505 (no unique-index oracle); the only 23505 on users_pkey is the caller's own id.
- No trigger, view or SECURITY DEFINER function added. No new function in `nestly`.

## Fixtures (file supabase/tests/setup/20_registration_fixtures.sql, once placed; draft at .work/register-account-create/20_registration_fixtures.sql.draft)
- Rows: a = journeys pregnant (due_date 2027-03-01) + has_child, children slots 1 and 2, 1 consent; b = journey planning, child slot 1, 1 consent. Others (c, p, s, x, f1..f5): none.
- Consent fixture versions: 'fixture-terms-1' / 'fixture-privacy-1'.
- `tests.fx_state()` (replaces the F1.1 one, same signature): md5 over the five nestly tables, unfiltered by RLS.
- `tests.fx_counts(id uuid)` -> text 'users/profiles/journeys/children/consents'.
- Existing helpers unchanged: `tests.fx_id(name)`, `tests.claims(sub)`, `tests.dml_as(role, claims, sql, keep)` -> 'OK:<rows>' / 'ERR:<sqlstate>', `tests.as_role`, `tests.n_as`, `tests.set_status`, `tests.fx_insert_user`, `tests.fx_insert_profile`.
- Multi-statement write as a user: `tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), 'do $$ ... $$')`.

## Error codes raised by the database
23505 unique violation (users_pkey, *_key, partial index); 23514 check violation; 23503 foreign key violation; 42501 RLS WITH CHECK or privilege.

## Migration and rollback
- supabase/migrations/20261014200000_registration_account.sql; supabase/rollback/20261014200000_registration_account.down.sql (runs as app_owner; raises if any of the three tables holds a row); F1.1 down script raises if `nestly.legal_consents` exists.
