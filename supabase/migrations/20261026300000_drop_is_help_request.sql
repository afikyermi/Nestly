-- =====================================================================================================================
-- I11 completion C follow-up: drop posts.is_help_request (the contract phase of 20261024000000_help_offers_reviews.sql) — migration only.
--
-- Why. Afik 24.10.2026 (§13.1; OP-038 closed): there is no "asking for help" marking; Offer Help goes on any post the Professional may
--      read. The column has been inert since 20261024000000 (no outreach_requests policy reads it), and the code on main neither reads nor
--      writes it (apps/ and packages/ name it nowhere; Drizzle stopped declaring it). This removes it and everything that names it.
--
-- Changes: posts_insert_author and posts_update_author lose "and not is_help_request" from the Professional branch; nothing else in
--          their text changes (USING of posts_update_author is untouched). The two edit guards posts_reject_staff_edit and
--          posts_reject_group_edit are recreated on audience, body, stage_tag (the columns they had before 20261022400000). Then the index
--          posts_help_request_created_idx, the check posts_help_request_check and the column go; its column grants go with it.
--          The two policy comments drop "help marking". No other policy, function or view names the column (pg_depend).
-- Data:    the column's values are discarded; every one is false or meaningless since 20261024000000 (no screen sets or shows it).
-- No new table, policy, grant or SECURITY DEFINER. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261026300000_drop_is_help_request.down.sql (re-adds the column boolean not null default false, its
--              check, index, grants, the guard column lists, both policies and the comments as they were; old markings are not restored).
-- =====================================================================================================================

-- 1. posts policies: the Professional branch no longer names the marking ------------------------------------------------------
drop policy posts_insert_author on nestly.posts;
create policy posts_insert_author on nestly.posts
  for insert to authenticated
  with check ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and ((not is_anonymous and author_id = (select auth.uid())) or (is_anonymous and author_id is null))
    and (((select nestly.caller_account_type()) = 'regular' and audience in ('everyone', 'friends'))
      or ((select nestly.caller_account_type()) = 'professional'
        and not is_anonymous and audience in ('everyone', 'followers') and stage_tag is null)));

alter policy posts_update_author on nestly.posts
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid())))
    and (((select nestly.caller_account_type()) = 'regular' and audience in ('everyone', 'friends'))
      or ((select nestly.caller_account_type()) = 'professional'
        and audience in ('everyone', 'followers') and stage_tag is null)));

comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself, or an anonymous post with no author id. A Regular to everyone or Friends; a Professional only named, to everyone or its followers, with no stage tag (VAL-049, AC-130). Admin and Moderator never.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post, or deletes it into the held state. The VAL-049 terms of posts_insert_author hold on an edit.';

-- 2. The edit guards: staff and Group managers never edit what an author wrote (I4, I10) ---------------------------------------
drop trigger posts_reject_staff_edit on nestly.posts;
create trigger posts_reject_staff_edit
  before update of audience, body, stage_tag on nestly.posts
  for each row execute function nestly.reject_staff_edit();
drop trigger posts_reject_group_edit on nestly.posts;
create trigger posts_reject_group_edit
  before update of audience, body, stage_tag on nestly.posts
  for each row execute function nestly.posts_reject_group_edit();

-- 3. The column, its index and its check (the column grants are dropped with it) ----------------------------------------------
drop index nestly.posts_help_request_created_idx;
alter table nestly.posts drop constraint posts_help_request_check;
alter table nestly.posts drop column is_help_request;
