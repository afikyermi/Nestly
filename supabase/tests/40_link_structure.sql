-- pgTAP, run by pg_prove as app_server (CI `db` job, F2.0 part a: account-takeover-close, S-01 / S-16, FR-AUTH-005, FR-AUTH-003).
-- Structure of nestly.identity_link_checks, its five helpers, its transition trigger, and the recovery_answers / recovery_events
-- additions: spec criteria c1 (verdict stored once), c3-c7 (state), c5 (single clear), c2/c10/c12 (audit), D1 (answers delete).
-- Behaviour of the policies and the trigger is in file 41.
-- Source of expected values: .work/account-takeover-close/spec.md and schema.md ("Change", "Authorization"), not the migration text.
-- Catalog lookups join pg_class / pg_namespace by name: app_server has no USAGE on schema nestly, so a regclass cast would fail.
-- Written without a database to run against (no Docker where this was authored): CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.0-a c12] session_user is app_server (this file must not run under another login)');

-- ---- the table: exactly the approved columns -----------------------------------------------------------------------------------
select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'checked_at:timestamp with time zone:nn, checked_session_id:uuid:nn, cleared_at:timestamp with time zone:null, clearing_session_id:uuid:null, '
  || 'password_set_at:timestamp with time zone:null, user_id:uuid:nn, verdict:text:nn',
  '[F2.0-a c1 c3 c7] identity_link_checks has exactly the approved columns and nothing that can hold a password, an answer, an email or a token');

select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'auth\.uid\(\)'
     from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c on c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and a.attname = 'user_id'),
  '[F2.0-a c12 platform r12] identity_link_checks.user_id defaults to auth.uid(): the subject is set by the database, never by a body');

select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~* 'now\(\)|current_timestamp|transaction_timestamp'
     from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c on c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and a.attname = 'checked_at'),
  '[F2.0-a c1] checked_at defaults to the database clock');

-- no foreign key to anything (c9: the user may have no users row; the anchor rule forbids a second FK to auth.users)
select is(
  (select count(*) from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and co.contype = 'f'),
  0::bigint,
  '[F2.0-a c9] identity_link_checks has no foreign key: an Auth user with no users row can have a verdict');

select is(
  (select count(*) from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and co.contype = 'p'
      and (select string_agg(a.attname, ',') from pg_catalog.pg_attribute a where a.attrelid = co.conrelid and a.attnum = any(co.conkey)) = 'user_id'),
  1::bigint,
  '[F2.0-a c1 c5] one row per Auth user: user_id is the primary key');

select ok(
  (select count(*) >= 3 from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and co.contype = 'c'),
  '[F2.0-a c3 c7] the table has its CHECKs (verdict values, unaffected rows carry no clear, cleared_at and clearing_session_id together, password only after a clear)');

-- ---- RLS on and forced, the policy set ------------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and c.relrowsecurity and c.relforcerowsecurity),
  1::bigint,
  '[F2.0-a c4 c12 platform r8] RLS is enabled AND forced on identity_link_checks');

select set_eq(
  $$ select pol.polcmd::text from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'identity_link_checks' $$,
  $$ values ('r'), ('a'), ('w') $$,
  '[F2.0-a c1 c5 platform r14] identity_link_checks has one SELECT, one INSERT and one UPDATE policy: no DELETE and no ALL policy');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks'
      and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')] and pol.polpermissive),
  3::bigint,
  '[F2.0-a c1 c12] all three policies are permissive and TO authenticated only (never PUBLIC, anon or app_recovery)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks'
      and coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)) ~ 'auth\.uid\(\)'),
  4::bigint,
  '[F2.0-a c12 · I4] each policy tests auth.uid(): the JWT subject only (three TO authenticated, and the owner-role read of the definer functions)');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'jwt_is_oauth' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'jwt_session_id'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and pol.polcmd = 'a'),
  '[F2.0-a c1] the INSERT policy requires an oauth session and checked_session_id = the caller''s session (a password session cannot pre-write "unaffected")');

-- ---- grants: exact ------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'checked_session_id, verdict',
  '[F2.0-a c1 c12] authenticated can INSERT exactly verdict and checked_session_id: not user_id, not a clear');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'cleared_at, password_set_at',
  '[F2.0-a c3 c5 c7] authenticated can UPDATE exactly cleared_at and password_set_at: never verdict, checked_* or user_id');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  7::bigint,
  '[F2.0-a c4 c6 c7] authenticated can SELECT all seven columns of its row (the server reads the guard state)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and has_table_privilege('authenticated', c.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  0::bigint,
  '[F2.0-a c5 platform r14] authenticated holds no DELETE, TRUNCATE, REFERENCES or TRIGGER on identity_link_checks');

select is_empty(
  $$ select r.rolname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs'), ('app_recovery')) as r(rolname)
      where n.nspname = 'nestly' and c.relname = 'identity_link_checks'
        and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_any_column_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) $$,
  '[F2.0-a c12 platform r1 r7] anon, service_role, app_server, app_jobs and app_recovery hold no privilege on identity_link_checks');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace, lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and a.grantee = 0),
  0::bigint,
  '[F2.0-a c12 platform r7] PUBLIC holds no privilege on identity_link_checks');

-- ---- the helpers ---------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname in ('jwt_session_id', 'jwt_issued_at', 'jwt_is_oauth', 'session_guard', 'recovery_subject')),
  'jwt_is_oauth, jwt_issued_at, jwt_session_id, recovery_subject, session_guard',
  '[F2.0-a c1 c4 c6] the five helpers exist');

select is(
  (select string_agg(p.proname || ':' || p.pronargs::text || ':' || p.prorettype::regtype::text || ':' || p.provolatile::text || ':' || p.prosecdef::text,
                     ', ' order by p.proname)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname in ('jwt_session_id', 'jwt_issued_at', 'jwt_is_oauth', 'session_guard', 'recovery_subject')),
  'jwt_is_oauth:0:boolean:s:false, jwt_issued_at:0:timestamp with time zone:s:false, jwt_session_id:0:uuid:s:false, recovery_subject:0:uuid:s:false, session_guard:0:text:s:false',
  '[F2.0-a c4 c6 platform r10] each helper takes no argument, has the approved return type, is STABLE and SECURITY INVOKER');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname in ('jwt_session_id', 'jwt_issued_at', 'jwt_is_oauth', 'session_guard', 'recovery_subject')
      and exists (select 1 from unnest(p.proconfig) as cfg where cfg like 'search_path=%')),
  5::bigint,
  '[F2.0-a platform r10] all five helpers have a fixed search_path');

select is(
  (select string_agg(p.proname || ':' || r.rolname, ', ' order by p.proname, r.rolname)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join (values ('app_recovery'), ('authenticated'), ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
    where n.nspname = 'nestly' and p.proname in ('jwt_session_id', 'jwt_issued_at', 'jwt_is_oauth', 'session_guard', 'recovery_subject')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  'jwt_is_oauth:authenticated, jwt_issued_at:authenticated, jwt_session_id:authenticated, recovery_subject:app_recovery, session_guard:authenticated',
  '[F2.0-a c4 c12] the four session helpers execute for authenticated only; recovery_subject() for app_recovery only (never anon or PUBLIC)');

-- ---- the transition trigger ------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(t.tgname || ':' || t.tgtype::text || ':' || p.prosecdef::text || ':' || l.lanname, ', ')
     from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_proc p on p.oid = t.tgfoid join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname = 'nestly' and c.relname = 'identity_link_checks' and not t.tgisinternal),
  'identity_link_checks_transition:19:false:plpgsql',
  '[F2.0-a c3 c5 c7] one trigger identity_link_checks_transition: BEFORE UPDATE, per row, plpgsql, SECURITY INVOKER');

-- ---- recovery_answers: the first DELETE (D1) -------------------------------------------------------------------------------------
select is(
  (select pol.polcmd::text || ':' || pol.polpermissive::text
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and pol.polname = 'recovery_answers_delete_clear'),
  'd:true',
  '[F2.0-a c1 c2 D1] policy recovery_answers_delete_clear exists, FOR DELETE, permissive');

select is(
  (select pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_answers_delete_clear'),
  true,
  '[F2.0-a c12 D1] recovery_answers_delete_clear is TO authenticated only');

select ok(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'auth\.uid\(\)' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'identity_link_checks'
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_answers_delete_clear'),
  '[F2.0-a c2 D1] the delete is the caller''s own row, and only while the caller''s own link-check row says so');

select is(
  (select has_table_privilege('authenticated', c.oid, 'DELETE') from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers'),
  true,
  '[F2.0-a c2 D1] authenticated holds DELETE on recovery_answers');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER')),
  0::bigint,
  '[F2.0-a c12] authenticated still holds no TRUNCATE, REFERENCES or TRIGGER on recovery_answers');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and has_table_privilege('app_recovery', c.oid, 'DELETE,TRUNCATE')),
  0::bigint,
  '[F2.0-a c2 D1] app_recovery still cannot DELETE or TRUNCATE answers: only the caller''s own session clears them');

-- ---- recovery_events: new kinds, subject policy, one takeover_cleared per user -----------------------------------------------------
select is(
  (select pol.polcmd::text || ':' || pol.polpermissive::text
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_events' and pol.polname = 'recovery_events_insert_subject'),
  'a:true',
  '[F2.0-a c2 c7 c11 c12] policy recovery_events_insert_subject exists, FOR INSERT, permissive');

select is(
  (select pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'app_recovery')]
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_events_insert_subject'),
  true,
  '[F2.0-a c12] recovery_events_insert_subject is TO app_recovery only');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'recovery_subject'
          and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'takeover_cleared'
          and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'password_set_forced'
          and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'first_password_set'
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_events_insert_subject'),
  '[F2.0-a c2 c7 c11 c12] the subject policy binds the user to recovery_subject() and names exactly the three subject-bound kinds');

select is(
  (select count(*) from pg_catalog.pg_index i join pg_catalog.pg_class ic on ic.oid = i.indexrelid join pg_catalog.pg_namespace n on n.oid = ic.relnamespace
    where n.nspname = 'nestly' and ic.relname = 'recovery_events_takeover_cleared_key' and i.indisunique
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) ~ 'takeover_cleared'),
  1::bigint,
  '[F2.0-a c5] recovery_events_takeover_cleared_key is a partial unique index on the kind takeover_cleared: one clear row per user, even under a race');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_events' and pol.polcmd in ('r', 'w', 'd')
      and not (pol.polname in ('recovery_events_select_jobs', 'recovery_events_delete_jobs')
               and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'app_jobs')])),
  0::bigint,
  '[F2.0-a c2 c12 · I9] recovery_events still has no SELECT, UPDATE or DELETE policy: the audit stays append-only, but for I9''s purge TO app_jobs of an account deleted 90 days ago (BR-073, file 110)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_events'
      and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),
  0::bigint,
  '[F2.0-a c2 c12] authenticated still holds no privilege of any kind on recovery_events');

-- the seven new kinds are in the kind CHECK (the CHECK text is the catalog's, so this asserts the promise, not the migration)
select is(
  (select count(*) from unnest(array['takeover_cleared', 'password_set_forced', 'first_password_set', 'password_changed',
                                     'password_change_failed', 'password_change_limited', 'password_change_auth_failed']) as k
    where (select pg_catalog.pg_get_constraintdef(co.oid) from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname = 'recovery_events' and co.conname = 'recovery_events_kind_check') like '%''' || k || '''%'),
  7::bigint,
  '[F2.0-a c2 c7 c10 c11] recovery_events_kind_check lists the seven new kinds');

select is(
  (select count(*) from unnest(array['answers_saved', 'answers_changed', 'change_failed', 'change_limited', 'reset_verified', 'reset_completed',
                                     'reset_failed', 'reset_limited', 'reset_admin_failed', 'reset_revoke_failed', 'reset_email_mismatch',
                                     'handle_released', 'handle_rekeyed']) as k
    where (select pg_catalog.pg_get_constraintdef(co.oid) from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname = 'recovery_events' and co.conname = 'recovery_events_kind_check') like '%''' || k || '''%'),
  13::bigint,
  '[F2.0-a c10 c12] the thirteen F1.6 kinds are still accepted (the CHECK was widened, not replaced)');

-- ---- no new SECURITY DEFINER ------------------------------------------------------------------------------------------------------
select is((select count(*) from tests.approved_security_definer() as a
            where a ~ '^nestly\.(jwt_session_id|jwt_issued_at|jwt_is_oauth|session_guard|recovery_subject|identity_link_checks_transition)\('),
  0::bigint,
  '[F2.0-a c12 platform r10] F2.0 adds no definer to the approved list: the guard and the clear are policies and a trigger, not definers');

select is((select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'nestly' and p.prosecdef
              and p.proname in ('jwt_session_id', 'jwt_issued_at', 'jwt_is_oauth', 'session_guard', 'recovery_subject',
                                'identity_link_checks_transition')), 0::bigint,
  '[F2.0-a c12 platform r10] no F2.0 function in schema nestly is SECURITY DEFINER');

select * from finish();

rollback;
