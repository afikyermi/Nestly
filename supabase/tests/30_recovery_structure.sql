-- pgTAP, run by pg_prove as app_server (CI `db` job, F1.6 part a/b: password recovery, FR-AUTH-003).
-- Structure of the three recovery tables, the role app_recovery and the three helpers: spec criteria 3 (no runtime role reads
-- hashes except app_recovery for its handle), 5 (own rows only), 13 (audit: append-only, no access for authenticated/anon),
-- and the structural side of 12. Behaviour of the policies is in file 31.
-- Source of expected values: .work/password-recovery/spec.md (+ Amendments 1 and 2), schema.md and interface.md "Database", not the
-- migration text.
-- Catalog lookups join pg_class / pg_namespace by name: app_server has no USAGE on schema nestly, so a regclass cast would fail.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.6 c3] session_user is app_server (this file must not run under another login)');

-- ---- the tables exist with exactly the approved columns ------------------------------------------------------------------
select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'answer_hash_1:bytea:nn, answer_hash_2:bytea:nn, answer_salt_1:bytea:nn, answer_salt_2:bytea:nn, created_at:timestamp with time zone:nn, '
  || 'email_handle:bytea:null, handle_claimed_at:timestamp with time zone:null, question_1:text:nn, question_2:text:nn, scrypt_log_n:smallint:nn, scrypt_p:smallint:nn, scrypt_r:smallint:nn, user_id:uuid:nn',
  '[F1.6 c3 c8 c21] recovery_answers has exactly the approved columns: two hashes, two salts, the pair and scrypt parameters (NOT NULL), the handle and its claim time (both nullable: NULL is released)');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_throttles' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'limited_noted_until:timestamp with time zone:null, locked_until:timestamp with time zone:null, long_failures:smallint:nn, long_window_started_at:timestamp with time zone:null, '
  || 'short_failures:smallint:nn, short_window_started_at:timestamp with time zone:null, subject_hash:bytea:nn, subject_kind:text:nn',
  '[F1.6 c12 c13] recovery_throttles has exactly the approved columns: keyed by kind and hash, two windows, one lock, and the marker of the limited event written for that lock');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_events' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'handle_hash:bytea:nn, id:uuid:nn, ip_hash:bytea:nn, kind:text:nn, occurred_at:timestamp with time zone:nn, user_id:uuid:null',
  '[F1.6 c13] recovery_events has exactly the approved columns and nothing that can hold an answer, a password, an email or a raw IP');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'recovery_events' and a.attnum > 0 and not a.attisdropped
        and a.attname ~* '(answer|pass|pwd|email|token|secret|ip_address|address|salt)' $$,
  '[F1.6 c13 NFR-SEC-001] no column of recovery_events is named like an answer, password, email, token, secret, address or salt');

-- ---- defaults: owner, identifiers and clocks come from the database --------------------------------------------------------
select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'auth\.uid\(\)'
     from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c on c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and a.attname = 'user_id'),
  '[F1.6 c5 platform r12] recovery_answers.user_id defaults to auth.uid(): the owner is set by the database, never by the body');

select ok(
  (select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'gen_random_uuid\(\)'
     from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c on c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_events' and a.attname = 'id'),
  '[F1.6 c13 NFR-SEC-006] recovery_events.id defaults to gen_random_uuid()');

select is(
  (select count(*) from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c on c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly'
      and ((c.relname = 'recovery_answers' and a.attname = 'created_at') or (c.relname = 'recovery_events' and a.attname = 'occurred_at'))
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~* 'now\(\)|current_timestamp|transaction_timestamp'),
  2::bigint,
  '[F1.6 c13] created_at and occurred_at default to the database clock');

-- ---- constraints by name --------------------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and co.conname in (
      'recovery_answers_pkey', 'recovery_answers_email_handle_key', 'recovery_answers_question_order_check',
      'recovery_answers_salts_differ_check', 'recovery_answers_scrypt_log_n_check', 'recovery_answers_handle_claim_check', 'recovery_events_kind_check',
      'recovery_events_user_id_check', 'recovery_throttles_long_window_check', 'recovery_throttles_long_failures_check',
      'recovery_answers_user_id_fkey', 'recovery_events_user_id_fkey')),
  12::bigint,
  '[F1.6 c3 c8 c13 c21] the named constraints exist: pkey, handle uniqueness, handle and claim time null together, pair order, salts differ, scrypt N, event kind and user checks, throttle checks, two foreign keys');

select is(
  (select string_agg(c.relname || '->' || fc.relname || ':' || co.confdeltype::text, ', ' order by c.relname)
     from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_class fc on fc.oid = co.confrelid
    where n.nspname = 'nestly' and co.contype = 'f' and c.relname in ('recovery_answers', 'recovery_throttles', 'recovery_events')),
  'recovery_answers->users:c, recovery_events->users:r',
  '[F1.6 c13] answers die with the account (CASCADE); the audit does not (RESTRICT); throttles, keyed by hashes, have no foreign key');

select is(
  (select pg_catalog.pg_get_expr(i.indpred, i.indrelid) from pg_catalog.pg_index i join pg_catalog.pg_class ic on ic.oid = i.indexrelid
    where ic.relname = 'recovery_events_user_id_idx'),
  '(user_id IS NOT NULL)',
  '[F1.6 c13] recovery_events_user_id_idx is the partial index on user_id where it is not null');

-- ---- RLS on and forced ----------------------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('recovery_answers', 'recovery_throttles', 'recovery_events')
      and c.relrowsecurity and c.relforcerowsecurity),
  3::bigint,
  '[F1.6 c3 c5 c13 platform r8] RLS is enabled AND forced on all three recovery tables');

-- ---- policies: the exact list, roles, permissive --------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('recovery_answers', 'recovery_throttles', 'recovery_events') $$,
  $$ values ('recovery_answers.recovery_answers_select_own.r'), ('recovery_answers.recovery_answers_insert_own.a'),
            ('recovery_answers.recovery_answers_update_own.w'), ('recovery_answers.recovery_answers_select_recovery.r'),
            ('recovery_answers.recovery_answers_release_recovery.w'),
            ('recovery_throttles.recovery_throttles_select_recovery.r'), ('recovery_throttles.recovery_throttles_insert_recovery.a'),
            ('recovery_throttles.recovery_throttles_update_recovery.w'), ('recovery_events.recovery_events_insert_recovery.a') $$,
  '[F1.6 c3 c5 c13 platform r14] the recovery policies are exactly the nine approved ones: no DELETE or ALL policy, no policy for anon, no SELECT or UPDATE policy on the audit');

select is(
  (select string_agg(c.relname || '.' || pol.polname, ', ' order by c.relname, pol.polname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname like 'recovery\_%'
      and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]),
  'recovery_answers.recovery_answers_insert_own, recovery_answers.recovery_answers_select_own, recovery_answers.recovery_answers_update_own',
  '[F1.6 c5] the three own-row policies are TO authenticated only');

select is(
  (select string_agg(c.relname || '.' || pol.polname, ', ' order by c.relname, pol.polname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname like 'recovery\_%'
      and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'app_recovery')]),
  'recovery_answers.recovery_answers_release_recovery, recovery_answers.recovery_answers_select_recovery, recovery_events.recovery_events_insert_recovery, '
  || 'recovery_throttles.recovery_throttles_insert_recovery, recovery_throttles.recovery_throttles_select_recovery, recovery_throttles.recovery_throttles_update_recovery',
  '[F1.6 c3 c13 c21] the six recovery policies are TO app_recovery only (never PUBLIC, never anon)');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname like 'recovery\_%' and not pol.polpermissive $$,
  '[F1.6] every recovery policy is permissive');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and pol.polname like '%\_own'
      and coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)) ~ 'auth\.uid\(\)'
      and coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)) ~ 'is_active_account'),
  3::bigint,
  '[F1.6 c5 rule 15] each own-row policy tests auth.uid() and is_active_account()');

select ok(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'recovery_handle' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'email_handle'
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_answers_select_recovery'),
  '[F1.6 c3] recovery_answers_select_recovery matches email_handle against the declared handle');

-- The release policy: only the declared handle, only under an OLDER claim, and only to NULL.
select ok(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'recovery_handle' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'recovery_claimed_at'
          and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'handle_claimed_at <'
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_answers_release_recovery'),
  '[F1.6 c21] recovery_answers_release_recovery matches the declared handle and a claim older than the declared one');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'email_handle IS NULL' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'handle_claimed_at IS NULL'
     from pg_catalog.pg_policy pol where pol.polname = 'recovery_answers_release_recovery'),
  '[F1.6 c21] recovery_answers_release_recovery can only write NULL into both: a handle can be released, never set, by app_recovery');

-- ---- authenticated: column-level grants, never the hashes -------------------------------------------------------------------
select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'created_at, email_handle, handle_claimed_at, user_id',
  '[F1.6 c3 DR-G2] authenticated can SELECT exactly user_id, email_handle, handle_claimed_at and created_at of recovery_answers: never a hash, a salt, a question or a parameter');

select is(
  (select has_table_privilege('authenticated', c.oid, 'SELECT') from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers'),
  false,
  '[F1.6 c3] authenticated has no table-level SELECT on recovery_answers (the column list above is the whole grant)');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'answer_hash_1, answer_hash_2, answer_salt_1, answer_salt_2, email_handle, handle_claimed_at, question_1, question_2, scrypt_log_n, scrypt_p, scrypt_r',
  '[F1.6 c1 c5 c21] authenticated can INSERT exactly the eleven approved columns: not user_id, not created_at');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'recovery_answers' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'answer_hash_1, answer_hash_2, answer_salt_1, answer_salt_2, email_handle, handle_claimed_at, question_1, question_2, scrypt_log_n, scrypt_p, scrypt_r',
  '[F1.6 c4 c8 c23] authenticated can UPDATE the same eleven columns: the handle moves only with its claim time, own row only (the policy), never user_id or created_at');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'recovery_answers'
      and (has_table_privilege('authenticated', c.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER,INSERT,UPDATE')
           or has_any_column_privilege('authenticated', c.oid, 'REFERENCES'))),
  0::bigint,
  '[F1.6 c4] authenticated holds no DELETE, TRUNCATE, REFERENCES or TRIGGER on recovery_answers and no table-level INSERT or UPDATE');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('recovery_throttles', 'recovery_events')
      and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),
  0::bigint,
  '[F1.6 c13 platform r18] authenticated holds no privilege of any kind on recovery_throttles or recovery_events: it never writes or reads the audit');

-- ---- app_recovery ---------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r' and has_table_privilege('app_recovery', c.oid, 'SELECT')),
  'recovery_answers, recovery_throttles',
  '[F1.6 c3 c13] app_recovery can SELECT recovery_answers and recovery_throttles and no other table, the audit included');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('app_recovery', c.oid, a.attnum, 'INSERT')),
  'recovery_events.handle_hash, recovery_events.ip_hash, recovery_events.kind, recovery_events.user_id, '
  || 'recovery_throttles.subject_hash, recovery_throttles.subject_kind',
  '[F1.6 c12 c13] app_recovery can INSERT exactly: a throttle row (kind, hash) and an audit row (kind, user, handle hash, ip hash)');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('app_recovery', c.oid, a.attnum, 'UPDATE')),
  'recovery_answers.email_handle, recovery_answers.handle_claimed_at, recovery_throttles.limited_noted_until, recovery_throttles.locked_until, '
  || 'recovery_throttles.long_failures, recovery_throttles.long_window_started_at, recovery_throttles.short_failures, recovery_throttles.short_window_started_at',
  '[F1.6 c12 c13 c21] app_recovery can UPDATE exactly: the handle and its claim time of an answers row (the release policy limits it to NULL), and the six counter, lock and marker columns of the throttles: no hash, no audit row');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind = 'r' and c.relname like 'recovery\_%'
        and (has_table_privilege('app_recovery', c.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER')) $$,
  '[F1.6 c13] app_recovery cannot DELETE, TRUNCATE or alter anything: the audit is append-only for every runtime role');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relname = 'recovery_events' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('app_recovery', c.oid, a.attnum, 'SELECT,UPDATE')),
  0::bigint,
  '[F1.6 c13] app_recovery has no SELECT and no UPDATE on any column of recovery_events (no RETURNING either)');

select is(has_schema_privilege('app_recovery', 'nestly', 'USAGE'), true, '[F1.6] app_recovery has USAGE on schema nestly');
select is(has_schema_privilege('app_recovery', 'nestly', 'CREATE'), false, '[F1.6] app_recovery cannot CREATE in schema nestly');

-- ---- nobody else holds anything on the three tables ----------------------------------------------------------------------
select is_empty(
  $$ select c.relname || ':' || r.rolname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
      where n.nspname = 'nestly' and c.relname in ('recovery_answers', 'recovery_throttles', 'recovery_events')
        and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_any_column_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) $$,
  '[F1.6 c3 c13 platform r1, r7] anon, service_role, app_server and app_jobs hold no privilege on any recovery table (app_server only reaches them after SET ROLE)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace, lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'nestly' and c.relname like 'recovery\_%' and a.grantee = 0),
  0::bigint,
  '[F1.6 platform r7] PUBLIC holds no privilege on any recovery table');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid, lateral pg_catalog.aclexplode(a.attacl) x
      where n.nspname = 'nestly' and c.relname like 'recovery\_%' and a.attnum > 0 and not a.attisdropped and x.grantee = 0 $$,
  '[F1.6 platform r7] PUBLIC holds no column-level privilege on any recovery table');

-- ---- the role --------------------------------------------------------------------------------------------------------------
select is(
  (select r.rolcanlogin::text || '/' || r.rolinherit::text || '/' || r.rolsuper::text || '/' || r.rolbypassrls::text || '/'
          || r.rolcreatedb::text || '/' || r.rolcreaterole::text || '/' || r.rolreplication::text
     from pg_catalog.pg_roles r where r.rolname = 'app_recovery'),
  'false/false/false/false/false/false/false',
  '[F1.6 DR-G1] app_recovery: NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION');

select is(
  (select count(*) from pg_catalog.pg_auth_members m where m.member = (select oid from pg_catalog.pg_roles where rolname = 'app_recovery')),
  0::bigint,
  '[F1.6 DR-G1] app_recovery is a member of no role');

select is(
  (select string_agg(mr.rolname || ':inherit=' || m.inherit_option::text || ':set=' || m.set_option::text, ', ' order by mr.rolname)
     from pg_catalog.pg_auth_members m join pg_catalog.pg_roles mr on mr.oid = m.member
    where m.roleid = (select oid from pg_catalog.pg_roles where rolname = 'app_recovery') and mr.rolname <> 'postgres'),
  'app_server:inherit=false:set=true',
  '[F1.6 DR-G1] apart from postgres (the creator: PostgreSQL gives it ADMIN OPTION only, bootstrap check 01-roles-check.sql), only app_server holds app_recovery, WITH INHERIT FALSE and SET TRUE');

select is(
  (select count(*) from pg_catalog.pg_auth_members m join pg_catalog.pg_roles mr on mr.oid = m.member
    where m.roleid = (select oid from pg_catalog.pg_roles where rolname = 'app_recovery') and mr.rolname = 'postgres'
      and (m.set_option or m.inherit_option)),
  0::bigint,
  '[F1.6 DR-G1] postgres cannot act as app_recovery either (no SET, no INHERIT: administration only)');

select is(
  (select count(*) from pg_catalog.pg_class c where c.relowner = (select oid from pg_catalog.pg_roles where rolname = 'app_recovery')),
  0::bigint,
  '[F1.6 DR-G1] app_recovery owns nothing');

select is(
  (select current_setting('is_superuser')), 'off', '[F1.6] the suite itself is not a superuser (control for the checks above)');

-- ---- the two helpers ---------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname like 'recovery\_%'),
  'recovery_claimed_at, recovery_handle, recovery_ip',
  '[F1.6 c3 c21] the helpers recovery_handle(), recovery_ip() and recovery_claimed_at() exist');

select is(
  (select string_agg(p.proname || ':' || p.pronargs::text || ':' || p.prorettype::regtype::text || ':' || p.provolatile::text || ':' || p.prosecdef::text,
                     ', ' order by p.proname)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname like 'recovery\_%'),
  'recovery_claimed_at:0:timestamp with time zone:s:false, recovery_handle:0:bytea:s:false, recovery_ip:0:bytea:s:false',
  '[F1.6 c3 platform r10] each helper takes no argument, returns bytea (the claim time: timestamptz), is STABLE and SECURITY INVOKER');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname like 'recovery\_%'
      and exists (select 1 from unnest(p.proconfig) as cfg where cfg like 'search_path=%')),
  3::bigint,
  '[F1.6 platform r10] all three helpers have a fixed search_path');

select is(
  (select string_agg(p.proname || ':' || r.rolname, ', ' order by p.proname, r.rolname)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join (values ('app_recovery'), ('authenticated'), ('anon'), ('service_role'), ('app_server'), ('app_jobs')) as r(rolname)
    where n.nspname = 'nestly' and p.proname like 'recovery\_%' and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  'recovery_claimed_at:app_recovery, recovery_handle:app_recovery, recovery_ip:app_recovery',
  '[F1.6 c3 c5] only app_recovery can execute the helpers: authenticated, anon, app_server, app_jobs and PUBLIC cannot');

select is((select count(*) from tests.approved_security_definer()), 0::bigint,
  '[F1.6 platform r10, DR-G1] the approved SECURITY DEFINER list is still empty: the recovery flow is a role, not a definer');

-- ---- fixtures are there, so "no row" results elsewhere are not vacuous ------------------------------------------------------
select is(tests.fx_user(tests.fx_id('a')), 'regular/active', '[F1.6 fixture] account a exists, regular and active');
select is(tests.fx_user(tests.fx_id('b')), 'regular/active', '[F1.6 fixture] account b exists, regular and active');

select * from finish();

rollback;
