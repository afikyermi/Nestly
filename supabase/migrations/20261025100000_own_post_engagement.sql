-- =====================================================================================================================
-- own_post_engagement(integer) — the Professional dashboard's engagement count without the RLS chain — migration only.
--
-- SRS: FR-PRO-001, AC-018, VAL-032 (the dashboard shows the caller's own aggregates only: "likes and comments by others on my posts in
--      the last 30 days"). decisions-in-force.md §19 (Afik 25.10.2026): a SECURITY DEFINER that returns only a number needs no approval of
--      Afik's when pgTAP proves it counts nothing beyond the caller's own rights (supabase/tests/109_own_post_engagement.sql) and a separate
--      code review runs before the merge.
--
-- Why. The dashboard counts today, as the caller, under the caller's RLS:
--        (select count(*) from nestly.reactions x join nestly.posts p on p.id = x.post_id
--           where p.author_id = auth.uid() and not x.is_by_author and x.created_at > now() - interval '30 days')
--      + (select count(*) from nestly.comments m join nestly.posts p on p.id = m.post_id
--           where p.author_id = auth.uid() and not m.is_by_post_author and m.created_at > now() - interval '30 days')
--      Every reaction and comment row re-checks its post through reactions_select_reader / comments_select_viewer, whose EXISTS over posts
--      runs the posts policies again for that one row (104-1545 ms on Production, 25.10). The answer is one number about the caller's own
--      posts, so a definer may compute it once per own post instead of once per row — and must return exactly what the caller counts today.
--
-- 1. own_post_engagement(p_days integer) returns integer   SECURITY DEFINER, owner app_owner, search_path ''. No argument names a user or a
--      post: it counts for auth.uid() only. NULL auth.uid() or an inactive account (is_active_account(): suspended, banned, stale session)
--      returns 0, as today's statement does (every policy it passes through is gated by is_active_account()). p_days outside 1..365 raises
--      22023 (the child_tracker_trends precedent). EXECUTE authenticated only. Any active account may call it: an Admin, a Moderator or an
--      account with no post gets 0.
--      What it counts, over the caller's own posts, the same as the caller's policies decide today:
--        posts      author_id = auth.uid(), status 'active', author_status 'active' — posts_select_viewer's own branch. Its two other terms
--                   cannot hold on one's own post: a hide of one's own post is refused (post_hides_insert_guard, NS003) and so is a report
--                   of it (reports_insert_check, 42501); 109 pins both refusals, so the function does not read post_hides or reports.
--                   An anonymous post has author_id NULL (post_authors holds its real author, rule 20): today's statement counts none of
--                   its likes or comments for the author, and neither does this (it never reads post_authors).
--                   The held branch (status 'deleted', held_xact = this transaction) is left out on purpose: it matches only inside the
--                   transaction that deleted the post, which the dashboard's read never is; a deleted post has no engagement to show.
--        reactions  on the post itself (post_id; a like of a comment is not counted, as today), liker_status 'active', not is_by_author —
--                   reactions_select_reader. A like carries no identity, so a user block does not hide it, today or here.
--        comments   status 'active', parent_status 'active', author NULL or author_status 'active', not is_by_post_author —
--                   comments_select_viewer's first branch. Its own-comment branch (status active, author = caller) adds nothing: the
--                   caller's comment on its own post is always is_by_post_author (comments_insert_prepare). Its held branch matches only in
--                   the deleting transaction and is the caller's own comment anyway.
--        window     created_at > now() - p_days days (30 for the dashboard).
--      The RESTRICTIVE select policies TO authenticated still apply inside the definer (app_owner inherits authenticated; FORCE RLS), so
--      the block hide (comments_block_hide), the group hide (posts_group_hide, comments_group_hide) and the ten-identical-reports hide
--      (posts_auto_hide, comments_auto_hide) narrow this count exactly as they narrow today's. Their lookups are keyed by the caller's own id
--      or the row's own group / report_auto_hides row, so app_owner's wider reads change none of them (a wider read of report_auto_hides
--      can only hide more, and none is open outside its own definer's nonce).
--      The other permissive SELECT policies add nothing to this count: *_staff, *_staff_review, *_analytics (staff or analytics settings),
--      posts_select_group_held / comments_select_group_held (held rows in the deleting transaction), *_own_moderated (hidden / removed rows
--      during an own delete), *_notify, *_reveal, *_auto_hide (TO app_owner, each behind its own definer's scope) — each only opens rows
--      the statement's own conditions above exclude (not active, not the caller's post, not on a post), or rows no runtime role opens.
--      Because the statement states every condition itself, a wider policy (a caller who set nestly.notify_scope, say) changes nothing.
-- 2. Its reads: reactions_select_within_engagement and comments_select_within_engagement, TO app_owner, open only while the call holds its
--      own scope — a random nonce it writes to trend_scopes for its own transaction (trend_scopes_insert_engagement: an active account),
--      names in nestly.engagement_scope for its one statement, then clears and deletes (the I14 / child-birthday pattern). No runtime role is
--      app_owner and none reads or writes trend_scopes, so a caller who sets the setting itself opens nothing. Each policy also carries the
--      statement's own row conditions and is_active_account(). They read no other table per row: the post check is the statement's join,
--      run once per own post under the posts policies. Named *_select_within_engagement so that, of the permissive policies Postgres ORs
--      for a row, these are tested first (the relcache lists them in reverse name order) and a counted row skips the reader's EXISTS chain.
--      Posts need no new policy: the caller's own active posts are already open to it (posts_select_viewer).
--
-- No table, no column, no data. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261025100000_own_post_engagement.down.sql. The code that calls it follows after migrate.yml (schema before code).
-- =====================================================================================================================

-- 1. The scope row: only an app_owner definer writes it, for this transaction, for an active caller.
create policy trend_scopes_insert_engagement on nestly.trend_scopes
  for insert to app_owner
  with check (xact = pg_catalog.pg_current_xact_id() and (select nestly.is_active_account()));

-- 2. The two scoped reads. The EXISTS over trend_scopes names no column of the row, so it runs once per statement.
create policy reactions_select_within_engagement on nestly.reactions
  for select to app_owner
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.trend_scopes s
                 where s.xact = pg_catalog.pg_current_xact_id_if_assigned()
                   and s.nonce::text = pg_catalog.current_setting('nestly.engagement_scope', true))
    and post_id is not null and liker_status = 'active' and not is_by_author);

create policy comments_select_within_engagement on nestly.comments
  for select to app_owner
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.trend_scopes s
                 where s.xact = pg_catalog.pg_current_xact_id_if_assigned()
                   and s.nonce::text = pg_catalog.current_setting('nestly.engagement_scope', true))
    and status = 'active' and parent_status = 'active' and (author_id is null or author_status = 'active') and not is_by_post_author);

-- 3. The function.
create function nestly.own_post_engagement(p_days integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_nonce uuid := pg_catalog.gen_random_uuid();
  v_since timestamptz;
  n bigint;
begin
  if v_me is null or not nestly.is_active_account() then
    return 0;
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'own_post_engagement: the period is 1 to 365 days' using errcode = '22023';
  end if;
  v_since := pg_catalog.now() - pg_catalog.make_interval(days => p_days);
  insert into nestly.trend_scopes (nonce) values (v_nonce);
  perform pg_catalog.set_config('nestly.engagement_scope', v_nonce::text, true);
  select (select count(*)
            from nestly.posts p
            join nestly.reactions x on x.post_id = p.id
           where p.author_id = v_me and p.status = 'active' and p.author_status = 'active'
             and x.liker_status = 'active' and not x.is_by_author
             and x.created_at > v_since)
       + (select count(*)
            from nestly.posts p
            join nestly.comments m on m.post_id = p.id
           where p.author_id = v_me and p.status = 'active' and p.author_status = 'active'
             and m.status = 'active' and m.parent_status = 'active' and (m.author_id is null or m.author_status = 'active')
             and not m.is_by_post_author
             and m.created_at > v_since)
    into n;
  perform pg_catalog.set_config('nestly.engagement_scope', '', true);
  delete from nestly.trend_scopes where nonce = v_nonce;
  return n::integer;
end
$$;

revoke execute on function nestly.own_post_engagement(integer) from public;
grant  execute on function nestly.own_post_engagement(integer) to authenticated;

-- 4. Comments.
comment on function nestly.own_post_engagement(integer) is
  'FR-PRO-001, AC-018, VAL-032: the number of likes and comments by others in the last p_days days (1 to 365, else 22023) on the caller''s own posts, exactly what the caller''s own policies count: its active named posts (an anonymous post counts none, as today), likes of active likers but its own, active comments of active commenters under an active parent but its own; the restrictive block, group and identical-reports hides apply as they do to the caller. NULL or inactive caller: 0. No argument names a user or a post; nothing but the number leaves it. SECURITY DEFINER (decisions-in-force.md §19, Afik 25.10.2026: a number only, pgTAP file 109 and a separate review), owner app_owner, pinned search_path; reads only through reactions_select_within_engagement and comments_select_within_engagement, opened while it holds its nonce in trend_scopes (nestly.engagement_scope).';
comment on policy trend_scopes_insert_engagement on nestly.trend_scopes is 'decisions-in-force.md §19: own_post_engagement() writes its nonce for this transaction, for an active caller.';
comment on policy reactions_select_within_engagement on nestly.reactions is 'decisions-in-force.md §19: own_post_engagement() (its nonce scope) reads likes of a post by an active liker who is not the author; the statement keeps only the caller''s own active posts.';
comment on policy comments_select_within_engagement on nestly.comments is 'decisions-in-force.md §19: own_post_engagement() (its nonce scope) reads active comments of active commenters under an active parent, not by the post''s author; the statement keeps only the caller''s own active posts.';
