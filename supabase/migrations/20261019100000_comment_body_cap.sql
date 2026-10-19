-- =====================================================================================================================
-- Comment length cap and column comments — I3 F3.3a (comments-likes), schema-only.
--
-- Source: .work/comments-likes/schema.md (Gate 2, ORCHESTRATOR 19.10.2026); spec.md c1.
-- SRS: FR-FEED-003 · BR-062 · platform rule 1.
--
-- comments    gains comments_body_length_check: a comment or reply is at most 1,000 characters (char_length counts code points;
--             shared COMMENT_BODY_MAX must equal it). comments_body_check (non-blank) is unchanged.
-- Comments    nine column comments rewritten: seven said "never granted" for a column a client role can SELECT (the grants are
--             right, RLS limits the rows); two had a stale cap text. No grant, policy, function or data change.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged.
--
-- Phase: expand. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261019100000_comment_body_cap.down.sql.
-- =====================================================================================================================

alter table nestly.comments
  add constraint comments_body_length_check check (char_length(body) <= 1000);

comment on constraint comments_body_length_check on nestly.comments is
  'VAL (F3.3 c1): a comment or reply is at most 1,000 characters; shared COMMENT_BODY_MAX.';

comment on column nestly.posts.author_id is
  'The named author (database default auth.uid(), a Regular profile); NULL on an anonymous post (set by posts_insert_prepare). Readable under posts_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.posts.body is
  'The text, or the sharer''s text on a share; NULL only on a share. At most 2,000 characters (posts_body_length_check).';
comment on column nestly.post_authors.author_id is
  'The real author (default auth.uid(); a Regular profile). Readable only by that author (post_authors_select_author, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.comments.author_id is
  'The commenter (default auth.uid()); NULL only for the real author of an anonymous post (comments_insert_prepare). Readable under comments_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.comments.is_by_post_author is
  'AC-076 "המחבר": set by comments_insert_prepare. Readable under comments_select_viewer (column SELECT grant; the server renders byAuthor from it); no INSERT or UPDATE grant.';
comment on column nestly.comments.body is
  'The text of a comment or a reply: 1-1,000 characters (comments_body_check, comments_body_length_check; shared COMMENT_BODY_MAX).';
comment on column nestly.reactions.is_by_author is
  'The liker is the content''s author (reactions_insert_prepare); the quality count excludes it. Readable under reactions_select_reader (column SELECT grant; ranking SQL reads it); no INSERT or UPDATE grant. Carries no identity. API responses never emit it.';
comment on column nestly.reaction_owners.user_id is
  'The liker (default auth.uid(); a Regular profile). Readable only by that liker (reaction_owners_select_owner, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.reports.reporter_id is
  'The reporter (default auth.uid()); ON DELETE RESTRICT: I9 decides the minimal record. Readable only by that reporter (reports_select_reporter, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
