-- =====================================================================================================================
-- Down script for supabase/migrations/20261026300000_drop_is_help_request.sql: re-adds posts.is_help_request as
-- 20261022400000_professionals.sql created it (boolean not null default false, posts_help_request_check, posts_help_request_created_idx,
-- the authenticated column grants), the edit guards on audience, body, stage_tag, is_help_request, posts_insert_author /
-- posts_update_author with "and not is_help_request" in the Professional branch, and the comments as 20261024000000 left them.
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod: Afik only.
-- Safe:     always: every post gets false (the old values are gone; none was in use since 20261024000000).
-- Restores: the column and everything naming it; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the drop is_help_request down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.posts add column is_help_request boolean not null default false;
alter table nestly.posts add constraint posts_help_request_check check (not (is_help_request and is_share));
create index posts_help_request_created_idx on nestly.posts (created_at desc) where is_help_request and status = 'active';
comment on index nestly.posts_help_request_created_idx is 'Help-request posts, newest first (the Professional''s home).';
grant select (is_help_request), insert (is_help_request), update (is_help_request) on table nestly.posts to authenticated;
comment on column nestly.posts.is_help_request is 'Inert since 20261024000000 (§13.1: no help-request marking; Offer Help no longer reads it). Dropped by a follow-up migration once the code no longer reads or writes it.';

drop trigger posts_reject_staff_edit on nestly.posts;
create trigger posts_reject_staff_edit
  before update of audience, body, stage_tag, is_help_request on nestly.posts
  for each row execute function nestly.reject_staff_edit();
drop trigger posts_reject_group_edit on nestly.posts;
create trigger posts_reject_group_edit
  before update of audience, body, stage_tag, is_help_request on nestly.posts
  for each row execute function nestly.posts_reject_group_edit();

drop policy posts_insert_author on nestly.posts;
create policy posts_insert_author on nestly.posts
  for insert to authenticated
  with check ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and ((not is_anonymous and author_id = (select auth.uid())) or (is_anonymous and author_id is null))
    and (((select nestly.caller_account_type()) = 'regular' and audience in ('everyone', 'friends'))
      or ((select nestly.caller_account_type()) = 'professional'
        and not is_anonymous and audience in ('everyone', 'followers') and stage_tag is null and not is_help_request)));

alter policy posts_update_author on nestly.posts
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid())))
    and (((select nestly.caller_account_type()) = 'regular' and audience in ('everyone', 'friends'))
      or ((select nestly.caller_account_type()) = 'professional'
        and audience in ('everyone', 'followers') and stage_tag is null and not is_help_request)));

comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself, or an anonymous post with no author id. A Regular to everyone or Friends; a Professional only named, to everyone or its followers, with no stage tag and no help marking (VAL-049, AC-130). Admin and Moderator never.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body, tag and help marking of an active post, or deletes it into the held state. The VAL-049 terms of posts_insert_author hold on an edit.';

delete from supabase_migrations.schema_migrations where version = '20261026300000';

commit;
