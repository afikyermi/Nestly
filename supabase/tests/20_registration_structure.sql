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
        and c.relname not in ('recovery_answers', 'recovery_throttles', 'recovery_events', 'identity_link_checks')
        and a.attname ~* '(pass|pwd|hash|secret|token|salt|crypt|email|phone)' $$,
  '[F1.4-a c14 NFR-SEC-001 · F1.6, F2.0 scoped] no column of the five F1.1/F1.4 tables holds a password, hash, secret, token, email or phone (the recovery tables hold hashes by design: file 30; identity_link_checks: file 40)');

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
  $$ select c.relname || '.' || co.contype::text || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'journey_contexts' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('journey_contexts.p.journey_contexts_pkey'), ('journey_contexts.f.journey_contexts_user_id_fkey'),
            ('journey_contexts.c.journey_contexts_stage_check'), ('journey_contexts.c.journey_contexts_due_date_check'),
            ('journey_contexts.u.journey_contexts_user_id_stage_key') $$,
  '[F1.4-a c14] journey_contexts has exactly the approved constraints: pkey, owner FK, stage check, due-date check, one per stage');

select set_eq(
  $$ select c.relname || '.' || co.contype::text || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'children' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('children.p.children_pkey'), ('children.f.children_user_id_fkey'), ('children.c.children_slot_check'),
            ('children.c.children_name_check'), ('children.c.children_sex_check'), ('children.c.children_birth_date_check'),
            ('children.u.children_user_id_slot_key') $$,
  '[F1.4-a c14] children has exactly the approved constraints: pkey, owner FK, slot 1-10, name, sex, birth date, one child per slot');

select set_eq(
  $$ select c.relname || '.' || co.contype::text || '.' || co.conname
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
  30::bigint,
  '[F1.4-a c14 · F1.6-a · F2.0-a · F2.4a c12 · F2.4-c c20 c21 c22 · F3.0a c17 · F3.0-b c1] schema nestly holds exactly thirty tables, I4''s staff_roles, moderator_permissions, audit_log, report_reasons and user_enforcements, I6''s cycle_entries, status_guides and tracker_events, F3.0b''s comments, reactions, reaction_owners and reports and F3.0a''s algorithm_configurations, post_authors, post_hides and posts on top of fourteen: the five F1.1/F1.4 ones, the three recovery tables, identity_link_checks, F2.4a''s friendships and regular_names and F2.4c1''s security_limits, profile_open_counts and security_events (no table nobody listed)');

select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')),
  'algorithm_configurations, audit_log, children, comments, cycle_entries, friendships, identity_link_checks, journey_contexts, legal_consents, moderator_permissions, post_authors, post_hides, posts, profile_open_counts, reaction_owners, reactions, recovery_answers, recovery_events, recovery_throttles, regular_names, regular_profiles, report_reasons, reports, security_events, security_limits, staff_roles, status_guides, tracker_events, user_enforcements, users',
  '[F1.6-a · F2.0-a · F2.4a c12 · F2.4-c c22 · F3.0a c17 · F3.0-b c1 · I4] the thirty tables are exactly these names');

-- ---- policies: the exact list ---------------------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents') $$,
  $$ values ('users.users_select_own.r'), ('users.users_insert_own.a'),
            ('regular_profiles.regular_profiles_select_own.r'), ('regular_profiles.regular_profiles_insert_own.a'),
            ('regular_profiles.regular_profiles_update_own.w'),
            ('journey_contexts.journey_contexts_select_own.r'), ('journey_contexts.journey_contexts_insert_own.a'),
            ('journey_contexts.journey_contexts_update_own.w'), ('journey_contexts.journey_contexts_delete_own.d'),
            ('children.children_select_own.r'), ('children.children_insert_own.a'),
            ('children.children_update_own.w'), ('children.children_delete_own.d'),
            ('legal_consents.legal_consents_select_own.r'), ('legal_consents.legal_consents_insert_own.a'),
            ('users.users_select_profile_view.r'), ('regular_profiles.regular_profiles_select_profile_view.r'),
            ('children.children_select_profile_view.r'), ('journey_contexts.journey_contexts_select_profile_view.r'),
            ('users.users_select_staff.r'), ('users.users_update_staff.w'), ('users.users_update_own_expired_suspension.w') $$,
  '[F1.4-a c14 platform r14 · F1.6 scoped · F2.2a c9 · F2.2-b c18 · F2.3b c15] the policies on the five F1.1/F1.4 tables are exactly twenty-two (I4 adds users_select_staff, users_update_staff and users_update_own_expired_suspension): one SELECT and one INSERT per table plus regular_profiles_update_own (F2.1), children_update_own (F2.2a), journey_contexts_update_own (F2.2b1), the own-row deletes children_delete_own and journey_contexts_delete_own (F2.2b2, DR-1 A) and the four *_select_profile_view (F2.3b, TO app_owner: file 53), no other UPDATE, DELETE or ALL (the recovery policies: file 30; files 50, 51 and 54 assert the update and delete policies)');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and pol.polroles <> array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]
        and pol.polname not like '%\_select\_profile\_view' $$,
  '[F1.4-a c14 platform r4 · F1.6 scoped · F2.3b c15] every policy on the five F1.1/F1.4 tables is TO authenticated only (not PUBLIC, not anon, not app_recovery), except the four *_select_profile_view TO app_owner (file 53)');

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
    where n.nspname = 'nestly' and c.relkind = 'r' and c.relname <> 'identity_link_checks' and has_table_privilege('authenticated', c.oid, 'SELECT')),
  'algorithm_configurations, audit_log, children, cycle_entries, friendships, journey_contexts, legal_consents, moderator_permissions, post_authors, post_hides, reaction_owners, regular_names, regular_profiles, report_reasons, reports, staff_roles, status_guides, tracker_events, user_enforcements, users',
  '[F1.4-a c14 · F2.0 scoped · F2.4a c12 · F3.0a c1 · F3.0-b c1 c12 c14] authenticated holds table-level SELECT on the five tables and, from F2.4a, friendships and regular_names, from F3.0a algorithm_configurations, post_authors and post_hides, from F3.0b reaction_owners and reports, from I6 tracker_events, cycle_entries and status_guides; posts, comments and reactions carry column-level SELECT only (held_xact and liker_status never granted: files 70 and 73); identity_link_checks: file 40');

-- Amendment 1 (CRITIC a-1): INSERT is granted per COLUMN, never per table.
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'INSERT') $$,
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1] authenticated holds no table-level INSERT on any nestly table (only per-column INSERT)');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attnum)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'children.slot, children.name, children.sex, children.birth_date, journey_contexts.stage, journey_contexts.due_date, '
  || 'legal_consents.terms_version, legal_consents.privacy_version, legal_consents.has_declared_18_plus, '
  || 'regular_profiles.full_name, regular_profiles.gender, users.account_type, users.status',
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1] authenticated can INSERT exactly these 13 columns and no others');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped and a.attacl is not null
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')),
  17::bigint,
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1 · F1.6 scoped · F2.3-a c5 · I4] exactly 17 columns of the five F1.1/F1.4 tables carry a column-level ACL: the 13 INSERT columns, F2.3a''s three UPDATE-only settings and I4''s UPDATE of users.suspended_until (status already carried its INSERT entry)');

select is_empty(
  $$ select c.relname || '.' || a.attname || ':' || x.grantee::text || ':' || x.privilege_type
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid, lateral pg_catalog.aclexplode(a.attacl) x
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
        and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and not (x.privilege_type = 'INSERT' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated'))
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'regular_profiles' and a.attname in ('full_name', 'gender', 'profile_visibility',
                                                                      'is_empty_journey_sentence_shown', 'is_child_birthday_shared'))
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'children' and a.attname in ('name', 'sex', 'birth_date'))
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'journey_contexts' and a.attname = 'due_date')
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'users' and a.attname in ('status', 'suspended_until')) $$,
  '[F1.4-a c14 · CRITIC a-1 · F1.6 scoped · F2.2a c9 · F2.2-b c18] on the five F1.1/F1.4 tables every column-level ACL entry is INSERT to authenticated, or the UPDATE of regular_profiles full_name/gender (F2.1) and the three privacy settings (F2.3a), children name/sex/birth_date (F2.2a) and journey_contexts due_date (F2.2b1): no column-level SELECT or REFERENCES, no other grantee');

select is_empty(
  $$ select v.t || '.' || v.col
       from (values ('users', 'id'), ('users', 'created_at'),
                    ('regular_profiles', 'user_id'), ('regular_profiles', 'account_type'), ('regular_profiles', 'created_at'),
                    ('journey_contexts', 'id'), ('journey_contexts', 'user_id'), ('journey_contexts', 'created_at'),
                    ('children', 'id'), ('children', 'user_id'), ('children', 'created_at'),
                    ('legal_consents', 'id'), ('legal_consents', 'user_id'), ('legal_consents', 'accepted_at')) as v(t, col)
       join pg_catalog.pg_class c on c.relname = v.t
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'nestly'
       join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = v.col
      where has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') $$,
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1] none of the never-granted columns holds INSERT: identifiers, owners, clocks and regular_profiles.account_type always take their defaults');

select is(
  (select count(*) from (values ('users', 'id'), ('users', 'created_at'),
                    ('regular_profiles', 'user_id'), ('regular_profiles', 'account_type'), ('regular_profiles', 'created_at'),
                    ('journey_contexts', 'id'), ('journey_contexts', 'user_id'), ('journey_contexts', 'created_at'),
                    ('children', 'id'), ('children', 'user_id'), ('children', 'created_at'),
                    ('legal_consents', 'id'), ('legal_consents', 'user_id'), ('legal_consents', 'accepted_at')) as v(t, col)
     join pg_catalog.pg_class c on c.relname = v.t
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'nestly'
     join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = v.col),
  14::bigint,
  '[F1.4-a c14 · CRITIC a-1 control] all 14 never-granted columns exist (the previous test is not vacuous)');

select is_empty(
  $$ select c.relname || ':' || p.priv
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, p.priv)
        and not (c.relname in ('recovery_answers', 'children', 'journey_contexts', 'posts', 'post_hides', 'comments', 'reactions', 'tracker_events', 'cycle_entries', 'moderator_permissions') and p.priv = 'DELETE') $$,
  '[F1.4-a c14 criterion 14 amended · F2.0 scoped · F2.2-b c18] authenticated holds no table-level UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any nestly table; the DELETEs are the F2.0 D1 clear of recovery_answers (file 40) and the F2.2b2 own-row removal of children and journeys (DR-1 A, file 54) and F3.0a''s own-post and own-hide delete (3א, 7א: files 70-71) and F3.0b''s own-comment and own-like delete (3א, c12: files 73-74) and I6''s own tracker_events and cycle_entries delete (file 86)');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
        and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and not (c.relname = 'regular_profiles' and a.attname in ('full_name', 'gender', 'profile_visibility',
                                                                  'is_empty_journey_sentence_shown', 'is_child_birthday_shared'))
        and not (c.relname = 'children' and a.attname in ('name', 'sex', 'birth_date'))
        and not (c.relname = 'journey_contexts' and a.attname = 'due_date')
        and not (c.relname = 'users' and a.attname in ('status', 'suspended_until'))
        and (has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')
             or has_column_privilege('authenticated', c.oid, a.attnum, 'REFERENCES')) $$,
  '[F1.4-a c14 criterion 14 amended · F1.6 scoped · F2.2a c9 · F2.2-b c18] no column of the five F1.1/F1.4 tables can be UPDATEd or REFERENCEd by authenticated beyond regular_profiles full_name/gender (file 50), the three privacy settings (file 52, which also bars their REFERENCES), children name/sex/birth_date (file 51) and journey_contexts due_date (file 54); recovery_answers has its own column-level UPDATE: file 30');

select is_empty(
  $$ select c.relname || ':' || r.rolname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
      where n.nspname = 'nestly' and c.relkind in ('r', 'p')
        and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_any_column_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
        and not (r.rolname = 'app_jobs' and c.relname in ('posts', 'comments', 'reports')) $$,
  '[F1.4-a c14 platform r1, r7 · F3.0-b c14] anon, service_role, app_server and app_jobs hold no privilege on any nestly table, new ones included, but app_jobs on posts, comments and reports (the approved purge exception: exact grants in file 73)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace, lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.grantee = 0),
  0::bigint,
  '[F1.4-a c14 platform r7] PUBLIC holds no privilege on any nestly table');

select is_empty(
  $$ select r.rolname
       from pg_catalog.pg_roles r
      where r.rolbypassrls and not r.rolsuper
        and (r.rolname in ('authenticated', 'anon', 'app_server', 'app_jobs')
             or pg_has_role('authenticated', r.oid, 'member') or pg_has_role('anon', r.oid, 'member')
             or pg_has_role('app_server', r.oid, 'member') or pg_has_role('app_jobs', r.oid, 'member')) $$,
  '[F1.4-a c14 platform r1] no BYPASSRLS role is a runtime role or one a runtime role can become (Supabase''s built-in service_role has the attribute by design; it is unreachable: see the grants checks above)');

select is_empty(
  $$ select c.relname || ':service_role'
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p')
        and (has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_schema_privilege('service_role', n.oid, 'USAGE')) $$,
  '[F1.4-a c14 platform r1] service_role, which bypasses RLS by design, holds no schema or table privilege in nestly: it cannot reach the data');

-- ---- nothing else came with the migration --------------------------------------------------------------------------------
select is_empty(
  $$ select c.relname || '.' || t.tgname
       from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and not t.tgisinternal and t.tgname not in ('identity_link_checks_transition', 'friendships_transition', 'regular_profiles_name_insert', 'posts_insert_prepare', 'posts_insert_author', 'algorithm_configurations_guard', 'post_hides_insert_guard', 'posts_update_share_guard', 'posts_content_hold', 'comments_content_hold', 'comments_insert_prepare', 'reactions_insert_prepare', 'reactions_insert_owner', 'reports_insert_check', 'users_staff_mirror', 'audit_log_append_only', 'audit_log_no_truncate', 'moderator_permissions_audit', 'report_reasons_guard', 'report_reasons_audit', 'reports_insert_snapshot', 'reports_handle_guard', 'reports_audit', 'posts_moderation_audit', 'comments_moderation_audit', 'posts_reject_staff_edit', 'users_status_guard', 'user_enforcements_prepare', 'user_enforcements_apply', 'user_enforcements_audit', 'status_guides_prepare', 'status_guides_audit') $$,
  '[F1.4-a c14 · F2.0 scoped · F2.4a c12] no trigger on any nestly table but the F2.0 transition guard of identity_link_checks (file 40) and F2.4a''s friendships_transition and regular_profiles_name_insert (files 60-62) and F3.0a''s posts_insert_prepare, posts_insert_author, algorithm_configurations_guard and post_hides_insert_guard (files 70-72) and F3.0b''s content_hold on posts and comments, comments_insert_prepare, reactions_insert_prepare, reactions_insert_owner and reports_insert_check (files 73-76) and I4''s staff and moderation triggers (file 90): the limits are constraints, not code');

select set_eq(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  $$ select a from tests.approved_security_definer() as a $$,
  '[F1.4-a c14 platform r10 · F2.3b c15] the SECURITY DEFINER functions in schema nestly are exactly the approved list (F2.3b: profile_view(text))');

select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly'),
  'algorithm_configurations_guard, audit_log_append_only, audit_trigger, caller_account_type, caller_staff_role, child_age_months, comments_insert_prepare, content_hold, delete_comment, delete_post, friendships_transition, has_permission, identity_link_checks_transition, is_active_account, jwt_is_oauth, jwt_issued_at, jwt_session_id, post_hides_insert_guard, posts_insert_author, posts_insert_prepare, posts_update_share_guard, profile_view, profile_view_target, purge_held_content, reactions_insert_owner, reactions_insert_prepare, recovery_claimed_at, recovery_handle, recovery_ip, recovery_subject, regular_names_insert, reject_staff_edit, report_reasons_guard, reports_handle_guard, reports_insert_check, reports_insert_snapshot, reveal_post_author, session_guard, status_guides_prepare, user_enforcements_apply, user_enforcements_prepare, users_staff_mirror, users_status_guard',
  '[F1.4-a c14 · F1.6-a c3 c21 · F2.0-a · F2.3b c15 · F2.4a c12] nestly holds exactly forty-three functions (I6 adds status_guides_prepare) (I4 adds thirteen: has_permission, caller_staff_role, the staff and moderation triggers, reveal_post_author) (I3 rest PR-A adds posts_update_share_guard; professional-posting adds the RLS helper caller_account_type) (F3.0a c17: four trigger functions, no recording one; F3.0-b: delete_post, delete_comment, purge_held_content, content_hold and the four insert trigger functions, none records a view): is_active_account, the three recovery helpers, the five F2.0 helpers, the F2.0 transition trigger, F2.3b''s profile_view with its two helpers, and F2.4a''s friendships_transition and regular_names_insert (no other function came with a migration)');

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
