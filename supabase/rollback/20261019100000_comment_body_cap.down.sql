-- =====================================================================================================================
-- Down script for supabase/migrations/20261019100000_comment_body_cap.sql (I3 F3.3a; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Safe:     at any time: dropping a CHECK only loosens; no data is touched. If F3.3 b1 has merged, revert it first only to keep
--           the server's 422 mapping meaningful (shared Zod still caps).
-- Restores: drops the constraint; restores the nine previous column comments verbatim; deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the comment_body_cap down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.comments drop constraint comments_body_length_check;

comment on column nestly.posts.author_id is
  'The named author (database default auth.uid(), a Regular profile); NULL on an anonymous post (set by posts_insert_prepare). Never granted to a client.';
comment on column nestly.posts.body is
  'The text, or the sharer''s text on a share; NULL only on a share. Length limit: F3.1 (no writer before).';
comment on column nestly.post_authors.author_id is 'The real author (default auth.uid(); a Regular profile). Never granted to a client.';
comment on column nestly.comments.author_id is 'The commenter (default auth.uid()); NULL only for the real author of an anonymous post (comments_insert_prepare). Never granted to a client.';
comment on column nestly.comments.is_by_post_author is 'AC-076 "המחבר": set by comments_insert_prepare, never granted.';
comment on column nestly.comments.body is 'The text; its length cap comes with F3.4''s validation.';
comment on column nestly.reactions.is_by_author is 'The liker is the content''s author (reactions_insert_prepare); the quality count excludes it. Never granted.';
comment on column nestly.reaction_owners.user_id is 'The liker (default auth.uid(); a Regular profile). Never granted to a client.';
comment on column nestly.reports.reporter_id is 'The reporter (default auth.uid()); ON DELETE RESTRICT: I9 decides the minimal record. Never granted to a client.';

delete from supabase_migrations.schema_migrations where version = '20261019100000';

commit;
