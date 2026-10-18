-- =====================================================================================================================
-- Author names on readable posts — I3 F3.2 (feed-view), the 6b names policy.
--
-- Source: .work/feed-view/schema.md (Gate 2, ORCHESTRATOR 18.10.2026); Afik 18.10 (6b, final): a reader sees the author's full name
--         on every named post the reader is allowed to see.
-- SRS: FR-FEED-001/005 · BR-062 · platform rules 15, 20.
--
-- regular_names   gains one permissive SELECT policy beside the three existing ones: an active account reads the name of any user
--                 who authored a named post that the account can read itself. Eligibility is delegated to posts_select_viewer
--                 (the EXISTS on posts runs under the caller's RLS). No column, grant or index change; no data written.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. SECURITY INVOKER only, no function, no view.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261018300000_feed_author_names.down.sql.
-- =====================================================================================================================

create policy regular_names_select_post_reader on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.posts p
                where p.author_id = regular_names.user_id and not p.is_anonymous));

comment on policy regular_names_select_post_reader on nestly.regular_names is
  'An active account reads the name of a user who authored a named post that the account can read (posts_select_viewer, via the EXISTS under the caller''s RLS; 6b). Anonymous posts never grant a name: their author_id is NULL (posts_author_id_check) and the real author lives only in post_authors.';
