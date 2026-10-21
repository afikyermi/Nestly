-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0b feed-groundwork: comments, reactions, reaction_owners, reports, held state, functions).
-- Source of expected values: .work/feed-groundwork/spec.md (c1, c12, c14, c15, c16 and Gate 2 lines) and the names/grants in schema-b.md,
-- not the migration text. Behaviour is in files 74-77. Catalog lookups join by name: app_server has no USAGE on schema nestly.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-b c1] session_user is app_server (this file must not run under another login)');

create function pg_temp.new_tables() returns text[] language sql as $f$
  select array['comments', 'reaction_owners', 'reactions', 'reports']
$f$;

-- ---- c1: RLS, policies, grants --------------------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())),
  'comments:true:true, reaction_owners:true:true, reactions:true:true, reports:true:true',
  '[F3.0-b c1 platform r8] the four new tables exist with RLS enabled and forced');

select is(
  (select count(*) from unnest(pg_temp.new_tables()) t
    where (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = t) = 0),
  0::bigint, '[F3.0-b c1] every new table has at least one policy');

select is(
  (select string_agg(c.relname || '.' || pol.polname, ', ' order by c.relname, pol.polname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('comments', 'posts', 'reaction_owners', 'reactions', 'reports')
      and pol.polname !~ '_notify$'
      and pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')]::oid[]),
  'comments.comments_delete_jobs, comments.comments_select_auto_hide, comments.comments_select_jobs, posts.posts_delete_jobs, posts.posts_select_auto_hide, posts.posts_select_jobs, posts.posts_select_reveal, reports.reports_select_auto_hide, reports.reports_select_jobs, reports.reports_select_reveal, reports.reports_update_jobs',
  '[F3.0-b c14 platform r6 · I4] the only policies not TO authenticated are the six TO app_jobs of the purge (the approved exception) and the TO app_owner read of reveal_post_author (approved by Afik 20.10.2026); the *_notify policies TO app_owner of the notification definers are file 90''s; completion B''s *_select_auto_hide reads of identical_reports_hide are file 103''s');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and pol.polname !~ '_(jobs|notify)$' and pol.polname !~ '_reveal$'
      and pol.polname !~ '_block_hide$' -- restrictive: it only narrows the gated permissive policies (file 91)
      and pol.polname !~ '_group_(hide|insert)$' -- restrictive (I10, file 96)
      and pol.polname !~ '_auto_hide$' -- restrictive, and the definer''s TO app_owner reads (completion B, file 103)
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          !~ 'is_active_account\(\)'),
  0::bigint, '[F3.0-b c1 platform r15] every policy for authenticated on the new tables is gated by is_active_account()');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and not pol.polpermissive and pol.polname !~ '_block_hide$' and pol.polname !~ '_group_(hide|insert)$'
      and pol.polname <> 'reports_insert_community' and pol.polname !~ '_auto_hide$'),
  0::bigint, '[F3.0-b c1 · I4 blocking · I10 · I14c] no restrictive policy hides an unreviewed branch (the reviewed block policies, file 91, I10''s group policies, file 96, and the I14 completion''s reports_insert_community, staff file no report, file 100, and completion B''s *_auto_hide, ten identical reports, file 103, excepted)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
      and (has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
           or has_table_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
  0::bigint, '[F3.0-b c1 platform r1 r7] anon, service_role and app_server hold no privilege on any new table');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.grantee = 0),
  0::bigint, '[F3.0-b c1 platform r7] PUBLIC holds no privilege on any new table');

select is(
  (select string_agg(c.relname || '=' || p, ', ' order by c.relname, p)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and has_table_privilege('authenticated', c.oid, p)),
  'comments=DELETE, reaction_owners=SELECT, reactions=DELETE, reports=SELECT',
  '[F3.0-b c1 c12 c15 finding 1] authenticated holds table-level SELECT on reaction_owners and reports (comments and reactions: column-level, next test) and DELETE on comments and reactions only: no table-wide INSERT/UPDATE, reports never deleted or updated');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('comments', 'reactions') and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'comments.author_id, comments.author_status, comments.body, comments.created_at, comments.group_id, comments.held_at, comments.held_until, comments.id, comments.is_by_post_author, '
  || 'comments.parent_id, comments.post_id, comments.status, reactions.comment_id, reactions.created_at, reactions.id, reactions.is_by_author, reactions.post_id, reactions.target_id',
  '[F3.0-b finding 1 c12 c14 b-1] authenticated may SELECT exactly these comments and reactions columns: everything but comments.held_xact, comments.parent_status and reactions.liker_status');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and ((c.relname = 'comments' and a.attname in ('held_xact', 'parent_status')) or (c.relname = 'reactions' and a.attname = 'liker_status'))
      and a.attnum > 0 and not a.attisdropped),
  3::bigint, '[F3.0-b finding 1 c14 b-1] comments.held_xact, comments.parent_status and reactions.liker_status exist (the never-readable test is not vacuous)');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'comments.body, comments.parent_id, comments.post_id, reaction_owners.reaction_id, reaction_owners.target_id, reactions.comment_id, reactions.post_id, '
  || 'reports.article_id, reports.comment_id, reports.details, reports.listing_id, reports.message_id, reports.post_id, reports.reason, reports.reported_user_id, reports.review_id, reports.target_kind',
  '[F3.0-b c10 c11 c12 c15] authenticated may INSERT exactly these columns: never an author, a mark, a status, a copy, a clock or a reporter');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and (c.relname = any (pg_temp.new_tables()) or (c.relname = 'posts' and a.attname = 'status')) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'comments.status, posts.status, reports.closed_at, reports.handled_by, reports.handler_note, reports.resolution, reports.status',
  '[F3.0-b c13 c14 · I4] authenticated may UPDATE only comments.status and posts.status besides a''s columns (the move to deleted or a moderator''s move), and the five handling columns of a report (staff only, by reports_update_staff: file 90); no like is updatable');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and a.attnum > 0 and not a.attisdropped
      and ((c.relname in ('posts', 'comments') and a.attname = 'held_xact') or (c.relname = 'comments' and a.attname = 'parent_status') or (c.relname = 'reactions' and a.attname = 'liker_status'))
      and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  0::bigint, '[F3.0-b c12 c14 b-1] the holding transaction, the parent-status copy and the liker-status copy are never readable');

select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'comments' and a.attname = 'parent_status' and a.attnum > 0 and not a.attisdropped
      and (has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') or has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')
           or has_column_privilege('authenticated', c.oid, a.attnum, 'REFERENCES'))),
  0::bigint, '[F3.0-b c13 c14 b-1] comments.parent_status is neither insertable, updatable nor referenceable by authenticated');

-- ---- b-1 / F3.1-a c6: constraints named by schema-b.md --------------------------------------------------------------------------
select is(
  (select string_agg(con.conname || ':' || con.contype::text, ', ' order by con.conname)
     from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and ((c.relname = 'comments' and con.conname in ('comments_id_post_id_status_key', 'comments_id_post_id_key', 'comments_parent_status_check', 'comments_body_length_check'))
                                 or (c.relname = 'posts' and con.conname = 'posts_body_length_check'))),
  'comments_body_length_check:c, comments_id_post_id_status_key:u, comments_parent_status_check:c, posts_body_length_check:c',
  '[F3.0-b c10 c13 b-1][F3.1-a c6][F3.3-a c1] the status-carrying unique key, the parent-status check and the body-length checks exist; comments_id_post_id_key is gone');

select is(
  (select pg_catalog.pg_get_constraintdef(con.oid) from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'comments' and con.conname = 'comments_body_length_check'),
  'CHECK ((char_length(body) <= 1000))', '[F3.3-a c1] the comment body cap is 1,000 characters');

select is(
  (select pg_catalog.pg_get_constraintdef(con.oid) from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'comments' and con.conname = 'comments_id_post_id_status_key'),
  'UNIQUE (id, post_id, status)', '[F3.0-b b-1] the reply foreign-key target is exactly (id, post_id, status)');

select is(
  (select string_agg(
            (select string_agg(a.attname::text, ',' order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
               join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum)
            || '->' ||
            (select string_agg(a.attname::text, ',' order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
               join pg_catalog.pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
            || ' upd=' || con.confupdtype::text || ' del=' || con.confdeltype::text, '; ')
     from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'comments' and con.contype = 'f' and con.confrelid = con.conrelid),
  'parent_id,post_id,parent_status->id,post_id,status upd=c del=c',
  '[F3.0-b c10 c13 b-1] the only self-reference of comments is (parent_id, post_id, parent_status) -> (id, post_id, status), ON UPDATE and ON DELETE CASCADE');

select ok(
  (select pg_catalog.pg_get_constraintdef(con.oid) like '%char_length(body) <= 2000%' from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'posts' and con.conname = 'posts_body_length_check'),
  '[F3.1-a c6] the body cap is 2,000 characters');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('posts', 'comments') and a.attname ~ '^held_'),
  'comments.held_at, comments.held_until, comments.held_xact, posts.held_at, posts.held_until, posts.held_xact',
  '[F3.0-b c14] posts and comments carry the held state (held_at, held_until, held_xact)');

-- ---- c14: the jobs role holds exactly what the purge needs -----------------------------------------------------------------------
select is(
  (select string_agg(c.relname || '=' || p, ', ' order by c.relname, p)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and has_table_privilege('app_jobs', c.oid, p)),
  'comments=DELETE, comments=SELECT, posts=DELETE, posts=SELECT, professional_views=DELETE, professional_views=SELECT, promotion_events=DELETE, promotion_monthly_summaries=INSERT, promotion_monthly_summaries=SELECT, promotion_monthly_summaries=UPDATE, reports=SELECT, search_intents=DELETE, search_intents=SELECT, usage_events=DELETE, usage_events=SELECT',
  '[F3.0-b c14 platform r6] app_jobs holds table privileges on posts, comments and reports (and, from the Intent Signal, search_intents; from the I13 follow-up usage_events, professional_views, the paid events'' 12-month delete and the monthly summaries, file 104; column-level reads of the paid events, promotions and payments) only, and only SELECT, DELETE (SELECT on reports; SELECT, INSERT, UPDATE on the summaries)');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      and (has_column_privilege('app_jobs', c.oid, a.attnum, 'UPDATE') or has_column_privilege('app_jobs', c.oid, a.attnum, 'INSERT'))),
  'reports.closed_at, reports.status',
  '[F3.0-b c14] and may write exactly the status and the close time of a report');

select is((select pg_catalog.has_schema_privilege('app_jobs', n.oid, 'USAGE') and not pg_catalog.has_schema_privilege('app_jobs', n.oid, 'CREATE')
             from pg_catalog.pg_namespace n where n.nspname = 'nestly'), true, '[F3.0-b c14] app_jobs may use schema nestly, not create in it');

select is(
  (select count(*) from pg_catalog.pg_roles r where r.rolname in ('app_server', 'authenticated', 'anon') and pg_has_role(r.oid, 'app_jobs', 'member')),
  0::bigint, '[F3.0-b c14 platform r6] no runtime role is a member of app_jobs outside the test fixtures');

-- ---- c1: functions --------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype and p.proname in ('delete_post', 'delete_comment', 'purge_held_content')),
  'delete_comment, delete_post, purge_held_content', '[F3.0-b c13 c14] the three callable functions exist');

select is(
  (select string_agg(p.proname || '=' || (has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text || '/' || (has_function_privilege('app_jobs', p.oid, 'EXECUTE'))::text
                     || '/' || (has_function_privilege('anon', p.oid, 'EXECUTE'))::text || '/' || (has_function_privilege('app_server', p.oid, 'EXECUTE'))::text, ', ' order by p.proname)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname in ('delete_post', 'delete_comment', 'purge_held_content')),
  'delete_comment=true/false/false/false, delete_post=true/false/false/false, purge_held_content=false/true/false/false',
  '[F3.0-b c13 c14] delete_post and delete_comment: authenticated only; the purge: app_jobs only (authenticated/app_jobs/anon/app_server)');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace, pg_catalog.pg_roles r
    where n.nspname = 'nestly' and p.prorettype = 'trigger'::regtype and r.rolname in ('authenticated', 'anon', 'app_server', 'app_jobs', 'service_role')
      and has_function_privilege(r.oid, p.oid, 'EXECUTE')),
  0::bigint, '[F3.0-b c1] no runtime role can execute any trigger function in nestly');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.prosecdef
      and (p.proname in ('delete_post', 'delete_comment', 'purge_held_content', 'content_hold') or p.proname ~ '^(comments|reaction|reports)')),
  0::bigint, '[F3.0-b c1 platform r10] none of the F3.0b functions is SECURITY DEFINER');

select is((select count(*) from tests.approved_security_definer() as a where a ~ '^nestly\.(comment|reaction|report|delete_post|purge_held|content_hold)'),
  0::bigint, '[F3.0-b c1 platform r10] the approved definer list gains nothing from F3.0b (the notification triggers are named notify_*)');

select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and (p.proname in ('delete_post', 'delete_comment', 'purge_held_content', 'content_hold') or p.proname ~ '^(comments|reaction|reports)')
      and not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""'])),
  0::bigint, '[F3.0-b c1 platform r11] every F3.0b function pins an empty search_path');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('v', 'm', 'f', 'S')),
  0::bigint, '[F3.0-b c1 c12 platform r9] still no view, materialized view, foreign table or sequence in nestly (nothing exposes who liked or who authored)');

-- ---- c15: the eight decided reasons, nothing else ---------------------------------------------------------------------------------
select is(
  (select count(*) from unnest(array['child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information', 'medical_misinformation', 'impersonation', 'spam', 'other']) r(code)
    where tests.as_role('authenticated', tests.claims(tests.fx_id('a')), format($q$ select count(*)::text from nestly.report_reasons where key = %L and is_active $q$, r.code)) = '1'),
  8::bigint, '[F3.0-b c15 · I4] the report_reasons list holds each of the eight decided reasons, active (the reports.reason foreign key replaced the CHECK; FR-ADMIN-007)');
select is(
  (select count(*) from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'reports' and con.conname = 'reports_reason_fkey' and con.contype = 'f'),
  1::bigint, '[F3.0-b c15 · I4] reports.reason references report_reasons'); 

select is(
  (select count(*) from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'reports' and con.contype = 'f' and con.confdeltype = 'n'),
  8::bigint, '[F3.0-b c14 c15 · I8 · I12 · I11 follow-ups · I14c] the seven target columns of a report (I8 adds message_id, I12 listing_id, the I11 follow-ups review_id and article_id) and the I14 completion''s thread_post_id (a comment''s post, file 100) are SET NULL: a report outlives its content');

-- ---- c12 c15 c16: who may depend on whom -----------------------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(d, ' ; ' order by d), '(none)') from (
     select distinct pg_describe_object(dep.classid, dep.objid, dep.objsubid) as d
       from pg_catalog.pg_depend dep join pg_catalog.pg_class c on c.oid = dep.refobjid and dep.refclassid = 'pg_class'::regclass
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'reports'
        and pg_describe_object(dep.classid, dep.objid, dep.objsubid) !~ 'reports'
        and pg_describe_object(dep.classid, dep.objid, dep.objsubid) !~ '(_staff on table|_staff_context on table|user_enforcements|report_escalations|report_openings)'
        and dep.deptype <> 'i') x),
  'constraint enforcement_records_report_id_fkey on table nestly.enforcement_records ; constraint private_group_content_views_report_id_fkey on table nestly.private_group_content_views ; constraint reported_comment_views_report_id_fkey on table nestly.reported_comment_views ; constraint reported_message_views_report_id_fkey on table nestly.reported_message_views ; policy marketplace_listings_select_viewer on table nestly.marketplace_listings ; policy posts_select_viewer on table nestly.posts ; policy report_auto_hides_select_community on table nestly.report_auto_hides',
  '[F3.0-b c16 7א · I4 · I12] only posts_select_viewer and marketplace_listings_select_viewer (a reported post or listing is hidden from its reporter; and the staff policies and the enforcement link, file 90; I8''s audited staff view of a reported message, file 94; I10''s audited staff view of reported Private Group content, file 96) depends on reports besides the table''s own objects: no other policy, function or view, never a ranking input');

select is(
  (select coalesce(string_agg(c.relname || '.' || pol.polname, ', ' order by c.relname, pol.polname), '(none)')
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname not in ('reports', 'report_escalations', 'report_openings') and pol.polname !~ '_staff(_context)?$'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ '\mreports\M'),
  'marketplace_listings.marketplace_listings_select_viewer, posts.posts_select_viewer, report_auto_hides.report_auto_hides_select_community',
  '[F3.0-b c16 Afik 18.10 · I14c · I14c-B: ten identical reports hide an item from all but its author and its reporters, file 103] no policy of comments, users or any other table reads reports: a reported comment or user is hidden from nobody (a listing, like a post, is hidden from its reporter, I12; the staff policies, the I14 completion''s report context for REPORTS_VIEW and its escalations and openings only open rows to staff, file 100)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'reports' and pol.polname !~ '_(jobs|notify)$'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ '(posts|comments)'),
  0::bigint, '[F3.0-b c15 platform r1] the reporter''s policies on reports never read posts or comments');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname not in ('reaction_owners', 'reactions')
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ 'reaction_owners'),
  0::bigint, '[F3.0-b c12] no policy of another table reads the owner rows of likes');

-- ---- c17: nothing records a view, impression, click or dwell ---------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
      and a.attname ~* '(view|impression|click|dwell|seen|read_at|opened)' and a.attname <> 'review_id'),
  0::bigint, '[F3.0-b c1 4א] no column of the new tables records a view, impression, click or dwell');

select * from finish();

rollback;
