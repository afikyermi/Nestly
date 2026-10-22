-- =====================================================================================================================
-- Group rules — I10 completion C, migration only (Afik 21.10.2026 evening, decisions-in-force.md §11.13–11.17).
--
-- SRS: FR-GRP-001..003, FR-ALG-010, FR-FEED-001, BR-041, BR-059, BR-060, AC-036..038, AC-050, AC-066, VAL-035, §13 GroupInvitation,
--      GroupMemberEnforcement, OP-045..048 · platform rules 8, 10, 12, 15-17.
--
-- group_highlight_configurations  v2 (BR-059, versioned): the threshold is a share of the Group's active members, within bounds — 5%,
--                                 rounded up, at least 3 and at most 20 likes and comments by others (§11.17). v1 (a fixed 5) stays as
--                                 history, inactive. nestly.group_highlight_threshold(members) reads the active version.
-- group_highlights                a group post that reached the threshold (one row per post, kept when members later leave: the ⭐ of
--                                 OP-048). Written only by notify_group() at the threshold; read by the Group's members only (the main
--                                 feed shows their Groups' Highlights, FR-GRP-001, §11.13). A pinned post is a Highlight by itself (it is
--                                 read from the Group's pin, not stored here).
-- group_invitations               any member invites an active Friend (§11.15). In a Private Group an invitation by a member below Group
--                                 Admin waits (awaiting_approval) until the Owner or a Group Admin approves it (then pending: the invitee
--                                 sees it) or rejects it; the invitee never sees one that waits or was rejected. A muted member invites
--                                 no one.
-- group_member_enforcements       the Group's enforcement history (§11.16): warn_mute (a notice with a reason, and read-only for 24 hours
--                                 or 7 days), remove_block (out of the Group and blocked, in one statement) and unblock. By a Group
--                                 Moderator or higher, against a lower Role (unblock: a Role not lower than the blocker's). Read by the
--                                 member it names and by the Group's Moderators and higher. Never updated or deleted by a client.
-- group_members                   no plain removal of another member: a manager's delete needs the member's block (remove + block).
-- posts, comments, reactions      a muted member writes no post, comment or like in the Group (the RESTRICTIVE group insert policies).
-- group_suggestions               a muted member recommends the Group to no one.
-- regular_names                   the Group's managers read the names of invitees awaiting approval and of members in its enforcement
--                                 history (regular_names_select_group_manager).
-- notify_group()                  replaced (the approved definer, rule 17; decisions-in-force.md §9.3): refuses the invitation of a user
--                                 blocked from the Group (NS028; scope group opens group_bans_select_notify), the threshold of v2, the
--                                 Highlight row, an invitation awaiting approval (to the Owner and Admins), its approval (to the invitee
--                                 and the inviter) or rejection (to the inviter), and the mute notice (to the member, critical). Scope
--                                 `group` also opens group_highlights_insert_notify (TO app_owner).
--
-- No new SECURITY DEFINER. Phase: expand for the code on main (its block, unblock, invite and notification paths keep working; a plain
-- removal of a member now changes nothing, by decision). Down script: supabase/rollback/20261023800000_group_rules.down.sql (refuses once
-- an enforcement row or an invitation that waited for approval exists).
-- =====================================================================================================================

-- 1. The Highlights threshold, version 2 (BR-059: a change is a new version, by migration) ------------------------------------
alter table nestly.group_highlight_configurations
  alter column engagement_threshold drop not null,
  add column member_percent    integer
    constraint group_highlight_configurations_percent_check check (member_percent between 1 and 100),
  add column minimum_threshold integer
    constraint group_highlight_configurations_minimum_check check (minimum_threshold between 1 and 1000),
  add column maximum_threshold integer
    constraint group_highlight_configurations_maximum_check check (maximum_threshold between 1 and 1000),
  add constraint group_highlight_configurations_rule_check check (
    (engagement_threshold is null) = (member_percent is not null)
    and (member_percent is null) = (minimum_threshold is null)
    and (member_percent is null) = (maximum_threshold is null)
    and (minimum_threshold is null or minimum_threshold <= maximum_threshold));

-- FORCE RLS holds the owner to the client policies (no write policy exists): lifted for these two statements, inside this transaction.
alter table nestly.group_highlight_configurations no force row level security;
update nestly.group_highlight_configurations set is_active = false where version = 1;
insert into nestly.group_highlight_configurations (version, engagement_threshold, member_percent, minimum_threshold, maximum_threshold, is_active, reason)
values (2, null, 5, 3, 20, true,
  'Afik 21.10.2026 (decisions-in-force 11.17): a group post is a highlight when likes and comments by others reach 5% of the active members, rounded up, at least 3 and at most 20');
alter table nestly.group_highlight_configurations force row level security;

-- The threshold of a Group with p_members active members, by the active version. Deterministic, no ML (BR-060).
create function nestly.group_highlight_threshold(p_members integer)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when c.engagement_threshold is not null then c.engagement_threshold
           else least(c.maximum_threshold,
                      greatest(c.minimum_threshold, ceil(c.member_percent::numeric * greatest(coalesce(p_members, 0), 0) / 100)::integer))
         end
    from nestly.group_highlight_configurations c
   where c.is_active
$$;

revoke execute on function nestly.group_highlight_threshold(integer) from public;
grant execute on function nestly.group_highlight_threshold(integer) to authenticated;

-- 2. group_highlights -------------------------------------------------------------------------------------------------------
create table nestly.group_highlights (
  post_id               uuid        not null
    constraint group_highlights_pkey primary key,
  group_id              uuid        not null
    constraint group_highlights_group_id_fkey references nestly.groups (id) on delete cascade,
  threshold             integer     not null
    constraint group_highlights_threshold_check check (threshold between 1 and 1000),
  member_count          integer     not null
    constraint group_highlights_member_count_check check (member_count >= 0),
  configuration_version integer     not null
    constraint group_highlights_configuration_version_fkey references nestly.group_highlight_configurations (version),
  reached_at            timestamptz not null default now(),
  constraint group_highlights_post_fkey foreign key (post_id, group_id) references nestly.posts (id, group_id) on delete cascade
);

create index group_highlights_group_id_idx on nestly.group_highlights (group_id, reached_at desc);

-- Backfill (data-model.md 'Backfills', computed): the group posts that already reach the v2 threshold of their Group's active members today, so
-- the Highlights told under v1 are not lost from the main feed. As owner, before RLS is enabled on the new table; FORCE is lifted on the
-- sources for this statement only, inside this transaction, and put back at once.
alter table nestly.posts no force row level security;
alter table nestly.reactions no force row level security;
alter table nestly.comments no force row level security;
alter table nestly.groups no force row level security;
alter table nestly.group_members no force row level security;
alter table nestly.group_highlight_configurations no force row level security;
insert into nestly.group_highlights (post_id, group_id, threshold, member_count, configuration_version)
select p.id, p.group_id, nestly.group_highlight_threshold(m.n), m.n, 2
  from nestly.posts p
  join nestly.groups g on g.id = p.group_id and g.status = 'active'
  cross join lateral (select count(*)::integer as n from nestly.group_members gm where gm.group_id = p.group_id and gm.member_status = 'active') m
 where p.group_id is not null and p.status = 'active'
   and (select count(*) from nestly.reactions x where x.post_id = p.id and not x.is_by_author)
     + (select count(*) from nestly.comments c where c.post_id = p.id and c.status = 'active' and not c.is_by_post_author)
     >= nestly.group_highlight_threshold(m.n);
alter table nestly.posts force row level security;
alter table nestly.reactions force row level security;
alter table nestly.comments force row level security;
alter table nestly.groups force row level security;
alter table nestly.group_members force row level security;
alter table nestly.group_highlight_configurations force row level security;

alter table nestly.group_highlights enable row level security, force row level security;
revoke all on table nestly.group_highlights from public, anon, authenticated;

-- Read: the Group's members (the main feed of a member; a non-member, staff included, reads none: no activity leaks, §11.13).
create policy group_highlights_select_member on nestly.group_highlights
  for select to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) > 0);

-- Write: notify_group() only, at the threshold (scope `group`); no client writes.
create policy group_highlights_insert_notify on nestly.group_highlights
  for insert to app_owner
  with check ((select nestly.notify_scope()) = 'group');

grant select (post_id, group_id, threshold, member_count, configuration_version, reached_at) on table nestly.group_highlights to authenticated;

-- 3. group_member_enforcements ---------------------------------------------------------------------------------------------------
create table nestly.group_member_enforcements (
  id           uuid        not null default gen_random_uuid()
    constraint group_member_enforcements_pkey primary key,
  group_id     uuid        not null
    constraint group_member_enforcements_group_id_fkey references nestly.groups (id) on delete cascade,
  user_id      uuid        not null
    constraint group_member_enforcements_user_id_fkey references nestly.users (id) on delete cascade,
  kind         text        not null
    constraint group_member_enforcements_kind_check check (kind in ('warn_mute', 'remove_block', 'unblock')),
  reason_key   text
    constraint group_member_enforcements_reason_key_check check (reason_key in ('offensive', 'spam', 'off_topic', 'privacy', 'rules', 'other')),
  reason_text  text
    constraint group_member_enforcements_reason_text_check check (reason_text is null or (reason_text ~ '[^[:space:]]' and char_length(reason_text) <= 500)),
  mute_hours   integer
    constraint group_member_enforcements_mute_hours_check check (mute_hours in (24, 168)),
  mute_until   timestamptz,
  actor_id     uuid        default auth.uid()
    constraint group_member_enforcements_actor_id_fkey references nestly.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  created_xact xid8        not null default pg_catalog.pg_current_xact_id(),
  constraint group_member_enforcements_shape_check check (
    (kind = 'warn_mute') = (mute_hours is not null)
    and (mute_hours is null) = (mute_until is null)
    and (kind = 'unblock') = (reason_key is null)
    and coalesce(reason_key = 'other', false) = (reason_text is not null)),
  constraint group_member_enforcements_pair_check check (actor_id is null or actor_id <> user_id)
);

create index group_member_enforcements_group_id_idx on nestly.group_member_enforcements (group_id, created_at desc);
create index group_member_enforcements_user_id_idx on nestly.group_member_enforcements (user_id, group_id, created_at desc);
create index group_member_enforcements_actor_id_idx on nestly.group_member_enforcements (actor_id) where actor_id is not null;

-- BEFORE INSERT: the mute's end is the database's clock plus the chosen duration. AFTER INSERT: the action itself, with the caller's own
-- rights in the same statement (remove_block: the block, which ends the Membership, group_bans_remove; unblock: the block lifted, or the
-- record is refused when there was none the caller may lift).
create function nestly.group_member_enforcements_apply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if tg_when = 'BEFORE' then
    new.created_at := pg_catalog.now();
    new.created_xact := pg_catalog.pg_current_xact_id();
    new.mute_until := case when new.kind = 'warn_mute' then pg_catalog.now() + pg_catalog.make_interval(hours => new.mute_hours) end;
    return new;
  end if;
  if new.kind = 'remove_block' then
    insert into nestly.group_bans (group_id, user_id) values (new.group_id, new.user_id);
  elsif new.kind = 'unblock' then
    delete from nestly.group_bans b where b.group_id = new.group_id and b.user_id = new.user_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'group_member_enforcements: no block the caller may lift' using errcode = '42501';
    end if;
  end if;
  return null;
end
$$;

revoke execute on function nestly.group_member_enforcements_apply() from public;

create trigger group_member_enforcements_prepare
  before insert on nestly.group_member_enforcements
  for each row execute function nestly.group_member_enforcements_apply();

create trigger group_member_enforcements_apply
  after insert on nestly.group_member_enforcements
  for each row execute function nestly.group_member_enforcements_apply();

alter table nestly.group_member_enforcements enable row level security, force row level security;
revoke all on table nestly.group_member_enforcements from public, anon, authenticated;

-- Read: the member it names (their own notice and its end), and the Group's Moderators and higher (the history, ⭐ OP-047).
create policy group_member_enforcements_select_party on nestly.group_member_enforcements
  for select to authenticated
  using ((select nestly.is_active_account()) and (user_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 2));

-- Insert: a Group Moderator or higher of an active Group, never on oneself. warn_mute: a member of a lower Role. remove_block: a user of a
-- lower Role (a non-member counts as none). unblock: a blocked user whose block was made by a Role not higher than the caller's.
create policy group_member_enforcements_insert_manager on nestly.group_member_enforcements
  for insert to authenticated
  with check ((select nestly.is_active_account()) and actor_id = (select auth.uid()) and user_id <> (select auth.uid())
    and nestly.my_group_rank(group_id) >= 2
    and exists (select 1 from nestly.groups g where g.id = group_member_enforcements.group_id and g.status = 'active')
    and case kind
      when 'warn_mute' then exists (select 1 from nestly.group_members m
                                     where m.group_id = group_member_enforcements.group_id and m.user_id = group_member_enforcements.user_id
                                       and nestly.group_role_rank(m.role) < nestly.my_group_rank(group_member_enforcements.group_id))
      when 'remove_block' then coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                                          where m.group_id = group_member_enforcements.group_id and m.user_id = group_member_enforcements.user_id), 0)
                               < nestly.my_group_rank(group_id)
      when 'unblock' then exists (select 1 from nestly.group_bans b
                                   where b.group_id = group_member_enforcements.group_id and b.user_id = group_member_enforcements.user_id)
      else false
    end);

-- actor_id is not readable (the member is never told which manager acted; the history shows the action, the reason and the time).
grant select (id, group_id, user_id, kind, reason_key, reason_text, mute_hours, mute_until, created_at)
  on table nestly.group_member_enforcements to authenticated;
grant insert (group_id, user_id, kind, reason_key, reason_text, mute_hours) on table nestly.group_member_enforcements to authenticated;

-- 4. Invitations by any member, with approval in a Private Group ----------------------------------------------------------------
alter table nestly.group_invitations
  drop constraint group_invitations_status_check,
  drop constraint group_invitations_decided_check,
  add column needs_approval boolean     not null default false,
  add column approved_by    uuid
    constraint group_invitations_approved_by_fkey references nestly.users (id) on delete set null,
  add column approved_at    timestamptz;
alter table nestly.group_invitations
  add constraint group_invitations_status_check
    check (status in ('awaiting_approval', 'pending', 'accepted', 'declined', 'cancelled', 'rejected')),
  add constraint group_invitations_decided_check
    check ((status in ('awaiting_approval', 'pending')) = (decided_at is null) and (decided_at is null) = (decided_xact is null)),
  add constraint group_invitations_approval_check
    check ((needs_approval or (status not in ('awaiting_approval', 'rejected') and approved_at is null))
       and (status <> 'awaiting_approval' or approved_at is null));

drop index nestly.group_invitations_pending_key;
create unique index group_invitations_pending_key on nestly.group_invitations (group_id, invitee_id) where status in ('awaiting_approval', 'pending');
create index group_invitations_awaiting_idx on nestly.group_invitations (group_id) where status = 'awaiting_approval';
create index group_invitations_approved_by_idx on nestly.group_invitations (approved_by) where approved_by is not null;

-- An invitation by a member below Group Admin in a Private Group waits for approval; any other starts pending. Read under the caller's RLS.
create function nestly.group_invitations_route()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.needs_approval := coalesce((select g.privacy = 'private' from nestly.groups g where g.id = new.group_id), false)
                        and nestly.my_group_rank(new.group_id) < 3;
  new.status := case when new.needs_approval then 'awaiting_approval' else 'pending' end;
  new.approved_by := null;
  new.approved_at := null;
  return new;
end
$$;

-- An invitation moves once from each state: awaiting_approval -> pending (approved by the Owner or a Group Admin), rejected (by them) or
-- cancelled; pending -> accepted or declined (the invitee) or cancelled. The approver, times and transaction are the database's; a blocked
-- user is never approved and never accepts (NS028); an invitation whose inviter left, or whose invitee is already a member, is not approved.
create or replace function nestly.group_invitations_decide()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.group_id, new.inviter_id, new.invitee_id, new.created_at, new.needs_approval)
       is distinct from (old.id, old.group_id, old.inviter_id, old.invitee_id, old.created_at, old.needs_approval)
     or not ((old.status = 'pending' and new.status in ('accepted', 'declined', 'cancelled'))
          or (old.status = 'awaiting_approval' and new.status in ('pending', 'rejected', 'cancelled'))) then
    raise exception 'group_invitations: an invitation is answered once' using errcode = '42501';
  end if;
  if new.status in ('pending', 'rejected') and current_user = 'authenticated' and nestly.my_group_rank(old.group_id) < 3 then
    raise exception 'group_invitations: only the Owner or a Group Admin approves an invitation' using errcode = '42501';
  end if;
  if new.status in ('accepted', 'pending')
     and exists (select 1 from nestly.group_bans b where b.group_id = new.group_id and b.user_id = new.invitee_id) then
    raise exception 'group_invitations: the user is blocked from the Group' using errcode = 'NS028';
  end if;
  if new.status = 'pending'
     and (not exists (select 1 from nestly.group_members m where m.group_id = new.group_id and m.user_id = new.inviter_id)
       or exists (select 1 from nestly.group_members m where m.group_id = new.group_id and m.user_id = new.invitee_id)) then
    raise exception 'group_invitations: the invitation is no longer valid (the inviter left, or the invitee is a member)' using errcode = '42501';
  end if;
  if new.status = 'pending' then
    new.approved_by := auth.uid();
    new.approved_at := pg_catalog.now();
    return new;
  end if;
  if new.status = 'rejected' then
    new.approved_by := auth.uid();
  end if;
  new.decided_at := pg_catalog.now();
  new.decided_xact := pg_catalog.pg_current_xact_id();
  return new;
end
$$;

revoke execute on function nestly.group_invitations_route() from public;

create trigger group_invitations_route
  before insert on nestly.group_invitations
  for each row execute function nestly.group_invitations_route();

drop policy group_invitations_select_party on nestly.group_invitations;
drop policy group_invitations_insert_manager on nestly.group_invitations;
drop policy group_invitations_update_manager on nestly.group_invitations;

-- Read: the inviter and the Group's Owner and Admins; the invitee only an invitation that needed no approval or was approved (never one
-- that waits, was rejected or was cancelled before approval).
create policy group_invitations_select_party on nestly.group_invitations
  for select to authenticated
  using ((select nestly.is_active_account())
    and ((invitee_id = (select auth.uid()) and (not needs_approval or approved_at is not null))
      or inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3));

-- Insert: any member who is not muted invites an active Friend who is not a member and not blocked from the Group.
create policy group_invitations_insert_member on nestly.group_invitations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and inviter_id = (select auth.uid()) and nestly.my_group_rank(group_id) > 0
    and status = case when needs_approval then 'awaiting_approval' else 'pending' end
    and needs_approval = (exists (select 1 from nestly.groups g where g.id = group_invitations.group_id and g.privacy = 'private')
                          and nestly.my_group_rank(group_id) < 3)
    and exists (select 1 from nestly.groups g where g.id = group_invitations.group_id and g.status = 'active')
    and not exists (select 1 from nestly.group_member_enforcements e
                     where e.group_id = group_invitations.group_id and e.user_id = (select auth.uid()) and e.kind = 'warn_mute'
                       and e.mute_until > pg_catalog.now())
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = group_invitations.invitee_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = group_invitations.invitee_id)))
    and not exists (select 1 from nestly.group_members m where m.group_id = group_invitations.group_id and m.user_id = group_invitations.invitee_id)
    and not exists (select 1 from nestly.group_bans b where b.group_id = group_invitations.group_id and b.user_id = group_invitations.invitee_id));

-- The inviter, the Owner or a Group Admin cancels an open invitation.
create policy group_invitations_update_manager on nestly.group_invitations
  for update to authenticated
  using ((select nestly.is_active_account()) and status in ('awaiting_approval', 'pending')
    and (inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3))
  with check (status = 'cancelled' and (inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3));

-- The Owner or a Group Admin approves (pending) or rejects an invitation that waits.
create policy group_invitations_update_approver on nestly.group_invitations
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'awaiting_approval' and nestly.my_group_rank(group_id) >= 3
    and exists (select 1 from nestly.groups g where g.id = group_invitations.group_id and g.status = 'active'))
  with check (status in ('pending', 'rejected') and nestly.my_group_rank(group_id) >= 3);

grant select (needs_approval, approved_by, approved_at) on table nestly.group_invitations to authenticated;

-- 5. No plain removal of another member (§11.16): a manager's delete needs the member's block, made in the same statement by remove_block.
drop policy group_members_delete_manager on nestly.group_members;

create policy group_members_delete_blocked on nestly.group_members
  for delete to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 2
    and nestly.group_role_rank(role) < nestly.my_group_rank(group_id)
    and exists (select 1 from nestly.group_bans b where b.group_id = group_members.group_id and b.user_id = group_members.user_id));

-- 6. A muted member reads only: no post, comment, like, invitation or recommendation in the Group ----------------------------------
alter policy posts_group_insert on nestly.posts
  with check (group_id is null
    or (nestly.my_group_rank(group_id) > 0
      and exists (select 1 from nestly.groups g where g.id = posts.group_id and g.status = 'active')
      and not exists (select 1 from nestly.group_member_enforcements e
                       where e.group_id = posts.group_id and e.user_id = (select auth.uid()) and e.kind = 'warn_mute'
                         and e.mute_until > pg_catalog.now())));

alter policy comments_group_insert on nestly.comments
  with check (exists (select 1 from nestly.posts p
                       where p.id = comments.post_id
                         and (p.group_id is null
                           or (nestly.my_group_rank(p.group_id) > 0
                             and not exists (select 1 from nestly.group_member_enforcements e
                                              where e.group_id = p.group_id and e.user_id = (select auth.uid()) and e.kind = 'warn_mute'
                                                and e.mute_until > pg_catalog.now())))));

alter policy reactions_group_insert on nestly.reactions
  with check (
    (post_id is not null and exists (select 1 from nestly.posts p
                                      where p.id = reactions.post_id
                                        and (p.group_id is null
                                          or (nestly.my_group_rank(p.group_id) > 0
                                            and not exists (select 1 from nestly.group_member_enforcements e
                                                             where e.group_id = p.group_id and e.user_id = (select auth.uid())
                                                               and e.kind = 'warn_mute' and e.mute_until > pg_catalog.now())))))
    or (comment_id is not null and exists (select 1 from nestly.comments c
                                            where c.id = reactions.comment_id
                                              and (c.group_id is null
                                                or (nestly.my_group_rank(c.group_id) > 0
                                                  and not exists (select 1 from nestly.group_member_enforcements e
                                                                   where e.group_id = c.group_id and e.user_id = (select auth.uid())
                                                                     and e.kind = 'warn_mute' and e.mute_until > pg_catalog.now()))))));

alter policy group_suggestions_insert_sender on nestly.group_suggestions
  with check ((select nestly.caller_account_type()) = 'regular' and sender_id = (select auth.uid())
    and exists (select 1 from nestly.groups g where g.id = group_suggestions.group_id and g.status = 'active')
    and not exists (select 1 from nestly.group_member_enforcements e
                     where e.group_id = group_suggestions.group_id and e.user_id = (select auth.uid()) and e.kind = 'warn_mute'
                       and e.mute_until > pg_catalog.now())
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = group_suggestions.recipient_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = group_suggestions.recipient_id))));

-- 7. Names for the Group's managers: invitees awaiting approval and the users of its enforcement history (each row's own policy decides
-- who reads it: the Owner and Admins, and the Moderators and higher).
create policy regular_names_select_group_manager on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and (exists (select 1 from nestly.group_invitations i
                  where i.invitee_id = regular_names.user_id and i.status = 'awaiting_approval' and nestly.my_group_rank(i.group_id) >= 3)
      or exists (select 1 from nestly.group_member_enforcements e
                  where e.user_id = regular_names.user_id and nestly.my_group_rank(e.group_id) >= 2)));

-- 8. notify_group(), replaced (rule 17, the approved definer) ------------------------------------------------------------------
create or replace function nestly.notify_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_post uuid;
  v_group uuid;
  v_author uuid;
  v_members integer;
  v_threshold integer;
  v_version integer;
  v_count bigint;
  v_added integer;
  r record;
begin
  if tg_table_name in ('comments', 'reactions') then
    v_post := new.post_id;
    v_group := (select p.group_id from nestly.posts p where p.id = v_post);
    if v_group is null then
      return null;   -- not a group post: nothing to do
    end if;
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', 'group', true);
  if tg_table_name = 'group_suggestions' then
    perform nestly.notify_deliver(new.recipient_id, 'group_recommended', 'groups', new.sender_id, 'group', new.group_id, new.id, false);
  elsif tg_table_name = 'group_invitations' then
    -- a plain member cannot read the Group's blocks, so the insert policy's "not blocked" test is the inviter's view only; here the invitation
    -- of a user blocked from the Group is refused outright (the statement fails, nothing is sent)
    if tg_op = 'INSERT' and exists (select 1 from nestly.group_bans b where b.group_id = new.group_id and b.user_id = new.invitee_id) then
      raise exception 'group_invitations: the user is blocked from the Group' using errcode = 'NS028';
    end if;
    if tg_op = 'INSERT' and new.status = 'awaiting_approval' then
      -- a member's invitation to a Private Group: the Owner and Group Admins are asked to approve it (the invitee hears nothing yet)
      for r in
        select m.user_id from nestly.group_members m
         where m.group_id = new.group_id and m.role in ('owner', 'admin') and m.member_status = 'active' and m.user_id <> new.inviter_id
      loop
        perform nestly.notify_deliver(r.user_id, 'group_invitation_pending', 'groups', new.inviter_id, 'group', new.group_id, new.id, false);
      end loop;
    elsif tg_op = 'INSERT' then
      perform nestly.notify_deliver(new.invitee_id, 'group_invited', 'groups', new.inviter_id, 'group', new.group_id, new.id, false);
    elsif new.status = 'pending' then
      -- approved: now the invitee is invited, and the inviter hears that it went through
      perform nestly.notify_deliver(new.invitee_id, 'group_invited', 'groups', new.inviter_id, 'group', new.group_id, new.id, false);
      perform nestly.notify_deliver(new.inviter_id, 'group_invitation_approved', 'groups', null, 'group', new.group_id, new.id, false);
    elsif new.status = 'rejected' then
      perform nestly.notify_deliver(new.inviter_id, 'group_invitation_rejected', 'groups', null, 'group', new.group_id, new.id, false);
    end if;
  elsif tg_table_name = 'group_member_enforcements' then
    -- the warning and mute notice to the member (a moderation notice: not switched off by a category; the manager is not named)
    perform nestly.notify_deliver(new.user_id, 'group_member_muted', 'groups', null, 'group', new.group_id, new.id, true);
  elsif tg_table_name = 'group_join_requests' then
    if tg_op = 'INSERT' then
      for r in
        select m.user_id from nestly.group_members m
         where m.group_id = new.group_id and m.role in ('owner', 'admin') and m.member_status = 'active'
      loop
        perform nestly.notify_deliver(r.user_id, 'group_join_requested', 'groups', new.user_id, 'group', new.group_id, new.id, false);
      end loop;
    elsif new.status = 'approved' then
      perform nestly.notify_deliver(new.user_id, 'group_join_approved', 'groups', null, 'group', new.group_id, new.id, false);
    end if;
  elsif tg_table_name = 'posts' then
    -- a new group post: members whose mode is "all" (FR-ALG-010), never its author
    for r in
      select m.user_id from nestly.group_members m
        left join nestly.group_notification_preferences gp on gp.group_id = m.group_id and gp.user_id = m.user_id
       where m.group_id = new.group_id and m.member_status = 'active' and m.user_id <> v_me and coalesce(gp.mode, 'highlights') = 'all'
    loop
      perform nestly.notify_deliver(r.user_id, 'group_post', 'groups', new.author_id, 'post', new.id, new.id, false);
    end loop;
  elsif tg_table_name = 'groups' then
    -- a pinned post (an announcement): members on "all" or "highlights", never the one who pinned it
    for r in
      select m.user_id from nestly.group_members m
        left join nestly.group_notification_preferences gp on gp.group_id = m.group_id and gp.user_id = m.user_id
       where m.group_id = new.id and m.member_status = 'active' and m.user_id <> v_me and coalesce(gp.mode, 'highlights') <> 'off'
    loop
      perform nestly.notify_deliver(r.user_id, 'group_pinned', 'groups', v_me, 'post', new.pinned_post_id, new.pinned_post_id, false);
    end loop;
  else
    -- a like or a comment on a group post: the post becomes a Highlight when the likes and comments by others reach the threshold of the
    -- active version for the Group's active members now (5% rounded up, 3 to 20; §11.17). Recorded once (group_highlights); each member is
    -- told once, never the author nor the actor.
    select count(*)::integer into v_members from nestly.group_members m where m.group_id = v_group and m.member_status = 'active';
    select c.version into v_version from nestly.group_highlight_configurations c where c.is_active;
    v_threshold := nestly.group_highlight_threshold(v_members);
    if v_threshold is not null and v_version is not null
       and not exists (select 1 from nestly.group_highlights h where h.post_id = v_post) then
      v_count := (select count(*) from nestly.reactions x where x.post_id = v_post and not x.is_by_author)
               + (select count(*) from nestly.comments c where c.post_id = v_post and c.status = 'active' and not c.is_by_post_author);
      if v_count >= v_threshold then
        insert into nestly.group_highlights (post_id, group_id, threshold, member_count, configuration_version)
        values (v_post, v_group, v_threshold, v_members, v_version)
        on conflict (post_id) do nothing;
        get diagnostics v_added = row_count;
        if v_added > 0 then
          select coalesce(p.author_id, pa.author_id) into v_author
            from nestly.posts p left join nestly.post_authors pa on pa.post_id = p.id
           where p.id = v_post;
          for r in
            select m.user_id from nestly.group_members m
              left join nestly.group_notification_preferences gp on gp.group_id = m.group_id and gp.user_id = m.user_id
             where m.group_id = v_group and m.member_status = 'active' and m.user_id <> v_me
               and m.user_id is distinct from v_author and coalesce(gp.mode, 'highlights') <> 'off'
          loop
            perform nestly.notify_deliver(r.user_id, 'group_highlight', 'groups', null, 'post', v_post, v_post, false);
          end loop;
        end if;
      end if;
    end if;
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

revoke execute on function nestly.notify_group() from public;

create trigger notify_group_invitation_decided
  after update of status on nestly.group_invitations
  for each row when (old.status = 'awaiting_approval' and new.status in ('pending', 'rejected'))
  execute function nestly.notify_group();

create trigger notify_group_enforcement
  after insert on nestly.group_member_enforcements
  for each row when (new.kind = 'warn_mute') execute function nestly.notify_group();

-- notify_group: whether an invitee is blocked from the Group (a plain member inviting cannot read the blocks).
create policy group_bans_select_notify on nestly.group_bans
  for select to app_owner
  using ((select nestly.notify_scope()) = 'group');

-- 9. Comments ------------------------------------------------------------------------------------------------------------------
comment on table nestly.group_highlight_configurations is
  'SRS FR-ALG-010, BR-059, BR-060: the versioned Highlights threshold. v1: a fixed count (5, inactive since I10 completion C). v2: member_percent of the Group''s active members, rounded up, within minimum_threshold..maximum_threshold (5%, 3, 20; Afik 21.10.2026). Exactly one version is active; a change is a new version by migration (no write policy).';
comment on column nestly.group_highlight_configurations.engagement_threshold is 'A fixed threshold (v1 only); NULL for a percentage version.';
comment on column nestly.group_highlight_configurations.member_percent is 'The share of the Group''s active members, in percent, rounded up (v2: 5); NULL for a fixed version.';
comment on column nestly.group_highlight_configurations.minimum_threshold is 'The lowest threshold of a percentage version (v2: 3).';
comment on column nestly.group_highlight_configurations.maximum_threshold is 'The highest threshold of a percentage version (v2: 20).';
comment on function nestly.group_highlight_threshold(integer) is
  'STABLE, SECURITY INVOKER. The Highlights threshold for a Group of p_members active members by the active configuration version (FR-ALG-010, BR-060: deterministic, no ML): fixed, or least(maximum, greatest(minimum, ceil(percent x members / 100))). Executable by authenticated (the Group page shows the threshold); it takes a count, never a user.';

comment on table nestly.group_highlights is
  'SRS FR-ALG-010, FR-GRP-001 (I10 completion C, Afik 21.10.2026 §11.13, §11.17): a group post that reached the Highlights threshold, once, kept when members later leave (⭐ OP-048). Written only by notify_group() (TO app_owner, scope group); read only by the Group''s members, so the main feed carries a Group''s Highlights to its members and to no one else. A pinned post is a Highlight through the Group''s pin, not a row here.';
comment on column nestly.group_highlights.post_id is 'The post (a post of the Group; the composite foreign key ties it to group_id).';
comment on column nestly.group_highlights.group_id is 'The post''s Group.';
comment on column nestly.group_highlights.threshold is 'The threshold the post reached (likes and comments by others).';
comment on column nestly.group_highlights.member_count is 'The Group''s active members when it was reached.';
comment on column nestly.group_highlights.configuration_version is 'The configuration version of the threshold (BR-059).';
comment on column nestly.group_highlights.reached_at is 'When it was reached (the database clock).';

comment on column nestly.group_invitations.status is
  'awaiting_approval (a member''s invitation to a Private Group, until the Owner or a Group Admin decides), pending (the invitee sees it), accepted, declined, cancelled (by the inviter or a manager) or rejected (by the Owner or a Group Admin). Moves once from each open state (group_invitations_decide).';
comment on column nestly.group_invitations.needs_approval is 'The invitation needed approval (a Private Group, an inviter below Group Admin); set at insert by group_invitations_route, never by a client.';
comment on column nestly.group_invitations.approved_by is 'Who approved or rejected it (the Owner or a Group Admin); NULL otherwise, or once that account is gone.';
comment on column nestly.group_invitations.approved_at is 'When it was approved (the database clock); NULL when it never waited, waits or was rejected.';
comment on function nestly.group_invitations_route() is 'BEFORE INSERT, SECURITY INVOKER. An invitation by a member below Group Admin in a Private Group waits for approval (needs_approval, awaiting_approval); any other is pending at once (§11.15).';
comment on function nestly.group_invitations_decide() is 'BEFORE UPDATE, SECURITY INVOKER. awaiting_approval -> pending (approved) / rejected (the Owner or a Group Admin only) / cancelled; pending -> accepted / declined / cancelled; nothing else (42501). A blocked user is never approved and never accepts (NS028); approved_by, approved_at, decided_at and decided_xact are the database''s.';
comment on policy group_invitations_select_party on nestly.group_invitations is 'The inviter and the Owner and Group Admins; the invitee only an invitation that needed no approval or was approved (never one that waits, was rejected or was cancelled before approval).';
comment on policy group_invitations_insert_member on nestly.group_invitations is 'Any member who is not muted invites an active Friend who is not a member and not blocked from the Group (§11.15); a Private Group invitation by a member below Group Admin waits for approval.';
comment on policy group_invitations_update_manager on nestly.group_invitations is 'The inviter, the Owner or a Group Admin cancels an open invitation.';
comment on policy group_invitations_update_approver on nestly.group_invitations is 'The Owner or a Group Admin approves (pending) or rejects an invitation that waits (§11.15).';

comment on table nestly.group_member_enforcements is
  'SRS GroupMemberEnforcement (§13, FR-GRP-003; Afik 21.10.2026 §11.16): the Group''s enforcement history. warn_mute: a notice with a reason and read-only (no post, comment, like, invitation or recommendation) until mute_until (24 hours or 7 days); remove_block: removed and blocked in one statement; unblock: the block lifted. By a Group Moderator or higher against a lower Role (unblock: a block made by a Role not higher than the caller''s). Read by the member it names and the Group''s Moderators and higher; kept with the Group, deleted with it or with the account; no client update or delete.';
comment on column nestly.group_member_enforcements.id is 'The record (also the mute notice''s subject).';
comment on column nestly.group_member_enforcements.group_id is 'The Group.';
comment on column nestly.group_member_enforcements.user_id is 'The member (or, for remove_block / unblock, the user) it names.';
comment on column nestly.group_member_enforcements.kind is 'warn_mute, remove_block or unblock (the three actions, §11.16; no plain removal exists).';
comment on column nestly.group_member_enforcements.reason_key is 'The reason from the closed list (offensive, spam, off_topic, privacy, rules, other); required for warn_mute and remove_block, NULL for unblock.';
comment on column nestly.group_member_enforcements.reason_text is 'Free text, up to 500 characters, only with the reason other (as §11.9).';
comment on column nestly.group_member_enforcements.mute_hours is 'warn_mute: 24 or 168 (7 days); NULL otherwise.';
comment on column nestly.group_member_enforcements.mute_until is 'warn_mute: when the mute ends by itself (the database clock plus mute_hours); NULL otherwise.';
comment on column nestly.group_member_enforcements.actor_id is 'Who acted (default auth.uid()); NULL once that account is gone. Never granted for SELECT: no member learns which manager acted.';
comment on column nestly.group_member_enforcements.created_at is 'When (the database clock).';
comment on column nestly.group_member_enforcements.created_xact is 'The writing transaction. Never granted.';
comment on function nestly.group_member_enforcements_apply() is 'BEFORE INSERT: created_at, created_xact and mute_until are the database''s. AFTER INSERT, SECURITY INVOKER: the action with the caller''s own rights in the same statement (remove_block inserts the block, which ends the Membership; unblock lifts it, or is refused, 42501).';
comment on policy group_member_enforcements_select_party on nestly.group_member_enforcements is 'The member it names, and the Group''s Moderators and higher (⭐ OP-047).';
comment on policy group_member_enforcements_insert_manager on nestly.group_member_enforcements is 'A Group Moderator or higher of an active Group, never on oneself: warn_mute on a lower Role''s member, remove_block on a lower Role (or a non-member), unblock of a block by a Role not higher than the caller''s (BR-041).';
comment on policy group_members_delete_blocked on nestly.group_members is 'A Group Moderator or higher removes a lower Role only together with the block (remove_block, §11.16): there is no plain removal.';
comment on policy regular_names_select_group_manager on nestly.regular_names is 'The Group''s Owner and Admins read the names of invitees awaiting their approval; its Moderators and higher the names in its enforcement history.';
comment on policy group_highlights_select_member on nestly.group_highlights is 'The Group''s members read its Highlights (the main feed); no one else.';
comment on policy group_highlights_insert_notify on nestly.group_highlights is 'notify_group() only (TO app_owner, scope group), at the threshold.';
comment on policy group_bans_select_notify on nestly.group_bans is 'notify_group() only (TO app_owner, scope group): an invitation of a user blocked from the Group is refused (NS028).';
comment on function nestly.notify_group() is
  'SECURITY DEFINER (approved exception, rule 17; I10, extended in I10 completion C). After a Group recommendation (to the Friend), an invitation (pending: to the invitee; awaiting approval: to the Owner and Group Admins), its approval (to the invitee and the inviter) or rejection (to the inviter), a mute notice (to the member, critical), a Join Request (to the Owner and Group Admins) or its approval (to the requester); a new group post (members whose mode is all); a pinned post, or a post whose likes and comments by others reached the threshold of the active version for the Group''s active members (members on all or highlights; FR-ALG-010, BR-060: deterministic), recorded once in group_highlights. Never to the actor, never across a block (notify_deliver), and every category switch is honoured but for the mute notice. Declares nestly.notify_scope = group and clears it. No EXECUTE for any runtime role.';
