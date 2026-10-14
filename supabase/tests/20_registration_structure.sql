-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.4 part a).
-- Structure of the registration tables: spec criterion 14 (owner-only rows: RLS, policies, grants), rule 1 (nothing
-- bypasses RLS), and the shape criterion 10 and 14 depend on. Behaviour is in files 21-23.
-- Source of expected values: .work/register-account-create/schema.md and interface.md (the approved lists), not the
-- migration text.
-- Catalog lookups join pg_class / pg_namespace by name: app_server has no USAGE on schema nestly, so a regclass cast
-- would fail with permission denied.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.4-a c14] session_user is app_server (this file must not run under another login)');

-- ---- the three tables exist, with exactly the approved columns --------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r' and c.relname in ('journey_contexts', 'children', 'legal_consents')),
  3::bigint,
  '[F1.4-a c14] journey_contexts, children and legal_consents exist in schema nestly');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'journey_contexts' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'created_at:timestamp with time zone:nn, due_date:date:null, id:uuid:nn, stage:text:nn, user_id:uuid:nn',
  '[F1.4-a c14] journey_contexts has exactly the approved columns (due_date is the only nullable one)');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'children' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'birth_date:date:nn, created_at:timestamp with time zone:nn, id:uuid:nn, name:text:nn, sex:text:nn, slot:smallint:nn, user_id:uuid:nn',
  '[F1.4-a c14] children has exactly name, sex, birth_date and the mechanics (slot, ids, created_at): nothing else about a minor');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'legal_consents' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'accepted_at:timestamp with time zone:nn, has_declared_18_plus:boolean:nn, id:uuid:nn, privacy_version:text:nn, terms_version:text:nn, user_id:uuid:nn',
  '[F1.4-a c14] legal_consents has exactly the approved columns, all NOT NULL');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p', 'v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
        and a.attname ~* '(pass|pwd|hash|secret|token|salt|crypt|email|phone)' $$,
  '[F1.4-a c14 NFR-SEC-001] no column anywhere in nestly holds a password, hash, secret, token, email or phone');

-- ---- defaults: the owner and the clock come from the database (rules 12, 13; criterion 10 / 14) ------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents') and a.attname = 'user_id'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'auth\.uid\(\)'),
  'children, journey_contexts, legal_consents',
  '[F1.4-a c14 platform r12] user_id defaults to auth.uid() on all three tables: the owner is set by the database');

select is(
  (select count(*) from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents') and a.attname = 'id'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'gen_random_uuid\(\)'),
  3::bigint,
  '[F1.4-a c14 NFR-SEC-006] id defaults to gen_random_uuid() on all three tables (not a counter)');

select is(
  (select count(*) from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly'
      and ((c.relname = 'journey_contexts' and a.attname = 'created_at')
        or (c.relname = 'children' and a.attname = 'created_at')
        or (c.relname = 'legal_consents' and a.attname = 'accepted_at'))
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~* 'now\(\)|current_timestamp|transaction_timestamp'),
  3::bigint,
  '[F1.4-a c10 c14 BR-068] created_at (two tables) and accepted_at default to the database clock');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents')),
  'children.created_at, children.id, children.user_id, journey_contexts.created_at, journey_contexts.id, journey_contexts.user_id, legal_consents.accepted_at, legal_consents.id, legal_consents.user_id',
  '[F1.4-a c14] only id, user_id and the clock column have defaults: stage, slot, name, sex, birth_date, versions and the declaration must be sent');

-- ---- constraints and indexes by name ---------------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '.' || co.contype || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'journey_contexts' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('journey_contexts.p.journey_contexts_pkey'), ('journey_contexts.f.journey_contexts_user_id_fkey'),
            ('journey_contexts.c.journey_contexts_stage_check'), ('journey_contexts.c.journey_contexts_due_date_check'),
            ('journey_contexts.u.journey_contexts_user_id_stage_key') $$,
  '[F1.4-a c14] journey_contexts has exactly the approved constraints: pkey, owner FK, stage check, due-date check, one per stage');

select set_eq(
  $$ select c.relname || '.' || co.contype || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'children' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('children.p.children_pkey'), ('children.f.children_user_id_fkey'), ('children.c.children_slot_check'),
            ('children.c.children_name_check'), ('children.c.children_sex_check'), ('children.c.children_birth_date_check'),
            ('children.u.children_user_id_slot_key') $$,
  '[F1.4-a c14] children has exactly the approved constraints: pkey, owner FK, slot 1-10, name, sex, birth date, one child per slot');

select set_eq(
  $$ select c.relname || '.' || co.contype || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'legal_consents' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('legal_consents.p.legal_consents_pkey'), ('legal_consents.f.legal_consents_user_id_fkey'),
            ('legal_consents.c.legal_consents_terms_version_check'), ('legal_consents.c.legal_consents_privacy_version_check'),
            ('legal_consents.c.legal_consents_has_declared_18_plus_check'), ('legal_consents.u.legal_consents_user_id_versions_key') $$,
  '[F1.4-a c14] legal_consents has exactly the approved constraints: pkey, account FK, two version checks, declaration true, one row per version pair');

select set_eq(
  $$ select c.relname || '.' || i.relname || '.' || (ix.indpred is not null)::text || '.' || ix.indisunique::text
       from pg_catalog.pg_index ix join pg_catalog.pg_class c on c.oid = ix.indrelid join pg_catalog.pg_class i on i.oid = ix.indexrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents') $$,
  $$ values ('journey_contexts.journey_contexts_pkey.false.true'), ('journey_contexts.journey_contexts_user_id_stage_key.false.true'),
            ('journey_contexts.journey_contexts_user_id_planning_pregnant_key.true.true'),
            ('children.children_pkey.false.true'), ('children.children_user_id_slot_key.false.true'),
            ('legal_consents.legal_consents_pkey.false.true'), ('legal_consents.legal_consents_user_id_versions_key.false.true') $$,
  '[F1.4-a c14] the indexes are exactly the approved ones, all unique; the planning/pregnant one is partial');

select ok(
  (select pg_catalog.pg_get_indexdef(ix.indexrelid) ~* 'where' and pg_catalog.pg_get_indexdef(ix.indexrelid) ~ 'planning'
          and pg_catalog.pg_get_indexdef(ix.indexrelid) ~ 'pregnant' and pg_catalog.pg_get_indexdef(ix.indexrelid) !~ 'has_child'
     from pg_catalog.pg_index ix join pg_catalog.pg_class i on i.oid = ix.indexrelid
    where i.relname = 'journey_contexts_user_id_planning_pregnant_key'),
  '[F1.4-a c14 VAL-039] the partial unique index covers exactly the stages planning and pregnant');

-- ---- foreign keys: targets and actions -----------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '->' || fc.relname || ':' || co.confdeltype::text
       from pg_catalog.pg_constraint co
       join pg_catalog.pg_class c  on c.oid = co.conrelid  join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
       join pg_catalog.pg_class fc on fc.oid = co.confrelid
      where n.nspname = 'nestly' and co.contype = 'f' and c.relname in ('journey_contexts', 'children', 'legal_consents') $$,
  $$ values ('journey_contexts->regular_profiles:c'), ('children->regular_profiles:c'), ('legal_consents->users:r') $$,
  '[F1.4-a c14] journeys and children cascade from regular_profiles; a consent RESTRICTs deletion of its users row');

select is(
  (select count(*) from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and co.contype = 'f' and not co.convalidated),
  0::bigint,
  '[F1.4-a c14] every foreign key in nestly is validated');

-- ---- RLS on and forced, all five tables ---------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r'
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
      and c.relrowsecurity and c.relforcerowsecurity),
  5::bigint,
  '[F1.4-a c14 platform r8] RLS is enabled AND forced on all five nestly tables');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  '[F1.4-a c14 platform r8] no table in nestly lacks RLS or FORCE');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')),
  5::bigint,
  '[F1.4-a c14] schema nestly holds exactly five tables (no table nobody listed)');

-- ---- policies: the exact list ---------------------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' $$,
  $$ values ('users.users_select_own.r'), ('users.users_insert_own.a'),
            ('regular_profiles.regular_profiles_select_own.r'), ('regular_profiles.regular_profiles_insert_own.a'),
            ('journey_contexts.journey_contexts_select_own.r'), ('journey_contexts.journey_contexts_insert_own.a'),
            ('children.children_select_own.r'), ('children.children_insert_own.a'),
            ('legal_consents.legal_consents_select_own.r'), ('legal_consents.legal_consents_insert_own.a') $$,
  '[F1.4-a c14 platform r14] the policies in nestly are exactly ten: one SELECT and one INSERT per table, no UPDATE, DELETE or ALL');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly'
        and pol.polroles <> array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')] $$,
  '[F1.4-a c14 platform r4] every policy in nestly is TO authenticated only (not PUBLIC, not anon)');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and not pol.polpermissive $$,
  '[F1.4-a c14] every policy is permissive (no restrictive policy that hides an unreviewed branch)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents')
      and pol.polname like '%\_select\_own' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'auth\.uid\(\)'
      and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'is_active_account'),
  3::bigint,
  '[F1.4-a c14 rule 15] each new SELECT policy tests auth.uid() and is_active_account()');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents', 'regular_profiles')
      and pol.polname like '%\_insert\_own' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'auth\.uid\(\)'
      and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'is_active_account'),
  4::bigint,
  '[F1.4-a c14 rules 12, 15] the INSERT policies of the four dependent tables test auth.uid() and is_active_account()');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'auth\.uid\(\)'
      and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'regular' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'active'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'users' and pol.polname = 'users_insert_own'),
  '[F1.4-a c14 rule 14] users_insert_own pins the id to auth.uid() and the type and status to regular and active');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'accepted_at' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'now\(\)'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'legal_consents' and pol.polname = 'legal_consents_insert_own'),
  '[F1.4-a c14 BR-068] legal_consents_insert_own forces accepted_at to now() (the database clock)');

-- ---- grants ---------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, 'SELECT')),
  'children, journey_contexts, legal_consents, regular_profiles, users',
  '[F1.4-a c14] authenticated can SELECT all five tables');

select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, 'INSERT')),
  'children, journey_contexts, legal_consents, regular_profiles, users',
  '[F1.4-a c14] authenticated can INSERT into all five tables');

select is_empty(
  $$ select c.relname || ':' || p.priv
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, p.priv) $$,
  '[F1.4-a c14 criterion 14 amended] authenticated holds no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any nestly table: owners read, they do not edit (I2)');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped and a.attacl is not null $$,
  '[F1.4-a c14] no column-level grant exists on any nestly table (nothing narrower hides a column UPDATE)');

select is_empty(
  $$ select c.relname || ':' || r.rolname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
      where n.nspname = 'nestly' and c.relkind in ('r', 'p')
        and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_any_column_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) $$,
  '[F1.4-a c14 platform r1, r7] anon, service_role, app_server and app_jobs hold no privilege on any nestly table, new ones included');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace, lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.grantee = 0),
  0::bigint,
  '[F1.4-a c14 platform r7] PUBLIC holds no privilege on any nestly table');

select is_empty(
  $$ select c.relname || ':' || r.rolname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_roles r on r.rolbypassrls
      where n.nspname = 'nestly' and c.relkind = 'r' and r.rolname in ('authenticated', 'anon', 'app_server', 'app_jobs', 'service_role') $$,
  '[F1.4-a c14 platform r1] no runtime role has BYPASSRLS');

-- ---- nothing else came with the migration --------------------------------------------------------------------------------
select is_empty(
  $$ select c.relname || '.' || t.tgname
       from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and not t.tgisinternal $$,
  '[F1.4-a c14] no trigger on any nestly table (the limits are constraints, not code)');

select is_empty(
  $$ select p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  '[F1.4-a c14 platform r10] schema nestly holds no SECURITY DEFINER function');

select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly'),
  'is_active_account',
  '[F1.4-a c14] the migration added no function to nestly: is_active_account is still the only one');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('v', 'm', 'f', 'S') $$,
  '[F1.4-a c14 platform r9] schema nestly holds no view, materialized view, foreign table or sequence');

-- ---- fixtures are there, so "no row" results elsewhere are not vacuous ---------------------------------------------------
select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F1.4-a fixture] a: 1 user, 1 profile, 2 journeys, 2 children, 1 consent');
select is(tests.fx_counts(tests.fx_id('b')), '1/1/1/1/1', '[F1.4-a fixture] b: 1 user, 1 profile, 1 journey, 1 child, 1 consent');
select is(tests.fx_counts(tests.fx_id('c')), '0/0/0/0/0', '[F1.4-a fixture] c: nothing');

select * from finish();

rollback;
