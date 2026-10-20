-- =====================================================================================================================
-- Blocking a user — I4 (FR-REL-002, BR-011).
--
-- user_blocks  one row per block: who blocked whom, when, and when it was lifted (an unblock keeps the row, so the daily block limit
--              cannot be reset by unblocking). While an unlifted row exists for a pair, in either direction, each side no longer sees
--              the other's posts, comments, name or profile, finds no Friend Request or notification from the other, and their
--              Friendship and open requests end at the block (trigger, the blocker's rights). Only an active Regular or Professional
--              account blocks, and only an active Regular or Professional account can be blocked (composite FKs to users: never staff).
--              Both parties read an unlifted row (the database evaluates it for either side); the blocker also reads its lifted ones.
--              At most 20 blocks per account in 24 hours (NS021), so a block cannot be used to read names in bulk.
-- block_peer_ids()   SECURITY INVOKER, stable, no argument: the accounts in an unlifted block with the caller, either direction, once
--                    per statement. The restrictive policies test `<> all (...)` against it.
-- RESTRICTIVE policies (TO authenticated; app_owner inherits them inside the definers, so profile_view, search_people and the
--                    notification definers exclude blocked pairs too): posts, comments, regular_names, regular_profiles, friendships
--                    (insert, update). A REPORTS_VIEW holder is never hidden from (a block cannot shield content from moderation), nor is
--                    a name on the admin screens or inside the audited reveal (nestly.reveal_user).
-- regular_names_select_blocker   the blocker reads the names of the accounts it blocked (its blocked list, to unblock).
-- notify_deliver     (SECURITY INVOKER helper of the notification definers) skips a notification across a block; the definers are unchanged.
-- Known limit: an anonymous post has no author_id readable by anyone, so a block cannot hide it.
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261021250000_user_blocks.down.sql (refuses while user_blocks holds a row).
-- =====================================================================================================================

create table nestly.user_blocks (
  id                   uuid        not null default gen_random_uuid()
    constraint user_blocks_pkey primary key,
  blocker_id           uuid        not null default auth.uid()
    constraint user_blocks_blocker_id_fkey references nestly.users (id) on delete cascade,
  blocked_id           uuid        not null,
  blocked_account_type text        not null
    constraint user_blocks_blocked_account_type_check check (blocked_account_type in ('regular', 'professional')),
  blocked_status       text        not null default 'active',
  created_at           timestamptz not null default now(),
  lifted_at            timestamptz,
  constraint user_blocks_blocked_fkey foreign key (blocked_id, blocked_account_type)
    references nestly.users (id, account_type) on delete cascade,
  constraint user_blocks_blocked_status_fkey foreign key (blocked_id, blocked_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint user_blocks_distinct_check check (blocker_id <> blocked_id),
  constraint user_blocks_lifted_check check (lifted_at is null or lifted_at >= created_at)
);

create unique index user_blocks_active_pair_key on nestly.user_blocks (blocker_id, blocked_id) where lifted_at is null;
create index user_blocks_blocked_id_idx on nestly.user_blocks (blocked_id) where lifted_at is null;
create index user_blocks_blocker_created_idx on nestly.user_blocks (blocker_id, created_at);

-- The accounts in an unlifted block with the caller, either direction. Runs under the caller's rights (the select policy shows both parties
-- the row); one call per statement through `(select ...)`.
create function nestly.block_peer_ids()
returns uuid[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(case when b.blocker_id = (select auth.uid()) then b.blocked_id else b.blocker_id end), '{}'::uuid[])
  from nestly.user_blocks b
  where b.lifted_at is null and (select auth.uid()) in (b.blocker_id, b.blocked_id)
$$;

revoke execute on function nestly.block_peer_ids() from public;
grant execute on function nestly.block_peer_ids() to authenticated;

-- At most 20 blocks per account in 24 hours (lifted ones included): a block shows the blocked account's name to the blocker.
create function nestly.user_blocks_insert_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from nestly.user_blocks b
       where b.blocker_id = new.blocker_id and b.created_at > pg_catalog.now() - interval '24 hours') >= 20 then
    raise exception 'user_blocks: too many blocks in 24 hours' using errcode = 'NS021';
  end if;
  return new;
end
$$;

revoke execute on function nestly.user_blocks_insert_limit() from public;

create trigger user_blocks_insert_limit
  before insert on nestly.user_blocks
  for each row execute function nestly.user_blocks_insert_limit();

-- An unblock sets lifted_at once, to the database clock; a lifted block stays lifted. (A status change of the blocked account reaches
-- blocked_status by the cascade and changes nothing else.)
create function nestly.user_blocks_lift_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.lifted_at is not null then
    new.lifted_at := old.lifted_at;
  elsif new.lifted_at is not null then
    new.lifted_at := pg_catalog.now();
  end if;
  return new;
end
$$;

revoke execute on function nestly.user_blocks_lift_guard() from public;

create trigger user_blocks_lift_guard
  before update on nestly.user_blocks
  for each row execute function nestly.user_blocks_lift_guard();

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

revoke all on table nestly.user_blocks from public, anon, authenticated;
grant select on table nestly.user_blocks to authenticated;
grant insert (blocked_id, blocked_account_type) on table nestly.user_blocks to authenticated;
grant update (lifted_at) on table nestly.user_blocks to authenticated;

create policy user_blocks_select_party on nestly.user_blocks
  for select to authenticated
  using ((select nestly.is_active_account()) and (select auth.uid()) in (blocker_id, blocked_id)
    and (lifted_at is null or blocker_id = (select auth.uid())));

create policy user_blocks_insert_blocker on nestly.user_blocks
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.caller_account_type()) in ('regular', 'professional')
    and blocker_id = (select auth.uid()) and lifted_at is null);

create policy user_blocks_update_blocker on nestly.user_blocks
  for update to authenticated
  using ((select nestly.is_active_account()) and blocker_id = (select auth.uid()) and lifted_at is null)
  with check (blocker_id = (select auth.uid()) and lifted_at is not null);

-- Hiding. RESTRICTIVE: each ANDs with the permissive policies already on the table (and, inside the definers, with app_owner's).
create policy posts_block_hide on nestly.posts
  as restrictive for select to authenticated
  using (author_id is null or author_id = (select auth.uid()) or (select nestly.has_permission('REPORTS_VIEW'))
    or author_id <> all ((select nestly.block_peer_ids())));

create policy comments_block_hide on nestly.comments
  as restrictive for select to authenticated
  using (author_id is null or author_id = (select auth.uid()) or (select nestly.has_permission('REPORTS_VIEW'))
    or author_id <> all ((select nestly.block_peer_ids())));

-- The blocker reads the names of the accounts it blocked (its blocked list, to unblock); nothing else of them.
create policy regular_names_select_blocker on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.user_blocks b
                 where b.blocker_id = (select auth.uid()) and b.blocked_id = regular_names.user_id and b.lifted_at is null));

create policy regular_names_block_hide on nestly.regular_names
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or user_id <> all ((select nestly.block_peer_ids()))
    or user_id::text = pg_catalog.current_setting('nestly.reveal_user', true)
    or exists (select 1 from nestly.user_blocks b
                where b.blocker_id = (select auth.uid()) and b.blocked_id = regular_names.user_id and b.lifted_at is null)
    or (pg_catalog.current_setting('nestly.staff_view', true) = 'on'
        and ((select nestly.has_permission('USER_VIEW')) or (select nestly.has_permission('REPORTS_VIEW')))));

create policy regular_profiles_block_hide on nestly.regular_profiles
  as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or user_id <> all ((select nestly.block_peer_ids())));

-- No Friend Request across a block; a request already there can still end (decline, cancel, remove), never open or accept.
create policy friendships_block_insert on nestly.friendships
  as restrictive for insert to authenticated
  with check (addressee_id <> all ((select nestly.block_peer_ids())));

create policy friendships_block_update on nestly.friendships
  as restrictive for update to authenticated
  with check (status in ('removed', 'declined') or cancelled_at is not null
    or (case when requester_id = (select auth.uid()) then addressee_id else requester_id end) <> all ((select nestly.block_peer_ids())));

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
    where b.lifted_at is null
      and ((b.blocker_id = p_recipient and b.blocked_id = p_actor) or (b.blocker_id = p_actor and b.blocked_id = p_recipient))) then
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
  'FR-REL-002: a block, mutual in effect while lifted_at is NULL. Both parties read an unlifted row, the blocker also its lifted ones; only the blocker inserts and lifts (unblock). No delete: a lifted row still counts toward the 20 blocks per 24 hours. A new row ends the Friendship and open requests (trigger). Separate from Chat Block (FR-SERV-009).';
comment on column nestly.user_blocks.id is 'Row id.';
comment on column nestly.user_blocks.blocker_id is 'Who blocked; the caller on insert.';
comment on column nestly.user_blocks.blocked_id is 'Who was blocked: an active Regular or Professional account (the two foreign keys), never staff.';
comment on column nestly.user_blocks.blocked_account_type is 'The blocked account''s type, regular or professional; with blocked_id a foreign key to users (id, account_type).';
comment on column nestly.user_blocks.blocked_status is 'The blocked account''s status: active at the block (default, never granted; the foreign key proves it), then kept by the cascade.';
comment on column nestly.user_blocks.created_at is 'When the block was made; counts toward the daily limit.';
comment on column nestly.user_blocks.lifted_at is 'When the blocker unblocked; set once by the database. NULL while the block is in force.';
comment on index nestly.user_blocks_active_pair_key is 'One block in force per pair and direction.';
comment on index nestly.user_blocks_blocked_id_idx is 'The blocked side''s lookups (block_peer_ids, the cascade).';
comment on index nestly.user_blocks_blocker_created_idx is 'The blocker''s list and the daily limit.';
comment on function nestly.block_peer_ids() is 'The accounts in a block in force with the caller, either direction. SECURITY INVOKER, no argument; used by the RESTRICTIVE hiding policies once per statement.';
comment on function nestly.user_blocks_insert_limit() is 'Trigger before insert: at most 20 blocks by one account in 24 hours, lifted ones included (NS021). SECURITY INVOKER.';
comment on function nestly.user_blocks_lift_guard() is 'Trigger before update: lifted_at is set once, to the database clock, and never cleared. SECURITY INVOKER.';
comment on function nestly.user_blocks_end_relations() is 'Trigger on user_blocks insert: ends the pair''s Friendship and open Friend Requests with the blocker''s own rights. SECURITY INVOKER.';
comment on policy user_blocks_select_party on nestly.user_blocks is 'Both parties read a block in force (the hiding policies evaluate it for either side); the blocker also reads its lifted blocks.';
comment on policy user_blocks_insert_blocker on nestly.user_blocks is 'An active Regular or Professional account blocks, in its own name.';
comment on policy user_blocks_update_blocker on nestly.user_blocks is 'Only the blocker lifts its block in force (unblock); the trigger sets the time.';
comment on policy posts_block_hide on nestly.posts is 'RESTRICTIVE: a post of the other party of a block is hidden, both ways; never from REPORTS_VIEW (a block cannot shield content from moderation). An anonymous post cannot be hidden.';
comment on policy comments_block_hide on nestly.comments is 'RESTRICTIVE: a comment of the other party of a block is hidden, both ways; never from REPORTS_VIEW.';
comment on policy regular_names_select_blocker on nestly.regular_names is 'The blocker reads the names of the accounts it blocked (the blocked list in Settings, to unblock).';
comment on policy regular_names_block_hide on nestly.regular_names is 'RESTRICTIVE: the other party''s name is hidden, both ways (search_people and profile_view included); not from the blocker''s own blocked list, staff on the admin screens, or the audited reveal.';
comment on policy regular_profiles_block_hide on nestly.regular_profiles is 'RESTRICTIVE: profile_view does not open the profile of the other party of a block.';
comment on policy friendships_block_insert on nestly.friendships is 'RESTRICTIVE: no Friend Request across a block.';
comment on policy friendships_block_update on nestly.friendships is 'RESTRICTIVE: across a block a request or Friendship can only end, never open or be accepted.';
