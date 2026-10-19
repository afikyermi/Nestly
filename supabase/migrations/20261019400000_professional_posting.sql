-- =====================================================================================================================
-- Professional posting, commenting and liking — I3 PR-A3 (professional-posting), migration only.
--
-- Source: .work/professional-posting/schema.md (Gate 2, .work/_initiatives/I3-rest-gate1.md: no `followers` value now); spec.md N1-N4.
-- SRS: FR-FEED-002/003 (Professional actors) · AC-076 · BR-016 · platform rules 1, 15, 16 · Afik 19.10 DR-1..3 and the DR-2 correction.
--
-- caller_account_type()      (new) the caller's own account_type while active, else NULL. SECURITY INVOKER, caller-only (rule 16): it
--                            reads users through users_select_own, so it adds no exception. EXECUTE authenticated only.
-- posts                      drops posts_author_id_fkey (-> regular_profiles); posts_author_status_fkey (-> users) stays and still proves
--                            the author exists and cascades. posts_insert_author: a Regular as before; a Professional only named,
--                            audience everyone, no stage tag. posts_update_author WITH CHECK: the same terms on an edit; USING unchanged.
-- comments                   drops comments_author_id_fkey; comments_insert_commenter adds: the caller is Regular or Professional.
-- reaction_owners            drops reaction_owners_user_id_fkey; reactions_insert_reader adds: the caller is Regular or Professional
--                            (a reaction_owners row exists only with its reactions row, so that gate is the only one needed).
-- Unchanged: post_authors and its FK to regular_profiles (anonymous posts stay Regular-only), every SELECT policy, the share and hide
-- guards (a Professional share or hide stays 42501), delete_post / delete_comment, content_hold, reports, grants.
-- Integrity: the row-level "author is Regular or Professional" guarantee moves from an FK to the policy; only the owner role, which no
-- runtime role is (rule 1), could write a row the policy refuses.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. No data written, no table rewrite.
--
-- Phase: expand. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261019400000_professional_posting.down.sql (refuses once a Professional has posted, commented or liked).
-- =====================================================================================================================

-- 1. The helper. Checks id and status itself rather than trusting the users policy (as is_active_account()).
create function nestly.caller_account_type()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select u.account_type from nestly.users u where u.id = auth.uid() and u.status = 'active'
$$;

revoke execute on function nestly.caller_account_type() from public;
grant  execute on function nestly.caller_account_type() to authenticated;

-- 2. The three FKs to regular_profiles. The status FKs to users stay.
alter table nestly.posts drop constraint posts_author_id_fkey;
alter table nestly.comments drop constraint comments_author_id_fkey;
alter table nestly.reaction_owners drop constraint reaction_owners_user_id_fkey;

-- 3. Policies.
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

drop policy comments_insert_commenter on nestly.comments;
create policy comments_insert_commenter on nestly.comments
  for insert to authenticated
  with check ((select nestly.is_active_account()) and status = 'active' and author_status = 'active'
    and exists (select 1 from nestly.posts p where p.id = comments.post_id)
    and (author_id = (select auth.uid())
      or (author_id is null and is_by_post_author
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid()))))
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

drop policy reactions_insert_reader on nestly.reactions;
create policy reactions_insert_reader on nestly.reactions
  for insert to authenticated
  with check ((select nestly.is_active_account()) and liker_status = 'active' and (
    (post_id is not null and exists (select 1 from nestly.posts p where p.id = reactions.post_id))
    or (comment_id is not null and exists (select 1 from nestly.comments c where c.id = reactions.comment_id)))
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

-- 4. Comments.
comment on function nestly.caller_account_type() is
  'The caller''s own account_type (auth.uid()) while the account is active; NULL otherwise. Caller only: takes no user argument. SECURITY INVOKER, reads users through users_select_own (rule 16). Called as (select nestly.caller_account_type()) by the feed write policies.';
comment on table nestly.posts is
  'SRS Post (§13, FR-FEED-001/002/005/006): a post or a share. Visible per posts_select_viewer; author_id is NULL exactly when the post is anonymous (the real author is in post_authors, rule 20). Regular and Professional accounts post (posts_insert_author); a Professional only named, to everyone, with no stage tag. Anonymous posts and shares are Regular-only.';
comment on column nestly.posts.author_id is
  'The named author (database default auth.uid(), a Regular or Professional account; posts_author_status_fkey proves it in users); NULL on an anonymous post (set by posts_insert_prepare). Readable under posts_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.comments.author_id is
  'The commenter (default auth.uid(), a Regular or Professional account; comments_author_status_fkey proves it in users); NULL only for the real author of an anonymous post (comments_insert_prepare). Readable under comments_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.reaction_owners.user_id is
  'The liker (default auth.uid(), a Regular or Professional account; reaction_owners_liker_status_fkey proves it in users). Readable only by that liker (reaction_owners_select_owner, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
comment on index nestly.posts_author_id_created_at_idx is 'An author''s own posts, newest first; the author status FK cascade.';
comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself as author, or an anonymous post with no author id. A Regular account as such; a Professional only a named post to everyone with no stage tag (DR-2, AC-076: never anonymous). Admin and Moderator never. post_authors'' FK keeps anonymous posts Regular-only.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post, or deletes it into the held state (status active to deleted, content_hold). A Professional''s post stays everyone with no stage tag.';
comment on policy comments_insert_commenter on nestly.comments is
  'An active Regular or Professional account comments as itself, or as the real author of an anonymous post it wrote (author_id NULL, marked), on a readable post. Admin and Moderator never.';
comment on policy reactions_insert_reader on nestly.reactions is
  'An active Regular or Professional account likes a readable post or comment. Admin and Moderator never.';
