-- pgTAP, run by pg_prove as app_server (CI `db` job): deliver_child_birthdays() returns before writing its scope row when the caller has
-- no Friend (migration 20261026100000, plan ח3, decisions-in-force.md §21.6 / §19.1).
-- Expected values come from the SRS, not the migration text: FR-NOTIF-003, BR-037, AC-046 (one child_birthday per birthday of an accepted,
-- active Friend's child in the last seven days, only with the parent's permission) are unchanged; only the work done without a Friend is.
-- "No scope row written" is observed through the transaction's own insert counter of nestly.trend_scopes (the row is deleted again inside
-- the call, so a count of rows cannot tell).
-- People: a, b (Regular), c = fr_c (Regular, no Friend). Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F7.2-a c0 h3] session_user is app_server (this file must not run under another login)');

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
-- inserts into nestly.trend_scopes so far in this transaction
create function pg_temp.scopes() returns bigint language sql as $f$
  select pg_catalog.pg_stat_get_xact_tuples_inserted((select c.oid from pg_catalog.pg_class c where c.relname = 'trend_scopes' and c.relnamespace = (select n.oid from pg_catalog.pg_namespace n where n.nspname = 'nestly')))
$f$;
-- one delivery as p_who: '<number written>/<scope rows written by the call>', or 'ERR:<sqlstate>/...'
create function pg_temp.deliver(p_who text) returns text language plpgsql as $f$
declare
  v_before bigint := pg_temp.scopes();
  v text;
begin
  v := pg_temp.q(p_who, 'select nestly.deliver_child_birthdays()::text');
  return v || '/' || (pg_temp.scopes() - v_before)::text;
end
$f$;
create function pg_temp.born(p_years int, p_days int) returns date language sql as $f$
  select (((now() at time zone 'Asia/Jerusalem')::date - p_days) - make_interval(years => p_years))::date
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  perform tests.fx_nt_purge();
end
$f$;

-- =====================================================================================================================
-- 1. The definer's surface is unchanged (rule 4, rule 10, rule 17)
-- =====================================================================================================================
select is(
  (select p.prosecdef::text || '/' || pg_catalog.pg_get_userbyid(p.proowner) || '/' || coalesce(array_to_string(p.proconfig, ','), '-')
     from pg_catalog.pg_proc p where p.proname = 'deliver_child_birthdays' and p.pronamespace = 'nestly'::regnamespace),
  'true/app_owner/search_path=""', '[h3 rule 10 rule 17] still a SECURITY DEFINER owned by app_owner with an empty, fixed search_path');
select is(
  (select string_agg(r.rolname || ':' || has_function_privilege(r.rolname, p.oid, 'EXECUTE')::text, ', ' order by r.rolname)
     from (values ('anon'), ('app_jobs'), ('app_server'), ('authenticated')) as r(rolname)
     cross join pg_catalog.pg_proc p where p.proname = 'deliver_child_birthdays' and p.pronamespace = 'nestly'::regnamespace),
  'anon:false, app_jobs:false, app_server:false, authenticated:true', '[h3 rule 4] EXECUTE for authenticated only, as before');
select is(
  (select exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee = 0) from pg_catalog.pg_proc p
    where p.proname = 'deliver_child_birthdays' and p.pronamespace = 'nestly'::regnamespace),
  false, '[h3 rule 4] no EXECUTE for PUBLIC');
select is(
  (select pg_catalog.pg_get_function_arguments(p.oid) || '->' || pg_catalog.pg_get_function_result(p.oid)
     from pg_catalog.pg_proc p where p.proname = 'deliver_child_birthdays' and p.pronamespace = 'nestly'::regnamespace),
  '->integer', '[h3 §19.1] no argument, and only a number leaves it');
select is(tests.as_role('anon', null, 'select nestly.deliver_child_birthdays()::text'), 'ERR:42501', '[h3] a Guest still cannot call it');

-- =====================================================================================================================
-- 2. No Friend: 0, and no scope row is written (plan ח3)
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.deliver('c'), '0/0', '[h3 FR-NOTIF-003] a Regular caller with no Friendship gets 0 and the call writes no trend_scopes row');
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'pending');
select is(pg_temp.deliver('c') || ' ' || pg_temp.deliver('a'), '0/0 0/0', '[h3 FR-NOTIF-003] a pending Friend Request is not a Friendship: 0, no scope row, either side');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'declined');
select is(pg_temp.deliver('c') || ' ' || pg_temp.deliver('a'), '0/0 0/0', '[h3] nor a declined one');

-- an accepted Friendship whose other side is not active: the delivery's join excludes it, and so does the early read
select pg_temp.reset();
select pg_temp.dml('b', 'delete from nestly.children');
select is(pg_temp.dml('b', format($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Noa', 'girl', %L) $q$, pg_temp.born(3, 0))),
  'OK:1', '[h3] (setup) B''s child turns 3 today (Israel''s date)');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.deliver('a'), '0/0', '[h3 platform r15] a Friend who is suspended counts as no Friend: 0, no scope row');
select tests.set_status(pg_temp.id('b'), 'active');

-- =====================================================================================================================
-- 3. With a Friend: delivered exactly as before (FR-NOTIF-003, BR-037, AC-046; file 102 keeps the full rules)
-- =====================================================================================================================
select is(pg_temp.deliver('a'), '1/1', '[h3 AC-046 FR-NOTIF-003] with an accepted, active Friend (caller requester) the birthday is delivered, through its scope row');
select is(tests.fx_pr_count('nestly.trend_scopes'), 0::bigint, '[h3 rule 17] and the scope row is deleted again');
select is(tests.fx_nt_types(pg_temp.id('a')), 'child_birthday', '[h3] one child_birthday notification');
select is(pg_temp.deliver('a'), '0/1', '[h3] a second opening adds nothing (and, with a Friend, still runs the full delivery)');

select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('b'), pg_temp.id('a'), 'accepted');
select is(pg_temp.deliver('a'), '1/1', '[h3 AC-046] the other direction too: the caller as addressee of the Friendship gets the birthday');

-- the parent's permission still decides, past the early read
select tests.fx_nt_purge();
select is(pg_temp.dml('b', $q$ update nestly.regular_profiles set is_child_birthday_shared = false $q$), 'OK:1', '[h3] (setup) B turns the birthday off for Friends');
select is(pg_temp.deliver('a'), '0/1', '[h3 BR-037 NFR-PRIV-003] with a Friend whose permission is off: nothing written');

-- the caller's category still returns before anything else
select is(pg_temp.dml('b', $q$ update nestly.regular_profiles set is_child_birthday_shared = true $q$), 'OK:1', '[h3] (setup) back on');
select tests.fx_nt_pref(pg_temp.id('a'), 'birthdays', false);
select is(pg_temp.deliver('a'), '0/0', '[h3 FR-NOTIF-002] the caller''s birthdays category off: 0, no scope row');
select tests.fx_nt_pref(pg_temp.id('a'), 'birthdays', true);
select is(pg_temp.deliver('a'), '1/1', '[h3] (control) on again, it comes');

select * from finish();
rollback;
