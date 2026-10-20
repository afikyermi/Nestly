-- pgTAP, run by pg_prove as app_server (CI `db` job, I4: the recovery lock ladder; NFR-SEC-010, AC-113; Afik 20.10.2026).
-- Expected values come from the SRS and data-model.md approved exception (b): the ladder belongs to the account's handle, and the restricted
-- recovery role gains exactly one column-level write (the ladder count) and nothing else. The ladder arithmetic itself (3rd failure: 1 hour,
-- 6th and every later one: 24 hours, a success resets) is the server's (apps/server/tests/db/recovery-reset.db.test.ts).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F4.2-a c1 I4-rl fixture] session_user is app_server (this file must not run under another login)');

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
create function pg_temp.upd(p_handle text, p_set text, p_kind text default 'handle') returns text language sql as $f$
  select pg_temp.rec(p_handle, format($q$ with u as (update nestly.recovery_throttles set %s where subject_kind = %L returning 1) select 'OK:' || count(*) from u $q$, p_set, p_kind))
$f$;

-- ---- structure ---------------------------------------------------------------------------------------------------------------
select is((select format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || pg_get_expr(d.adbin, d.adrelid)
             from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
            where c.relname = 'recovery_throttles' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly') and a.attname = 'ladder_failures'),
  'smallint:true:0', '[I4-rl c1 NFR-SEC-010] recovery_throttles carries the ladder count: failures since the last success, starting at 0');
select is((select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_throttles' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
              and a.attnum > 0 and not a.attisdropped and a.attname ~ '(perman|releas)'),
  0::bigint, '[I4-rl c1 NFR-SEC-010] no permanent-lock flag and no release field: the ladder never locks for good');
select is((select count(*) from pg_class c where c.relnamespace = (select oid from pg_namespace where nspname = 'nestly') and c.relname ~ 'releas'),
  0::bigint, '[I4-rl c1] there is no release table (nothing for an Admin to release)');

-- ---- app_recovery's reach: exactly the earlier grants plus the ladder column ---------------------------------------------------
select is((select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_throttles' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
              and a.attnum > 0 and not a.attisdropped and has_column_privilege('app_recovery', c.oid, a.attnum, 'UPDATE')),
  'ladder_failures, limited_noted_until, locked_until, long_failures, long_window_started_at, short_failures, short_window_started_at',
  '[I4-rl c2 exception (b)] app_recovery updates the six earlier counter, lock and marker columns plus the ladder count, and no other column');
select is((select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_throttles' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
              and a.attnum > 0 and not a.attisdropped and has_column_privilege('app_recovery', c.oid, a.attnum, 'INSERT')),
  'subject_hash, subject_kind', '[I4-rl c2 exception (b)] app_recovery still inserts only the subject (never a ladder count)');
select ok(not has_table_privilege('app_recovery', 'nestly.recovery_throttles', 'DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  '[I4-rl c2] app_recovery cannot delete, truncate, reference or trigger on recovery_throttles');
select is((select string_agg(c.relname || ':' || p.priv, ', ' order by c.relname, p.priv)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
            where n.nspname = 'nestly' and c.relkind in ('r', 'p', 'v', 'm')
              and (has_table_privilege('app_recovery', c.oid, p.priv)
                   or (p.priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') and has_any_column_privilege('app_recovery', c.oid, p.priv)))),
  'recovery_answers:SELECT, recovery_answers:UPDATE, recovery_events:INSERT, recovery_throttles:INSERT, recovery_throttles:SELECT, recovery_throttles:UPDATE',
  '[I4-rl c2 exception (b)] app_recovery reaches nothing on any other table: the answers (read, release), the events (append), the throttles');
select is((select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a join pg_class c on c.oid = a.attrelid
            where c.relname = 'recovery_answers' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
              and a.attnum > 0 and not a.attisdropped and has_column_privilege('app_recovery', c.oid, a.attnum, 'UPDATE')),
  'email_handle, handle_claimed_at', '[I4-rl c2] its write on recovery_answers is unchanged (the handle release only)');
select is((select count(*) from pg_class c where c.relname in ('recovery_throttles', 'recovery_events') and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')
            and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[I4-rl c2] authenticated still holds nothing on recovery_throttles or recovery_events');

-- ---- behaviour under the grants ---------------------------------------------------------------------------------------------
select is(pg_temp.rec('aa', $q$ with i as (insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('aa', 32), 'hex')) returning 1) select 'OK:' || count(*) from i $q$),
  'OK:1', '[I4-rl fixture] app_recovery creates the declared handle''s row');
select is(pg_temp.rec('aa', $q$ with i as (insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('ip', decode(repeat('cc', 32), 'hex')) returning 1) select 'OK:' || count(*) from i $q$),
  'OK:1', '[I4-rl fixture] and the declared IP''s row');
select is(pg_temp.rec('aa', $q$ with i as (insert into nestly.recovery_throttles (subject_kind, subject_hash, ladder_failures) values ('handle', decode(repeat('ab', 32), 'hex'), 3) returning 1) select 'OK:' || count(*) from i $q$),
  'ERR:42501', '[I4-rl c2] an insert naming the ladder count is refused');

select is(pg_temp.upd('aa', $s$ ladder_failures = 3, locked_until = now() + interval '1 hour' $s$), 'OK:1',
  '[I4-rl c3 AC-113] app_recovery records the 3rd failure on the declared handle and its 1-hour lock');
select is(tests.fx_recovery_ladder(repeat('aa', 32)), '3/true', '[I4-rl c3 AC-113] the handle is locked with a count of 3');
select is(pg_temp.upd('aa', $s$ ladder_failures = 7, locked_until = now() + interval '24 hours' $s$), 'OK:1',
  '[I4-rl c3 AC-113] after the 24-hour lock a further failure locks again for 24 hours (no ceiling, no permanent step)');
select is(pg_temp.upd('aa', 'ladder_failures = 0'), 'OK:1', '[I4-rl c3 AC-113] a success resets the count');
select is(tests.fx_recovery_ladder(repeat('aa', 32)), '0/true', '[I4-rl c3] the count is back to 0 (the reset touches no lock)');

select is(pg_temp.upd('aa', $s$ subject_hash = decode(repeat('ab', 32), 'hex') $s$), 'ERR:42501', '[I4-rl c2] app_recovery cannot rewrite the subject hash');
select is(pg_temp.upd('aa', $s$ subject_kind = 'ip' $s$), 'ERR:42501', '[I4-rl c2] nor the subject kind');
select is(pg_temp.rec('aa', $q$ with d as (delete from nestly.recovery_throttles returning 1) select 'OK:' || count(*) from d $q$), 'ERR:42501',
  '[I4-rl c2] nor delete a row');
select is(pg_temp.upd('aa', 'ladder_failures = 1', 'ip'), 'ERR:23514', '[I4-rl c2] an IP row never carries the ladder (check constraint)');
select is(pg_temp.upd('aa', 'ladder_failures = -1'), 'ERR:23514', '[I4-rl c2] the count is never negative');
select is(pg_temp.upd('bb', 'ladder_failures = 5'), 'OK:0', '[I4-rl c2] another declared handle cannot touch a''s row');
select is(tests.fx_recovery_ladder(repeat('aa', 32)), '0/true', '[I4-rl c2] a''s ladder is unchanged by the refused writes');

-- ---- no new definer -------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname ~ '(ladder|releas)'),
  0::bigint, '[I4-rl c4] the ladder adds no function or trigger to the schema');

select * from finish();
rollback;
