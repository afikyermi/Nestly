-- pgTAP, run by pg_prove as app_server (CI `db` job): the Groups list and the feed's Group suggestions as plan-cached plpgsql functions
-- (migration 20261027300000, performance brief plan-cache 27.10.2026). Both run as the caller (SECURITY INVOKER), are not executable by
-- anon or public, and return exactly what the replaced statements returned under the caller's policies (FR-GRP-001, FR-ALG-010, §11.14):
-- a Private Group's members are not counted for a non-member, a Group the caller belongs to is never suggested, a Private one never.
-- People: a, b (Regular), p (Professional), e = gr_e, f = gr_f (Regular). Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F10.9-p c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_gr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'e' then tests.fx_gr_id('gr_e') when 'f' then tests.fx_gr_id('gr_f') end
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.mk(p_who text, p_name text, p_privacy text) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.groups (name, description, privacy) values (%L, 'about us', %L) returning id::text $q$, p_name, p_privacy))
$f$;
-- the function's oid, from the catalog (app_server has no USAGE on schema nestly, so no regprocedure lookup)
create function pg_temp.fn(p_name text) returns oid language sql as $f$
  select p.oid from pg_catalog.pg_proc p where p.pronamespace = 'nestly'::regnamespace and p.proname = p_name
$f$;
create function pg_temp.g(p_key text) returns uuid language sql as $f$ select current_setting('t.' || p_key)::uuid $f$;
-- the caller's Groups list as 'name:member_rows:my_role' (only the fixture's two Groups)
create function pg_temp.list(p_who text, p_scope text, p_like text) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select coalesce(string_agg(s.name || ':' || s.member_rows || ':' || coalesce(s.my_role, '-'), ',' order by s.name), '')
    from nestly.group_summaries(%L, %L, 30, 3, 48::float8, 7) s where s.name in ('PC Morning walks', 'PC Quiet parents') $q$, p_scope, p_like))
$f$;
create function pg_temp.suggested(p_who text) returns text language sql as $f$
  select pg_temp.n(p_who, $q$ select coalesce(string_agg(s.name || ':' || s.member_count, ',' order by s.name), '')
    from nestly.feed_group_suggestions(10, 3, 48::float8, 7) s where s.name in ('PC Morning walks', 'PC Quiet parents') $q$)
$f$;

-- 1. the functions' shape -------------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_catalog.pg_proc where pronamespace = 'nestly'::regnamespace
            and proname in ('group_summaries', 'feed_group_suggestions') and not prosecdef and provolatile = 's' and prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
            and proconfig @> array['search_path=""', 'plan_cache_mode=force_generic_plan']),
  2, '[F10.9-p c1] group_summaries and feed_group_suggestions are SECURITY INVOKER, STABLE plpgsql, search_path empty, force_generic_plan');

select is(has_function_privilege('authenticated', pg_temp.fn('group_summaries'), 'execute'), true,
  '[F10.9-p c2] authenticated may execute group_summaries');
select is(has_function_privilege('authenticated', pg_temp.fn('feed_group_suggestions'), 'execute'), true,
  '[F10.9-p c2] authenticated may execute feed_group_suggestions');
select is(has_function_privilege('anon', pg_temp.fn('group_summaries'), 'execute'), false,
  '[F10.9-p c3] anon may not execute group_summaries');
select is(has_function_privilege('anon', pg_temp.fn('feed_group_suggestions'), 'execute'), false,
  '[F10.9-p c3] anon may not execute feed_group_suggestions');
select is((select count(*)::int from pg_catalog.pg_proc p, lateral pg_catalog.aclexplode(p.proacl) x
            where p.pronamespace = 'nestly'::regnamespace and p.proname in ('group_summaries', 'feed_group_suggestions') and x.grantee = 0),
  0, '[F10.9-p c3] public holds no privilege on either function');
select is(tests.as_role('anon', tests.claims(null), $q$ select count(*)::text from nestly.feed_group_suggestions(10, 3, 48::float8, 7) $q$), 'ERR:42501',
  '[F10.9-p c3] a call as anon is refused');

-- 2. fixture: a Public Group of a with three recent events, a Private Group of p -----------------------------------------------
select set_config('t.pub', pg_temp.mk('a', 'PC Morning walks', 'public'), true);
select set_config('t.priv', pg_temp.mk('p', 'PC Quiet parents', 'private'), true);
select is(pg_temp.dml('e', format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g('pub'))), 'OK:1', 'fixture: e joins the Public Group');
select is(pg_temp.dml('f', format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g('pub'))), 'OK:1', 'fixture: f joins the Public Group');
select isnt(pg_temp.n('a', format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', 'walk at 7', %L) returning id::text $q$, pg_temp.g('pub'))),
  null, 'fixture: a posts in the Public Group (3 events: two joins and a post)');

-- 3. the Groups list under the caller's policies ----------------------------------------------------------------------------------
select is(pg_temp.list('b', 'discover', null), 'PC Morning walks:3:-,PC Quiet parents:0:-',
  '[F10.9-p c4 FR-GRP-001] a non-member discovers both Groups; a Private Group''s members are not counted for them (0 rows readable)');
select is(pg_temp.list('p', 'discover', null), 'PC Morning walks:3:-,PC Quiet parents:1:owner',
  '[F10.9-p c4] the Private Group''s Owner reads its member rows and own Role');
select is(pg_temp.list('a', 'mine', null), 'PC Morning walks:3:owner', '[F10.9-p c5] scope mine: only the caller''s own Groups');
select is(pg_temp.list('b', 'mine', null), '', '[F10.9-p c5] scope mine: none for a caller who belongs to no Group');
select is(pg_temp.list('b', 'discover', '%walk%'), 'PC Morning walks:3:-', '[F10.9-p c6] a search pattern filters by name or description');
select is(pg_temp.list('p', 'mine', '%walk%'), '', '[F10.9-p c6] scope mine with a pattern: the caller''s own Groups only');
select is(pg_temp.n('b', $q$ select count(*)::text from nestly.group_summaries('other', null, 30, 3, 48::float8, 7) $q$), 'ERR:22023',
  '[F10.9-p c7] an unknown scope is refused');

-- the function returns what the replaced statement returned (discover, as b and as p)
select is(
  pg_temp.n('b', $q$ select string_agg(s.id::text || s.member_rows || coalesce(s.my_role, '-') || s.requested || s.blocked, ',' order by s.id)
    from nestly.group_summaries('discover', null, 30, 3, 48::float8, 7) s $q$),
  pg_temp.n('b', $q$ select string_agg(g.id::text || (select count(*) from nestly.group_members m where m.group_id = g.id)::int || coalesce(a.role, '-')
      || exists (select 1 from nestly.group_join_requests r where r.group_id = g.id and r.user_id = (select auth.uid()) and r.status = 'pending')
      || exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid())), ',' order by g.id)
    from nestly.groups g left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid()) where g.status = 'active' $q$),
  '[F10.9-p c8] as b: the function''s rows equal the replaced statement''s');
select is(
  pg_temp.n('p', $q$ select string_agg(s.id::text || s.member_rows || coalesce(s.my_role, '-'), ',' order by s.id)
    from nestly.group_summaries('discover', null, 30, 3, 48::float8, 7) s $q$),
  pg_temp.n('p', $q$ select string_agg(g.id::text || (select count(*) from nestly.group_members m where m.group_id = g.id)::int || coalesce(a.role, '-'), ',' order by g.id)
    from nestly.groups g left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid()) where g.status = 'active' $q$),
  '[F10.9-p c8] as p: the function''s rows equal the replaced statement''s');

-- 4. the feed's Group suggestions (§11.14) ------------------------------------------------------------------------------------------
select is(pg_temp.suggested('b'), 'PC Morning walks:3', '[F10.9-p c9 FR-ALG-010] a non-member is suggested the active Public Group, with its member count');
select is(pg_temp.suggested('a'), '', '[F10.9-p c9] a Group the caller belongs to is never suggested');
select is(pg_temp.suggested('e'), '', '[F10.9-p c9] nor to a member who joined it');
select is(pg_temp.suggested('p'), 'PC Morning walks:3', '[F10.9-p c9] a Private Group is never suggested (p''s own is not; the Public one is)');

select * from finish();
rollback;
