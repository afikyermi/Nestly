-- =====================================================================================================================
-- Down script for supabase/migrations/20261022400000_professionals.sql (I11, Professionals and services).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while none of the five new tables holds a row, no Professional account exists, no post is a help request or
--           followers-only, and no conversation has a Professional context (refuses otherwise: data would be lost).
-- Restores: users_insert_own (Regular only), posts_insert_author / posts_update_author as 20261019400000 left them, posts_select_viewer as
--           20261018200000 left it; conversations_insert_party as 20261022100000 left it; the posts and conversations constraints and columns; the
--           triggers, functions and tables go; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the professionals down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only, for
  -- the check; the new tables are dropped below and the others get FORCE back right after it.
  alter table nestly.professional_profiles no force row level security;
  alter table nestly.professional_follows no force row level security;
  alter table nestly.outreach_requests no force row level security;
  alter table nestly.professional_reviews no force row level security;
  alter table nestly.professional_articles no force row level security;
  alter table nestly.users no force row level security;
  alter table nestly.posts no force row level security;
  alter table nestly.conversations no force row level security;
  if exists (select 1 from nestly.professional_profiles) or exists (select 1 from nestly.professional_follows)
     or exists (select 1 from nestly.outreach_requests) or exists (select 1 from nestly.professional_reviews)
     or exists (select 1 from nestly.professional_articles)
     or exists (select 1 from nestly.users where account_type = 'professional')
     or exists (select 1 from nestly.posts where is_help_request or audience = 'followers')
     or exists (select 1 from nestly.conversations where context in ('professional', 'outreach')) then
    raise exception 'a Professional row, a help-request or followers-only post, or a Professional conversation exists: the down script refuses';
  end if;
  alter table nestly.users force row level security;
  alter table nestly.posts force row level security;
  alter table nestly.conversations force row level security;
end
$$;

-- conversations and posts policies back to their earlier text.
drop policy conversations_insert_party on nestly.conversations;
create policy conversations_insert_party on nestly.conversations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select auth.uid()) in (user_a, user_b)
    and a_status = 'active' and b_status = 'active'
    and (case when user_a = (select auth.uid()) then user_b else user_a end) <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and ((context = 'friends' and exists (
           select 1 from nestly.friendships f where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id) = conversations.user_a and greatest(f.requester_id, f.addressee_id) = conversations.user_b))
      or (context = 'request' and exists (
           select 1 from nestly.chat_requests r where r.id = conversations.chat_request_id and r.status = 'accepted'
            and least(r.requester_id, r.target_id) = conversations.user_a and greatest(r.requester_id, r.target_id) = conversations.user_b))));

drop policy posts_select_viewer on nestly.posts;
create policy posts_select_viewer on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    (status = 'active' and author_status = 'active'
      and (audience = 'everyone'
        or author_id = (select auth.uid())
        or exists (
          select 1 from nestly.friendships f
          where f.status = 'accepted' and (
            (f.requester_id = (select auth.uid()) and f.addressee_id = posts.author_id)
            or (f.addressee_id = (select auth.uid()) and f.requester_id = posts.author_id))))
      and not exists (
        select 1 from nestly.post_hides h where h.user_id = (select auth.uid()) and h.post_id = posts.id)
      and not exists (
        select 1 from nestly.reports r where r.reporter_id = (select auth.uid()) and r.post_id = posts.id))
    or (status = 'deleted' and held_xact = pg_catalog.pg_current_xact_id_if_assigned() and (
      author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))));
comment on policy posts_select_viewer on nestly.posts is
  'As F3.0a, plus: a post the viewer reported is not returned to them (7א); the author reads a post they deleted-with-hold only in the holding transaction.';

drop policy posts_insert_author on nestly.posts;
create policy posts_insert_author on nestly.posts
  for insert to authenticated
  with check ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and ((not is_anonymous and author_id = (select auth.uid())) or (is_anonymous and author_id is null))
    and ((select nestly.caller_account_type()) = 'regular'
      or ((select nestly.caller_account_type()) = 'professional'
        and not is_anonymous and audience = 'everyone' and stage_tag is null)));

alter policy posts_update_author on nestly.posts
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid())))
    and ((select nestly.caller_account_type()) = 'regular'
      or ((select nestly.caller_account_type()) = 'professional'
        and audience = 'everyone' and stage_tag is null)));

alter policy users_insert_own on nestly.users
  with check (id = (select auth.uid()) and account_type = 'regular' and status = 'active');

-- columns and constraints.
alter table nestly.conversations drop constraint conversations_outreach_request_id_check;
alter table nestly.conversations drop constraint conversations_context_check;
alter table nestly.conversations add constraint conversations_context_check check (context in ('friends', 'request'));
drop index nestly.conversations_outreach_request_id_idx;
alter table nestly.conversations drop column outreach_request_id;

-- tables, triggers and functions.
drop table nestly.professional_articles;
drop table nestly.professional_reviews;
drop table nestly.outreach_requests;
drop table nestly.professional_follows;
drop table nestly.professional_profiles;

drop function nestly.professional_profiles_update_guard();
drop function nestly.outreach_requests_insert_limit();
drop function nestly.outreach_requests_transition();
drop function nestly.professional_articles_update_guard();

drop index nestly.posts_help_request_created_idx;
alter table nestly.posts drop constraint posts_audience_check;
alter table nestly.posts add constraint posts_audience_check check (not (is_anonymous and audience = 'friends'));
alter table nestly.posts drop constraint posts_audience_value_check;
alter table nestly.posts add constraint posts_audience_value_check check (audience in ('everyone', 'friends'));
alter table nestly.posts drop constraint posts_help_request_check;
alter table nestly.posts drop column is_help_request;


comment on policy users_insert_own on nestly.users is
  'An identity creates its own account, as a regular and active account only (platform rule 14; professional registration widens it in its own Gate 2).';
comment on column nestly.posts.audience is 'OP-033: everyone or friends (friends only).';
comment on column nestly.conversations.context is 'How it opened: friends (an accepted Friendship) or request (an accepted chat request).';
comment on policy conversations_insert_party on nestly.conversations is 'A party opens it while Friends, or from the pair''s accepted request (FR-CHAT-002).';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post, or deletes it into the held state (status active to deleted, content_hold). A Professional''s post stays everyone with no stage tag.';
comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself as author, or an anonymous post with no author id. A Regular account as such; a Professional only a named post to everyone with no stage tag (DR-2, AC-076: never anonymous). Admin and Moderator never. post_authors'' FK keeps anonymous posts Regular-only.';

delete from supabase_migrations.schema_migrations where version = '20261022400000';

commit;
