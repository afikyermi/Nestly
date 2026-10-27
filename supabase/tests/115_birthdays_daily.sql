-- pgTAP, run by pg_prove as app_server (CI `db` job): the child-birthday check runs at most once per Israel day per user, at the first
-- entry of the day; a Friendship accepted after that day's check makes the next call run (migration 20261027100000, Afik 27.10.2026).
-- Expected values come from the SRS: AC-192 (once per user per Israel day, at first entry; a Friend accepted later that day makes it run
-- again), with FR-NOTIF-003, BR-037, AC-046 unchanged on a call that runs.
-- Within one test transaction now() does not move, so "earlier today", "yesterday" and "after the check" are set by moving checked_at
-- and the Friendships' responded_at as postgres (tests.fx_dl_exec), relative to today's Israel midnight.
-- People: a, b (Regular), c = fr_c (Regular). Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F7.2-a c0 AC-192] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'c' then tests.fx_fr_id('fr_c') end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
-- rows inserted plus rows updated in nestly.birthday_checks so far in this transaction
create function pg_temp.writes() returns bigint language sql as $f$
  select pg_catalog.pg_stat_get_xact_tuples_inserted(c.oid) + pg_catalog.pg_stat_get_xact_tuples_updated(c.oid)
    from pg_catalog.pg_class c where c.relname = 'birthday_checks' and c.relnamespace = 'nestly'::regnamespace
$f$;
-- one call as p_who: '<number delivered>/<birthday_checks rows written by the call>'
create function pg_temp.deliver(p_who text) returns text language plpgsql as $f$
declare
  v_before bigint := pg_temp.writes();
  v text;
begin
  v := pg_temp.q(p_who, 'select nestly.deliver_child_birthdays()::text');
  return v || '/' || (pg_temp.writes() - v_before)::text;
end
$f$;
-- child_birthday notifications of p_who, as postgres (asked in a statement of its own: a stable read sees its statement's snapshot)
create function pg_temp.bdays(p_who text) returns bigint language sql as $f$
  select tests.fx_pr_count(format($q$ nestly.notifications n where n.recipient_id = %L and n.type = 'child_birthday' $q$, pg_temp.id(p_who)))
$f$;
create function pg_temp.born(p_years int, p_days int) returns date language sql as $f$
  select (((now() at time zone 'Asia/Jerusalem')::date - p_days) - make_interval(years => p_years))::date
$f$;
-- today's midnight in Israel, as an instant
create function pg_temp.midnight() returns timestamptz language sql as $f$
  select ((now() at time zone 'Asia/Jerusalem')::date::timestamp) at time zone 'Asia/Jerusalem'
$f$;
create function pg_temp.set_checked(p_who text, p_at timestamptz) returns text language sql as $f$
  select tests.fx_dl_exec(format('update nestly.birthday_checks set checked_at = %L where user_id = %L', p_at, pg_temp.id(p_who)))
$f$;
create function pg_temp.checked(p_who text) returns text language sql as $f$
  select coalesce(tests.fx_dl_text(format('select checked_at::text from nestly.birthday_checks where user_id = %L', pg_temp.id(p_who))), 'none')
$f$;
-- every Friendship of p_who answered two days ago (before any check of today)
create function pg_temp.age_friendships(p_who text) returns text language sql as $f$
  select tests.fx_dl_exec(format($q$ update nestly.friendships set requested_at = now() - interval '3 days', responded_at = now() - interval '2 days'
                                       where responded_at is not null and %L in (requester_id, addressee_id) $q$, pg_temp.id(p_who)))
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  perform tests.fx_nt_purge();
end
$f$;

-- =====================================================================================================================
-- 1. The table: RLS forced, no runtime role can reach it, only the function's three TO app_owner policies (rules 1, 8, 17)
-- =====================================================================================================================
select is(
  (select c.relrowsecurity::text || '/' || c.relforcerowsecurity::text || '/' || pg_catalog.pg_get_userbyid(c.relowner)
     from pg_catalog.pg_class c where c.relname = 'birthday_checks' and c.relnamespace = 'nestly'::regnamespace),
  'true/true/app_owner', '[AC-192 rule 8] nestly.birthday_checks exists, owned by app_owner, with RLS enabled and forced');
select is(
  (select string_agg(r.rolname || ':' || p.priv || ':' || has_table_privilege(r.rolname, t.oid, p.priv)::text, ', '
                     order by r.rolname, p.priv)
     from (values ('anon'), ('app_jobs'), ('app_server'), ('authenticated')) as r(rolname)
     cross join (values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')) as p(priv)
     cross join (select c.oid from pg_catalog.pg_class c where c.relname = 'birthday_checks' and c.relnamespace = 'nestly'::regnamespace) as t
    where has_table_privilege(r.rolname, t.oid, p.priv)),
  null, '[AC-192 rule 1] no runtime role (anon, authenticated, app_server, app_jobs) holds any privilege on it');
select is(
  (select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, ','), ', ' order by p.policyname)
     from pg_catalog.pg_policies p where p.schemaname = 'nestly' and p.tablename = 'birthday_checks'),
  'birthday_checks_insert_birthday:INSERT:app_owner, birthday_checks_select_birthday:SELECT:app_owner, birthday_checks_update_birthday:UPDATE:app_owner',
  '[AC-192 rule 17] exactly three policies, all TO app_owner (the definer): select, insert and update; no delete');
select is(
  (select bool_and(coalesce(p.qual, '') || coalesce(p.with_check, '') ~ 'auth\.uid\(\)' and coalesce(p.qual, '') || coalesce(p.with_check, '') ~ 'notify_scope\(\)')
     from pg_catalog.pg_policies p where p.schemaname = 'nestly' and p.tablename = 'birthday_checks'),
  true, '[AC-192 rule 17] each is limited to auth.uid()''s own row and to the birthday scope the function declares');
select is(
  (select c.confdeltype::text || ':' || (select n.nspname || '.' || x.relname from pg_catalog.pg_class x join pg_catalog.pg_namespace n on n.oid = x.relnamespace where x.oid = c.confrelid) from pg_catalog.pg_constraint c
    where c.conname = 'birthday_checks_user_id_fkey' and c.conrelid = (select x.oid from pg_catalog.pg_class x where x.relname = 'birthday_checks' and x.relnamespace = 'nestly'::regnamespace)),
  'c:nestly.users', '[AC-192 I9] the row cascades with the account (nestly.users), so the account deletion removes it');

select pg_temp.reset();
select is(pg_temp.q('a', 'select count(*)::text from nestly.birthday_checks'), 'ERR:42501', '[AC-192] deny all: a Regular user cannot read the table');
select is(pg_temp.dml('a', format($q$ insert into nestly.birthday_checks (user_id, checked_at) values (%L, now()) $q$, pg_temp.id('a'))),
  'ERR:42501', '[AC-192] nor write their own row (which would skip today''s check)');
select is(pg_temp.dml('a', 'delete from nestly.birthday_checks'), 'ERR:42501', '[AC-192] nor delete it (which would rerun the check)');
select is(tests.as_role('anon', null, 'select count(*)::text from nestly.birthday_checks'), 'ERR:42501', '[AC-192] nor can a Guest');

-- =====================================================================================================================
-- 2. The first call of the day records the check and delivers; later calls that day do nothing (AC-192)
-- =====================================================================================================================
select pg_temp.reset();
select pg_temp.dml('b', 'delete from nestly.children');
select is(pg_temp.dml('b', format($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Noa', 'girl', %L) $q$, pg_temp.born(3, 0))),
  'OK:1', '[AC-192] (setup) B''s child turns 3 today (Israel''s date)');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.age_friendships('a'), 'OK:1', '[AC-192] (setup) A and B have been Friends since two days ago');

select is(pg_temp.checked('a'), 'none', '[AC-192] (setup) A has never been checked');
select is(pg_temp.deliver('a'), '1/1', '[AC-192 AC-046] the first call of the day records the check and delivers the birthday');
select is(pg_temp.checked('a'), now()::text, '[AC-192] the check is recorded at the call''s instant');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] a second call the same day returns 0 and writes nothing');

select is(pg_temp.dml('b', format($q$ insert into nestly.children (slot, name, sex, birth_date) values (2, 'Dan', 'boy', %L) $q$, pg_temp.born(1, 0))),
  'OK:1', '[AC-192] (setup) a second child of B, turning 1 today, appears after the check');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] the same day it is not delivered: the call returns 0 and writes nothing');
select is(pg_temp.bdays('a'), 1::bigint, '[AC-192] (one birthday notification still)');

select is(pg_temp.set_checked('a', pg_temp.midnight() + interval '1 minute'), 'OK:1', '[AC-192] (setup) A''s check moved to 00:01 today, Israel time');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] a check earlier the same Israel day still counts: 0, nothing written');

-- =====================================================================================================================
-- 3. A check of a previous Israel day: the next call runs (AC-192)
-- =====================================================================================================================
select is(pg_temp.set_checked('a', pg_temp.midnight() - interval '1 day'), 'OK:1', '[AC-192] (setup) A''s check moved to yesterday');
select is(pg_temp.deliver('a'), '1/1',
  '[AC-192 AC-046] the first call of a new day runs: the second child''s birthday is delivered and the check recorded again');
select is(pg_temp.bdays('a'), 2::bigint, '[AC-192] (two birthday notifications now)');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] and the next call that day is gated again');

-- the Israel day, not the UTC day: 23:30 the previous evening in Israel runs; 00:30 today in Israel (still yesterday in UTC) does not
select is(pg_temp.set_checked('a', pg_temp.midnight() - interval '30 minutes'), 'OK:1', '[AC-192] (setup) A''s check moved to 23:30 yesterday, Israel time');
select is(pg_temp.deliver('a'), '0/1', '[AC-192] 23:30 the previous Israel evening is another day: the call runs (nothing new to deliver) and records the check');
select is(
  ((pg_temp.midnight() + interval '30 minutes') at time zone 'UTC')::date < ((pg_temp.midnight() + interval '30 minutes') at time zone 'Asia/Jerusalem')::date,
  true, '[AC-192] (setup) 00:30 Israel time falls on the previous UTC date');
select is(pg_temp.set_checked('a', pg_temp.midnight() + interval '30 minutes'), 'OK:1', '[AC-192] (setup) A''s check moved to 00:30 today, Israel time');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] the day is Israel''s: a check at 00:30 Israel time (yesterday in UTC) is today''s, so the call is gated');

-- =====================================================================================================================
-- 4. A Friend accepted after today's check: the next call runs, the same day (AC-192)
-- =====================================================================================================================
select pg_temp.dml('c', 'delete from nestly.children');
select is(pg_temp.dml('c', format($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Lia', 'girl', %L) $q$, pg_temp.born(5, 0))),
  'OK:1', '[AC-192] (setup) C''s child turns 5 today');
select is(pg_temp.set_checked('a', pg_temp.midnight()), 'OK:1', '[AC-192] (setup) A was checked at midnight today, Israel time');
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'pending');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] a Friend Request (pending) sent after the check does not reopen it');
select tests.fx_fr_purge(pg_temp.id('c'));
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'accepted');
select is(pg_temp.deliver('a'), '1/1',
  '[AC-192 AC-046] a Friendship accepted after the check: the next call runs and C''s child''s birthday appears the same day');
select is(pg_temp.bdays('a'), 3::bigint, '[AC-192] (three birthday notifications now)');
select is(pg_temp.checked('a'), now()::text, '[AC-192] and the check is recorded again');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] after that, calls that day are gated again');
select is(pg_temp.deliver('c'), '0/1',
  '[AC-192] the Friend''s own first call runs too (A has no child: nothing to deliver)');

-- the caller as requester works the same way
select is(pg_temp.age_friendships('a'), 'OK:2', '[AC-192] (setup) both of A''s Friendships answered two days ago');
select tests.fx_nt_purge();
select tests.fx_fr_purge(pg_temp.id('c'));
select is(pg_temp.deliver('a'), '2/1', '[AC-192] (setup, a cleared check) the first call of the day delivers B''s two');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.deliver('a'), '0/0', '[AC-192] a Friendship answered in the same instant as the check is not after it: gated');
select is(pg_temp.set_checked('a', pg_temp.midnight()), 'OK:1', '[AC-192] (setup) A was checked at midnight today');
select is(pg_temp.deliver('a'), '1/1',
  '[AC-192] the caller as requester of the newly accepted Friendship: the call runs and delivers C''s child''s birthday');
select is(pg_temp.bdays('a'), 3::bigint, '[AC-192] (B''s two and C''s one)');

-- =====================================================================================================================
-- 5. What does not count as an entry, and the first call when nothing is due
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.deliver('c'), '0/1', '[AC-192] a first call with no Friend still records the day''s check');
select is(pg_temp.deliver('c'), '0/0', '[AC-192] and the next call that day is gated');
select is(tests.as_role('anon', null, 'select nestly.deliver_child_birthdays()::text'), 'ERR:42501', '[AC-192] a Guest still cannot call it');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.deliver('b'), '0/0', '[AC-192] a caller who is not active returns before the check: nothing recorded');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.checked('b'), 'none', '[AC-192] (so B''s first call later that day still runs)');

select * from finish();
rollback;
