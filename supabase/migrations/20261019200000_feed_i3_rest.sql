-- =====================================================================================================================
-- Share and hide guards, share immutability, report text cap — I3 rest (F3.5, F3.7, F3.9), PR-A.
--
-- Source: .work/i3-rest-schema/schema.md (Gate 2, ORCHESTRATOR 19.10.2026, .work/_initiatives/I3-rest-gate1.md). The commenter-names
--         policy (N1, F3.4) is its own migration, 20261019300000_commenter_names.sql (ORCHESTRATOR 19.10: ships separately, after D1).
-- SRS: FR-FEED-006 · FR-MOD-001 · FR-ALG-009 · BR-064/065/066 · platform rules 10, 15.
--
-- posts_insert_prepare      (replaced) for a share: caller gate 42501, then NS002 for every refusal, own post included (FR-FEED-006).
-- post_hides_insert_guard   (replaced) caller gate 42501, unreadable/unknown post NS004, own post NS003; a repeat hide reaches the PK.
-- posts_update_share_guard  (new) a share's audience, body and stage_tag cannot change: NS005.
-- reports          gains reports_details_length_check: details at most 1,000 code points (F3.7 Q1).
-- SQLSTATEs (the server maps by code, never by message): 42501, NS002-NS005, 23514. NS001 stays profile_view's.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. Every function is SECURITY INVOKER, search_path ''.
--
-- Phase: expand. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261019200000_feed_i3_rest.down.sql.
-- =====================================================================================================================

-- 1. S-share: posts_insert_prepare (F3.5 c5, c6). Non-share inserts are unchanged.
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
    -- (a) the caller: this trigger runs before RLS WITH CHECK and the FKs, so without this gate a suspended or Professional caller would
    --     get NS002 or 23503; the own-row policy on regular_profiles already requires is_active_account(). RLS and the FK stay the authority.
    if not exists (select 1 from nestly.regular_profiles rp where rp.user_id = (select auth.uid())) then
      raise exception 'posts: not an active Regular account' using errcode = '42501';
    end if;
    -- (b) the original, read under the caller's own RLS: unreadable to the sharer looks the same as absent (BR-064/065, VAL-038)
    select p.author_id, p.audience, p.is_anonymous, p.is_share, p.status into orig
      from nestly.posts p where p.id = new.shared_post_id;
    -- (c) one code for every refusal, no reason given; own post refused (FR-FEED-006)
    if not found or orig.audience <> 'everyone' or orig.is_anonymous or orig.is_share or orig.status <> 'active'
       or orig.author_id = (select auth.uid()) then
      raise exception 'posts: the original cannot be shared' using errcode = 'NS002';
    end if;
  end if;
  return new;
end
$$;

comment on function nestly.posts_insert_prepare() is
  'SECURITY INVOKER. Before insert: sets is_share, anonymous_post_id and a NULL author_id on an anonymous post. For a share: (a) a caller without a readable own regular_profiles row (not active, or not Regular) -> 42501; (b) reads the original under the caller''s RLS; (c) refuses with NS002 one that is unknown or unreadable, friends-only, anonymous, a share, not active, or the caller''s own post (BR-064/065, VAL-038, FR-FEED-006).';

-- 2. S-hide: post_hides_insert_guard (F3.9 S1-S3). new.user_id is auth.uid() at runtime (user_id is never granted); using new.user_id
--    keeps the postgres fixture tests.fx_ph_add working.
create or replace function nestly.post_hides_insert_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- (a) the caller is an active Regular account (own-row policy on regular_profiles); a Professional's hide is refused too
  if not exists (select 1 from nestly.regular_profiles rp where rp.user_id = new.user_id) then
    raise exception 'posts: not an active Regular account' using errcode = '42501';
  end if;
  -- (b) readability before ownership, under the caller's RLS. An unknown uuid gets the same code as an unreadable post (no FK oracle).
  --     A post the caller already hid is unreadable to them: the second test lets a repeat hide reach the PK (on conflict do nothing).
  if not exists (select 1 from nestly.posts p where p.id = new.post_id)
     and not exists (select 1 from nestly.post_hides h where h.user_id = new.user_id and h.post_id = new.post_id) then
    raise exception 'posts: the post cannot be hidden' using errcode = 'NS004';
  end if;
  -- (c) a viewer's hide of their own post, named or anonymous, is refused; both reads run under the caller's RLS
  if exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = new.user_id)
     or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = new.user_id) then
    raise exception 'posts: a post cannot be hidden by its own author' using errcode = 'NS003';
  end if;
  return new;
end
$$;

comment on function nestly.post_hides_insert_guard() is
  'SECURITY INVOKER. Before insert on post_hides, in this order: (a) the hider has no readable own regular_profiles row (not active, or not Regular) -> 42501; (b) the post is neither readable to the hider (posts_select_viewer) nor already hidden by them -> NS004 (unknown uuid included); (c) the hider''s own post, named (posts.author_id) or anonymous (post_authors row) -> NS003. The table''s own guard; post_hides is never a ranking input.';

-- 3. U-share: a share cannot be edited (F3.5 c3, c8). Status changes (delete into held, content_hold) and the author_status cascade do not
--    name these columns, so the trigger does not fire for them.
create function nestly.posts_update_share_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.audience, new.body, new.stage_tag) is distinct from (old.audience, old.body, old.stage_tag) then
    raise exception 'posts: a share cannot be edited' using errcode = 'NS005';
  end if;
  return new;
end
$$;

revoke execute on function nestly.posts_update_share_guard() from public;

create trigger posts_update_share_guard
  before update of audience, body, stage_tag on nestly.posts
  for each row
  when (old.is_share)
  execute function nestly.posts_update_share_guard();

comment on function nestly.posts_update_share_guard() is
  'SECURITY INVOKER. Before update of audience, body or stage_tag on a share (old.is_share): a change to any of them -> NS005 (the share text is immutable, its tag NULL; F3.5 c3, c8). A no-op update passes. The UPDATE grant on these columns is generic, so the rule holds for every path.';

-- 4. R-cap: report text (F3.7 Q1, c3). Validates existing rows: none are written on main (no report route).
alter table nestly.reports
  add constraint reports_details_length_check check (char_length(details) <= 1000);

comment on constraint reports_details_length_check on nestly.reports is
  'VAL (F3.7 c3, Q1): details is at most 1,000 characters (code points); NULL passes. The server''s Zod refuses first.';

comment on column nestly.reports.details is
  'Optional text; required for other. Not blank (reports_details_check); cap 1,000 code points (reports_details_length_check, F3.7 Q1).';
