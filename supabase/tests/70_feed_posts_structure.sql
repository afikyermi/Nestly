-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0a feed-groundwork: posts, post_authors, post_hides, algorithm_configurations).
-- Source of expected values: .work/feed-groundwork/spec.md (c1, c16, c17) and the names/grants in schema.md, not the migration text.
-- Behaviour is in files 71 (access) and 72 (configuration). Catalog lookups join by name: app_server has no USAGE on schema nestly.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-a c1] session_user is app_server (this file must not run under another login)');

create function pg_temp.new_tables() returns text[] language sql as $f$
  select array['algorithm_configurations', 'post_authors', 'post_hides', 'posts']
$f$;

-- ---- c1: RLS, policies, grants --------------------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())),
  'algorithm_configurations:true:true, post_authors:true:true, post_hides:true:true, posts:true:true',
  '[F3.0-a c1 platform r8] the four new tables exist with RLS enabled and forced');

select is(
  (select count(*) from unnest(pg_temp.new_tables()) t
    where (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = t) = 0),
  0::bigint, '[F3.0-a c1] every new table has at least one policy');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
      and pol.polname !~ '_(jobs|notify)$' and pol.polname !~ '_reveal$' and pol.polname !~ '_auto_hide$'
      and pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')]::oid[]),
  0::bigint, '[F3.0-a c1 platform r4 · c5] every policy on the new tables is TO authenticated only (none for PUBLIC, anon, app_owner; F3.0b adds the *_jobs policies of the purge, file 73; the *_notify policies TO app_owner are asserted exactly in file 90; completion B''s *_select_auto_hide in file 103)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and not pol.polpermissive and pol.polname !~ '_block_hide$' and pol.polname !~ '_group_(hide|insert)$' and pol.polname !~ '_auto_hide$'),
  0::bigint, '[F3.0-a c1 · I4 blocking · I10] no restrictive policy hides an unreviewed branch (the reviewed block policies, file 91, I10''s group policies, file 96, and completion B''s ten-identical-reports hide, file 103, excepted)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and pol.polname !~ '_(jobs|notify)$' and pol.polname !~ '_reveal$'
      and pol.polname !~ '_block_hide$' -- restrictive: it only narrows the gated permissive policies (file 91)
      and pol.polname !~ '_group_(hide|insert)$' -- restrictive (I10, file 96)
      and pol.polname !~ '_auto_hide$' -- restrictive, and the definer''s reads (completion B, file 103)
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          !~ 'is_active_account\(\)'),
  0::bigint, '[F3.0-a c1 c2 platform r15] every policy is gated by is_active_account()');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
      and (has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
  0::bigint, '[F3.0-a c1 platform r1 r7] anon, service_role and app_server hold no privilege on any new table (app_jobs: the purge grants of F3.0b, file 73)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.grantee = 0),
  0::bigint, '[F3.0-a c1 platform r7] PUBLIC holds no privilege on any new table');

select is(
  (select string_agg(c.relname || '=' || p, ', ' order by c.relname, p)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and has_table_privilege('authenticated', c.oid, p)),
  'algorithm_configurations=SELECT, post_authors=SELECT, post_hides=DELETE, post_hides=SELECT, posts=DELETE',
  '[F3.0-a c1 c18 · F3.0-b finding 1] authenticated holds table-level SELECT on algorithm_configurations, post_authors and post_hides (posts: column-level, next test), DELETE on posts and post_hides only; no INSERT/UPDATE table-wide, no TRUNCATE/REFERENCES/TRIGGER');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'posts' and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'anonymous_post_id, audience, author_id, author_status, body, created_at, group_id, held_at, held_until, id, is_anonymous, is_help_request, is_share, shared_post_id, stage_tag, status',
  '[F3.0-b finding 1 c14 · I10] authenticated may SELECT exactly these posts columns: everything but held_xact');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'posts' and a.attname = 'held_xact' and a.attnum > 0 and not a.attisdropped
      and not has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  1::bigint, '[F3.0-b finding 1 c14] posts.held_xact exists and is not selectable by authenticated (the previous test is not vacuous)');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'post_authors.post_id, post_hides.post_id, posts.audience, posts.body, posts.group_id, posts.is_anonymous, posts.is_help_request, posts.shared_post_id, posts.stage_tag',
  '[F3.0-a c1 c6 platform r12 r13] authenticated may INSERT exactly these columns: never the author, the status, a copy, an id or a clock');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'posts.audience, posts.body, posts.is_help_request, posts.stage_tag, posts.status',
  '[F3.0-a c6 c4] authenticated may UPDATE exactly audience, body, tag and (F3.0b, the move to deleted) status: not the anonymous flag, author or share reference');

-- ---- c1: functions --------------------------------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prosecdef and (p.proname like 'post%' or p.proname like 'algorithm%')),
  0::bigint, '[F3.0-a c1 platform r10] no SECURITY DEFINER function is named for the feed tables');

select is((select count(*) from tests.approved_security_definer() as a where a ~ '^nestly\.(post|algorithm)'),
  0::bigint, '[F3.0-a c1 platform r10] the approved definer list gains nothing from F3.0a');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%')
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('app_server', p.oid, 'EXECUTE'))),
  0::bigint, '[F3.0-a c1] no runtime role holds EXECUTE on the feed trigger functions');

-- ---- c17: nothing records a view, impression, click or dwell -------------------------------------------------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')),
  'algorithm_configurations, audit_log, auto_hide_scopes, chat_blocks, chat_reads, chat_requests, children, comments, conversations, cycle_entries, enforcement_records, friend_content_notification_preferences, friendships, group_access, group_bans, group_highlight_configurations, group_invitations, group_join_requests, group_members, group_notification_preferences, group_staff_views, group_suggestions, groups, identity_link_checks, journey_contexts, legal_consents, marketplace_listings, media_assets, media_fingerprints, media_reviews, media_training_candidates, media_training_events, media_training_samples, messages, moderator_invitations, moderator_permissions, notification_preferences, notifications, outreach_requests, people_search_counts, post_authors, post_hides, posts, private_group_content_views, professional_articles, professional_follows, professional_profiles, professional_reviews, profile_open_counts, profile_photos, profile_staff_views, promotion_events, promotion_payments, promotion_plans, promotions, reaction_owners, reactions, recovery_answers, recovery_events, recovery_throttles, regular_names, regular_profiles, report_auto_hides, report_escalations, report_openings, report_reasons, reported_comment_views, reported_message_views, reports, search_intents, security_events, security_limits, sponsored_products, staff_roles, status_guides, stories, support_messages, support_requests, suspected_image_fingerprints, system_announcements, tracker_events, trend_scopes, user_blocks, user_enforcements, users',
  '[F3.0-a c17 F3.0-b c1 · I14] schema nestly holds exactly the fourteen earlier tables plus the schema.md and schema-b.md names (85, with completion B''s seven staff-rule and image-hash tables, file 103, with I13''s promotion_plans, promotion_payments, promotions and promotion_events (paid events only, FR-PRO-002), file 101, with the I14 completion''s report_escalations, report_openings, group_staff_views and trend_scopes, file 100, with I12''s marketplace_listings and sponsored_products, file 99, with I11''s five Professional tables, file 97, with I10''s ten group tables, file 96, with I14''s moderator_invitations and system_announcements, with I6''s cycle_entries, status_guides and tracker_events, plus I4''s five, user_blocks and the five notification and search tables and I5''s seven media tables and I8''s eight chat, Support and reported-message tables): no events table');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and a.attname ~* '(view|impression|click|dwell|seen|read_at|opened)'),
  0::bigint, '[F3.0-a c17 4א] no column of the new tables records a view, impression, click or dwell');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%'))
  - (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%') and p.prorettype = 'trigger'::regtype),
  0::bigint, '[F3.0-a c17] every function of F3.0a is a trigger function (no recording or reading function)');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%')),
  7::bigint, '[F3.0-a c17 · F3.5 c8 · I10] exactly seven functions: four came with F3.0a (schema.md + the hide-own-post guard), posts_update_share_guard (I3 rest PR-A) and I10''s posts_group_share_guard and posts_reject_group_edit (file 96)');

select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname like 'post%' or p.proname like 'algorithm%')),
  'algorithm_configurations_guard, post_hides_insert_guard, posts_group_share_guard, posts_insert_author, posts_insert_prepare, posts_reject_group_edit, posts_update_share_guard',
  '[F3.0-a c17 · F3.5 c8 · I10] the seven are insert/update guards; none is a view, impression, click or dwell recorder');

select is(
  (select count(*) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and not t.tgisinternal and c.relname = any (pg_temp.new_tables())
      and (t.tgname ~* '(view|impression|click|dwell)')),
  0::bigint, '[F3.0-a c17] no trigger on the new tables is named for a view, impression, click or dwell');

select is((select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relkind in ('v', 'm', 'f', 'S')),
  0::bigint, '[F3.0-a c5 c17 platform r9] no view, materialized view, foreign table or sequence in nestly (nothing can expose an anonymous author)');

-- ---- c5: no policy outside post_authors reads it for SELECT ---------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname || '.' || pol.polname, ', ' order by c.relname, pol.polname), '(none)') from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname <> 'post_authors' and pol.polcmd in ('r', '*')
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')) ~ 'post_authors'),
  'comments.comments_select_own_moderated, comments.comments_select_viewer, outreach_requests.outreach_requests_select_target, posts.posts_select_own_moderated, posts.posts_select_viewer', '[F3.0-a c5 F3.0-b c11 rule 20 · I4 · I11] only the four SELECT policies that carry the held branch or the delete of moderated content (the author reads their own row) and I11''s outreach_requests_select_target (the author of an anonymous post reads the Offer Help on it through its own post_authors row, file 97) read post_authors: no other table policy does (post_authors itself has the reveal policy, file 90)');

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
  '[F3.0-a c16 7א] only posts_select_viewer depends on post_hides besides the table''s own objects: no other policy, function or view, never a ranking input');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prosrc ~ 'post_hides' and p.proname <> 'post_hides_insert_guard'),
  0::bigint, '[F3.0-a c16] no function body but the table''s own guard post_hides_insert_guard mentions post_hides');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname <> 'post_hides' and c.relname <> 'posts'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ 'post_hides'),
  0::bigint, '[F3.0-a c16] no policy of any other table reads post_hides');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'posts' and pol.polname <> 'posts_select_viewer'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ 'post_hides'),
  0::bigint, '[F3.0-a c16] no other posts policy reads post_hides');

select * from finish();

rollback;
