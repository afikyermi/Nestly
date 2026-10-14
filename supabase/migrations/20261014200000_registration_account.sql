-- =====================================================================================================================
-- Registration account — I1 F1.4 part a. JourneyContext, Child and LegalConsent under RLS and FORCE RLS; the create
-- path (INSERT) on User and RegularProfile; SELECT + INSERT on the three new tables.
--
-- Source: .work/register-account-create/schema.md (Gate 2, passed 14.10.2026; decisions/2026-10.md).
-- SRS: §13 JourneyContext, Child, LegalConsent · FR-REG-004, BR-068, BR-016 · AC-084, AC-088 · VAL-005, VAL-006,
--      VAL-039, VAL-040 · NFR-SEC-002. Platform rules 1, 8, 11–15 (.claude/knowledge/data-model.md).
--
-- Write order inside the one identity transaction (platform rule 11), for the part-b repository:
--   users -> regular_profiles -> journey_contexts -> children (slots 1..n in entry order) -> legal_consents.
-- Every status gate below reads the users row inserted earlier in the same transaction.
--
-- No UPDATE and no DELETE grant on any nestly table, and no policy behind one: I2 adds the edit path (its own Gate 2).
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261014200000_registration_account.down.sql (refuses while any new table holds a row).
-- =====================================================================================================================

-- 1. nestly.journey_contexts — SRS JourneyContext: one row per stage the parent ticked (VAL-039).
create table nestly.journey_contexts (
  id         uuid        not null default gen_random_uuid(),
  user_id    uuid        not null default auth.uid(),
  stage      text        not null,
  due_date   date,
  created_at timestamptz not null default now(),
  constraint journey_contexts_pkey primary key (id),
  constraint journey_contexts_user_id_fkey foreign key (user_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint journey_contexts_stage_check check (stage in ('planning', 'pregnant', 'has_child')),
  constraint journey_contexts_due_date_check check (due_date is null or stage = 'pregnant'),
  constraint journey_contexts_user_id_stage_key unique (user_id, stage)
);

-- VAL-039: planning is never ticked together with pregnant. At most one of the two per user.
create unique index journey_contexts_user_id_planning_pregnant_key
  on nestly.journey_contexts (user_id)
  where stage in ('planning', 'pregnant');

-- 2. nestly.children — SRS Child: exactly name, sex, birth date, plus mechanics (minors' data).
create table nestly.children (
  id         uuid        not null default gen_random_uuid(),
  user_id    uuid        not null default auth.uid(),
  slot       smallint    not null,
  name       text        not null,
  sex        text        not null,
  birth_date date        not null,
  created_at timestamptz not null default now(),
  constraint children_pkey primary key (id),
  constraint children_user_id_fkey foreign key (user_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint children_slot_check check (slot between 1 and 10),
  constraint children_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint children_sex_check check (sex in ('boy', 'girl', 'unknown')),
  constraint children_birth_date_check check (birth_date >= date '1900-01-01'),
  constraint children_user_id_slot_key unique (user_id, slot)
);

-- 3. nestly.legal_consents — SRS LegalConsent: one row per acceptance event, append-only.
create table nestly.legal_consents (
  id                   uuid        not null default gen_random_uuid(),
  user_id              uuid        not null default auth.uid(),
  terms_version        text        not null,
  privacy_version      text        not null,
  has_declared_18_plus boolean     not null,
  accepted_at          timestamptz not null default now(),
  constraint legal_consents_pkey primary key (id),
  constraint legal_consents_user_id_fkey foreign key (user_id)
    references nestly.users (id) on delete restrict,
  constraint legal_consents_terms_version_check check (char_length(terms_version) between 1 and 64),
  constraint legal_consents_privacy_version_check check (char_length(privacy_version) between 1 and 64),
  constraint legal_consents_has_declared_18_plus_check check (has_declared_18_plus = true),
  constraint legal_consents_user_id_versions_key unique (user_id, terms_version, privacy_version)
);

-- 4. RLS on, and forced (platform rule 8).
alter table nestly.journey_contexts enable row level security;
alter table nestly.journey_contexts force  row level security;
alter table nestly.children         enable row level security;
alter table nestly.children         force  row level security;
alter table nestly.legal_consents   enable row level security;
alter table nestly.legal_consents   force  row level security;

-- 5. Policies — all TO authenticated. Owner only, active account only (platform rules 12, 14, 15).
create policy users_insert_own on nestly.users
  for insert to authenticated
  with check (id = (select auth.uid()) and account_type = 'regular' and status = 'active');

create policy regular_profiles_insert_own on nestly.regular_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy journey_contexts_select_own on nestly.journey_contexts
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy journey_contexts_insert_own on nestly.journey_contexts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy children_select_own on nestly.children
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy children_insert_own on nestly.children
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy legal_consents_select_own on nestly.legal_consents
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy legal_consents_insert_own on nestly.legal_consents
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()) and accepted_at = now());

-- 6. Grants — authenticated only. No UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER to anyone.
grant select, insert on table nestly.journey_contexts, nestly.children, nestly.legal_consents to authenticated;
grant insert         on table nestly.users, nestly.regular_profiles                           to authenticated;

-- 7. Comments.
comment on table nestly.journey_contexts is
  'SRS JourneyContext (§13, VAL-039): one row per stage the parent ticked at registration. Part of the parent''s account: deleted with the profile.';
comment on column nestly.journey_contexts.id is
  'Stable handle for later references (trackers, I6). Generated by the database.';
comment on column nestly.journey_contexts.user_id is
  'The owning Regular account. Set by the database (auth.uid()), never by the client (platform rule 12).';
comment on column nestly.journey_contexts.stage is
  'planning, pregnant or has_child (VAL-039). One row per stage per user; planning never together with pregnant.';
comment on column nestly.journey_contexts.due_date is
  'Estimated due date (§13, health-related). Only on a pregnant journey; NULL = not given. The window around today is checked by the server only (clock-dependent).';
comment on column nestly.journey_contexts.created_at is
  'When the row was created. UTC.';

comment on table nestly.children is
  'SRS Child (§13): minors'' data. Exactly name, sex and birth date, plus mechanics. Part of the parent''s account (BR-016): deleted with the profile.';
comment on column nestly.children.user_id is
  'The parent (owner). Set by the database (auth.uid()), never by the client (platform rule 12).';
comment on column nestly.children.slot is
  'The child''s position in the parent''s list, 1 to 10 (VAL-040). Means nothing beyond order and the limit; not data about the child.';
comment on column nestly.children.name is
  'The child''s name: 1 to 60 characters after trimming the spaces at both ends (same counting as VAL-001).';
comment on column nestly.children.sex is
  'boy, girl or unknown (VAL-006). Required.';
comment on column nestly.children.birth_date is
  'The child''s birth date, not before 1900-01-01. "Not in the future" (VAL-005) is checked by the server only (clock-dependent).';
comment on column nestly.children.created_at is
  'When the row was created. UTC.';

comment on table nestly.legal_consents is
  'SRS LegalConsent (§13, FR-REG-004, BR-068): one row per acceptance event holding the full set accepted. Append-only: no UPDATE or DELETE grant. The latest row is the current consent state.';
comment on column nestly.legal_consents.user_id is
  'The account that accepted (any account type). ON DELETE RESTRICT: whether a consent outlives the account is a legal retention question (§13.4, Afik).';
comment on column nestly.legal_consents.terms_version is
  'The Terms of Use version accepted, 1 to 64 characters. Comes from the server''s constant, never the client (AC-084).';
comment on column nestly.legal_consents.privacy_version is
  'The Privacy Policy version accepted, 1 to 64 characters. Comes from the server''s constant, never the client (AC-084).';
comment on column nestly.legal_consents.has_declared_18_plus is
  'The 18+ declaration was made in this acceptance (BR-068). Always true: a row without the declaration cannot exist.';
comment on column nestly.legal_consents.accepted_at is
  'When the user accepted: the database clock. The insert policy refuses any value other than now().';

comment on index nestly.journey_contexts_user_id_planning_pregnant_key is
  'VAL-039: at most one of planning and pregnant per user, held by the database as well as by the server.';
comment on constraint children_user_id_slot_key on nestly.children is
  'At most 10 children per user together with children_slot_check; two concurrent inserts of one slot serialize on this index.';
comment on constraint legal_consents_user_id_versions_key on nestly.legal_consents is
  'The same version pair is never recorded twice for one account; a new version pair (re-consent) is a new row.';

comment on policy users_insert_own on nestly.users is
  'An identity creates its own account, as a regular and active account only (platform rule 14; professional registration widens it in its own Gate 2).';
comment on policy regular_profiles_insert_own on nestly.regular_profiles is
  'An active account creates its own profile only (platform rules 12, 15). Needs the users row inserted earlier in the same transaction.';
comment on policy journey_contexts_select_own on nestly.journey_contexts is
  'An active account reads its own journeys only (layer 9).';
comment on policy journey_contexts_insert_own on nestly.journey_contexts is
  'An active account creates its own journeys only.';
comment on policy children_select_own on nestly.children is
  'An active account reads its own children only (layer 9).';
comment on policy children_insert_own on nestly.children is
  'An active account creates its own children only.';
comment on policy legal_consents_select_own on nestly.legal_consents is
  'An active account reads its own consent records only (layer 9).';
comment on policy legal_consents_insert_own on nestly.legal_consents is
  'An active account records its own consent only, stamped with the database clock (accepted_at = now()).';
