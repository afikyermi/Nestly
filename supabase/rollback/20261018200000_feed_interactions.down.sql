-- =====================================================================================================================
-- Down script for supabase/migrations/20261018200000_feed_interactions.sql (I3 F3.0b; schema-b.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F3.0b server code first (none exists yet), then run this; F3.0a's down script runs after it.
-- Safe:     only while comments, reactions, reaction_owners and reports hold no row and no post is deleted (held): they are user data,
--           and after the first real row the way back is a forward migration (data-model rule 7). FORCE RLS would hide every row
--           from app_owner, so it is lifted inside this transaction first and the checks are real.
-- Restores: F3.0a's posts_select_viewer and posts_update_author verbatim; drops comments, reactions, reaction_owners, reports, the
--           posts held columns, the app_jobs policies and grants, the eight functions; deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the feed_interactions down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.posts no force row level security;
alter table nestly.comments no force row level security;
alter table nestly.reactions no force row level security;
alter table nestly.reaction_owners no force row level security;
alter table nestly.reports no force row level security;

do $$
begin
  if exists (select 1 from nestly.comments) or exists (select 1 from nestly.reactions)
     or exists (select 1 from nestly.reaction_owners) or exists (select 1 from nestly.reports) then
    raise exception 'comments, reactions, reaction_owners or reports holds a row: rolling back would delete users'' data. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
  if exists (select 1 from nestly.posts where status = 'deleted') then
    raise exception 'a post is deleted (held): rolling back would drop its hold. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

-- the policies of posts that read reports and the held columns: F3.0a's versions back, verbatim
drop policy posts_select_viewer on nestly.posts;
drop policy posts_update_author on nestly.posts;
drop policy posts_select_jobs on nestly.posts;
drop policy posts_delete_jobs on nestly.posts;

create policy posts_select_viewer on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and (audience = 'everyone'
      or author_id = (select auth.uid())
      or exists (
        select 1 from nestly.friendships f
        where f.status = 'accepted' and (
          (f.requester_id = (select auth.uid()) and f.addressee_id = posts.author_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = posts.author_id))))
    and not exists (
      select 1 from nestly.post_hides h where h.user_id = (select auth.uid()) and h.post_id = posts.id));

create policy posts_update_author on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))
  with check ((select nestly.is_active_account()) and status = 'active' and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

comment on policy posts_select_viewer on nestly.posts is
  'An active account reads an active post of an active author: everyone-posts, its own, a friend''s friends-only post (accepted Friendship); never one it hid. Anonymous posts (author_id NULL) are reachable only through everyone (BR-062, rule 15).';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post (column grant); the status cannot be changed.';

revoke update (status) on table nestly.posts from authenticated;
revoke select on table nestly.posts from authenticated;
grant select on table nestly.posts to authenticated;  -- F3.0a's table-level grant back
revoke select, delete on table nestly.posts from app_jobs;
revoke usage on schema nestly from app_jobs;

drop trigger posts_content_hold on nestly.posts;

-- the like policy that reads reaction_owners and the circular like FK first; the other policies go with their tables
drop policy reactions_delete_owner on nestly.reactions;
alter table nestly.reactions drop constraint reactions_owner_fkey;
drop table nestly.reaction_owners;
drop table nestly.reactions;
drop table nestly.reports;
drop table nestly.comments;

alter table nestly.posts
  drop constraint posts_held_check,
  drop constraint posts_body_length_check,
  drop column held_at,
  drop column held_until,
  drop column held_xact;

drop function nestly.content_hold();
drop function nestly.comments_insert_prepare();
drop function nestly.reactions_insert_prepare();
drop function nestly.reactions_insert_owner();
drop function nestly.reports_insert_check();
drop function nestly.delete_post(uuid);
drop function nestly.delete_comment(uuid);
drop function nestly.purge_held_content();

alter table nestly.posts force row level security;

delete from supabase_migrations.schema_migrations where version = '20261018200000';

commit;
