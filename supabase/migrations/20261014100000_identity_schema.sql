-- =====================================================================================================================
-- Identity schema — I1 F1.1 part b. The product schema `nestly`, User (the anchor) and RegularProfile under RLS and
-- FORCE RLS, their two read policies, and is_active_account().
--
-- Source: .work/identity-platform/schema.md (Gate 2, approved 13.10.2026; decisions/2026-10.md "F1.1 Gate 2").
-- SRS: §13 User, RegularProfile · NFR-SEC-001, NFR-SEC-002, NFR-SEC-006(4), AC-078 · FR-MOD-002, BR-024 · VAL-001,
--      VAL-006. Platform rules 1, 7, 8, 10, 12–16 (.claude/knowledge/data-model.md).
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261014100000_identity_schema.down.sql (safe only while both tables are empty).
-- The FK from nestly.users to auth.users is not here: app_owner cannot hold REFERENCES on auth.users, so postgres adds
-- it in bootstrap step 2 (supabase/bootstrap/02-anchor-fk.sql), after this migration, in every environment.
--
-- Writes: none for authenticated in F1.1 (no INSERT, UPDATE or DELETE grant, and no policy behind one). F1.4 adds the
-- create path, I2 the edit path (with column-level UPDATE that excludes account_type and status).
-- =====================================================================================================================

-- 1. The product schema. Owned by app_owner (the role running this file); never public, not exposed by the Data API.
create schema nestly;

-- 2. No function app_owner creates from now on is executable by PUBLIC (and so by anon) unless granted explicitly.
--    Global form on purpose: the PUBLIC EXECUTE default cannot be revoked per schema.
alter default privileges revoke execute on functions from public;

-- 3. nestly.users — SRS User, the anchor. The only product table that references auth.users (bootstrap step 2).
create table nestly.users (
  id           uuid        not null default auth.uid(),
  account_type text        not null,
  status       text        not null,
  created_at   timestamptz not null default now(),
  constraint users_pkey primary key (id),
  constraint users_id_account_type_key unique (id, account_type),
  constraint users_account_type_check check (account_type in ('regular', 'professional', 'admin', 'moderator')),
  constraint users_status_check check (status in ('active', 'suspended', 'banned'))
);

-- 4. nestly.regular_profiles — SRS RegularProfile, 1:1 with a regular user.
--    The composite FK with account_type fixed to 'regular' means a profile can only belong to a Regular account.
create table nestly.regular_profiles (
  user_id      uuid        not null default auth.uid(),
  account_type text        not null default 'regular',
  full_name    text        not null,
  gender       text,
  created_at   timestamptz not null default now(),
  constraint regular_profiles_pkey primary key (user_id),
  constraint regular_profiles_account_type_check check (account_type = 'regular'),
  constraint regular_profiles_full_name_check check (char_length(btrim(full_name)) between 2 and 60),
  constraint regular_profiles_gender_check check (gender in ('woman', 'man', 'other', 'prefer_not_to_say')),
  constraint regular_profiles_user_fkey foreign key (user_id, account_type)
    references nestly.users (id, account_type) on delete cascade
);

-- 5. RLS on, and forced: the owner is held to the policies too (platform rule 8).
alter table nestly.users            enable row level security;
alter table nestly.users            force  row level security;
alter table nestly.regular_profiles enable row level security;
alter table nestly.regular_profiles force  row level security;

-- 6. is_active_account() — true only when the caller's own account exists and is active (platform rule 15).
--    SECURITY INVOKER (Gate 2): it reads users through the caller's own-row policy. No argument names a user, so it
--    answers for the caller only. It checks id and status itself rather than trusting the users policy.
create function nestly.is_active_account()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from nestly.users u where u.id = auth.uid() and u.status = 'active'
  )
$$;

revoke execute on function nestly.is_active_account() from public;
grant  execute on function nestly.is_active_account() to authenticated;

-- 7. Policies — the only two. Read own row, and only while the account is active.
--    On users the status gate is inline: a users policy never calls a function that reads users (no recursion).
create policy users_select_own on nestly.users
  for select to authenticated
  using (id = (select auth.uid()) and status = 'active');

create policy regular_profiles_select_own on nestly.regular_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));

-- 8. Grants — authenticated reads, nothing else; nothing to anon, PUBLIC, service_role, app_server or app_jobs.
grant usage  on schema nestly                                to authenticated;
grant select on table  nestly.users, nestly.regular_profiles to authenticated;

-- 9. Comments — the meaning and the SRS id travel with the object.
comment on schema nestly is
  'Nestly product schema (I1 F1.1). Owned by app_owner; every table under RLS and FORCE RLS; not exposed by the Supabase Data API (platform rule 7).';

comment on table nestly.users is
  'SRS User (§13): the Nestly account. The anchor: the only product table with an FK to auth.users (bootstrap step 2, ON DELETE RESTRICT). Email and login details stay in auth.users; no password or hash is stored (NFR-SEC-001).';
comment on column nestly.users.id is
  'The account id = the Supabase Auth user id (auth.uid(), the JWT sub). Set by the database, never by the client (platform rules 12–13; NFR-SEC-006(4), AC-078).';
comment on column nestly.users.account_type is
  'SRS Role (§3, BR-016): regular, professional, admin or moderator. Fixed at creation; never changes. Read from this table only, never from token claims (platform rule 14).';
comment on column nestly.users.status is
  'Whether the account may use the product now: active, suspended or banned (FR-MOD-002, BR-024). Anything but active reads nothing, from the next statement (platform rule 15). A warning is not a status.';
comment on column nestly.users.created_at is
  'When the Nestly account row was created (not the Auth sign-up). UTC.';

comment on table nestly.regular_profiles is
  'SRS RegularProfile (§13): the parent''s own FR-REG-002 fields, 1:1 with a regular account.';
comment on column nestly.regular_profiles.user_id is
  'The owning account, = nestly.users.id. Set by the database (auth.uid()), never by the client (platform rule 12).';
comment on column nestly.regular_profiles.account_type is
  'Always regular. With the composite FK to nestly.users (id, account_type), only a Regular account can hold a profile (BR-016).';
comment on column nestly.regular_profiles.full_name is
  'Full name (VAL-001): required, 2 to 60 characters after trimming the spaces at both ends.';
comment on column nestly.regular_profiles.gender is
  'The parent''s gender (VAL-006, OP-004 closed): woman, man, other or prefer_not_to_say. NULL = not answered; optional.';
comment on column nestly.regular_profiles.created_at is
  'When the profile row was created. UTC.';

comment on function nestly.is_active_account() is
  'True when the caller''s own account (auth.uid()) exists and is active (platform rule 15, FR-MOD-002). Caller only: takes no user argument. SECURITY INVOKER (F1.1 Gate 2).';

comment on policy users_select_own on nestly.users is
  'An active account reads its own row only (NFR-SEC-002, layer 1). Status checked inline: no function that reads users.';
comment on policy regular_profiles_select_own on nestly.regular_profiles is
  'An active account reads its own profile only (NFR-SEC-002, layer 1; platform rule 15).';
