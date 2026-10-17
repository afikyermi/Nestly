-- =====================================================================================================================
-- Friendships, Friend Requests, and the names the pair may read — I2 F2.4a (friends).
--
-- Source: .work/friends/schema.md (F2.4a; Gate 2, ORCHESTRATOR 17.10.2026: DR-6 A, DR-7 A, DR-B); spec.md criteria 1-12
--         (DR-3 A silent decline, DR-4 A cancel, DR-5 A inactive counterparty hidden, row kept).
-- SRS: FR-REL-001 · VAL-017 · BR-029 · AC-034 · §13 Friendship · PG-036 (names) · platform rules 8, 10, 12, 13, 15.
--
-- friendships    one row per Friend Request and the Friendship it becomes (§13): pending, accepted, declined, removed.
--                Cancel (DR-4 A) is no status: cancelled_at on a pending or declined row. No DELETE (retention: I9).
--                Each row copies both parties' users.status under composite FKs (ON UPDATE CASCADE), so RLS can show a row
--                only while the other party is active (DR-5 A) without the caller reading the other party's users row.
--                friendships_transition() is the only place that sees OLD and NEW: it lists every legal move and the actor.
-- regular_names  user_id, full_name of each Regular profile, kept equal to regular_profiles by a composite FK and an insert
--                trigger (DR-6 A). Readable by its owner and by the other party of a live pair, so PG-036 can show names
--                without a definer and without exposing the profile row. Backfilled below, in this transaction (DR-B).
-- No SECURITY DEFINER: tests.approved_security_definer() stays F2.3b's list. Both new functions are SECURITY INVOKER.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017160000_friendships.down.sql (refuses while friendships holds a row).
-- =====================================================================================================================

-- 1. FK targets: the composite keys the copies and the names reference.
alter table nestly.users
  add constraint users_id_status_key unique (id, status);

alter table nestly.regular_profiles
  add constraint regular_profiles_user_id_full_name_key unique (user_id, full_name);

-- 2. friendships.
create table nestly.friendships (
  id                uuid        not null default gen_random_uuid()
    constraint friendships_pkey primary key,
  requester_id      uuid        not null default auth.uid(),
  addressee_id      uuid        not null,
  status            text        not null default 'pending'
    constraint friendships_status_check check (status in ('pending', 'accepted', 'declined', 'removed')),
  requester_status  text        not null default 'active',
  addressee_status  text        not null default 'active',
  requested_at      timestamptz not null default now(),
  responded_at      timestamptz,
  cancelled_at      timestamptz,
  removed_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint friendships_addressee_id_check check (addressee_id <> requester_id),
  constraint friendships_cancelled_at_check check (cancelled_at is null or status in ('pending', 'declined')),
  constraint friendships_responded_at_check check ((responded_at is null) = (status = 'pending')),
  constraint friendships_removed_at_check check ((removed_at is null) = (status <> 'removed')),
  constraint friendships_requester_id_fkey foreign key (requester_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint friendships_addressee_id_fkey foreign key (addressee_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint friendships_requester_status_fkey foreign key (requester_id, requester_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint friendships_addressee_status_fkey foreign key (addressee_id, addressee_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

-- At most one live row per unordered pair (VAL-017; c3, c4).
create unique index friendships_pair_live_key on nestly.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status = 'accepted' or (status = 'pending' and cancelled_at is null);

-- Directional: a declined A->B blocks A->B, not B->A (DR-3 A).
create unique index friendships_requester_id_addressee_id_key on nestly.friendships (requester_id, addressee_id)
  where status = 'declined' or (status = 'pending' and cancelled_at is null);

create index friendships_requester_id_idx on nestly.friendships (requester_id);
create index friendships_addressee_id_idx on nestly.friendships (addressee_id);

-- 3. The transition trigger: who may move a row where. SECURITY INVOKER; auth.uid() is the actor.
create function nestly.friendships_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid;
begin
  if (new.id, new.requester_id, new.addressee_id, new.created_at)
     is distinct from (old.id, old.requester_id, old.addressee_id, old.created_at) then
    raise exception 'friendships: immutable column' using errcode = '42501';
  end if;
  -- the status-copy cascade (users.status moved): nothing else changed
  if new.status = old.status and new.cancelled_at is not distinct from old.cancelled_at then
    return new;
  end if;
  me := auth.uid();
  if me = old.addressee_id and old.status = 'pending' and old.cancelled_at is null
     and new.status in ('accepted', 'declined') and new.cancelled_at is null then
    new.responded_at := pg_catalog.now();
  elsif me = old.addressee_id and old.status = 'declined' and new.status = 'pending'
     and new.cancelled_at is not distinct from old.cancelled_at then
    new.responded_at := null;
  elsif me = old.requester_id and old.status in ('pending', 'declined') and old.cancelled_at is null
     and new.status = old.status and new.cancelled_at is not null then
    new.cancelled_at := pg_catalog.now();
  elsif me = old.requester_id and old.status = 'declined' and old.cancelled_at is not null
     and new.status = 'declined' and new.cancelled_at is null then
    new.requested_at := pg_catalog.now();
  elsif me in (old.requester_id, old.addressee_id) and old.status = 'accepted' and new.status = 'removed'
     and new.cancelled_at is null then
    new.removed_at := pg_catalog.now();
  else
    raise exception 'friendships: transition refused' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function nestly.friendships_transition() from public;

create trigger friendships_transition
  before update on nestly.friendships
  for each row execute function nestly.friendships_transition();

-- 4. RLS and grants. The other party's copy must be 'active' for a row to be seen (DR-5 A).
alter table nestly.friendships enable row level security, force row level security;

create policy friendships_select_party on nestly.friendships
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    (requester_id = (select auth.uid()) and addressee_status = 'active')
    or (addressee_id = (select auth.uid()) and requester_status = 'active')));

create policy friendships_insert_requester on nestly.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and (select nestly.is_active_account())
    and status = 'pending' and cancelled_at is null and requester_status = 'active' and addressee_status = 'active');

create policy friendships_update_party on nestly.friendships
  for update to authenticated
  using ((select nestly.is_active_account()) and (
    (requester_id = (select auth.uid()) and addressee_status = 'active')
    or (addressee_id = (select auth.uid()) and requester_status = 'active')))
  with check ((select nestly.is_active_account()) and (
    (requester_id = (select auth.uid()) and addressee_status = 'active')
    or (addressee_id = (select auth.uid()) and requester_status = 'active')));

grant select on table nestly.friendships to authenticated;
grant insert (addressee_id), update (status, cancelled_at) on table nestly.friendships to authenticated;

-- 5. regular_names (DR-6 A).
create table nestly.regular_names (
  user_id    uuid not null default auth.uid()
    constraint regular_names_pkey primary key,
  full_name  text not null,
  constraint regular_names_user_id_full_name_fkey foreign key (user_id, full_name)
    references nestly.regular_profiles (user_id, full_name) on update cascade on delete cascade
);

-- Backfill (DR-B): one row per profile. FORCE is lifted for this transaction only (ACCESS EXCLUSIVE until commit), so the
-- owner reads every row; it is put back before the table is used. regular_names has no RLS yet at this point.
alter table nestly.regular_profiles no force row level security;
insert into nestly.regular_names (user_id, full_name) select user_id, full_name from nestly.regular_profiles;
alter table nestly.regular_profiles force row level security;

alter table nestly.regular_names enable row level security, force row level security;

create policy regular_names_select_party on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    user_id = (select auth.uid())
    or exists (
      select 1 from nestly.friendships f
      where f.cancelled_at is null and (
        (f.requester_id = (select auth.uid()) and f.addressee_id = regular_names.user_id
          and f.status in ('pending', 'declined', 'accepted'))
        or (f.addressee_id = (select auth.uid()) and f.requester_id = regular_names.user_id
          and f.status in ('pending', 'accepted'))))));

create policy regular_names_insert_own on nestly.regular_names
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

grant select on table nestly.regular_names to authenticated;
grant insert (user_id, full_name) on table nestly.regular_names to authenticated;

create function nestly.regular_names_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.regular_names (user_id, full_name) values (new.user_id, new.full_name);
  return null;
end
$$;

revoke execute on function nestly.regular_names_insert() from public;

create trigger regular_profiles_name_insert
  after insert on nestly.regular_profiles
  for each row execute function nestly.regular_names_insert();

-- 6. Comments.
comment on table nestly.friendships is
  'SRS Friendship / Friend Request (§13, FR-REL-001, VAL-017): one row per request and the Friendship it becomes. Cancel is cancelled_at, not a status (DR-4 A). No DELETE: retention is I9.';
comment on column nestly.friendships.requester_id is
  'Who sent the request; set by the database from auth.uid() (rule 12), never by the client.';
comment on column nestly.friendships.addressee_id is
  'Who received it; a Regular profile (FK). The only column a client may INSERT.';
comment on column nestly.friendships.status is
  'pending, accepted, declined or removed (§13). Moves only through friendships_transition(). Never returned by an API: a decline stays silent for the requester (DR-3 A).';
comment on column nestly.friendships.requester_status is
  'Copy of the requester''s users.status (ON UPDATE CASCADE): a row is shown only while the other party''s copy is active (DR-5 A).';
comment on column nestly.friendships.addressee_status is
  'Copy of the addressee''s users.status (ON UPDATE CASCADE): see requester_status.';
comment on column nestly.friendships.requested_at is
  'When the request was sent; a silent re-send after a cancelled decline refreshes it (DR-3 A).';
comment on column nestly.friendships.responded_at is
  'When the addressee accepted or declined; NULL exactly while pending.';
comment on column nestly.friendships.cancelled_at is
  'When the requester withdrew a pending or declined request (DR-4 A); NULL otherwise.';
comment on column nestly.friendships.removed_at is
  'When either party removed the Friendship; NULL exactly unless status is removed.';
comment on column nestly.friendships.created_at is
  'When the row was created; immutable.';
comment on index nestly.friendships_pair_live_key is
  'At most one live row (accepted, or pending and not cancelled) per unordered pair (VAL-017).';
comment on index nestly.friendships_requester_id_addressee_id_key is
  'A declined or open pending A->B blocks another A->B, not B->A (DR-3 A).';
comment on function nestly.friendships_transition() is
  'SECURITY INVOKER. Refuses every friendships UPDATE that is not a legal move by its actor (addressee accepts or declines, requester cancels, either removes; DR-3, DR-4, DR-7), stamps the clocks, and lets the status-copy cascade through (FR-REL-001, rule 11).';
comment on policy friendships_select_party on nestly.friendships is
  'An active account reads the rows it is a party to, while the other party is active (DR-5 A, rule 15).';
comment on policy friendships_insert_requester on nestly.friendships is
  'An active account inserts a pending, uncancelled request naming itself as requester; the FKs prove the addressee is an active Regular account (AC-034, BR-029).';
comment on policy friendships_update_party on nestly.friendships is
  'A party updates a row it can read; which move, and by whom, is decided by friendships_transition().';
comment on table nestly.regular_names is
  'The full name of each Regular profile, readable by the owner and by the other party of a live pair (DR-6 A, PG-036). Kept equal to regular_profiles.full_name by a composite FK and an insert trigger.';
comment on column nestly.regular_names.user_id is
  'The profile''s owner; defaults to auth.uid() (rule 12).';
comment on column nestly.regular_names.full_name is
  'Equal to regular_profiles.full_name (composite FK, ON UPDATE CASCADE).';
comment on function nestly.regular_names_insert() is
  'SECURITY INVOKER trigger function: a new regular_profiles row writes its regular_names row (DR-6 A).';
comment on policy regular_names_select_party on nestly.regular_names is
  'An active account reads its own name and the name of the other party of a request it sent (pending, declined, accepted) or received (pending, accepted), never a cancelled one (DR-3 A, DR-5 A).';
comment on policy regular_names_insert_own on nestly.regular_names is
  'An active account inserts its own name row (the registration trigger); the composite FK proves it equals the profile''s.';
comment on constraint users_id_status_key on nestly.users is
  'FK target of the status copies in friendships (id and status are never both reused).';
comment on constraint regular_profiles_user_id_full_name_key on nestly.regular_profiles is
  'FK target of regular_names (DR-6 A).';
