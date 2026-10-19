-- =====================================================================================================================
-- Down script for supabase/migrations/20261019400000_professional_posting.sql (I3 PR-A3; .work/professional-posting/schema.md
-- "Rollback"). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the Professional server and web code (PR b) first, then run this.
-- Safe:     only while no posts row (named), comments row or reaction_owners row has an author or liker without a regular_profiles
--           row, i.e. while no Professional has posted, commented or liked. Re-adding the three FKs would fail on such rows anyway; the
--           script refuses first and names the reason. After that, rolling back means deleting those rows first: a DECISION REQUEST.
--           FORCE RLS would hide rows from app_owner, so it is lifted inside this transaction for the check and put back.
-- Restores: posts_insert_author, comments_insert_commenter and reactions_insert_reader verbatim from 20261018100000 /
--           20261018200000; the WITH CHECK of posts_update_author verbatim from 20261018200000; the three FKs to regular_profiles
--           with their original names and ON DELETE CASCADE; drops caller_account_type(); the previous comments verbatim (posts
--           from 20261018100000 / 20261019100000, comments and reaction_owners from 20261018200000 / 20261019100000); deletes only
--           its own history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the professional_posting down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.posts no force row level security;
alter table nestly.comments no force row level security;
alter table nestly.reaction_owners no force row level security;
alter table nestly.regular_profiles no force row level security;

do $$
begin
  if exists (select 1 from nestly.posts p
             where p.author_id is not null
               and not exists (select 1 from nestly.regular_profiles rp where rp.user_id = p.author_id))
     or exists (select 1 from nestly.comments c
                where c.author_id is not null
                  and not exists (select 1 from nestly.regular_profiles rp where rp.user_id = c.author_id))
     or exists (select 1 from nestly.reaction_owners o
                where not exists (select 1 from nestly.regular_profiles rp where rp.user_id = o.user_id)) then
    raise exception 'a posts, comments or reaction_owners row belongs to an account without a regular_profiles row (a Professional wrote it): re-adding the Regular-only FKs would fail, and rolling back means deleting users'' content. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

alter table nestly.regular_profiles force row level security;
alter table nestly.reaction_owners force row level security;
alter table nestly.comments force row level security;
alter table nestly.posts force row level security;

-- 1. Policies, verbatim from 20261018100000 / 20261018200000.
drop policy posts_insert_author on nestly.posts;
create policy posts_insert_author on nestly.posts
  for insert to authenticated
  with check ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and ((not is_anonymous and author_id = (select auth.uid())) or (is_anonymous and author_id is null)));

alter policy posts_update_author on nestly.posts
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

drop policy comments_insert_commenter on nestly.comments;
create policy comments_insert_commenter on nestly.comments
  for insert to authenticated
  with check ((select nestly.is_active_account()) and status = 'active' and author_status = 'active'
    and exists (select 1 from nestly.posts p where p.id = comments.post_id)
    and (author_id = (select auth.uid())
      or (author_id is null and is_by_post_author
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

drop policy reactions_insert_reader on nestly.reactions;
create policy reactions_insert_reader on nestly.reactions
  for insert to authenticated
  with check ((select nestly.is_active_account()) and liker_status = 'active' and (
    (post_id is not null and exists (select 1 from nestly.posts p where p.id = reactions.post_id))
    or (comment_id is not null and exists (select 1 from nestly.comments c where c.id = reactions.comment_id))));

-- 2. The three FKs, original names and actions.
alter table nestly.posts
  add constraint posts_author_id_fkey foreign key (author_id)
    references nestly.regular_profiles (user_id) on delete cascade;
alter table nestly.comments
  add constraint comments_author_id_fkey foreign key (author_id)
    references nestly.regular_profiles (user_id) on delete cascade;
alter table nestly.reaction_owners
  add constraint reaction_owners_user_id_fkey foreign key (user_id)
    references nestly.regular_profiles (user_id) on delete cascade;

-- 3. The helper (no policy references it any more).
drop function nestly.caller_account_type();

-- 4. Comments, verbatim.
comment on table nestly.posts is
  'SRS Post (§13, FR-FEED-001/002/005/006): a post or a share. Visible per posts_select_viewer; author_id is NULL exactly when the post is anonymous (the real author is in post_authors, rule 20). Posting is Regular-only.';
comment on column nestly.posts.author_id is
  'The named author (database default auth.uid(), a Regular profile); NULL on an anonymous post (set by posts_insert_prepare). Readable under posts_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.comments.author_id is
  'The commenter (default auth.uid()); NULL only for the real author of an anonymous post (comments_insert_prepare). Readable under comments_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.reaction_owners.user_id is
  'The liker (default auth.uid(); a Regular profile). Readable only by that liker (reaction_owners_select_owner, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
comment on index nestly.posts_author_id_created_at_idx is 'An author''s own posts, newest first; both author FK cascades.';
comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself as author, or an anonymous post with no author id; the FKs prove a Regular author.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post, or deletes it into the held state (status active to deleted, content_hold).';
comment on policy comments_insert_commenter on nestly.comments is 'An active account comments as itself, or as the real author of an anonymous post it wrote (author_id NULL, marked), on a readable post.';
comment on policy reactions_insert_reader on nestly.reactions is 'An active account likes a readable post or comment.';

delete from supabase_migrations.schema_migrations where version = '20261019400000';

commit;
