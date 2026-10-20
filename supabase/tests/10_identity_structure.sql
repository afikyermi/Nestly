-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part b).
-- Criteria 8 (anchor FK), 10 (columns, no password), 11 (identifiers not guessable), and the structural side of 12, 18
-- and 19 (RLS flags, policies, grants, the helper function). Behaviour of the policies is in 11-13.
-- Source of expected values: .work/identity-platform/spec.md and schema.md (the approved column lists), not the
-- migration text.
-- Catalog lookups join pg_class / pg_namespace by name: app_server has no USAGE on schema nestly, so a regclass cast
-- ('nestly.users'::regclass) would fail with permission denied.
-- Written without a database to run against: CI is the first run. no_plan() on purpose (no hand-counted plan).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.1-b c8] session_user is app_server (this file must not run under another login)');

-- ---- fixtures are really there (so "no row" results elsewhere are not vacuous) ----------------------------------------
select is(tests.fx_user(tests.fx_id('a')), 'regular/active', '[F1.1-b fixture] account a exists, regular and active');
select is(tests.fx_profile(tests.fx_id('a')), 'Alice Aaron/woman', '[F1.1-b fixture] account a has a profile');

-- =====================================================================================================================
-- Criterion 8 — the anchor. [13-data.md:16-17 · data-model "anchor"]
-- =====================================================================================================================
select is(
  (select count(*) from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c      on c.oid  = co.conrelid
     join pg_catalog.pg_namespace n  on n.oid  = c.relnamespace
     join pg_catalog.pg_class fc     on fc.oid = co.confrelid
     join pg_catalog.pg_namespace fn on fn.oid = fc.relnamespace
    where co.contype = 'f' and n.nspname = 'nestly' and c.relname = 'users'
      and fn.nspname = 'auth' and fc.relname = 'users'
      and array_length(co.conkey, 1) = 1 and array_length(co.confkey, 1) = 1
      and (select a.attname from pg_catalog.pg_attribute a where a.attrelid = co.conrelid  and a.attnum = co.conkey[1])  = 'id'
      and (select a.attname from pg_catalog.pg_attribute a where a.attrelid = co.confrelid and a.attnum = co.confkey[1]) = 'id'),
  1::bigint,
  '[F1.1-b c8] after bootstrap step 2, nestly.users (id) has a foreign key to auth.users (id) (the anchor)');

select is(
  (select co.confdeltype::text from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c      on c.oid  = co.conrelid
     join pg_catalog.pg_namespace n  on n.oid  = c.relnamespace
     join pg_catalog.pg_namespace fn on fn.oid = (select fc.relnamespace from pg_catalog.pg_class fc where fc.oid = co.confrelid)
    where co.contype = 'f' and n.nspname = 'nestly' and c.relname = 'users' and fn.nspname = 'auth'),
  'r',
  '[F1.1-b c8] the anchor is ON DELETE RESTRICT (Afik, 13.10.2026)');

select is(
  (select co.convalidated from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c      on c.oid  = co.conrelid
     join pg_catalog.pg_namespace n  on n.oid  = c.relnamespace
     join pg_catalog.pg_namespace fn on fn.oid = (select fc.relnamespace from pg_catalog.pg_class fc where fc.oid = co.confrelid)
    where co.contype = 'f' and n.nspname = 'nestly' and c.relname = 'users' and fn.nspname = 'auth'),
  true,
  '[F1.1-b c8] the anchor is validated (checked against existing rows, not NOT VALID)');

select is(
  (select count(*) from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c      on c.oid  = co.conrelid
     join pg_catalog.pg_namespace n  on n.oid  = c.relnamespace
     join pg_catalog.pg_class fc     on fc.oid = co.confrelid
     join pg_catalog.pg_namespace fn on fn.oid = fc.relnamespace
    where co.contype = 'f' and n.nspname = 'nestly' and fn.nspname = 'auth'),
  1::bigint,
  '[F1.1-b c8] exactly one foreign key from schema nestly reaches schema auth: User is the only product table with an FK to auth.users');

select is_empty(
  $$ select c.relname
       from pg_catalog.pg_constraint co
       join pg_catalog.pg_class c      on c.oid  = co.conrelid
       join pg_catalog.pg_namespace n  on n.oid  = c.relnamespace
       join pg_catalog.pg_class fc     on fc.oid = co.confrelid
       join pg_catalog.pg_namespace fn on fn.oid = fc.relnamespace
      where co.contype = 'f' and n.nspname = 'nestly' and c.relname = 'regular_profiles' and fn.nspname <> 'nestly' $$,
  '[F1.1-b c8] RegularProfile has no foreign key outside schema nestly (nothing of its own reaches auth.users)');

select cmp_ok(
  (select count(*) from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c      on c.oid  = co.conrelid
     join pg_catalog.pg_namespace n  on n.oid  = c.relnamespace
     join pg_catalog.pg_class fc     on fc.oid = co.confrelid
     join pg_catalog.pg_namespace fn on fn.oid = fc.relnamespace
    where co.contype = 'f' and n.nspname = 'nestly' and c.relname = 'regular_profiles'
      and fn.nspname = 'nestly' and fc.relname = 'users'),
  '>=', 1::bigint,
  '[F1.1-b c8] RegularProfile references User (nestly.regular_profiles -> nestly.users)');

-- The anchor really restricts: an Auth user who has a Nestly account cannot be deleted; one without can.
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_delete_auth_user(%L) $q$, tests.fx_id('a')), false),
  'ERR:23503',
  '[F1.1-b c8] deleting the Auth user of an account that has a nestly.users row is refused (foreign_key_violation, ON DELETE RESTRICT)');

select is(
  tests.dml_as('none', '', format($q$ select tests.fx_delete_auth_user(%L) $q$, tests.fx_id('c')), false),
  'OK:1',
  '[F1.1-b c8] deleting an Auth user that has no nestly.users row is not blocked (the restriction is the anchor, not a blanket lock)');

select is(tests.fx_user(tests.fx_id('a')), 'regular/active', '[F1.1-b c8] after the refused delete the account is untouched');

-- A Nestly account without an Auth user is impossible (orphans).
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_user(%L, 'regular', 'active') $q$, gen_random_uuid()), false),
  'ERR:23503',
  '[F1.1-b c8] a nestly.users row whose id is not an Auth user is refused (no orphan accounts)');

-- =====================================================================================================================
-- Criterion 10 — the columns equal schema.md's lists; no password, no hash. [NFR-SEC-001]
-- =====================================================================================================================
select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a
     join pg_catalog.pg_class c     on c.oid = a.attrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'users' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'account_type:text:nn, created_at:timestamp with time zone:nn, id:uuid:nn, status:text:nn, suspended_until:timestamp with time zone:null',
  '[F1.1-b c10 NFR-SEC-001 · I4] nestly.users has exactly the approved columns: id uuid, account_type text, status text, created_at timestamptz, all NOT NULL, and the nullable suspended_until (end of a suspension)');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a
     join pg_catalog.pg_class c     on c.oid = a.attrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_profiles' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'account_type:text:nn, created_at:timestamp with time zone:nn, full_name:text:nn, gender:text:null, '
  || 'is_child_birthday_shared:boolean:nn, is_empty_journey_sentence_shown:boolean:nn, profile_visibility:text:nn, user_id:uuid:nn',
  '[F1.1-b c10 NFR-SEC-001 · F2.3-a c6] nestly.regular_profiles has exactly the approved columns: user_id, account_type, full_name, gender (the only nullable one), created_at, and F2.3a''s profile_visibility text, is_empty_journey_sentence_shown and is_child_birthday_shared boolean, all NOT NULL');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class c     on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p', 'v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
        and c.relname not in ('recovery_answers', 'recovery_throttles', 'recovery_events', 'identity_link_checks')
        and a.attname ~* '(pass|pwd|hash|secret|token|salt|crypt)' $$,
  '[F1.1-b c10 NFR-SEC-001 · F1.6, F2.0 scoped] no column of the F1.1/F1.4 tables or any view is named like a password, hash, secret or token (the recovery tables hold peppered answer hashes by design: file 30 checks them; identity_link_checks.password_set_at is a time: file 40)');

select is(
  (select count(*) from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a  on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c      on c.oid = d.adrelid
     join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'users' and a.attname in ('account_type', 'status')),
  0::bigint,
  '[F1.1-b c10] users.account_type and users.status have no default: nothing becomes regular or active by accident');

select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'regular'
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a  on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c      on c.oid = d.adrelid
     join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_profiles' and a.attname = 'account_type'),
  '[F1.1-b c10] regular_profiles.account_type defaults to regular');

select is(
  (select count(*) from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a  on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c      on c.oid = d.adrelid
     join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles') and a.attname = 'created_at'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~* 'now\(\)|current_timestamp|transaction_timestamp'),
  2::bigint,
  '[F1.1-b c10] created_at defaults to the current time on both tables');

-- =====================================================================================================================
-- Criterion 11 — identifiers are not guessable. [NFR-SEC-006(4) · AC-078 · Gate 2 default: >= 64 CSPRNG bits]
-- =====================================================================================================================
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind = 'S' $$,
  '[F1.1-b c11 NFR-SEC-006] schema nestly holds no sequence');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attribute a
       join pg_catalog.pg_class c     on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
        and (a.attidentity <> '' or a.attgenerated <> '')
        and not (c.relname = 'reactions' and a.attname = 'target_id') $$,
  '[F1.1-b c11 NFR-SEC-006 · F3.0-b c12] no column in schema nestly is an identity or generated column, but reactions.target_id (generated coalesce of the two target columns: the owner row''s foreign-key target)');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attrdef d
       join pg_catalog.pg_attribute a  on a.attrelid = d.adrelid and a.attnum = d.adnum
       join pg_catalog.pg_class c      on c.oid = d.adrelid
       join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
      where n.nspname = 'nestly'
        and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~* '(nextval|serial|identity|counter|currval)' $$,
  '[F1.1-b c11 NFR-SEC-006] no default in schema nestly uses a sequence, an identity or a counter');

select is(
  (select string_agg(c.relname || ':' || format_type(a.atttypid, a.atttypmod), ', ' order by c.relname)
     from pg_catalog.pg_index i
     join pg_catalog.pg_class c     on c.oid = i.indrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles') and i.indisprimary),
  'regular_profiles:uuid, users:uuid',
  '[F1.1-b c11 NFR-SEC-006] both primary keys are uuid, not an integer that counts');

select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'auth\.uid\(\)'
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a  on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c      on c.oid = d.adrelid
     join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'users' and a.attname = 'id'),
  '[F1.1-b c11 platform r12] users.id defaults to auth.uid(): the id is issued by Supabase Auth, never chosen by the client');

select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'auth\.uid\(\)'
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a  on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c      on c.oid = d.adrelid
     join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_profiles' and a.attname = 'user_id'),
  '[F1.1-b c11 platform r12] regular_profiles.user_id defaults to auth.uid()');

-- The generator that issues ids (Gate 2: gen_random_uuid(), UUID v4, 122 random bits): 1,000 in a row.
create temp table zz_ids as
  select n, gen_random_uuid() as u from generate_series(1, 1000) as n;
create temp table zz_nums as
  select n, u, (('x' || substr(replace(u::text, '-', ''), 1, 16))::bit(64)::bigint)::numeric as v from zz_ids;
create temp table zz_diffs as
  select n, v - lag(v) over (order by n) as d from zz_nums;

select is((select count(*) from zz_ids), 1000::bigint, '[F1.1-b c11 AC-078] 1,000 identifiers were generated');
select is((select count(distinct u) from zz_ids), 1000::bigint, '[F1.1-b c11 AC-078] 1,000 identifiers generated in a row contain no repeat');
select ok((select count(distinct d) from zz_diffs where d is not null) > 1,
  '[F1.1-b c11 AC-078] the differences between consecutive identifiers are not constant');
select ok((select count(distinct d) from zz_diffs where d is not null) >= 990,
  '[F1.1-b c11 AC-078] the differences between consecutive identifiers are practically all different (no counter, no fixed step)');
select ok(
  (select count(*) from zz_nums a join zz_nums b on b.n = a.n + 1 where b.v > a.v) between 1 and 998,
  '[F1.1-b c11 AC-078] consecutive identifiers are neither all rising nor all falling (not ordered by time or count)');
select is((select count(*) from zz_ids where substr(u::text, 15, 1) <> '4'), 0::bigint,
  '[F1.1-b c11 NFR-SEC-006] every generated identifier is a random (version 4) UUID, not a time-ordered one');

-- =====================================================================================================================
-- Criteria 12-13, 19 — structure of the protection: RLS on and forced, only SELECT policies, grants. [layer 1, layer 2]
-- =====================================================================================================================
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  '[F1.1-b c12 platform r8] every table in schema nestly has RLS enabled and FORCED');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles') and c.relrowsecurity and c.relforcerowsecurity),
  2::bigint,
  '[F1.1-b c12 platform r8] users and regular_profiles both have RLS enabled and FORCED');

select is(
  (select count(distinct c.relname) from pg_catalog.pg_policy pol
     join pg_catalog.pg_class c     on c.oid = pol.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles') and pol.polcmd = 'r'),
  2::bigint,
  '[F1.1-b c12] each of the two tables has a SELECT policy');

-- F1.4 part a (Gate 2): the five INSERT policies exist, and nothing else writes. Updated from "no INSERT, UPDATE, DELETE or
-- ALL policy" to the exact list: no UPDATE, DELETE or ALL policy, and INSERT only on these five tables by these names.
select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol
       join pg_catalog.pg_class c     on c.oid = pol.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and pol.polcmd not in ('r', 'a')
        and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and not (c.relname = 'regular_profiles' and pol.polname = 'regular_profiles_update_own' and pol.polcmd = 'w')
        and not (c.relname = 'children' and pol.polname = 'children_update_own' and pol.polcmd = 'w')
        and not (c.relname = 'journey_contexts' and pol.polname = 'journey_contexts_update_own' and pol.polcmd = 'w')
        and not (c.relname = 'children' and pol.polname = 'children_delete_own' and pol.polcmd = 'd')
        and not (c.relname = 'journey_contexts' and pol.polname = 'journey_contexts_delete_own' and pol.polcmd = 'd')
        and not (c.relname = 'users' and pol.polname in ('users_update_staff', 'users_update_own_expired_suspension') and pol.polcmd = 'w') $$,
  '[F1.1-b c13 platform r14 · F1.4-a c14 · F1.6 scoped · F2.1 c10 · F2.2a c9 · F2.2-b c18] no UPDATE, DELETE or ALL policy exists on the five F1.1/F1.4 tables except regular_profiles_update_own (F2.1), children_update_own (F2.2a), journey_contexts_update_own (F2.2b1) and the own-row deletes children_delete_own and journey_contexts_delete_own (F2.2b2, DR-1 A; recovery_answers has its own: file 30; files 50, 51 and 54 assert the policies)');

select is(
  (select string_agg(c.relname || '.' || pol.polname, ', ' order by c.relname, pol.polname)
     from pg_catalog.pg_policy pol
     join pg_catalog.pg_class c     on c.oid = pol.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and pol.polcmd = 'a'
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')),
  'children.children_insert_own, journey_contexts.journey_contexts_insert_own, legal_consents.legal_consents_insert_own, regular_profiles.regular_profiles_insert_own, users.users_insert_own',
  '[F1.1-b c13 · F1.4-a c14 platform r14 · F1.6 scoped] the INSERT policies on the five F1.1/F1.4 tables are exactly the five approved ones, one per table');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol
       join pg_catalog.pg_class c     on c.oid = pol.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and pol.polroles <> array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]
        and pol.polname not like '%\_select\_profile\_view' and pol.polname not in ('users_select_search', 'regular_profiles_block_hide_owner') $$,
  '[F1.1-b c19 platform r4 · F1.6 scoped · F2.3b c15] every policy on the five F1.1/F1.4 tables is TO authenticated only (not PUBLIC, not anon, not app_recovery), except the four *_select_profile_view policies, users_select_search and regular_profiles_block_hide_owner TO app_owner (files 53, 90 and 91 assert them)');

select is(has_schema_privilege('authenticated', 'nestly', 'USAGE'), true,
  '[F1.1-b c12] authenticated has USAGE on schema nestly');
select is(has_schema_privilege('anon', 'nestly', 'USAGE,CREATE'), false,
  '[F1.1-b c19 platform r7] anon has no privilege on schema nestly');
select is(has_schema_privilege('app_server', 'nestly', 'USAGE,CREATE'), false,
  '[F1.1-b c14 platform r2] app_server has no privilege on schema nestly: it reaches the data only after SET ROLE');
select is(has_schema_privilege('service_role', 'nestly', 'USAGE,CREATE'), false,
  '[F1.1-b c19 platform r1] service_role has no privilege on schema nestly');
select is(
  (select count(*) from pg_catalog.pg_namespace n, lateral pg_catalog.aclexplode(n.nspacl) a
    where n.nspname = 'nestly' and a.grantee = 0),
  0::bigint,
  '[F1.1-b c19 platform r7] PUBLIC holds no privilege on schema nestly');

select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace, lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.grantee = 0),
  0::bigint,
  '[F1.1-b c19 platform r7] PUBLIC holds no privilege on any table in schema nestly');

select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles')
      and has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  0::bigint,
  '[F1.1-b c19 platform r1,r7] anon, service_role, app_server and app_jobs hold no privilege at all on User or RegularProfile');

select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles')
      and has_table_privilege('authenticated', c.oid, 'SELECT')),
  2::bigint,
  '[F1.1-b c12] authenticated can SELECT both tables (the policies then narrow it to its own row)');

-- F1.4 part a (Amendment 1): INSERT is granted per COLUMN, never per table. The exact column list lives in file 20 (one source).
select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles')
      and has_table_privilege('authenticated', c.oid, 'INSERT')),
  0::bigint,
  '[F1.4-a c14 CRITIC a-1] authenticated holds no table-level INSERT on users or regular_profiles (column-level only; see file 20)');

select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')
      and (has_table_privilege('authenticated', c.oid, 'UPDATE,TRUNCATE,REFERENCES,TRIGGER')
           or (c.relname not in ('recovery_answers', 'children', 'journey_contexts', 'posts', 'post_hides', 'comments', 'reactions', 'tracker_events', 'cycle_entries', 'moderator_permissions', 'user_blocks') and has_table_privilege('authenticated', c.oid, 'DELETE'))
           or (c.relname not in ('recovery_answers', 'identity_link_checks', 'regular_profiles', 'children', 'journey_contexts', 'friendships', 'posts', 'comments', 'tracker_events', 'cycle_entries', 'users', 'reports', 'report_reasons', 'notifications', 'notification_preferences', 'friend_content_notification_preferences') and has_any_column_privilege('authenticated', c.oid, 'UPDATE,REFERENCES')))),
  0::bigint,
  '[F1.1-b c13 · F1.4-a c14 · F1.6, F2.0 scoped · F2.2a c9 · F2.2-b c18 · F2.4a c12] authenticated holds no table-level UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any table in nestly (DELETE on recovery_answers is the F2.0 D1 grant; on children and journey_contexts the F2.2b2 own-row delete, file 54), and no column-level UPDATE or REFERENCES except on recovery_answers, identity_link_checks, regular_profiles, children, journey_contexts and friendships (files 30, 40, 50, 51, 54 and 61 list those columns); I6''s tracker_events and cycle_entries are owner-only with own-row UPDATE and DELETE (file 86)');

-- =====================================================================================================================
-- Criterion 18 — is_active_account(): caller only, invoker, not an approved definer. [Spec addendum 1]
-- =====================================================================================================================
select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'is_active_account'),
  1::bigint,
  '[F1.1-b c18] nestly.is_active_account exists once');

select is(
  (select p.pronargs::int from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'is_active_account'),
  0,
  '[F1.1-b c18 layer 13] is_active_account() takes no argument, so it cannot be asked about another account');

select is(
  (select p.prorettype::regtype::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'is_active_account'),
  'boolean',
  '[F1.1-b c18] is_active_account() returns a boolean, not a status or an id');

select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'is_active_account'),
  false,
  '[F1.1-b c18 addendum 1] is_active_account() is SECURITY INVOKER, not a definer');

-- F2.3b (DR-G1, Afik 17.10.2026): the first approved definer, nestly.profile_view(text). The definers in nestly are exactly
-- the approved list, and is_active_account() is not on it (file 53 asserts profile_view itself).
select set_eq(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  $$ select a from tests.approved_security_definer() as a $$,
  '[F1.1-b c18 platform r10 · F2.3b c15] the SECURITY DEFINER functions in schema nestly are exactly the approved list');

select is((select count(*) from tests.approved_security_definer()), 7::bigint,
  '[F1.1-b c18 addendum 1 · F2.3b c15 · I4] the approved SECURITY DEFINER list holds seven functions (profile_view, F2.3b; audit_trigger and reveal_post_author, I4; the three notification triggers and search_people, rule 17; approved by Afik 20.10.2026)');

select is((select count(*) from tests.approved_security_definer() as a where a like 'nestly.is\_active\_account(%'), 0::bigint,
  '[F1.1-b c18 addendum 1] is_active_account() is not an approved exception');

select ok(
  (select exists (select 1 from unnest(p.proconfig) as cfg where cfg like 'search_path=%')
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'is_active_account'),
  '[F1.1-b c18 platform r10] is_active_account() has a fixed search_path');

select is(
  (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'is_active_account'),
  true,
  '[F1.1-b c18] authenticated can execute is_active_account()');

select is(
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
    where n.nspname = 'nestly' and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
      and not (r.rolname = 'app_jobs' and p.proname in ('purge_held_content', 'purge_search_intents'))),
  0::bigint,
  '[F1.1-b c19 platform r4,r7 · F3.0-b c14] no function in schema nestly is executable by anon, service_role, app_server or app_jobs (so not by PUBLIC either), but the purge, executable by app_jobs only');

-- No function that authenticated can execute returns another account's status: each one takes no argument and is not a definer.
select is_empty(
  $$ select p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and (p.pronargs > 0 or p.prosecdef)
        and p.oid::regprocedure::text not in ('nestly.profile_view(text)', 'nestly.delete_post(uuid)', 'nestly.delete_comment(uuid)',
          'nestly.has_permission(text)', 'nestly.reveal_post_author(uuid)', 'nestly.search_people(text,integer,integer)', 'nestly.is_blocked_pair(uuid)') $$,
  '[F1.1-b c18 layer 13 · F2.3b c15] every function in nestly that authenticated can execute takes no argument and is SECURITY INVOKER, except the approved profile_view(text) (one uuid per call, no status: file 53) and F3.0b''s delete_post(uuid) / delete_comment(uuid) (the caller''s own content, RLS decides), and the I4 invoker functions has_permission(text), reveal_post_author(uuid) and is_blocked_pair(uuid) (a block between the caller and that account, which the caller already reads: file 91)');

select * from finish();

rollback;
