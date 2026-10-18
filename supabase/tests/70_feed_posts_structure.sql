-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0a feed-groundwork: posts, post_authors, post_hides, algorithm_configurations).
-- Source of expected values: .work/feed-groundwork/spec.md (c1, c16, c17) and the names/grants in schema.md, not the migration text.
-- Behaviour is in files 71 (access) and 72 (configuration). Catalog lookups join by name: app_server has no USAGE on schema nestly.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0a c1] session_user is app_server (this file must not run under another login)');

create function pg_temp.new_tables() returns text[] language sql as $f$
  select array['algorithm_configurations', 'post_authors', 'post_hides', 'posts']
$f$;

-- ---- c1: RLS, policies, grants --------------------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())),
  'algorithm_configurations:true:true, post_authors:true:true, post_hides:true:true, posts:true:true',
  '[F3.0a c1 platform r8] the four new tables exist with RLS enabled and forced');

select is(
  (select count(*) from unnest(pg_temp.new_tables()) t
    where (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = t) = 0),
  0::bigint, '[F3.0a c1] every new table has at least one policy');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
      and pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')]::oid[]),
  0::bigint, '[F3.0a c1 platform r4 · c5] every policy on the new tables is TO authenticated only (none for PUBLIC, anon, app_owner, app_jobs)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and not pol.polpermissive),
  0::bigint, '[F3.0a c1] no restrictive policy hides an unreviewed branch');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          !~ 'is_active_account\(\)'),
  0::bigint, '[F3.0a c1 c2 platform r15] every policy is gated by is_active_account()');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
      and (has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('app_jobs', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('app_jobs', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
  0::bigint, '[F3.0a c1 platform r1 r7] anon, service_role, app_server and app_jobs hold no privilege on any new table');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.grantee = 0),
  0::bigint, '[F3.0a c1 platform r7] PUBLIC holds no privilege on any new table');

select is(
  (select string_agg(c.relname || '=' || p, ', ' order by c.relname, p)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and has_table_privilege('authenticated', c.oid, p)),
  'algorithm_configurations=SELECT, post_authors=SELECT, post_hides=DELETE, post_hides=SELECT, posts=DELETE, posts=SELECT',
  '[F3.0a c1 c18] authenticated holds table-level SELECT on all four, DELETE on posts and post_hides only; no INSERT/UPDATE table-wide, no TRUNCATE/REFERENCES/TRIGGER');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'post_authors.post_id, post_hides.post_id, posts.audience, posts.body, posts.is_anonymous, posts.shared_post_id, posts.stage_tag',
  '[F3.0a c1 c6 platform r12 r13] authenticated may INSERT exactly these columns: never the author, the status, a copy, an id or a clock');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'posts.audience, posts.body, posts.stage_tag',
  '[F3.0a c6 c4] authenticated may UPDATE exactly audience, body and tag: not the anonymous flag, status, author or share reference');

-- ---- c1: functions --------------------------------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prosecdef and (p.proname like 'post%' or p.proname like 'algorithm%')),
  0::bigint, '[F3.0a c1 platform r10] no SECURITY DEFINER function is named for the feed tables');

select is((select count(*) from tests.approved_security_definer() as a where a ~ '^nestly\.(post|algorithm)'),
  0::bigint, '[F3.0a c1 platform r10] the approved definer list gains nothing from F3.0a');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%')
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('app_server', p.oid, 'EXECUTE'))),
  0::bigint, '[F3.0a c1] no runtime role holds EXECUTE on the feed trigger functions');

-- ---- c17: nothing records a view, impression, click or dwell -------------------------------------------------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')),
  'algorithm_configurations, children, friendships, identity_link_checks, journey_contexts, legal_consents, post_authors, post_hides, posts, profile_open_counts, '
  || 'recovery_answers, recovery_events, recovery_throttles, regular_names, regular_profiles, security_events, security_limits, users',
  '[F3.0a c17] schema nestly holds exactly the fourteen earlier tables plus the four schema.md names: no events table');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and a.attname ~* '(view|impression|click|dwell|seen|read_at|opened)'),
  0::bigint, '[F3.0a c17 4א] no column of the new tables records a view, impression, click or dwell');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%'))
  - (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%') and p.prorettype = 'trigger'::regtype),
  0::bigint, '[F3.0a c17] every function of F3.0a is a trigger function (no recording or reading function)');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%')),
  3::bigint, '[F3.0a c17] exactly three functions came with F3.0a (schema.md)');

select is(
  (select count(*) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and not t.tgisinternal and c.relname = any (pg_temp.new_tables())
      and (t.tgname ~* '(view|impression|click|dwell)')),
  0::bigint, '[F3.0a c17] no trigger on the new tables is named for a view, impression, click or dwell');

select is((select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relkind in ('v', 'm', 'f', 'S')),
  0::bigint, '[F3.0a c5 c17 platform r9] no view, materialized view, foreign table or sequence in nestly (nothing can expose an anonymous author)');

-- ---- c5: no policy outside post_authors reads it for SELECT ---------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname <> 'post_authors' and pol.polcmd in ('r', '*')
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')) ~ 'post_authors'),
  0::bigint, '[F3.0a c5 rule 20] no SELECT policy of another table reads post_authors');

-- ---- c16: nothing depends on the hide table except its own objects and posts_select_viewer -------------------------------------------
select is(
  (select coalesce(string_agg(d, ' ; ' order by d), '(none)') from (
     select distinct pg_describe_object(dep.classid, dep.objid, dep.objsubid) as d
       from pg_catalog.pg_depend dep join pg_catalog.pg_class c on c.oid = dep.refobjid and dep.refclassid = 'pg_class'::regclass
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'post_hides'
        and pg_describe_object(dep.classid, dep.objid, dep.objsubid) !~ 'post_hides'
        and dep.deptype <> 'i') x),
  'policy posts_select_viewer on table nestly.posts',
  '[F3.0a c16 7א] only posts_select_viewer depends on post_hides besides the table''s own objects: no other policy, function or view, never a ranking input');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prosrc ~ 'post_hides'),
  0::bigint, '[F3.0a c16] no function body mentions post_hides');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname <> 'post_hides' and c.relname <> 'posts'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ 'post_hides'),
  0::bigint, '[F3.0a c16] no policy of any other table reads post_hides');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'posts' and pol.polname <> 'posts_select_viewer'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ 'post_hides'),
  0::bigint, '[F3.0a c16] no other posts policy reads post_hides');

select * from finish();

rollback;
