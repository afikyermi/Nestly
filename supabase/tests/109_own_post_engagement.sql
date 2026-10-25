-- pgTAP, run by pg_prove as app_server (CI `db` job): own_post_engagement(integer) (migration 20261025100000).
-- Expected values come from the SRS and Afik's decisions, not the migration text: FR-PRO-001, AC-018, VAL-032 (the dashboard shows the
-- caller's own aggregates only: likes and comments by others on its posts in the last 30 days) and decisions-in-force.md §19 (a SECURITY
-- DEFINER that returns only a number must count nothing beyond the caller's own rights). The reference is today's statement, run as the
-- caller under its own RLS: for every fixture state below the function returns exactly what that statement returns.
-- People: a, b, c (Regular), s (Regular, suspended between the steps), q1 = pr_1 (Professional), d = fr_d (Admin), m0 = fr_m (Moderator).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F11.10-a c1 engage] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'c' then tests.fx_fr_id('fr_c') when 's' then tests.fx_id('s')
    when 'q1' then tests.fx_pr_id('pr_1') when 'd' then tests.fx_fr_id('fr_d') when 'm0' then tests.fx_fr_id('fr_m')
  end
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, false)
$f$;
-- the function as p_who: the number, or 'ERR:<sqlstate>'
create function pg_temp.fn(p_who text, p_days int) returns text language sql as $f$
  select pg_temp.q(p_who, format('select nestly.own_post_engagement(%s)::text', p_days))
$f$;
-- today's dashboard statement (readDashboard, engagement30d), as p_who under its own RLS, over p_days days
create function pg_temp.today(p_who text, p_days int) returns text language sql as $f$
  select pg_temp.q(p_who, format($q$
    select ((select count(*) from nestly.reactions x join nestly.posts p on p.id = x.post_id
              where p.author_id = (select auth.uid()) and not x.is_by_author and x.created_at > now() - make_interval(days => %1$s))
          + (select count(*) from nestly.comments m join nestly.posts p on p.id = m.post_id
              where p.author_id = (select auth.uid()) and not m.is_by_post_author and m.created_at > now() - make_interval(days => %1$s)))::text $q$,
    p_days))
$f$;
-- 'who:function=today' for each caller, so a mismatch names the caller
create function pg_temp.both(p_days int) returns text language sql as $f$
  select string_agg(w || ':' || pg_temp.fn(w, p_days) || '=' || pg_temp.today(w, p_days), ', ' order by o)
    from unnest(array['a', 'b', 'c', 'q1', 'd', 'm0', 's']) with ordinality as t(w, o)
$f$;
create function pg_temp.keep(p_name text, p_id uuid) returns uuid language sql as $f$
  select set_config('t.' || p_name, p_id::text, true)::uuid
$f$;
create function pg_temp.v(p_name text) returns uuid language sql as $f$ select current_setting('t.' || p_name)::uuid $f$;

-- =====================================================================================================================
-- 1. Shape: a definer that takes only a period and returns one number
-- =====================================================================================================================
select is(
  (select p.prosecdef::text || '/' || pg_catalog.pg_get_userbyid(p.proowner) || '/' || coalesce(pg_catalog.array_to_string(p.proconfig, ','), '-')
          || '/' || pg_catalog.pg_get_function_arguments(p.oid) || '/' || pg_catalog.pg_get_function_result(p.oid)
     from pg_catalog.pg_proc p where p.proname = 'own_post_engagement' and p.pronamespace = 'nestly'::regnamespace),
  'true/app_owner/search_path=""/p_days integer/integer',
  '[F11.10-a c1 engage rule 10 §19] own_post_engagement is a SECURITY DEFINER owned by app_owner, search_path pinned, one integer in and one integer out: no argument names a user or a post');
select is(
  (select string_agg(r.rolname || ':' || has_function_privilege(r.rolname, p.oid, 'EXECUTE')::text, ', ' order by r.rolname)
     from (values ('anon'), ('app_jobs'), ('app_server'), ('authenticated')) as r(rolname)
     cross join pg_catalog.pg_proc p where p.proname = 'own_post_engagement' and p.pronamespace = 'nestly'::regnamespace),
  'anon:false, app_jobs:false, app_server:false, authenticated:true', '[F11.10-a c1 engage rule 4] only authenticated may call it');
select is(
  (select count(*) from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(p.proacl) a
    where p.proname = 'own_post_engagement' and p.pronamespace = 'nestly'::regnamespace and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0::bigint, '[F11.10-a c1 engage rule 7] EXECUTE is revoked from PUBLIC');
select is(tests.as_role('anon', null, 'select nestly.own_post_engagement(30)::text'), 'ERR:42501', '[F11.10-a c1 engage rule 7] a Guest cannot call it');

-- Its reads: exactly two TO app_owner SELECT policies and one scope insert, each opened only by the call's own nonce.
select is(
  (select string_agg(c.relname || '.' || pol.polname || '.' || pol.polcmd::text || '.'
                     || (select string_agg(r.rolname, '+') from pg_catalog.pg_roles r where r.oid = any (pol.polroles)) || '.' || pol.polpermissive::text || '.'
                     || (q ~ 'trend_scopes' and q ~ 'nestly.engagement_scope' and q ~ 'is_active_account\(\)' and q ~ 'pg_current_xact_id_if_assigned\(\)'
                         and q !~ '(notify_scope|child_data_scope|birthday_scope|auto_hide)')::text, ', ' order by c.relname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
     cross join lateral (select coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') as q) e
    where c.relnamespace = 'nestly'::regnamespace and pol.polname like '%\_within\_engagement'),
  'comments.comments_select_within_engagement.r.app_owner.true.true, reactions.reactions_select_within_engagement.r.app_owner.true.true',
  '[F11.10-a c1 engage §19 rule 17] the two reads are TO app_owner only, read-only, gated by an active caller and open only under the call''s own nonce in trend_scopes');
select is(
  (select q ~ 'liker_status = ''active''' and q ~ 'NOT is_by_author' and q ~ 'post_id IS NOT NULL'
     from (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) as q from pg_catalog.pg_policy pol
            where pol.polname = 'reactions_select_within_engagement' and pol.polrelid = (select c.oid from pg_catalog.pg_class c where c.relname = 'reactions' and c.relnamespace = 'nestly'::regnamespace)) x),
  true, '[F11.10-a c1 engage] reactions_select_within_engagement itself keeps only likes of a post by an active liker who is not the author');
select is(
  (select q ~ 'status = ''active''' and q ~ 'parent_status = ''active''' and q ~ 'author_status = ''active''' and q ~ 'NOT is_by_post_author'
     from (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) as q from pg_catalog.pg_policy pol
            where pol.polname = 'comments_select_within_engagement' and pol.polrelid = (select c.oid from pg_catalog.pg_class c where c.relname = 'comments' and c.relnamespace = 'nestly'::regnamespace)) x),
  true, '[F11.10-a c1 engage] comments_select_within_engagement itself keeps only active comments of active commenters under an active parent, not by the post''s author');
select is(
  (select string_agg(pol.polname || '.' || pol.polcmd::text || '.' || (select string_agg(r.rolname, '+') from pg_catalog.pg_roles r where r.oid = any (pol.polroles))
                     || '.' || (coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'is_active_account\(\)')::text, ', ')
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'trend_scopes' and c.relnamespace = 'nestly'::regnamespace and pol.polname = 'trend_scopes_insert_engagement'),
  'trend_scopes_insert_engagement.a.app_owner.true', '[F11.10-a c1 engage rule 17] the scope row is written by the owner role only (inside the definer), for an active caller');
-- The planner ORs the permissive policies in reverse name order: these two must be the greatest names, so a counted row is decided by
-- them before the reader policies' EXISTS over posts runs (the chain this function exists to skip).
select is(
  (select string_agg(c.relname || '=' || (select max(pol.polname::text collate "C") from pg_catalog.pg_policy pol
                                          where pol.polrelid = c.oid and pol.polpermissive and pol.polcmd in ('r', '*')), ', ' order by c.relname)
     from pg_catalog.pg_class c where c.relnamespace = 'nestly'::regnamespace and c.relname in ('comments', 'reactions')),
  'comments=comments_select_within_engagement, reactions=reactions_select_within_engagement',
  '[F11.10-a c1 engage performance] the scoped reads sort after every other permissive SELECT policy on their tables, so they are tested first');

-- =====================================================================================================================
-- 2. The fixture set
-- =====================================================================================================================
select tests.set_status(pg_temp.id('s'), 'active');
-- A's named post P1: likes by B, C, S and A; comments by B, C, S and A; a comment by B that is later removed, with C's reply under it.
select pg_temp.keep('p1', tests.fx_po_add(pg_temp.id('a')));
select tests.fx_rx_add(pg_temp.id('b'), pg_temp.v('p1'));
select tests.fx_rx_add(pg_temp.id('c'), pg_temp.v('p1'));
select tests.fx_rx_add(pg_temp.id('s'), pg_temp.v('p1'));
select tests.fx_rx_add(pg_temp.id('a'), pg_temp.v('p1'));
select pg_temp.keep('b1', tests.fx_cm_add(pg_temp.id('b'), pg_temp.v('p1'), 'from b'));
select tests.fx_cm_add(pg_temp.id('c'), pg_temp.v('p1'), 'from c');
select tests.fx_cm_add(pg_temp.id('s'), pg_temp.v('p1'), 'from s');
select tests.fx_cm_add(pg_temp.id('a'), pg_temp.v('p1'), 'from the author');
select pg_temp.keep('b2', tests.fx_cm_add(pg_temp.id('b'), pg_temp.v('p1'), 'from b, removed later'));
select tests.fx_cm_add(pg_temp.id('c'), pg_temp.v('p1'), 'a reply under the removed one', pg_temp.v('b2'));
-- A's post P3: a like and a comment from 40 days ago.
select pg_temp.keep('p3', tests.fx_po_add(pg_temp.id('a')));
select tests.fx_fv_ago('reaction', tests.fx_rx_add(pg_temp.id('b'), pg_temp.v('p3')), interval '40 days');
select tests.fx_fv_ago('comment', tests.fx_cm_add(pg_temp.id('c'), pg_temp.v('p3'), 'old'), interval '40 days');
-- A's anonymous post: author_id NULL, the real author in post_authors.
select pg_temp.keep('pa', tests.fx_po_add(pg_temp.id('a'), 'everyone', true));
select tests.fx_rx_add(pg_temp.id('b'), pg_temp.v('pa'));
select tests.fx_cm_add(pg_temp.id('b'), pg_temp.v('pa'), 'on the anonymous post');
-- A's post PR, removed by staff after B liked and commented.
select pg_temp.keep('pr', tests.fx_po_add(pg_temp.id('a')));
select tests.fx_rx_add(pg_temp.id('b'), pg_temp.v('pr'));
select tests.fx_cm_add(pg_temp.id('b'), pg_temp.v('pr'), 'on the removed post');
-- B's post PB, which A sees: A likes it, C comments.
select pg_temp.keep('pb', tests.fx_po_add(pg_temp.id('b')));
select tests.fx_rx_add(pg_temp.id('a'), pg_temp.v('pb'));
select tests.fx_cm_add(pg_temp.id('c'), pg_temp.v('pb'), 'c on b''s post');
-- The Professional's post: B likes, C comments.
select pg_temp.keep('pq', tests.fx_po_add(pg_temp.id('q1')));
select tests.fx_rx_add(pg_temp.id('b'), pg_temp.v('pq'));
select tests.fx_cm_add(pg_temp.id('c'), pg_temp.v('pq'), 'c on the professional''s post');
-- Then: S is suspended (liker_status and author_status follow), B's second comment is removed (the reply's parent_status follows), PR removed.
select tests.set_status(pg_temp.id('s'), 'suspended');
select tests.fx_fv_cs(pg_temp.v('b2'), 'removed');
select tests.fx_po_status(pg_temp.v('pr'), 'removed');

-- =====================================================================================================================
-- 3. What it counts
-- =====================================================================================================================
select is(pg_temp.fn('a', 30), '4',
  '[F11.10-a c1 engage FR-PRO-001 AC-018] A: the likes of B and C and the comments of B and C on A''s post in the last 30 days. Not A''s own like or comment, not the suspended S''s, not a removed comment or the reply under it, not 40 days ago, not on the anonymous post, the removed post or B''s post');
select is(pg_temp.fn('a', 60), '6', '[F11.10-a c1 engage] over 60 days the like and the comment of 40 days ago count too');
select is(pg_temp.fn('a', 1), '4', '[F11.10-a c1 engage] over one day: everything written today');
select is(pg_temp.fn('b', 30), '2', '[F11.10-a c1 engage] B: A''s like and C''s comment on B''s post; nothing of A''s posts, which B also sees');
select is(pg_temp.fn('q1', 30), '2', '[F11.10-a c1 engage FR-PRO-001] the Professional: the like and the comment on its post');
select is(pg_temp.fn('c', 30), '0', '[F11.10-a c1 engage] C has no post: 0');
select is(pg_temp.fn('d', 30) || '/' || pg_temp.fn('m0', 30), '0/0', '[F11.10-a c1 engage] an Admin and a Moderator have no posts: 0');
select is(pg_temp.fn('s', 30), '0', '[F11.10-a c1 engage rule 15] a suspended account gets 0, as every policy refuses it today');

-- The function equals today's statement as the caller, for every caller, over 30 and 60 days.
select is(pg_temp.both(30), 'a:4=4, b:2=2, c:0=0, q1:2=2, d:0=0, m0:0=0, s:0=0',
  '[F11.10-a c1 engage §19] for every caller the function returns exactly what today''s statement counts under the caller''s own RLS (30 days)');
select is(pg_temp.both(60), 'a:6=6, b:2=2, c:0=0, q1:2=2, d:0=0, m0:0=0, s:0=0',
  '[F11.10-a c1 engage §19] the same over 60 days');

-- The two terms of posts_select_viewer the function does not read cannot hold on one's own post: a hide or a report of it is refused.
select is(pg_temp.dml('a', format('insert into nestly.post_hides (post_id) values (%L)', pg_temp.v('p1'))), 'ERR:NS003',
  '[F11.10-a c1 engage] an author cannot hide its own post (so a hide never takes an own post out of today''s count)');
select is(pg_temp.dml('a', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'spam') $q$, pg_temp.v('p1'))), 'ERR:42501',
  '[F11.10-a c1 engage] an author cannot report its own post (so a report never takes an own post out of today''s count)');

-- A user block: B's comment on A's post is hidden from A (comments_block_hide), today and in the function; B's like carries no identity.
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('a')), format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('b')), true),
  'OK:1', '[F11.10-a c1 engage] (setup) A blocks B');
select is(pg_temp.fn('a', 30), '3', '[F11.10-a c1 engage FR-REL-002] after A blocks B, B''s comment no longer counts for A (its like does: a like names no one)');
select is(pg_temp.both(30), 'a:3=3, b:2=2, c:0=0, q1:2=2, d:0=0, m0:0=0, s:0=0',
  '[F11.10-a c1 engage §19] with the block, every caller still gets exactly today''s count');

-- =====================================================================================================================
-- 4. The scope opens nothing outside the call
-- =====================================================================================================================
select is(pg_temp.fn('a', 30), '3', '[F11.10-a c1 engage] (a call)');
select is(tests.fx_pr_count('nestly.trend_scopes'), 0::bigint, '[F11.10-a c1 engage rule 17] the call deletes its scope again: none is left open in the transaction');
select is(coalesce(current_setting('nestly.engagement_scope', true), ''), '', '[F11.10-a c1 engage rule 17] and clears its setting');
select is(pg_temp.dml('a', $q$ insert into nestly.trend_scopes (nonce) values (gen_random_uuid()) $q$), 'ERR:42501',
  '[F11.10-a c1 engage rule 17] a caller cannot write a scope row of its own');
select is(pg_temp.q('a', 'select count(*)::text from nestly.trend_scopes'), 'ERR:42501', '[F11.10-a c1 engage rule 17] nor read one');
select set_config('t.seen', tests.n_as(pg_temp.id('a'), 'nestly.reactions') || '/' || tests.n_as(pg_temp.id('a'), 'nestly.comments'), true);
select set_config('nestly.engagement_scope', gen_random_uuid()::text, true);
select is(tests.n_as(pg_temp.id('a'), 'nestly.reactions') || '/' || tests.n_as(pg_temp.id('a'), 'nestly.comments'), current_setting('t.seen'),
  '[F11.10-a c1 engage rule 17] a caller who sets nestly.engagement_scope itself reads no more likes or comments than before (the TO app_owner reads never apply to it)');
select is(pg_temp.fn('a', 30), '3', '[F11.10-a c1 engage] and the function, called with that setting already set, still counts only the caller''s own engagement');
select set_config('nestly.engagement_scope', '', true);

-- =====================================================================================================================
-- 5. The period
-- =====================================================================================================================
select is(pg_temp.fn('a', 0), 'ERR:22023', '[F11.10-a c1 engage] a period of 0 days is refused');
select is(pg_temp.fn('a', 366), 'ERR:22023', '[F11.10-a c1 engage] a period over 365 days is refused');
select is(pg_temp.q('a', 'select nestly.own_post_engagement(null)::text'), 'ERR:22023', '[F11.10-a c1 engage] no period is refused');
select is(pg_temp.fn('a', 365), '5', '[F11.10-a c1 engage] 365 days is the longest period (A, after the block: everything but B''s comment)');

select * from finish();

rollback;
