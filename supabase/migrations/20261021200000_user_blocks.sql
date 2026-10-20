-- =====================================================================================================================
-- Blocking a user — I4 (FR-REL-002, BR-080, AC-126).
--
-- user_blocks  one row per block: who blocked whom. The block is mutual in effect: while a row exists for a pair, in either direction,
--              each side no longer sees the other's posts, comments, names or profile, and no new Friend Request passes between them.
--              Either party reads the row (the database has to evaluate it for the other party's reads); only the blocker writes it
--              (insert, delete = unblock). A new block ends the Friendship and any open request of the pair (trigger, the blocker's rights).
-- is_blocked_pair(uuid)   SECURITY INVOKER, stable: is there a block between the caller and the other account, either direction.
-- RESTRICTIVE policies    posts, comments, regular_names (authenticated); regular_names, regular_profiles (app_owner: profile_view, search,
--                         notification definers) and friendships (insert/update). They AND with every permissive policy, so no existing
--                         policy changes. A Permission-Key holder with REPORTS_VIEW is never hidden from (a block cannot shield content from
--                         moderation), nor is staff reading names on the admin screens. Only a Regular or Professional account blocks.
-- One scoped TO app_owner SELECT policy on user_blocks: open only inside a declared notification, search or profile-view scope, so the
--              definers of I7 and profile_view can exclude blocked pairs in both directions.
-- Known limit: an anonymous post has no author_id readable by anyone, so a block cannot hide it.
-- notify_deliver (SECURITY INVOKER helper of the notification definers) skips a notification across a block; the definers are unchanged.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261021200000_user_blocks.down.sql (refuses while user_blocks holds a row).
-- =====================================================================================================================

create table nestly.user_blocks (
  blocker_id uuid        not null default auth.uid()
    constraint user_blocks_blocker_id_fkey references nestly.users (id) on delete cascade,
  blocked_id uuid        not null
    constraint user_blocks_blocked_id_fkey references nestly.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_check check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_id_idx on nestly.user_blocks (blocked_id);

-- Is there a block between the caller and the other account? Runs under the caller's rights (the select policy shows both parties the row).
create function nestly.is_blocked_pair(p_other uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_other is not null and exists (
    select 1 from nestly.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = p_other))
$$;

revoke execute on function nestly.is_blocked_pair(uuid) from public;
grant execute on function nestly.is_blocked_pair(uuid) to authenticated, app_owner;

-- A new block ends the Friendship and the open requests of the pair, with the blocker's own rights (friendships_transition decides).
create function nestly.user_blocks_end_relations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update nestly.friendships f set status = 'removed'
    where f.status = 'accepted'
      and ((f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
        or (f.addressee_id = new.blocker_id and f.requester_id = new.blocked_id));
  update nestly.friendships f set status = 'declined'
    where f.status = 'pending' and f.cancelled_at is null
      and f.addressee_id = new.blocker_id and f.requester_id = new.blocked_id;
  update nestly.friendships f set cancelled_at = pg_catalog.now()
    where f.status = 'pending' and f.cancelled_at is null
      and f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id;
  return new;
end
$$;

revoke execute on function nestly.user_blocks_end_relations() from public;

create trigger user_blocks_end_relations
  after insert on nestly.user_blocks
  for each row execute function nestly.user_blocks_end_relations();

alter table nestly.user_blocks enable row level security, force row level security;

create policy user_blocks_select_party on nestly.user_blocks
  for select to authenticated
  using ((select nestly.is_active_account()) and ((select auth.uid()) in (blocker_id, blocked_id)));

create policy user_blocks_insert_blocker on nestly.user_blocks
  for insert to authenticated
  with check ((select nestly.caller_account_type()) in ('regular', 'professional') and blocker_id = (select auth.uid()));

create policy user_blocks_delete_blocker on nestly.user_blocks
  for delete to authenticated
  using ((select nestly.is_active_account()) and blocker_id = (select auth.uid()));

create policy user_blocks_select_scoped on nestly.user_blocks
  for select to app_owner
  using (((select nestly.notify_scope()) is not null or (select nestly.search_scope()) is not null
          or (select nestly.profile_view_target()) is not null)
    and (select auth.uid()) in (blocker_id, blocked_id));

grant select on table nestly.user_blocks to authenticated;
grant insert (blocked_id), delete on table nestly.user_blocks to authenticated;

-- Hiding. RESTRICTIVE: each ANDs with the permissive policies already on the table.
create policy posts_block_hide on nestly.posts
  as restrictive for select to authenticated
  using (author_id is null or author_id = (select auth.uid()) or (select nestly.has_permission('REPORTS_VIEW'))
    or not (select nestly.is_blocked_pair(author_id)));

create policy comments_block_hide on nestly.comments
  as restrictive for select to authenticated
  using (author_id is null or author_id = (select auth.uid()) or (select nestly.has_permission('REPORTS_VIEW'))
    or not (select nestly.is_blocked_pair(author_id)));

create policy regular_names_block_hide on nestly.regular_names
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not (select nestly.is_blocked_pair(user_id))
    or (pg_catalog.current_setting('nestly.staff_view', true) = 'on'
        and ((select nestly.has_permission('USER_VIEW')) or (select nestly.has_permission('REPORTS_VIEW')))));

create policy regular_names_block_hide_owner on nestly.regular_names
  as restrictive for select to app_owner
  using (user_id = (select auth.uid()) or not (select nestly.is_blocked_pair(user_id)));

create policy regular_profiles_block_hide_owner on nestly.regular_profiles
  as restrictive for select to app_owner
  using (user_id = (select auth.uid()) or not (select nestly.is_blocked_pair(user_id)));

-- No Friend Request across a block; a request already there can still end (decline, cancel, remove), never open or accept.
create policy friendships_block_insert on nestly.friendships
  as restrictive for insert to authenticated
  with check (not (select nestly.is_blocked_pair(addressee_id)));

create policy friendships_block_update on nestly.friendships
  as restrictive for update to authenticated
  with check (status in ('removed', 'declined') or cancelled_at is not null
    or not (select nestly.is_blocked_pair(case when requester_id = (select auth.uid()) then addressee_id else requester_id end)));

-- A notification never passes across a block (either direction). notify_deliver is the SECURITY INVOKER helper the notification definers
-- run (every actor they pass is the caller or NULL); the definers themselves are unchanged. Identical to the I7 body but for the block check.
create or replace function nestly.notify_deliver(p_recipient uuid, p_type text, p_category text, p_actor uuid,
                                                 p_target_kind text, p_target_id uuid, p_subject uuid, p_is_critical boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_recipient is null then
    return;
  end if;
  if p_actor is not null and exists (
    select 1 from nestly.user_blocks b
    where (b.blocker_id = p_recipient and b.blocked_id = p_actor) or (b.blocker_id = p_actor and b.blocked_id = p_recipient)) then
    return;
  end if;
  if not p_is_critical and exists (
    select 1 from nestly.notification_preferences p
    where p.user_id = p_recipient and p.category = p_category and not p.is_in_app_enabled) then
    return;
  end if;
  insert into nestly.notifications (recipient_id, type, actor_id, target_kind, target_id, subject_id, is_critical)
  values (p_recipient, p_type, p_actor, p_target_kind, p_target_id, p_subject, p_is_critical)
  on conflict (recipient_id, type, subject_id) do nothing;
end
$$;

comment on table nestly.user_blocks is
  'FR-REL-002 (BR-080): a block, mutual in effect. Both parties read the row; only the blocker inserts and deletes (unblock). No UPDATE. A new row ends the Friendship and open requests (trigger). Separate from Chat Block (FR-SERV-009).';
comment on column nestly.user_blocks.blocker_id is 'Who blocked; the caller on insert.';
comment on column nestly.user_blocks.blocked_id is 'Who was blocked.';
comment on function nestly.is_blocked_pair(uuid) is 'True when the caller and the other account have a block between them, in either direction. SECURITY INVOKER; used by the RESTRICTIVE hiding policies.';
comment on function nestly.user_blocks_end_relations() is 'Trigger on user_blocks insert: ends the pair''s Friendship and open Friend Requests with the blocker''s own rights. SECURITY INVOKER.';
comment on policy user_blocks_select_scoped on nestly.user_blocks is 'TO app_owner, open only inside a declared notification, search or profile-view scope and only on the caller''s own pairs: lets those definers exclude blocked pairs in both directions.';
comment on policy user_blocks_select_party on nestly.user_blocks is 'Both parties read the row (the hiding policies evaluate it for either side).';
comment on policy user_blocks_insert_blocker on nestly.user_blocks is 'An active Regular or Professional account blocks, in its own name.';
comment on policy user_blocks_delete_blocker on nestly.user_blocks is 'Only the blocker lifts the block (unblock).';
comment on policy posts_block_hide on nestly.posts is 'RESTRICTIVE: a post of the other party of a block is hidden, both ways; never from REPORTS_VIEW (a block cannot shield content from moderation). An anonymous post cannot be hidden.';
comment on policy comments_block_hide on nestly.comments is 'RESTRICTIVE: a comment of the other party of a block is hidden, both ways; never from REPORTS_VIEW.';
comment on policy regular_names_block_hide on nestly.regular_names is 'RESTRICTIVE: the other party''s name is hidden, both ways; not from staff on the admin screens.';
comment on policy regular_names_block_hide_owner on nestly.regular_names is 'RESTRICTIVE, app_owner: inside search_people and profile_view the other party of a block is not found (user_blocks is readable to app_owner only in those scopes).';
comment on policy regular_profiles_block_hide_owner on nestly.regular_profiles is 'RESTRICTIVE, app_owner: profile_view does not open the profile of the other party of a block.';
comment on policy friendships_block_insert on nestly.friendships is 'RESTRICTIVE: no Friend Request across a block.';
comment on policy friendships_block_update on nestly.friendships is 'RESTRICTIVE: across a block a request or Friendship can only end, never open or be accepted.';
