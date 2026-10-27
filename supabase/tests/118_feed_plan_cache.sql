-- pgTAP, run by pg_prove as app_server (CI `db` job): the feed page's read statements as plan-cached functions (migration 20261027400000,
-- performance 27.10.2026). Each function is SECURITY INVOKER (authorization stays in the row policies, as the caller), stable or volatile,
-- with search_path '' and a generic plan; anon and public cannot execute it, authenticated can; and under RLS it returns only what the
-- caller's policies show: a Friends-only post of A reaches A and never B (a stranger) or P (a Professional).
-- People: 10_'s a, b (Regular) and 97_'s pr_1 (P, a Professional with a profile). Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[perf 27.10] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_pr_id('pr_1') end
$f$;
-- the first column of the first row of p_sql as `authenticated` with p_who's claims (or 'ERR:<sqlstate>')
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;

-- ---- every function: invoker, settings, privileges -------------------------------------------------------------------------------------
-- the functions by name (the schema is not usable by app_server, so they are read from the catalog, as in 100_staff_work.sql)
create function pg_temp.fns() returns setof pg_catalog.pg_proc language sql as $f$
  select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'nestly' and p.proname in ('read_feed_ranking_regular',
     'read_feed_ranking_regular_intent',
     'read_feed_ranking_content',
     'read_feed_display',
     'read_feed_config_rows',
     'read_post_counts',
     'read_liked_target_ids',
     'read_post_images',
     'read_muted_group_ids',
     'read_professional_authors',
     'read_promoted_post_candidates',
     'read_promoted_profile_candidates',
     'read_promoted_listing_candidates',
     'read_promotion_config',
     'read_recent_post_count',
     'read_matching_posts',
     'read_today_impressions')
$f$;

select is((select count(*)::int from pg_temp.fns()), 17, '[perf 27.10] the 17 plan-cached read functions exist, one of each name');

select is((select string_agg(p.proname, ', ') from pg_temp.fns() p where p.prosecdef), null,
  '[perf 27.10] every function is SECURITY INVOKER (prosecdef false): authorization stays in the row policies');

select is(
  (select string_agg(p.proname, ', ') from pg_temp.fns() p
    where p.prolang <> (select l.oid from pg_catalog.pg_language l where l.lanname = 'plpgsql')
       or coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path="",plan_cache_mode=force_generic_plan'
       or p.provolatile not in ('s', 'v')),
  null, '[perf 27.10] every function is plpgsql (plans cached per connection), search_path empty, a generic plan, and reads only (stable; volatile for random())');

select is((select string_agg(p.proname, ', ') from pg_temp.fns() p where has_function_privilege('anon', p.oid, 'EXECUTE')), null,
  '[perf 27.10] anon cannot execute any of them');

select is(
  (select string_agg(p.proname, ', ') from pg_temp.fns() p
    where exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE')),
  null, '[perf 27.10] public holds no EXECUTE on any of them');

select is((select string_agg(p.proname, ', ') from pg_temp.fns() p where not has_function_privilege('authenticated', p.oid, 'EXECUTE')), null,
  '[perf 27.10] authenticated can execute every one of them');

select is(tests.as_role('anon', null, 'select count(*)::text from nestly.read_feed_config_rows()'), 'ERR:42501',
  '[perf 27.10] a call as anon is refused (42501)');

-- ---- under RLS: a Friends-only post of A (A and B are not Friends) --------------------------------------------------------------------
select tests.fx_fr_purge(pg_temp.id('a'));
select tests.fx_fr_purge(pg_temp.id('b'));
select tests.fx_fr_purge(pg_temp.id('p'));
create temp table t (k text primary key, v uuid) on commit drop;
insert into t values ('friends', tests.fx_po_add(pg_temp.id('a'), 'friends', false, 'active', 'friends only plan cache body'));
insert into t values ('pro', tests.fx_po_add(pg_temp.id('p'), 'everyone', false, 'active', 'a professional post'));
select tests.fx_rx_add(pg_temp.id('a'), (select v from t where k = 'friends'));

create function pg_temp.ids(p_key text) returns text language sql as $f$ select format('array[%L]::uuid[]', (select v from t where k = p_key)) $f$;
-- the ranking's rows for this post: the first page (cursor tier -1), every post in tier 0, no tier-1 keyset
create function pg_temp.ranked(p_who text, p_fn text) returns text language sql as $f$
  select pg_temp.q(p_who, format($q$ select count(*)::text from %s where id = %L $q$,
    case p_fn
      when 'regular' then $c$nestly.read_feed_ranking_regular(now(), 1209601, 336, 1, 24, 2, 0.2, 20, 0, '{}', true, 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', -1, 0, now(), '00000000-0000-0000-0000-000000000000', 1000)$c$
      when 'intent' then $c$nestly.read_feed_ranking_regular_intent(now(), 1209601, 336, 1, 24, 2, 0.2, 20, 0, '{}', 0.5, array['plan cache'], array[1]::float8[], true, 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', -1, 0, now(), '00000000-0000-0000-0000-000000000000', 1000)$c$
      else $c$nestly.read_feed_ranking_content(now(), 1209601, 336, 1, 24, 0.2, 20, 2, null, true, 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', -1, 0, now(), '00000000-0000-0000-0000-000000000000', 1000)$c$
    end, (select v from t where k = 'friends')))
$f$;

select is(pg_temp.ranked('a', 'regular'), '1', '[perf 27.10] read_feed_ranking_regular: the author ranks her own Friends-only post');
select is(pg_temp.ranked('b', 'regular'), '0', '[perf 27.10] read_feed_ranking_regular: a stranger never gets it');
select is(pg_temp.ranked('a', 'intent'), '1', '[perf 27.10] read_feed_ranking_regular_intent: the author ranks it');
select is(pg_temp.ranked('b', 'intent'), '0', '[perf 27.10] read_feed_ranking_regular_intent: a stranger never gets it');
select is(pg_temp.ranked('p', 'content'), '0', '[perf 27.10] read_feed_ranking_content: a Professional never gets it');

select is(pg_temp.q('a', format('select count(*)::text from nestly.read_feed_display(%s) where "isMine"', pg_temp.ids('friends'))), '1',
  '[perf 27.10] read_feed_display: the author reads her post, marked hers');
select is(pg_temp.q('b', format('select count(*)::text from nestly.read_feed_display(%s)', pg_temp.ids('friends'))), '0',
  '[perf 27.10] read_feed_display: a stranger reads no row of it');

select is(pg_temp.q('a', format('select "likeCount"::text from nestly.read_post_counts(%s)', pg_temp.ids('friends'))), '1',
  '[perf 27.10] read_post_counts: the author sees the like on her post');
select is(pg_temp.q('b', format('select "likeCount"::text from nestly.read_post_counts(%s)', pg_temp.ids('friends'))), '0',
  '[perf 27.10] read_post_counts: a stranger counts 0 likes on a post it cannot read');

select is(pg_temp.q('a', format('select count(*)::text from nestly.read_liked_target_ids(%s)', pg_temp.ids('friends'))), '1',
  '[perf 27.10] read_liked_target_ids: the liker reads her own like');
select is(pg_temp.q('b', format('select count(*)::text from nestly.read_liked_target_ids(%s)', pg_temp.ids('friends'))), '0',
  '[perf 27.10] read_liked_target_ids: another user never reads it');

select is(pg_temp.q('a', format($q$ select count(*)::text from nestly.read_matching_posts(%s, array['plan cache']) $q$, pg_temp.ids('friends'))), '1',
  '[perf 27.10] read_matching_posts: the author''s post matches for the author');
select is(pg_temp.q('b', format($q$ select count(*)::text from nestly.read_matching_posts(%s, array['plan cache']) $q$, pg_temp.ids('friends'))), '0',
  '[perf 27.10] read_matching_posts: never for a stranger who cannot read it');

select is(pg_temp.q('a', format('select count(*)::text from nestly.read_professional_authors(%s)', pg_temp.ids('pro'))), '1',
  '[perf 27.10] read_professional_authors: a Professional''s post counts for another viewer');
select is(pg_temp.q('p', format('select count(*)::text from nestly.read_professional_authors(%s)', pg_temp.ids('pro'))), '0',
  '[perf 27.10] read_professional_authors: never the viewer''s own post');

-- the rest run as authenticated and return what the old statements did (compared row for row on Preview before merging)
select is(pg_temp.q('a', 'select count(*)::text from nestly.read_feed_config_rows()'),
  tests.fx_pr_count($q$ nestly.algorithm_configurations where surface = 'regular_feed' $q$)::text,
  '[perf 27.10] read_feed_config_rows: every regular_feed version');
select ok(pg_temp.q('a', format('select count(*)::text from nestly.read_post_images(%s)', pg_temp.ids('friends'))) = '0',
  '[perf 27.10] read_post_images runs as authenticated (a post without images: no row)');
select ok(pg_temp.q('a', 'select count(*)::text from nestly.read_muted_group_ids(array[gen_random_uuid()])') = '0',
  '[perf 27.10] read_muted_group_ids runs as authenticated (no mute: no row)');
select ok(pg_temp.q('a', 'select count(*)::text from nestly.read_promoted_post_candidates()') not like 'ERR:%', '[perf 27.10] read_promoted_post_candidates runs as authenticated');
select ok(pg_temp.q('a', 'select count(*)::text from nestly.read_promoted_profile_candidates()') not like 'ERR:%', '[perf 27.10] read_promoted_profile_candidates runs as authenticated');
select ok(pg_temp.q('a', 'select count(*)::text from nestly.read_promoted_listing_candidates()') not like 'ERR:%', '[perf 27.10] read_promoted_listing_candidates runs as authenticated');
select ok(pg_temp.q('a', 'select count(*)::text from nestly.read_promotion_config()') not like 'ERR:%', '[perf 27.10] read_promotion_config runs as authenticated');
select ok(pg_temp.q('a', 'select n::text from nestly.read_recent_post_count()')::int >= 1, '[perf 27.10] read_recent_post_count: the author counts her new post');
select ok(pg_temp.q('a', 'select count(*)::text from nestly.read_today_impressions(array[gen_random_uuid()])') = '0',
  '[perf 27.10] read_today_impressions runs as authenticated (no impression: no row)');

select * from finish();

rollback;
