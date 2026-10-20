-- pgTAP, run by pg_prove as app_server (CI `db` job, I4: the recovery lock ladder and its release by the Admin; NFR-SEC-010, FR-ADMIN-013,
-- AC-113, AC-126). Expected values come from the SRS (the ladder belongs to the account's handle; only the Admin releases; the release is
-- audited and gives no access), not from the migration text. The ladder arithmetic itself is the server's (tests/db/recovery-lock.db.test.ts).
-- People: a (Regular, saves answers under handle 'aa..'), b (Regular), m3 (Moderator holding all fourteen keys), d (the Admin).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F4.2-a c1 I4-rl fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b')
    when 'm3' then tests.fx_sf_id('sf_m3') when 'd' then tests.fx_fr_id('fr_d')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.release(p_by text, p_of text, p_reason text default 'asked by email') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.recovery_lock_releases (user_id, reason) values (%L, %L) $q$, pg_temp.id(p_of), p_reason))
$f$;
-- as app_recovery with a declared handle and IP (what the server does after SET LOCAL ROLE)
create function pg_temp.rec(p_handle text, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.recovery_handle', repeat(p_handle, 32), true);
  perform set_config('nestly.recovery_ip', repeat('cc', 32), true);
  set local role app_recovery;
  begin
    execute p_sql into v;
  exception when others then v := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('nestly.recovery_handle', '', true);
  perform set_config('nestly.recovery_ip', '', true);
  return v;
end
$f$;

-- a saves answers under handle 'aa..' (the signed-in write, as in file 31)
select is(pg_temp.dml('a', $q$ insert into nestly.recovery_answers (email_handle, handle_claimed_at, question_1, question_2, answer_hash_1, answer_salt_1,
    answer_hash_2, answer_salt_2, scrypt_log_n, scrypt_r, scrypt_p) values (decode(repeat('aa', 32), 'hex'), '2026-10-15 10:00:00+00', 'nickname', 'pet',
    decode(repeat('11', 32), 'hex'), decode(repeat('21', 16), 'hex'), decode(repeat('12', 32), 'hex'), decode(repeat('22', 16), 'hex'), 15, 8, 1) $q$),
  'OK:1', '[I4-rl fixture] a saved answers under handle aa');
select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW',
  'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);

-- ---- structure ---------------------------------------------------------------------------------------------------------
select is((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end, ', ' order by a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_throttles' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
              and a.attname in ('ladder_failures', 'ladder_started_at', 'is_locked_permanently')),
  'is_locked_permanently:boolean:nn, ladder_failures:smallint:nn, ladder_started_at:timestamp with time zone:null',
  '[I4-rl c1 NFR-SEC-010] recovery_throttles carries the ladder: the count since the last success or release, when it restarted, the permanent lock');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.relname = 'recovery_lock_releases'
            and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')), '[I4-rl c1] recovery_lock_releases has RLS enabled and forced');
select is((select string_agg(pl.polname || ':' || pl.polcmd::text || ':' || (select string_agg(r.rolname, '+') from pg_roles r where r.oid = any (pl.polroles)), ', ' order by pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid where c.relname = 'recovery_lock_releases'),
  'recovery_lock_releases_insert_admin:a:authenticated, recovery_lock_releases_select_admin:r:authenticated, recovery_lock_releases_select_recovery:r:app_recovery',
  '[I4-rl c1] the three policies: the key holder inserts and reads, app_recovery reads; no update, no delete');
select is((select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_lock_releases' and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'reason, user_id', '[I4-rl c1] authenticated inserts only the account and the reason: never released_by or the time');
select is((select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_lock_releases' and a.attnum > 0 and not a.attisdropped and has_column_privilege('app_recovery', c.oid, a.attnum, 'SELECT')),
  'released_at, user_id', '[I4-rl c1] app_recovery reads only whose and when: never who released or why');
select is((select count(*) from pg_class c where c.relname in ('recovery_throttles', 'recovery_events') and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
            and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[I4-rl c1] authenticated still holds nothing on recovery_throttles or recovery_events (the release is a row of its own)');
select is((select count(*) from tests.approved_security_definer() a where a = 'nestly.audit_trigger()'), 1::bigint,
  '[I4-rl c1 rule 18] audit_trigger() is still the one approved audit definer (no new definer)');

-- ---- the ladder columns belong to handles ------------------------------------------------------------------------------------
select is(pg_temp.rec('aa', $q$ with i as (insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('aa', 32), 'hex')) returning 1) select 'OK:' || count(*) from i $q$),
  'OK:1', '[I4-rl fixture] app_recovery creates the declared handle''s row');
select is(pg_temp.rec('aa', $q$ with i as (insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('ip', decode(repeat('cc', 32), 'hex')) returning 1) select 'OK:' || count(*) from i $q$),
  'OK:1', '[I4-rl fixture] and the declared IP''s row');
select is(pg_temp.rec('aa', $q$ with u as (update nestly.recovery_throttles set ladder_failures = 9, ladder_started_at = now() - interval '1 hour', is_locked_permanently = true, locked_until = 'infinity'
    where subject_kind = 'handle' returning 1) select 'OK:' || count(*) from u $q$),
  'OK:1', '[I4-rl c2 AC-113] app_recovery records the 9th failure on the declared handle: locked for good');
select is(pg_temp.rec('aa', $q$ with u as (update nestly.recovery_throttles set ladder_failures = 1 where subject_kind = 'ip' returning 1) select 'OK:' || count(*) from u $q$),
  'ERR:23514', '[I4-rl c2] an IP row never carries the ladder (check constraint)');
select is(pg_temp.rec('bb', $q$ with u as (update nestly.recovery_throttles set ladder_failures = 0 where subject_kind = 'handle' returning 1) select 'OK:' || count(*) from u $q$),
  'OK:0', '[I4-rl c2] another declared handle cannot touch a''s row');

select is(pg_temp.rec('aa', $q$ with u as (update nestly.recovery_throttles set ladder_failures = 0, is_locked_permanently = false, locked_until = null
    where subject_kind = 'handle' returning 1) select 'OK:' || count(*) from u $q$),
  'ERR:42501', '[I4-rl c2 FR-ADMIN-013] without a release nothing lifts the permanent lock (not even app_recovery)');
select is(pg_temp.rec('aa', $q$ with u as (update nestly.recovery_throttles set ladder_failures = 3 where subject_kind = 'handle' returning 1) select 'OK:' || count(*) from u $q$),
  'ERR:42501', '[I4-rl c2] nor lowers its count');

-- ---- who may release ------------------------------------------------------------------------------------------------------
select is(pg_temp.release('m3', 'a'), 'ERR:42501', '[I4-rl c3 AC-126] a Moderator holding all fourteen keys cannot release (RECOVERY_LOCK_RELEASE is the Admin''s)');
select is(pg_temp.release('b', 'a'), 'ERR:42501', '[I4-rl c3 AC-126] a Regular account cannot release');
select is(pg_temp.release('d', 'd'), 'ERR:42501', '[I4-rl c3] the Admin does not release its own lock');
select is(pg_temp.dml('d', format($q$ insert into nestly.recovery_lock_releases (user_id, released_by) values (%L, %L) $q$, pg_temp.id('a'), pg_temp.id('b'))),
  'ERR:42501', '[I4-rl c3] a release in another''s name is refused');
select is(tests.fx_sf_audit('recovery_lock_released'), 0::bigint, '[I4-rl c3] the refusals left no audit entry');
select is(pg_temp.release('d', 'a'), 'OK:1', '[I4-rl c4 FR-ADMIN-013 AC-126] the Admin releases a''s recovery lock');
select is(tests.fx_sf_audit('recovery_lock_released'), 1::bigint, '[I4-rl c4 AC-126] the release is an Audit Log entry');
select is((select a.target_kind || ':' || (a.target_id = pg_temp.id('a'))::text || ':' || a.permission_key || ':' || coalesce(a.reason, '-') || ':' || a.actor_role
             from tests.fx_audit_rows() a where a.action = 'recovery_lock_released'),
  'user:true:RECOVERY_LOCK_RELEASE:asked by email:admin', '[I4-rl c4] the entry names the account, the key, the reason and the Admin''s role');
select is(pg_temp.n('d', 'select count(*)::text from nestly.recovery_lock_releases'), '1', '[I4-rl c4] the Admin reads the release');
select is(pg_temp.n('m3', 'select count(*)::text from nestly.recovery_lock_releases'), '0', '[I4-rl c4] a Moderator reads none');
select is(pg_temp.n('a', 'select count(*)::text from nestly.recovery_lock_releases'), '0', '[I4-rl c4] the released account reads none');
select is(pg_temp.dml('d', 'update nestly.recovery_lock_releases set reason = null'), 'ERR:42501', '[I4-rl c4] a release is never changed');
select is(pg_temp.dml('d', 'delete from nestly.recovery_lock_releases'), 'ERR:42501', '[I4-rl c4] nor deleted');

-- ---- the release reaches the next attempt, and nothing else -------------------------------------------------------------------
select is(pg_temp.rec('aa', 'select count(*)::text from nestly.recovery_lock_releases'), '1', '[I4-rl c5 AC-126] the attempt on a''s handle sees a''s release');
select is(pg_temp.rec('bb', 'select count(*)::text from nestly.recovery_lock_releases'), '0', '[I4-rl c5] an attempt on another handle sees none');
select is(pg_temp.rec('aa', 'select (released_at > ladder_started_at)::text from nestly.recovery_lock_releases, nestly.recovery_throttles where subject_kind = ''handle'''),
  'true', '[I4-rl c5] the release is later than the ladder''s start: the next attempt restarts from zero');
select is(pg_temp.rec('aa', $q$ with u as (update nestly.recovery_throttles set ladder_failures = 0, ladder_started_at = now(), is_locked_permanently = false, locked_until = null,
    limited_noted_until = null where subject_kind = 'handle' returning 1) select 'OK:' || count(*) from u $q$),
  'OK:1', '[I4-rl c5 AC-126] app_recovery applies the release: count zero, no lock');
select is(tests.fx_recovery_answers_json(pg_temp.id('a')) <> '-', true, '[I4-rl c5 AC-126] the release changed nothing of the account''s answers (no access is given)');

-- ---- the status guide audit still works with the replaced audit_trigger() (I6's branch kept) ---------------------------------
select is(pg_temp.dml('d', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'מדריך', 'גוף', 'מקור') $$), 'OK:1',
  '[I4-rl c6] the Admin creates a status guide');
select is(tests.fx_sf_audit('guide_created'), 1::bigint, '[I4-rl c6 rule 18] and it is audited: the guide branch of audit_trigger() survived the release branch');

select * from finish();
rollback;
