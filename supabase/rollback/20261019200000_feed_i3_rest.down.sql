-- =====================================================================================================================
-- Down script for supabase/migrations/20261019200000_feed_i3_rest.sql (I3 rest PR-A; .work/i3-rest-schema/schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Safe:     at any time: no data is written, and every row is valid under the looser old rules. No refuse guard. If F3.5, F3.7 or
--           F3.9 has merged, revert it first only to keep the server's NS002-NS005 mappings meaningful.
-- Effect:   own-post shares allowed again; a share refusal is 42501 again; the hide oracle is back (unknown uuid 23503, own post
--           42501, repeat 23505); a share is editable at the database; report details uncapped.
-- Restores: posts_insert_prepare and post_hides_insert_guard and their comments verbatim from 20261018100000; drops trigger and
--           function posts_update_share_guard; drops reports_details_length_check and restores the reports.details comment verbatim
--           from 20261018200000; deletes only its own history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the feed_i3_rest down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop trigger posts_update_share_guard on nestly.posts;
drop function nestly.posts_update_share_guard();

create or replace function nestly.posts_insert_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  orig record;
begin
  new.is_share := new.shared_post_id is not null;
  if new.is_anonymous then
    new.author_id := null;
    new.anonymous_post_id := new.id;
  else
    new.anonymous_post_id := null;
  end if;
  if new.shared_post_id is not null then
    -- the original, read under the caller's own RLS: unreadable to the sharer looks the same as absent (BR-064/065, VAL-038)
    select p.audience, p.is_anonymous, p.is_share, p.status into orig
      from nestly.posts p where p.id = new.shared_post_id;
    if not found or orig.audience <> 'everyone' or orig.is_anonymous or orig.is_share or orig.status <> 'active' then
      raise exception 'posts: the original cannot be shared' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create or replace function nestly.post_hides_insert_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- a viewer's hide of their own post, named or anonymous, is refused (CRITIC finding 1); both reads run under the caller's RLS
  if exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = new.user_id)
     or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = new.user_id) then
    raise exception 'posts: a post cannot be hidden by its own author' using errcode = '42501';
  end if;
  return new;
end
$$;

comment on function nestly.posts_insert_prepare() is
  'SECURITY INVOKER. Before insert: sets is_share, anonymous_post_id and a NULL author_id on an anonymous post; for a share, reads the original under the caller''s RLS and refuses (42501) one that is friends-only, anonymous, a share, not active or unreadable (BR-064/065, VAL-038).';
comment on function nestly.post_hides_insert_guard() is
  'SECURITY INVOKER. Before insert on post_hides: refuses (42501) a hide of the caller''s own post, named (posts.author_id) or anonymous (post_authors row).';

alter table nestly.reports drop constraint reports_details_length_check;

comment on column nestly.reports.details is 'Optional text; required for other. Its cap comes with F3.7''s validation.';

delete from supabase_migrations.schema_migrations where version = '20261019200000';

commit;
