-- =====================================================================================================================
-- Commenter names on readable comments — I3 F3.4 (anonymous-post), N1 (PR-A2).
--
-- Source: .work/i3-rest-schema/schema.md (Gate 2, ORCHESTRATOR 19.10.2026) "N1"; Afik 19.10 Q7 B: a stranger sees the full name of a
--         commenter whose comment the stranger can read. Split from 20261019200000_feed_i3_rest.sql (ORCHESTRATOR 19.10) so it ships
--         after D1: main's "[F3.3-b1 c7]" null-name assertions are superseded by this policy.
-- SRS: FR-FEED-003 · BR-062 · platform rules 15, 20.
--
-- regular_names   gains regular_names_select_comment_reader (permissive SELECT, 5 policies in all): an active account reads the name of
--                 a user who wrote a comment or reply the account can read. Eligibility is delegated to comments_select_viewer (the
--                 EXISTS on comments runs under the caller's RLS). A NULL author_id ("המחבר") never grants a name. Recursion:
--                 regular_names -> comments -> posts -> friendships, post_hides, reports, post_authors; none of them reads regular_names.
-- No column, grant or index change (authenticated already holds column SELECT on comments.author_id); no data written.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged.
--
-- Phase: expand (changes what main's comments repository returns; no code change). Applied by the Supabase CLI as app_owner, in one
-- transaction with its history row. Down script: supabase/rollback/20261019300000_commenter_names.down.sql.
-- =====================================================================================================================

create policy regular_names_select_comment_reader on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.comments c
                where c.author_id = regular_names.user_id));

comment on policy regular_names_select_comment_reader on nestly.regular_names is
  'An active account reads the name of a user who wrote a comment or reply that the account can read (comments_select_viewer, via the EXISTS under the caller''s RLS: post readability, held/deleted, parent and commenter status; Afik 19.10 Q7 B). The real author of an anonymous post comments with author_id NULL ("המחבר"), which never equals a user id: no name, post_authors untouched.';
