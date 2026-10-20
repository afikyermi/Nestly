-- =====================================================================================================================
-- Groups — I10, migration only.
--
-- SRS: FR-GRP-001..004 · FR-ALG-010 · BR-031, BR-032, BR-033, BR-040, BR-041, BR-048, BR-060 · VAL-019..021, VAL-028, VAL-035 · ERR-017..019,
--      ERR-022, ERR-024, ERR-026 · NFR-PRIV-002 · AC-036, AC-037, AC-038, AC-050, AC-056, AC-066 · §13 Group / Membership, GroupJoinRequest,
--      GroupRoleAssignment, GroupInvitation, GroupMemberEnforcement, GroupNotificationPreference · platform rules 8, 10, 12, 15-19.
--
-- groups                         a Group: name, description, rules, Public/Private, the pinned post. Every active account reads an active
--                                Group's details (discovery, BR-031/032); the Owner and Group Admins edit them; only the Owner changes
--                                Public/Private or deletes the Group (a soft delete: the Group and all its content disappear).
-- group_members                  Membership with its Group Role (owner > admin > moderator > member; FR-GRP-003). A member row is
--                                readable by the member, by every fellow member, and (Public Group only, never with a name) by every
--                                active account. Joined by the creator (Owner), by Join (Public), by an accepted invitation or by an
--                                approved Join Request; left by the member (never the Owner, ERR-026); removed by a higher Role.
-- group_access                   the member's own copy of their Membership (group, role), kept by foreign key (ON UPDATE / DELETE CASCADE).
--                                Read by its owner only. It exists so that a policy can ask "is the caller a member, with which Role"
--                                without reading group_members inside group_members' own policies (that would recurse).
-- group_join_requests            Private Group Join Requests (VAL-020, ERR-018): one pending per user and Group; the Owner or a Group Admin
--                                approves (the Membership is created in the same statement) or rejects; the requester may cancel.
-- group_invitations              an Owner's or Group Admin's invitation of a Friend; the invitee accepts (Membership) or declines.
-- group_bans                     "remove and block" (GroupMemberEnforcement): the user leaves the Group and can neither join, ask nor be
--                                invited until unblocked. By a Group Moderator or higher, only against a lower Role.
-- group_notification_preferences per member and Group: all / highlights / off (VAL-035). No row = highlights.
-- group_recommendations          a Regular user's recommendation of a Group to an active Friend (FR-GRP-002, AC-050): a notification with
--                                the Group as its target; it changes no Membership.
-- group_highlight_configurations the versioned Highlights threshold (FR-ALG-010, BR-060): likes and comments by others on a group post. v1 = 5.
-- private_group_content_views    a staff view of reported Private Group content (NFR-PRIV-002, BR-040, ERR-024): written by a holder of
--                                PRIVATE_GROUP_MODERATE (the Admin always) on the admin screens and audited; only inside that transaction
--                                is the reported post or comment readable to them.
-- posts                          gain group_id: a group post is readable while its Group is active and Public, or the caller is a member
--                                (RESTRICTIVE posts_group_hide); only members post (posts_group_insert); always audience everyone, never a
--                                share, and a Private Group's post is never shared. A Group Moderator or higher removes a post of a lower
--                                Role (delete_post: deleted, or held while a report is open).
-- comments                       gain group_id (from the post, by trigger): same hiding; only members comment; same removal.
-- reactions                      only members like a group post or comment (reactions_group_insert).
-- reports                        gain is_private_group: a report on Private Group content keeps no copy of its text (staff read it only
--                                through private_group_content_views).
-- regular_names                  a fellow member's name; a pending requester's name to the Group's managers; a blocked user's name to them.
-- notify_post()                  replaced: a group post is never a "new post of a Friend" (notify_group decides who hears of it).
-- audit_trigger()                replaced: the body of 20261022200000 plus the private_group_content_views branch.
--
-- SECURITY DEFINER (data-model.md "Approved exceptions", rule 17, the shape of the I7 notification definers):
--   nestly.notify_group()   AFTER INSERT/UPDATE triggers: a recommendation, an invitation, a Join Request (to the Owner and Admins) and
--                           its approval (to the requester); a new group post (members on "all"); a pinned post and a post that reached
--                           the Highlights threshold (members on "all" or "highlights"; FR-ALG-010). Declares nestly.notify_scope = 'group',
--                           which opens group_members_select_notify and group_notification_preferences_select_notify (TO app_owner),
--                           and clears it. No EXECUTE for any runtime role.
--
-- Error codes: NS026 the Owner cannot leave or step down before transferring ownership (ERR-026) · NS027 a Group Role acting on an equal or
-- higher Role, or a change reserved to the Owner (ERR-019) · NS028 the user is blocked from the Group.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261022300000_groups.down.sql (refuses once a Group, a group post or a content view exists).
-- =====================================================================================================================

-- 1. groups -----------------------------------------------------------------------------------------------------------
create table nestly.groups (
  id             uuid        not null default gen_random_uuid()
    constraint groups_pkey primary key,
  name           text        not null
    constraint groups_name_check check (char_length(btrim(name)) between 3 and 60 and name = btrim(name)),
  description    text
    constraint groups_description_check check (description is null or (description ~ '[^[:space:]]' and char_length(description) <= 1000)),
  rules          text
    constraint groups_rules_check check (rules is null or (rules ~ '[^[:space:]]' and char_length(rules) <= 2000)),
  privacy        text        not null
    constraint groups_privacy_check check (privacy in ('public', 'private')),
  status         text        not null default 'active'
    constraint groups_status_check check (status in ('active', 'deleted')),
  pinned_post_id uuid,
  created_by     uuid        default auth.uid()
    constraint groups_created_by_fkey references nestly.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_xact   xid8,
  constraint groups_deleted_check check ((status = 'deleted') = (deleted_at is not null) and (deleted_at is null) = (deleted_xact is null)),
  constraint groups_pinned_check check (pinned_post_id is null or status = 'active')
);

create index groups_created_at_idx on nestly.groups (created_at desc, id desc) where status = 'active';
create index groups_created_by_idx on nestly.groups (created_by) where created_by is not null;

-- 2. posts gain the Group --------------------------------------------------------------------------------------------
alter table nestly.posts
  add column group_id uuid
    constraint posts_group_id_fkey references nestly.groups (id) on delete cascade;
alter table nestly.posts
  add constraint posts_group_check check (group_id is null or (audience = 'everyone' and not is_share)),
  add constraint posts_id_group_id_key unique (id, group_id);
create index posts_group_id_created_at_idx on nestly.posts (group_id, created_at desc, id desc) where group_id is not null;

alter table nestly.groups
  add constraint groups_pinned_post_fkey foreign key (pinned_post_id, id)
    references nestly.posts (id, group_id) on delete set null (pinned_post_id);

-- comments gain the Group of their post (set by comments_insert_group, never by a client).
alter table nestly.comments add column group_id uuid;
create index comments_group_id_idx on nestly.comments (group_id) where group_id is not null;

-- 3. group_members and group_access -----------------------------------------------------------------------------------
create table nestly.group_members (
  group_id      uuid        not null
    constraint group_members_group_id_fkey references nestly.groups (id) on delete cascade,
  user_id       uuid        not null default auth.uid(),
  member_status text        not null default 'active',
  role          text        not null default 'member'
    constraint group_members_role_check check (role in ('owner', 'admin', 'moderator', 'member')),
  created_at    timestamptz not null default now(),
  constraint group_members_pkey primary key (group_id, user_id),
  constraint group_members_group_id_user_id_role_key unique (group_id, user_id, role),
  constraint group_members_user_status_fkey foreign key (user_id, member_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint group_members_one_owner exclude using btree (group_id with =) where (role = 'owner') deferrable initially deferred
);

create index group_members_user_id_idx on nestly.group_members (user_id);
create index group_members_managers_idx on nestly.group_members (group_id) where role in ('owner', 'admin');

create table nestly.group_access (
  group_id uuid not null,
  user_id  uuid not null,
  role     text not null,
  constraint group_access_pkey primary key (group_id, user_id),
  constraint group_access_member_fkey foreign key (group_id, user_id, role)
    references nestly.group_members (group_id, user_id, role) on update cascade on delete cascade
);

create index group_access_user_id_idx on nestly.group_access (user_id);

-- The helpers. group_role_rank: owner 4, admin 3, moderator 2, member 1, anything else 0. my_group_rank: the caller's rank in a Group (0 = not a
-- member), read from the caller's own group_access row. Never called by group_access' own policy.
create function nestly.group_role_rank(p_role text)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'moderator' then 2 when 'member' then 1 else 0 end
$$;

create function nestly.my_group_rank(p_group uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select nestly.group_role_rank(a.role) from nestly.group_access a where a.group_id = p_group and a.user_id = auth.uid()), 0)
$$;

revoke execute on function nestly.group_role_rank(text), nestly.my_group_rank(uuid) from public;
grant execute on function nestly.group_role_rank(text), nestly.my_group_rank(uuid) to authenticated;

-- 4. Join Requests, invitations, bans, preferences, recommendations ---------------------------------------------------
create table nestly.group_join_requests (
  id           uuid        not null default gen_random_uuid()
    constraint group_join_requests_pkey primary key,
  group_id     uuid        not null
    constraint group_join_requests_group_id_fkey references nestly.groups (id) on delete cascade,
  user_id      uuid        not null default auth.uid()
    constraint group_join_requests_user_id_fkey references nestly.users (id) on delete cascade,
  status       text        not null default 'pending'
    constraint group_join_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at   timestamptz not null default now(),
  decided_by   uuid
    constraint group_join_requests_decided_by_fkey references nestly.users (id) on delete set null,
  decided_at   timestamptz,
  decided_xact xid8,
  constraint group_join_requests_decided_check check ((status = 'pending') = (decided_at is null) and (decided_at is null) = (decided_xact is null))
);

create unique index group_join_requests_pending_key on nestly.group_join_requests (group_id, user_id) where status = 'pending';
create index group_join_requests_user_id_idx on nestly.group_join_requests (user_id);
create index group_join_requests_decided_by_idx on nestly.group_join_requests (decided_by) where decided_by is not null;

create table nestly.group_invitations (
  id           uuid        not null default gen_random_uuid()
    constraint group_invitations_pkey primary key,
  group_id     uuid        not null
    constraint group_invitations_group_id_fkey references nestly.groups (id) on delete cascade,
  inviter_id   uuid        not null default auth.uid()
    constraint group_invitations_inviter_id_fkey references nestly.users (id) on delete cascade,
  invitee_id   uuid        not null
    constraint group_invitations_invitee_id_fkey references nestly.users (id) on delete cascade,
  status       text        not null default 'pending'
    constraint group_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_xact xid8,
  constraint group_invitations_pair_check check (inviter_id <> invitee_id),
  constraint group_invitations_decided_check check ((status = 'pending') = (decided_at is null) and (decided_at is null) = (decided_xact is null))
);

create unique index group_invitations_pending_key on nestly.group_invitations (group_id, invitee_id) where status = 'pending';
create index group_invitations_invitee_id_idx on nestly.group_invitations (invitee_id);
create index group_invitations_inviter_id_idx on nestly.group_invitations (inviter_id);

create table nestly.group_bans (
  group_id   uuid        not null
    constraint group_bans_group_id_fkey references nestly.groups (id) on delete cascade,
  user_id    uuid        not null
    constraint group_bans_user_id_fkey references nestly.users (id) on delete cascade,
  banned_by  uuid        default auth.uid()
    constraint group_bans_banned_by_fkey references nestly.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint group_bans_pkey primary key (group_id, user_id)
);

create index group_bans_user_id_idx on nestly.group_bans (user_id);
create index group_bans_banned_by_idx on nestly.group_bans (banned_by) where banned_by is not null;

create table nestly.group_notification_preferences (
  group_id   uuid        not null,
  user_id    uuid        not null default auth.uid(),
  mode       text        not null
    constraint group_notification_preferences_mode_check check (mode in ('all', 'highlights', 'off')),
  updated_at timestamptz not null default now(),
  constraint group_notification_preferences_pkey primary key (group_id, user_id),
  constraint group_notification_preferences_member_fkey foreign key (group_id, user_id)
    references nestly.group_members (group_id, user_id) on delete cascade
);

create index group_notification_preferences_user_id_idx on nestly.group_notification_preferences (user_id);

create table nestly.group_recommendations (
  id           uuid        not null default gen_random_uuid()
    constraint group_recommendations_pkey primary key,
  group_id     uuid        not null
    constraint group_recommendations_group_id_fkey references nestly.groups (id) on delete cascade,
  sender_id    uuid        not null default auth.uid()
    constraint group_recommendations_sender_id_fkey references nestly.users (id) on delete cascade,
  recipient_id uuid        not null
    constraint group_recommendations_recipient_id_fkey references nestly.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint group_recommendations_pair_check check (sender_id <> recipient_id),
  constraint group_recommendations_once_key unique (group_id, sender_id, recipient_id)
);

create index group_recommendations_sender_id_idx on nestly.group_recommendations (sender_id);
create index group_recommendations_recipient_id_idx on nestly.group_recommendations (recipient_id);

create table nestly.group_highlight_configurations (
  version              integer     not null
    constraint group_highlight_configurations_pkey primary key
    constraint group_highlight_configurations_version_check check (version > 0),
  engagement_threshold integer     not null
    constraint group_highlight_configurations_threshold_check check (engagement_threshold between 2 and 1000),
  is_active            boolean     not null,
  created_at           timestamptz not null default now(),
  reason               text        not null
    constraint group_highlight_configurations_reason_check check (btrim(reason) <> '')
);

create unique index group_highlight_configurations_active_key on nestly.group_highlight_configurations ((true)) where is_active;

-- Seed v1 before RLS is enabled: no role has an insert policy (a change is a migration, BR-059).
insert into nestly.group_highlight_configurations (version, engagement_threshold, is_active, reason)
values (1, 5, true, 'I10 default: a group post with 5 likes and comments by others is a highlight (FR-ALG-010)');

-- 5. reports: Private Group content keeps no copy of its text ---------------------------------------------------------
alter table nestly.reports add column is_private_group boolean not null default false;

-- 6. private_group_content_views ---------------------------------------------------------------------------------------
create table nestly.private_group_content_views (
  id         uuid        not null default gen_random_uuid()
    constraint private_group_content_views_pkey primary key,
  report_id  uuid        not null
    constraint private_group_content_views_report_id_fkey references nestly.reports (id) on delete cascade,
  viewer_id  uuid        not null default auth.uid()
    constraint private_group_content_views_viewer_id_fkey references nestly.users (id) on delete restrict,
  post_id    uuid,
  comment_id uuid,
  view_xact  xid8        not null default pg_catalog.pg_current_xact_id(),
  created_at timestamptz not null default now(),
  constraint private_group_content_views_target_check check (num_nonnulls(post_id, comment_id) = 1)
);

create index private_group_content_views_report_id_idx on nestly.private_group_content_views (report_id);
create index private_group_content_views_viewer_id_idx on nestly.private_group_content_views (viewer_id);

-- 7. Triggers (SECURITY INVOKER; auth.uid() is the actor; every read runs under the caller's RLS) -----------------------

-- groups: the database's clock; only the Owner changes Public/Private or deletes (NS027); a deleted Group is final and unpinned; a pin names
-- an active post of the Group that the caller can read.
create function nestly.groups_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if (new.privacy is distinct from old.privacy or new.status is distinct from old.status) and nestly.my_group_rank(old.id) < 4 then
      raise exception 'groups: only the Owner changes the privacy or deletes the Group' using errcode = 'NS027';
    end if;
    if new.status is distinct from old.status and not (old.status = 'active' and new.status = 'deleted') then
      raise exception 'groups: a deleted Group stays deleted' using errcode = '42501';
    end if;
    if new.pinned_post_id is not null and new.pinned_post_id is distinct from old.pinned_post_id
       and not exists (select 1 from nestly.posts p where p.id = new.pinned_post_id and p.group_id = old.id and p.status = 'active') then
      raise exception 'groups: only an active post of the Group can be pinned' using errcode = '42501';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  if new.status = 'deleted' and old.status = 'active' then
    new.deleted_at := pg_catalog.now();
    new.deleted_xact := pg_catalog.pg_current_xact_id();
    new.pinned_post_id := null;
  end if;
  return new;
end
$$;

-- groups: the creator becomes the Owner in the same statement (FR-GRP-004, VAL-028).
create function nestly.groups_insert_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.group_members (group_id, role) values (new.id, 'owner');
  return null;
end
$$;

-- group_members: the member's own copy (group_access) follows every new Membership.
create function nestly.group_members_insert_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.group_access (group_id, user_id, role) values (new.group_id, new.user_id, new.role);
  return null;
end
$$;

-- group_members: only the Role changes (and the status copy, by cascade); the Owner leaves the Role only when another Owner exists (a
-- transfer), and is never removed and never leaves (ERR-026).
create function nestly.group_members_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'group_members: the Owner transfers ownership before leaving' using errcode = 'NS026';
    end if;
    return old;
  end if;
  if (new.group_id, new.user_id, new.created_at) is distinct from (old.group_id, old.user_id, old.created_at) then
    raise exception 'group_members: only the Role changes' using errcode = '42501';
  end if;
  if old.role = 'owner' and new.role <> 'owner'
     and not exists (select 1 from nestly.group_members m where m.group_id = old.group_id and m.role = 'owner' and m.user_id <> old.user_id) then
    raise exception 'group_members: the Owner transfers ownership before stepping down' using errcode = 'NS026';
  end if;
  return new;
end
$$;

-- group_join_requests: a request moves once, from pending; the decision's author, time and transaction are the database's; a blocked
-- user is never approved (NS028).
create function nestly.group_join_requests_decide()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.group_id, new.user_id, new.created_at) is distinct from (old.id, old.group_id, old.user_id, old.created_at)
     or old.status <> 'pending' or new.status = 'pending' then
    raise exception 'group_join_requests: a request is answered once' using errcode = '42501';
  end if;
  if new.status = 'approved'
     and exists (select 1 from nestly.group_bans b where b.group_id = new.group_id and b.user_id = new.user_id) then
    raise exception 'group_join_requests: the user is blocked from the Group' using errcode = 'NS028';
  end if;
  new.decided_by := case when new.status = 'cancelled' then null else auth.uid() end;
  new.decided_at := pg_catalog.now();
  new.decided_xact := pg_catalog.pg_current_xact_id();
  return new;
end
$$;

-- group_join_requests: an approval makes the requester a member in the same statement (the manager's own rights; the policy names this
-- transaction's approval).
create function nestly.group_join_requests_admit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.group_members (group_id, user_id, role) values (new.group_id, new.user_id, 'member')
    on conflict (group_id, user_id) do nothing;
  return null;
end
$$;

-- group_invitations: an invitation moves once, from pending; an accepted one makes the invitee a member (the invitee's own rights); a
-- blocked user cannot accept (NS028).
create function nestly.group_invitations_decide()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.group_id, new.inviter_id, new.invitee_id, new.created_at)
       is distinct from (old.id, old.group_id, old.inviter_id, old.invitee_id, old.created_at)
     or old.status <> 'pending' or new.status = 'pending' then
    raise exception 'group_invitations: an invitation is answered once' using errcode = '42501';
  end if;
  if new.status = 'accepted'
     and exists (select 1 from nestly.group_bans b where b.group_id = new.group_id and b.user_id = new.invitee_id) then
    raise exception 'group_invitations: the user is blocked from the Group' using errcode = 'NS028';
  end if;
  new.decided_at := pg_catalog.now();
  new.decided_xact := pg_catalog.pg_current_xact_id();
  return new;
end
$$;

create function nestly.group_invitations_admit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.group_members (group_id, role) values (new.group_id, 'member')
    on conflict (group_id, user_id) do nothing;
  return null;
end
$$;

-- group_bans: the blocked user's Membership ends in the same statement (the blocker's own rights: the policy already proved the lower Role).
create function nestly.group_bans_remove()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from nestly.group_members m where m.group_id = new.group_id and m.user_id = new.user_id;
  return null;
end
$$;

create function nestly.group_notification_preferences_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- posts: a Private Group's post is never shared (its readers are the Group's members only). Reads the original under the caller's RLS.
create function nestly.posts_group_share_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.shared_post_id is not null and exists (
    select 1 from nestly.posts p join nestly.groups g on g.id = p.group_id
     where p.id = new.shared_post_id and g.privacy = 'private') then
    raise exception 'posts: a Private Group post cannot be shared' using errcode = 'NS002';
  end if;
  return new;
end
$$;

-- posts: only the author edits what was written (a Group manager removes; staff never edit: reject_staff_edit).
create function nestly.posts_reject_group_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.group_id is not null
     and old.author_id is distinct from auth.uid()
     and not exists (select 1 from nestly.post_authors pa where pa.post_id = old.id and pa.author_id = auth.uid()) then
    raise exception 'posts: only the author edits a post' using errcode = '42501';
  end if;
  return new;
end
$$;

-- comments: the Group of the comment is its post's, read under the caller's RLS (never sent by a client).
create function nestly.comments_insert_group()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.group_id := (select p.group_id from nestly.posts p where p.id = new.post_id);
  return new;
end
$$;

-- reports: a report on Private Group content keeps no copy of the text (staff read it only through an audited view), and says so.
create function nestly.reports_private_group()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_privacy text;
begin
  if new.post_id is not null then
    select g.privacy into v_privacy from nestly.posts p join nestly.groups g on g.id = p.group_id where p.id = new.post_id;
  elsif new.comment_id is not null then
    select g.privacy into v_privacy from nestly.comments c join nestly.groups g on g.id = c.group_id where c.id = new.comment_id;
  end if;
  new.is_private_group := coalesce(v_privacy = 'private', false);
  if new.is_private_group then
    new.target_text := null;
  end if;
  return new;
end
$$;

-- private_group_content_views: the view names the reported post or comment (read under the caller's RLS: reports_select_staff).
create function nestly.private_group_content_views_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  select rp.post_id, rp.comment_id into r from nestly.reports rp where rp.id = new.report_id and rp.is_private_group;
  if not found or num_nonnulls(r.post_id, r.comment_id) <> 1 then
    raise exception 'private_group_content_views: not a report on Private Group content' using errcode = '42501';
  end if;
  new.post_id := r.post_id;
  new.comment_id := r.comment_id;
  new.view_xact := pg_catalog.pg_current_xact_id();
  return new;
end
$$;

revoke execute on function nestly.groups_update_guard(), nestly.groups_insert_owner(), nestly.group_members_insert_access(),
  nestly.group_members_guard(), nestly.group_join_requests_decide(), nestly.group_join_requests_admit(), nestly.group_invitations_decide(),
  nestly.group_invitations_admit(), nestly.group_bans_remove(), nestly.group_notification_preferences_touch(), nestly.posts_group_share_guard(),
  nestly.posts_reject_group_edit(), nestly.comments_insert_group(), nestly.reports_private_group(),
  nestly.private_group_content_views_target() from public;

create trigger groups_update_guard
  before update on nestly.groups
  for each row execute function nestly.groups_update_guard();

create trigger groups_insert_owner
  after insert on nestly.groups
  for each row execute function nestly.groups_insert_owner();

create trigger group_members_insert_access
  after insert on nestly.group_members
  for each row execute function nestly.group_members_insert_access();

create trigger group_members_guard
  before update or delete on nestly.group_members
  for each row execute function nestly.group_members_guard();

create trigger group_join_requests_decide
  before update on nestly.group_join_requests
  for each row execute function nestly.group_join_requests_decide();

create trigger group_join_requests_admit
  after update of status on nestly.group_join_requests
  for each row when (new.status = 'approved') execute function nestly.group_join_requests_admit();

create trigger group_invitations_decide
  before update on nestly.group_invitations
  for each row execute function nestly.group_invitations_decide();

create trigger group_invitations_admit
  after update of status on nestly.group_invitations
  for each row when (new.status = 'accepted') execute function nestly.group_invitations_admit();

create trigger group_bans_remove
  after insert on nestly.group_bans
  for each row execute function nestly.group_bans_remove();

create trigger group_notification_preferences_touch
  before update on nestly.group_notification_preferences
  for each row execute function nestly.group_notification_preferences_touch();

create trigger posts_group_share_guard
  before insert on nestly.posts
  for each row when (new.shared_post_id is not null) execute function nestly.posts_group_share_guard();

create trigger posts_reject_group_edit
  before update of audience, body, stage_tag on nestly.posts
  for each row execute function nestly.posts_reject_group_edit();

create trigger comments_insert_group
  before insert on nestly.comments
  for each row execute function nestly.comments_insert_group();

-- named to run after reports_insert_snapshot (BEFORE triggers fire in name order)
create trigger reports_private_group
  before insert on nestly.reports
  for each row execute function nestly.reports_private_group();

create trigger private_group_content_views_target
  before insert on nestly.private_group_content_views
  for each row execute function nestly.private_group_content_views_target();

-- 8. RLS, policies, grants --------------------------------------------------------------------------------------------
alter table nestly.groups enable row level security, force row level security;
alter table nestly.group_members enable row level security, force row level security;
alter table nestly.group_access enable row level security, force row level security;
alter table nestly.group_join_requests enable row level security, force row level security;
alter table nestly.group_invitations enable row level security, force row level security;
alter table nestly.group_bans enable row level security, force row level security;
alter table nestly.group_notification_preferences enable row level security, force row level security;
alter table nestly.group_recommendations enable row level security, force row level security;
alter table nestly.group_highlight_configurations enable row level security, force row level security;
alter table nestly.private_group_content_views enable row level security, force row level security;

revoke all on table nestly.groups, nestly.group_members, nestly.group_access, nestly.group_join_requests, nestly.group_invitations,
  nestly.group_bans, nestly.group_notification_preferences, nestly.group_recommendations, nestly.group_highlight_configurations,
  nestly.private_group_content_views from public, anon, authenticated;

-- groups. Discovery: every active account reads an active Group's details, Public or Private (BR-031/032). A Group deleted in this
-- transaction stays readable inside it (the UPDATE's new row must be).
create policy groups_select_active on nestly.groups
  for select to authenticated
  using ((select nestly.is_active_account())
    and (status = 'active' or (status = 'deleted' and deleted_xact = pg_catalog.pg_current_xact_id_if_assigned())));

create policy groups_insert_creator on nestly.groups
  for insert to authenticated
  with check ((select nestly.caller_account_type()) in ('regular', 'professional')
    and created_by = (select auth.uid()) and status = 'active' and pinned_post_id is null);

create policy groups_update_manager on nestly.groups
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and nestly.my_group_rank(id) >= 3)
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and nestly.my_group_rank(id) >= 3);

grant select (id, name, description, rules, privacy, status, pinned_post_id, created_by, created_at, updated_at, deleted_at)
  on table nestly.groups to authenticated;
grant insert (name, description, rules, privacy) on table nestly.groups to authenticated;
grant update (name, description, rules, privacy, status, pinned_post_id) on table nestly.groups to authenticated;

-- group_members. Read: one's own rows; every row of a Group one belongs to; the rows of a Public Group (no name comes with them).
create policy group_members_select_viewer on nestly.group_members
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    user_id = (select auth.uid())
    or (member_status = 'active' and (
      exists (select 1 from nestly.group_access a where a.group_id = group_members.group_id and a.user_id = (select auth.uid()))
      or exists (select 1 from nestly.groups g where g.id = group_members.group_id and g.privacy = 'public' and g.status = 'active')))));

-- Insert: the creator as Owner in the creating transaction; oneself as a member of a Public Group, or with an invitation accepted in this
-- transaction; a requester whose request the Owner or a Group Admin approved in this transaction. Never a blocked user, never staff.
create policy group_members_insert_owner on nestly.group_members
  for insert to authenticated
  with check ((select nestly.caller_account_type()) in ('regular', 'professional')
    and user_id = (select auth.uid()) and role = 'owner' and member_status = 'active'
    and exists (select 1 from nestly.groups g
                 where g.id = group_members.group_id and g.created_by = (select auth.uid()) and g.created_at = pg_catalog.now()));

create policy group_members_insert_self on nestly.group_members
  for insert to authenticated
  with check ((select nestly.caller_account_type()) in ('regular', 'professional')
    and user_id = (select auth.uid()) and role = 'member' and member_status = 'active'
    and not exists (select 1 from nestly.group_bans b where b.group_id = group_members.group_id and b.user_id = (select auth.uid()))
    and exists (select 1 from nestly.groups g where g.id = group_members.group_id and g.status = 'active')
    and (exists (select 1 from nestly.groups g where g.id = group_members.group_id and g.privacy = 'public')
      or exists (select 1 from nestly.group_invitations i
                  where i.group_id = group_members.group_id and i.invitee_id = (select auth.uid()) and i.status = 'accepted'
                    and i.decided_xact = pg_catalog.pg_current_xact_id_if_assigned())));

create policy group_members_insert_approved on nestly.group_members
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id <> (select auth.uid()) and role = 'member' and member_status = 'active'
    and nestly.my_group_rank(group_id) >= 3
    and exists (select 1 from nestly.group_join_requests r
                 where r.group_id = group_members.group_id and r.user_id = group_members.user_id and r.status = 'approved'
                   and r.decided_xact = pg_catalog.pg_current_xact_id_if_assigned()));

-- Update (the Role): a higher Role changes a lower one to a Role below its own (an Admin manages Group Moderators; only the Owner appoints
-- an Admin); the Owner may also make someone Owner (a transfer) and then step down to Admin (group_members_guard: only with another Owner).
create policy group_members_update_manager on nestly.group_members
  for update to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 3
    and nestly.group_role_rank(role) < nestly.my_group_rank(group_id))
  with check ((select nestly.is_active_account())
    and (nestly.group_role_rank(role) < nestly.my_group_rank(group_id) or (role = 'owner' and nestly.my_group_rank(group_id) = 4)));

create policy group_members_update_owner_step_down on nestly.group_members
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()) and role = 'owner')
  with check (user_id = (select auth.uid()) and role = 'admin');

-- Delete: one leaves (never the Owner: group_members_guard, ERR-026); a Group Moderator or higher removes a lower Role (ERR-019).
create policy group_members_delete_self on nestly.group_members
  for delete to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy group_members_delete_manager on nestly.group_members
  for delete to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 2
    and nestly.group_role_rank(role) < nestly.my_group_rank(group_id));

-- notify_group: the recipients of a Group's notification.
create policy group_members_select_notify on nestly.group_members
  for select to app_owner
  using ((select nestly.notify_scope()) = 'group');

grant select (group_id, user_id, member_status, role, created_at) on table nestly.group_members to authenticated;
grant insert (group_id, user_id, role), delete on table nestly.group_members to authenticated;
grant update (role) on table nestly.group_members to authenticated;

-- group_access: its owner only. Written by group_members_insert_access (the foreign key proves the Membership); never updated or deleted
-- but by the cascade.
create policy group_access_select_own on nestly.group_access
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy group_access_insert_member on nestly.group_access
  for insert to authenticated
  with check ((select nestly.is_active_account()));

grant select on table nestly.group_access to authenticated;
grant insert (group_id, user_id, role) on table nestly.group_access to authenticated;

-- group_join_requests (VAL-020, ERR-018).
create policy group_join_requests_select_party on nestly.group_join_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and (user_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3));

create policy group_join_requests_insert_self on nestly.group_join_requests
  for insert to authenticated
  with check ((select nestly.caller_account_type()) in ('regular', 'professional')
    and user_id = (select auth.uid()) and status = 'pending' and nestly.my_group_rank(group_id) = 0
    and exists (select 1 from nestly.groups g where g.id = group_join_requests.group_id and g.status = 'active' and g.privacy = 'private')
    and not exists (select 1 from nestly.group_bans b where b.group_id = group_join_requests.group_id and b.user_id = (select auth.uid())));

create policy group_join_requests_update_requester on nestly.group_join_requests
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'cancelled');

create policy group_join_requests_update_manager on nestly.group_join_requests
  for update to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 3 and status = 'pending')
  with check (nestly.my_group_rank(group_id) >= 3 and status in ('approved', 'rejected'));

grant select (id, group_id, user_id, status, created_at, decided_by, decided_at, decided_xact) on table nestly.group_join_requests to authenticated;
grant insert (group_id) on table nestly.group_join_requests to authenticated;
grant update (status) on table nestly.group_join_requests to authenticated;

-- group_invitations: an Owner or Group Admin invites an active Friend who is not a member and not blocked from the Group.
create policy group_invitations_select_party on nestly.group_invitations
  for select to authenticated
  using ((select nestly.is_active_account())
    and (invitee_id = (select auth.uid()) or inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3));

create policy group_invitations_insert_manager on nestly.group_invitations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and inviter_id = (select auth.uid()) and status = 'pending'
    and nestly.my_group_rank(group_id) >= 3
    and exists (select 1 from nestly.groups g where g.id = group_invitations.group_id and g.status = 'active')
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = group_invitations.invitee_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = group_invitations.invitee_id)))
    and not exists (select 1 from nestly.group_members m where m.group_id = group_invitations.group_id and m.user_id = group_invitations.invitee_id)
    and not exists (select 1 from nestly.group_bans b where b.group_id = group_invitations.group_id and b.user_id = group_invitations.invitee_id));

create policy group_invitations_update_invitee on nestly.group_invitations
  for update to authenticated
  using ((select nestly.is_active_account()) and invitee_id = (select auth.uid()) and status = 'pending')
  with check (invitee_id = (select auth.uid()) and status in ('accepted', 'declined'));

create policy group_invitations_update_manager on nestly.group_invitations
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'pending'
    and (inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3))
  with check (status = 'cancelled' and (inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3));

grant select (id, group_id, inviter_id, invitee_id, status, created_at, decided_at, decided_xact) on table nestly.group_invitations to authenticated;
grant insert (group_id, invitee_id) on table nestly.group_invitations to authenticated;
grant update (status) on table nestly.group_invitations to authenticated;

-- group_bans: a Group Moderator or higher blocks a user of a lower Role (or a non-member) and unblocks; the blocked user reads their own row.
create policy group_bans_select_party on nestly.group_bans
  for select to authenticated
  using ((select nestly.is_active_account()) and (user_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 2));

create policy group_bans_insert_manager on nestly.group_bans
  for insert to authenticated
  with check ((select nestly.is_active_account()) and banned_by = (select auth.uid()) and user_id <> (select auth.uid())
    and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = group_bans.group_id and m.user_id = group_bans.user_id), 0) < nestly.my_group_rank(group_id));

create policy group_bans_delete_manager on nestly.group_bans
  for delete to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 2);

grant select (group_id, user_id, banned_by, created_at), delete on table nestly.group_bans to authenticated;
grant insert (group_id, user_id) on table nestly.group_bans to authenticated;

-- group_notification_preferences: the member's own (the foreign key proves the Membership).
create policy group_notification_preferences_select_own on nestly.group_notification_preferences
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy group_notification_preferences_insert_own on nestly.group_notification_preferences
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy group_notification_preferences_update_own on nestly.group_notification_preferences
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy group_notification_preferences_select_notify on nestly.group_notification_preferences
  for select to app_owner
  using ((select nestly.notify_scope()) = 'group');

grant select on table nestly.group_notification_preferences to authenticated;
grant insert (group_id, mode) on table nestly.group_notification_preferences to authenticated;
grant update (mode) on table nestly.group_notification_preferences to authenticated;

-- group_recommendations (AC-050): a Regular user recommends an active Group to an active Friend; sender and recipient read it.
create policy group_recommendations_select_party on nestly.group_recommendations
  for select to authenticated
  using ((select nestly.is_active_account()) and (select auth.uid()) in (sender_id, recipient_id));

create policy group_recommendations_insert_sender on nestly.group_recommendations
  for insert to authenticated
  with check ((select nestly.caller_account_type()) = 'regular' and sender_id = (select auth.uid())
    and exists (select 1 from nestly.groups g where g.id = group_recommendations.group_id and g.status = 'active')
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = group_recommendations.recipient_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = group_recommendations.recipient_id))));

grant select on table nestly.group_recommendations to authenticated;
grant insert (group_id, recipient_id) on table nestly.group_recommendations to authenticated;

-- group_highlight_configurations: readable by every active account (a versioned constant); no write policy for any role.
create policy group_highlight_configurations_select_all on nestly.group_highlight_configurations
  for select to authenticated
  using ((select nestly.is_active_account()));

grant select on table nestly.group_highlight_configurations to authenticated;

-- private_group_content_views (NFR-PRIV-002): PRIVATE_GROUP_MODERATE (REPORTS_VIEW with it; the Admin always) opens one reported item.
create policy private_group_content_views_select_own on nestly.private_group_content_views
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

create policy private_group_content_views_insert_staff on nestly.private_group_content_views
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid())
    and (select nestly.has_permission('PRIVATE_GROUP_MODERATE')));

grant select on table nestly.private_group_content_views to authenticated;
grant insert (report_id) on table nestly.private_group_content_views to authenticated;

-- posts. RESTRICTIVE: a group post is readable while its Group is active and Public or the caller is a member; to staff only inside the
-- transaction of an audited view of a report on it; counted (never read) on the analytics screen.
create policy posts_group_hide on nestly.posts
  as restrictive for select to authenticated
  using (group_id is null
    or exists (select 1 from nestly.groups g
                where g.id = posts.group_id and g.status = 'active'
                  and (g.privacy = 'public'
                    or exists (select 1 from nestly.group_access a where a.group_id = g.id and a.user_id = (select auth.uid()))))
    or exists (select 1 from nestly.private_group_content_views v
                where v.viewer_id = (select auth.uid()) and v.post_id = posts.id
                  and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned())
    or (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.analytics_reader())));

create policy posts_group_insert on nestly.posts
  as restrictive for insert to authenticated
  with check (group_id is null
    or (nestly.my_group_rank(group_id) > 0
      and exists (select 1 from nestly.groups g where g.id = posts.group_id and g.status = 'active')));

-- A Group Moderator or higher removes a post of a lower Role in the Group (an anonymous post counts as a member's: its author is never read).
create policy posts_delete_group_manager on nestly.posts
  for delete to authenticated
  using ((select nestly.is_active_account()) and group_id is not null and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = posts.group_id and m.user_id = posts.author_id), 1) < nestly.my_group_rank(group_id));

create policy posts_update_group_manager on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and group_id is not null and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = posts.group_id and m.user_id = posts.author_id), 1) < nestly.my_group_rank(group_id))
  with check (status = 'deleted' and group_id is not null and nestly.my_group_rank(group_id) >= 2);

create policy posts_select_group_held on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'deleted' and held_xact = pg_catalog.pg_current_xact_id_if_assigned()
    and group_id is not null and nestly.my_group_rank(group_id) >= 2);

grant insert (group_id) on table nestly.posts to authenticated;
grant select (group_id) on table nestly.posts to authenticated;

-- comments: the same hiding, membership and removal.
create policy comments_group_hide on nestly.comments
  as restrictive for select to authenticated
  using (group_id is null
    or exists (select 1 from nestly.groups g
                where g.id = comments.group_id and g.status = 'active'
                  and (g.privacy = 'public'
                    or exists (select 1 from nestly.group_access a where a.group_id = g.id and a.user_id = (select auth.uid()))))
    or exists (select 1 from nestly.private_group_content_views v
                where v.viewer_id = (select auth.uid()) and v.comment_id = comments.id
                  and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned())
    or (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.analytics_reader())));

create policy comments_group_insert on nestly.comments
  as restrictive for insert to authenticated
  with check (exists (select 1 from nestly.posts p
                       where p.id = comments.post_id and (p.group_id is null or nestly.my_group_rank(p.group_id) > 0)));

create policy comments_delete_group_manager on nestly.comments
  for delete to authenticated
  using ((select nestly.is_active_account()) and group_id is not null and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = comments.group_id and m.user_id = comments.author_id), 1) < nestly.my_group_rank(group_id));

create policy comments_update_group_manager on nestly.comments
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and group_id is not null and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = comments.group_id and m.user_id = comments.author_id), 1) < nestly.my_group_rank(group_id))
  with check (status = 'deleted' and group_id is not null and nestly.my_group_rank(group_id) >= 2);

create policy comments_select_group_held on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'deleted' and held_xact = pg_catalog.pg_current_xact_id_if_assigned()
    and group_id is not null and nestly.my_group_rank(group_id) >= 2);

grant select (group_id) on table nestly.comments to authenticated;

-- reactions: only members like a group post or a comment on one (AC-036).
create policy reactions_group_insert on nestly.reactions
  as restrictive for insert to authenticated
  with check (
    (post_id is not null and exists (select 1 from nestly.posts p
                                      where p.id = reactions.post_id and (p.group_id is null or nestly.my_group_rank(p.group_id) > 0)))
    or (comment_id is not null and exists (select 1 from nestly.comments c
                                            where c.id = reactions.comment_id and (c.group_id is null or nestly.my_group_rank(c.group_id) > 0))));

-- regular_names: a fellow member's name; a pending requester's to the Group's managers (the request's own policy); a blocked user's to them.
create policy regular_names_select_group_member on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.group_members m
                  join nestly.group_access a on a.group_id = m.group_id and a.user_id = (select auth.uid())
                 where m.user_id = regular_names.user_id));

create policy regular_names_select_group_requester on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.group_join_requests r where r.user_id = regular_names.user_id and r.status = 'pending'));

create policy regular_names_select_group_banned on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.group_bans b where b.user_id = regular_names.user_id and nestly.my_group_rank(b.group_id) >= 2));

grant select (is_private_group) on table nestly.reports to authenticated;

-- 9. Notifications (rule 17): notify_post() no longer speaks of group posts; notify_group() does.
create or replace function nestly.notify_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  r record;
begin
  if new.group_id is not null then
    return null;   -- a group post: notify_group() (I10)
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', 'post', true);
  if new.is_share then
    select p.author_id into v_owner from nestly.posts p where p.id = new.shared_post_id;
    if v_owner is distinct from new.author_id then
      perform nestly.notify_deliver(v_owner, 'post_shared', 'shares', new.author_id, 'post', new.id, new.id, false);
    end if;
  elsif not new.is_anonymous and new.author_id is not null then
    for r in
      select fp.user_id as friend_id
        from nestly.friend_content_notification_preferences fp
       where fp.friend_id = new.author_id and fp.is_enabled
         and exists (
           select 1 from nestly.friendships f
            where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
              and ((f.requester_id = new.author_id and f.addressee_id = fp.user_id)
                or (f.addressee_id = new.author_id and f.requester_id = fp.user_id)))
    loop
      perform nestly.notify_deliver(r.friend_id, 'friend_post', 'friend_posts', new.author_id, 'post', new.id, new.id, false);
    end loop;
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

create function nestly.notify_group()
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
  v_threshold integer;
  v_count bigint;
  r record;
begin
  perform pg_catalog.set_config('nestly.notify_scope', 'group', true);
  if tg_table_name = 'group_recommendations' then
    perform nestly.notify_deliver(new.recipient_id, 'group_recommended', 'groups', new.sender_id, 'group', new.group_id, new.id, false);
  elsif tg_table_name = 'group_invitations' then
    perform nestly.notify_deliver(new.invitee_id, 'group_invited', 'groups', new.inviter_id, 'group', new.group_id, new.id, false);
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
    -- a like or a comment on a group post: the post becomes a highlight when the likes and comments by others reach the threshold
    v_post := new.post_id;
    if v_post is not null then
      select p.group_id, coalesce(p.author_id, pa.author_id) into v_group, v_author
        from nestly.posts p left join nestly.post_authors pa on pa.post_id = p.id
       where p.id = v_post;
      select c.engagement_threshold into v_threshold from nestly.group_highlight_configurations c where c.is_active;
      if v_group is not null and v_threshold is not null then
        v_count := (select count(*) from nestly.reactions x where x.post_id = v_post and not x.is_by_author)
                 + (select count(*) from nestly.comments c where c.post_id = v_post and c.status = 'active' and not c.is_by_post_author);
        if v_count = v_threshold then
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

create trigger notify_group_recommendation
  after insert on nestly.group_recommendations
  for each row execute function nestly.notify_group();

create trigger notify_group_invitation
  after insert on nestly.group_invitations
  for each row execute function nestly.notify_group();

create trigger notify_group_join_request
  after insert on nestly.group_join_requests
  for each row execute function nestly.notify_group();

create trigger notify_group_join_approved
  after update of status on nestly.group_join_requests
  for each row when (new.status = 'approved') execute function nestly.notify_group();

create trigger notify_group_post
  after insert on nestly.posts
  for each row when (new.group_id is not null) execute function nestly.notify_group();

create trigger notify_group_pinned
  after update of pinned_post_id on nestly.groups
  for each row when (new.pinned_post_id is not null and new.pinned_post_id is distinct from old.pinned_post_id)
  execute function nestly.notify_group();

create trigger notify_group_comment
  after insert on nestly.comments
  for each row when (new.group_id is not null) execute function nestly.notify_group();

create trigger notify_group_reaction
  after insert on nestly.reactions
  for each row when (new.post_id is not null) execute function nestly.notify_group();

-- 10. The audit trigger, replaced with the private_group_content_views branch -------------------------------------------
create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'status_guides' then
    -- FR-ADMIN-012: an Admin-only action (no assignable Permission Key applies). Before/After carry what the guide is, not its text.
    v_action := case
      when tg_op = 'INSERT' then 'guide_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then case v_new ->> 'status'
        when 'published' then 'guide_published' when 'hidden' then 'guide_hidden' else 'guide_unpublished' end
      else 'guide_edited' end;
    v_kind := 'guide';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'stageKind', v_old ->> 'stage_kind', 'rangeFrom', v_old -> 'range_from', 'rangeTo', v_old -> 'range_to',
      'sourceCheckedOn', v_old ->> 'source_checked_on', 'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'stageKind', v_new ->> 'stage_kind',
      'rangeFrom', v_new -> 'range_from', 'rangeTo', v_new -> 'range_to', 'sourceCheckedOn', v_new ->> 'source_checked_on',
      'bodyChars', pg_catalog.char_length(v_new ->> 'body'), 'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on an image (a queued one approved or rejected; a checked one rejected after
    -- a report or as a suspicion). heldAsSuspected: the image is kept 90 days and never enters the training set.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'heldAsSuspected', v_new -> 'is_held');
  elsif tg_table_name = 'media_reviews' then
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told).
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_suspected';
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after');
  elsif tg_table_name = 'support_requests' then
    -- FR-ADMIN-002: a status change of a Support request (the trigger fires only when the status moves).
    v_key := 'SUPPORT_HANDLE';
    v_action := 'support_status_changed';
    v_kind := 'support_request';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'topic', v_new ->> 'topic');
  elsif tg_table_name = 'support_messages' then
    -- FR-ADMIN-002, FR-CHAT-004: a reply in the name of Support or an internal note (the trigger fires only for author_kind 'support').
    -- The entry carries what it was, never the text.
    v_key := 'SUPPORT_HANDLE';
    v_action := case when (v_new ->> 'is_internal')::boolean then 'support_note_added' else 'support_replied' end;
    v_kind := 'support_request';
    v_target := (v_new ->> 'support_request_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('internal', v_new -> 'is_internal', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'));
  elsif tg_table_name = 'reported_message_views' then
    -- §9.6 (Afik 20.10.2026): a staff member opened a reported chat message (only that message; never the conversation).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_message_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'moderator_invitations' then
    -- FR-ADMIN-004: the Admin invites or revokes an invitation (its redemption is audited on staff_roles). Never the code or its hash.
    if tg_op = 'INSERT' then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invited';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_after := pg_catalog.jsonb_build_object('note', v_new ->> 'note', 'expiresAt', v_new ->> 'expires_at');
    elsif v_new ->> 'revoked_at' is not null and v_old ->> 'revoked_at' is null then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invitation_revoked';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_before := pg_catalog.jsonb_build_object('note', v_old ->> 'note');
    else
      raise exception 'audit_trigger: only an invitation issued or revoked is audited here' using errcode = '42501';
    end if;
  elsif tg_table_name = 'staff_roles' then
    -- FR-ADMIN-004: a Moderator created from an invitation (the new staff role exists now, so the entry carries it as the actor).
    v_action := 'moderator_joined';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
  elsif tg_table_name = 'system_announcements' then
    -- FR-ADMIN-008, AC-049: created, edited, published or removed. Before/After carry the status, the title and the body's length.
    v_key := 'SYSTEM_ANNOUNCEMENTS';
    v_action := case
      when tg_op = 'INSERT' then 'announcement_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'announcement_' || (v_new ->> 'status')
      else 'announcement_edited' end;
    v_kind := 'announcement';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'private_group_content_views' then
    -- NFR-PRIV-002, BR-040 (I10): a staff member opened reported Private Group content (only that post or comment; never the Group).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_content_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('targetKind', case when v_new ->> 'post_id' is not null then 'post' else 'comment' end);
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger private_group_content_views_audit
  after insert on nestly.private_group_content_views
  for each row execute function nestly.audit_trigger();

-- 11. Comments ------------------------------------------------------------------------------------------------------------
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one, a System Announcement created, edited, published or removed, or a staff view of reported Private Group content: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';
comment on function nestly.notify_post() is
  'SECURITY DEFINER (approved exception, rule 17). After insert on posts: a share of my post; a new named post of a Friend I chose to follow (never an anonymous post, AC-076). A group post is left to notify_group() (I10). Declares nestly.notify_scope = post and clears it.';
comment on function nestly.notify_group() is
  'SECURITY DEFINER (approved exception, rule 17; I10). After a Group recommendation (to the Friend), an invitation (to the invitee), a Join Request (to the Owner and Group Admins) or its approval (to the requester); a new group post (members whose mode is all); a pinned post or a post whose likes and comments by others reached the Highlights threshold (members on all or highlights; FR-ALG-010, BR-060: deterministic). Never to the actor, never across a block (notify_deliver), and every category switch is honoured. Declares nestly.notify_scope = group and clears it. No EXECUTE for any runtime role.';
comment on function nestly.group_role_rank(text) is 'IMMUTABLE. The Group Role hierarchy (FR-GRP-003, BR-041): owner 4, admin 3, moderator 2, member 1, anything else 0.';
comment on function nestly.my_group_rank(uuid) is 'SECURITY INVOKER, caller only. The caller''s Group Role rank in that Group (0 = not a member), from the caller''s own group_access row. Never used by a policy of group_access.';
comment on function nestly.groups_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. Only the Owner changes Public/Private or deletes (NS027); a deleted Group stays deleted and loses its pin; a pin names an active post of the Group; updated_at, deleted_at and deleted_xact are the database''s.';
comment on function nestly.groups_insert_owner() is 'AFTER INSERT, SECURITY INVOKER. The creator becomes the Group Owner in the same statement (FR-GRP-004, VAL-028).';
comment on function nestly.group_members_insert_access() is 'AFTER INSERT, SECURITY INVOKER. Writes the member''s own group_access copy of the new Membership.';
comment on function nestly.group_members_guard() is 'BEFORE UPDATE OR DELETE, SECURITY INVOKER. Only the Role changes; the Owner never leaves and never steps down without another Owner (NS026, ERR-026). The owner role''s cascades pass.';
comment on function nestly.group_join_requests_decide() is 'BEFORE UPDATE, SECURITY INVOKER. A Join Request is answered once, from pending; a blocked user is never approved (NS028); decided_by, decided_at and decided_xact are the database''s.';
comment on function nestly.group_join_requests_admit() is 'AFTER UPDATE (approved), SECURITY INVOKER. The requester becomes a member in the same statement, with the approver''s rights.';
comment on function nestly.group_invitations_decide() is 'BEFORE UPDATE, SECURITY INVOKER. An invitation is answered once, from pending; a blocked user cannot accept (NS028); decided_at and decided_xact are the database''s.';
comment on function nestly.group_invitations_admit() is 'AFTER UPDATE (accepted), SECURITY INVOKER. The invitee becomes a member in the same statement.';
comment on function nestly.group_bans_remove() is 'AFTER INSERT, SECURITY INVOKER. The blocked user''s Membership ends in the same statement.';
comment on function nestly.group_notification_preferences_touch() is 'BEFORE UPDATE, SECURITY INVOKER. updated_at is the database''s.';
comment on function nestly.posts_group_share_guard() is 'BEFORE INSERT of a share, SECURITY INVOKER. A Private Group post is never shared (NS002).';
comment on function nestly.posts_reject_group_edit() is 'BEFORE UPDATE of audience, body, stage_tag, SECURITY INVOKER. On a group post only its author edits (a Group manager may only remove).';
comment on function nestly.comments_insert_group() is 'BEFORE INSERT, SECURITY INVOKER. A comment carries its post''s Group (read under the caller''s RLS).';
comment on function nestly.reports_private_group() is 'BEFORE INSERT, SECURITY INVOKER, after reports_insert_snapshot. A report on Private Group content is marked and keeps no copy of the text (NFR-PRIV-002, ERR-024).';
comment on function nestly.private_group_content_views_target() is 'BEFORE INSERT, SECURITY INVOKER. A view names the reported post or comment of a report on Private Group content (read under reports_select_staff); view_xact is this transaction.';

comment on table nestly.groups is 'SRS Group (§13, FR-GRP-001/003/004): a Public or Private Group. Every active account reads an active Group''s details (discovery, BR-031/032). Created by any active Regular or Professional account without Admin approval (BR-048); the Owner and Group Admins edit it; only the Owner changes Public/Private or deletes it (soft delete).';
comment on column nestly.groups.id is 'The Group.';
comment on column nestly.groups.name is 'The name, 3-60 characters, no leading or trailing space.';
comment on column nestly.groups.description is 'The basic description, up to 1,000 characters; NULL when none.';
comment on column nestly.groups.rules is 'The Group''s rules (FR-GRP-003: Admin manages Rules), up to 2,000 characters; NULL when none.';
comment on column nestly.groups.privacy is 'public or private (FR-GRP-001). Only the Owner changes it.';
comment on column nestly.groups.status is 'active or deleted. A deleted Group, its members'' view and its content are gone for everyone.';
comment on column nestly.groups.pinned_post_id is 'The pinned post (an announcement; FR-ALG-010), an active post of this Group; NULL when none; cleared when the post goes.';
comment on column nestly.groups.created_by is 'Who created it (default auth.uid()); not the Owner after a transfer (group_members holds the Roles).';
comment on column nestly.groups.created_at is 'When it was created.';
comment on column nestly.groups.updated_at is 'When it last changed (the database clock).';
comment on column nestly.groups.deleted_at is 'When the Owner deleted it (the database clock).';
comment on column nestly.groups.deleted_xact is 'The deleting transaction: only inside it is the deleted row readable (the UPDATE needs it). Never granted.';
comment on column nestly.posts.group_id is 'I10: the Group the post was written in; NULL for a feed post. Set at insert only (members only); a group post is always audience everyone and never a share.';
comment on column nestly.comments.group_id is 'I10: the Group of the comment''s post, set by comments_insert_group; readable, never written by a client (no INSERT or UPDATE grant).';
comment on column nestly.reports.is_private_group is 'I10: the report is on Private Group content; then target_text is NULL and staff read the content only through private_group_content_views (audited).';

comment on table nestly.group_members is 'SRS Membership and GroupRoleAssignment (§13, FR-GRP-002/003): a member and their Group Role (owner > admin > moderator > member, BR-041). Readable by the member, by fellow members, and for a Public Group by every active account (never with a name). Exactly one Owner per Group (deferred exclusion: a transfer is two updates in one transaction).';
comment on column nestly.group_members.group_id is 'The Group.';
comment on column nestly.group_members.user_id is 'The member (default auth.uid(); the manager names the requester on an approval).';
comment on column nestly.group_members.member_status is 'Copy of the member''s users.status (composite FK, ON UPDATE CASCADE): only active members are shown to others.';
comment on column nestly.group_members.role is 'owner, admin, moderator or member. Group Roles are separate from System Admin and Moderator (BR-033).';
comment on column nestly.group_members.created_at is 'When the member joined.';
comment on table nestly.group_access is 'The member''s own copy of their Membership and Role, kept by the foreign key (ON UPDATE / DELETE CASCADE). Read by its owner only; it lets a policy ask the caller''s Group Role without reading group_members inside its own policies.';
comment on column nestly.group_access.group_id is 'The Group.';
comment on column nestly.group_access.user_id is 'The member, the only reader of the row.';
comment on column nestly.group_access.role is 'The member''s Role, as in group_members.';
comment on table nestly.group_join_requests is 'SRS GroupJoinRequest (§13, FR-GRP-002, VAL-020, ERR-018): a request to join a Private Group, one pending per user and Group. The requester and the Group''s Owner and Admins read it; the Owner or an Admin approves (the requester becomes a member) or rejects; the requester may cancel.';
comment on column nestly.group_join_requests.id is 'The request.';
comment on column nestly.group_join_requests.group_id is 'The Private Group.';
comment on column nestly.group_join_requests.user_id is 'The requester (default auth.uid()).';
comment on column nestly.group_join_requests.status is 'pending, approved, rejected or cancelled; answered once.';
comment on column nestly.group_join_requests.created_at is 'When it was sent.';
comment on column nestly.group_join_requests.decided_by is 'The Owner or Admin who approved or rejected it (the database''s); NULL when pending or cancelled.';
comment on column nestly.group_join_requests.decided_at is 'When it was answered (the database clock).';
comment on column nestly.group_join_requests.decided_xact is 'The answering transaction (the database''s): an approval admits the requester only inside it. Readable (group_members_insert_approved reads it), never written by a client.';
comment on table nestly.group_invitations is 'SRS GroupInvitation (§13, FR-GRP-002): an Owner''s or Group Admin''s invitation of an active Friend who is not a member. The invitee accepts (becomes a member, Public or Private) or declines; the inviter or a manager may cancel. One pending per Group and invitee.';
comment on column nestly.group_invitations.id is 'The invitation.';
comment on column nestly.group_invitations.group_id is 'The Group.';
comment on column nestly.group_invitations.inviter_id is 'Who invited (default auth.uid()).';
comment on column nestly.group_invitations.invitee_id is 'The invited Friend.';
comment on column nestly.group_invitations.status is 'pending, accepted, declined or cancelled; answered once.';
comment on column nestly.group_invitations.created_at is 'When it was sent.';
comment on column nestly.group_invitations.decided_at is 'When it was answered (the database clock).';
comment on column nestly.group_invitations.decided_xact is 'The answering transaction (the database''s): an acceptance admits the invitee only inside it. Readable (group_members_insert_self reads it), never written by a client.';
comment on table nestly.group_bans is 'SRS GroupMemberEnforcement, "remove and block" (§13, FR-GRP-003): the user leaves the Group and cannot join, ask or be invited until unblocked. A Group Moderator or higher, only against a lower Role (ERR-019); the blocked user reads their own row.';
comment on column nestly.group_bans.group_id is 'The Group.';
comment on column nestly.group_bans.user_id is 'The blocked user.';
comment on column nestly.group_bans.banned_by is 'Who blocked (default auth.uid()).';
comment on column nestly.group_bans.created_at is 'When.';
comment on table nestly.group_notification_preferences is 'SRS GroupNotificationPreference (§13, VAL-035, FR-ALG-010): a member''s mode for one Group: all, highlights or off. No row = highlights. Goes with the Membership.';
comment on column nestly.group_notification_preferences.group_id is 'The Group.';
comment on column nestly.group_notification_preferences.user_id is 'The member (default auth.uid()).';
comment on column nestly.group_notification_preferences.mode is 'all (every new post, pins, highlights), highlights (pins and highlights) or off (none of these; direct events still arrive).';
comment on column nestly.group_notification_preferences.updated_at is 'When it last changed (the database clock).';
comment on table nestly.group_recommendations is 'FR-GRP-002, AC-050: a Regular user recommends a Group to an active Friend; the Friend gets a notification with the Group as its target. No Membership changes. Once per Group, sender and recipient.';
comment on column nestly.group_recommendations.id is 'The recommendation.';
comment on column nestly.group_recommendations.group_id is 'The Group recommended.';
comment on column nestly.group_recommendations.sender_id is 'Who recommended (default auth.uid()), a Regular user.';
comment on column nestly.group_recommendations.recipient_id is 'The Friend it was sent to.';
comment on column nestly.group_recommendations.created_at is 'When.';
comment on table nestly.group_highlight_configurations is 'FR-ALG-010, BR-060: the versioned Group Highlights threshold (deterministic, no ML). Written by migrations only; readable by every active account.';
comment on column nestly.group_highlight_configurations.version is 'Integer > 0.';
comment on column nestly.group_highlight_configurations.engagement_threshold is 'Likes and comments by others on a group post at which it becomes a highlight (2-1,000).';
comment on column nestly.group_highlight_configurations.is_active is 'At most one active version.';
comment on column nestly.group_highlight_configurations.created_at is 'When the version was written.';
comment on column nestly.group_highlight_configurations.reason is 'Why the version exists.';
comment on table nestly.private_group_content_views is 'NFR-PRIV-002, BR-040, ERR-024: a staff view of reported Private Group content, one row per opening, by PRIVATE_GROUP_MODERATE (with REPORTS_VIEW; the Admin always) on the admin screens, audited in the same transaction (private_group_content_viewed). Only inside that transaction is that post or comment readable to them. No Membership, no UPDATE or DELETE.';
comment on column nestly.private_group_content_views.id is 'Row id.';
comment on column nestly.private_group_content_views.report_id is 'The report opened.';
comment on column nestly.private_group_content_views.viewer_id is 'The staff member (default auth.uid()).';
comment on column nestly.private_group_content_views.post_id is 'The reported post (from the report; set by the trigger).';
comment on column nestly.private_group_content_views.comment_id is 'The reported comment (from the report; set by the trigger).';
comment on column nestly.private_group_content_views.view_xact is 'The viewing transaction (the database''s): the content is readable only inside it.';
comment on column nestly.private_group_content_views.created_at is 'Database clock.';

comment on index nestly.groups_created_at_idx is 'Discovery: active Groups, newest first.';
comment on index nestly.groups_created_by_idx is 'The users FK SET NULL.';
comment on index nestly.posts_group_id_created_at_idx is 'A Group''s posts, newest first.';
comment on index nestly.comments_group_id_idx is 'Group comments (the hiding policy, the managers'' removal).';
comment on index nestly.group_members_user_id_idx is 'My Groups; the users FK cascade.';
comment on index nestly.group_members_managers_idx is 'The Owner and Admins of a Group (Join Request notifications).';
comment on index nestly.group_access_user_id_idx is 'The caller''s own memberships.';
comment on index nestly.group_join_requests_pending_key is 'One pending request per user and Group (ERR-018).';
comment on index nestly.group_join_requests_user_id_idx is 'My requests; the users FK cascade.';
comment on index nestly.group_join_requests_decided_by_idx is 'The users FK SET NULL.';
comment on index nestly.group_invitations_pending_key is 'One pending invitation per Group and invitee.';
comment on index nestly.group_invitations_invitee_id_idx is 'My invitations; the users FK cascade.';
comment on index nestly.group_invitations_inviter_id_idx is 'The users FK cascade.';
comment on index nestly.group_bans_user_id_idx is 'The users FK cascade; the join checks.';
comment on index nestly.group_bans_banned_by_idx is 'The users FK SET NULL.';
comment on index nestly.group_notification_preferences_user_id_idx is 'The users side of the membership FK.';
comment on index nestly.group_recommendations_sender_id_idx is 'The users FK cascade.';
comment on index nestly.group_recommendations_recipient_id_idx is 'The users FK cascade.';
comment on index nestly.group_highlight_configurations_active_key is 'At most one active version.';
comment on index nestly.private_group_content_views_report_id_idx is 'The reports FK cascade; the read check.';
comment on index nestly.private_group_content_views_viewer_id_idx is 'The users FK restrict check.';

comment on policy groups_select_active on nestly.groups is 'Every active account reads an active Group''s details, Public or Private (discovery, BR-031/032); a Group deleted in this transaction stays readable inside it.';
comment on policy groups_insert_creator on nestly.groups is 'An active Regular or Professional account creates a Group in its own name, without Admin approval (BR-048, AC-056); staff never (ERR-022).';
comment on policy groups_update_manager on nestly.groups is 'The Owner and Group Admins edit an active Group (name, description, rules, pin); privacy and deletion are the Owner''s (groups_update_guard).';
comment on policy group_members_select_viewer on nestly.group_members is 'One''s own Memberships; every active member of a Group one belongs to; the active members of an active Public Group (rows only: names come through regular_names_select_group_member, to fellow members).';
comment on policy group_members_insert_owner on nestly.group_members is 'The creator as Owner, in the transaction that created the Group (groups_insert_owner).';
comment on policy group_members_insert_self on nestly.group_members is 'Join: oneself as a member of an active Public Group, or of any active Group whose invitation one accepted in this transaction (AC-036); never a blocked user or staff.';
comment on policy group_members_insert_approved on nestly.group_members is 'The Owner or a Group Admin admits the requester whose Join Request they approved in this transaction (group_join_requests_admit; BR-032).';
comment on policy group_members_update_manager on nestly.group_members is 'A higher Role changes a lower Role to one below its own: an Admin manages Group Moderators, only the Owner appoints or removes an Admin, and only the Owner makes someone Owner (AC-038, VAL-021).';
comment on policy group_members_update_owner_step_down on nestly.group_members is 'The Owner becomes an Admin after making someone else Owner (group_members_guard requires the other Owner).';
comment on policy group_members_delete_self on nestly.group_members is 'A member leaves; the Owner is refused by group_members_guard (ERR-026).';
comment on policy group_members_delete_manager on nestly.group_members is 'A Group Moderator or higher removes a member of a lower Role (ERR-019).';
comment on policy group_members_select_notify on nestly.group_members is 'notify_group only (nestly.notify_scope = group): the recipients of a Group''s notification.';
comment on policy group_access_select_own on nestly.group_access is 'The member reads their own copy; nobody else.';
comment on policy group_access_insert_member on nestly.group_access is 'Written by group_members_insert_access; the foreign key proves the Membership and its Role.';
comment on policy group_join_requests_select_party on nestly.group_join_requests is 'The requester and the Group''s Owner and Admins.';
comment on policy group_join_requests_insert_self on nestly.group_join_requests is 'A non-member Regular or Professional account asks to join an active Private Group, unless blocked from it (VAL-020).';
comment on policy group_join_requests_update_requester on nestly.group_join_requests is 'The requester cancels a pending request.';
comment on policy group_join_requests_update_manager on nestly.group_join_requests is 'The Owner or a Group Admin approves or rejects a pending request (FR-GRP-002).';
comment on policy group_invitations_select_party on nestly.group_invitations is 'The invitee, the inviter and the Group''s Owner and Admins.';
comment on policy group_invitations_insert_manager on nestly.group_invitations is 'The Owner or a Group Admin invites an active Friend who is neither a member nor blocked from the Group.';
comment on policy group_invitations_update_invitee on nestly.group_invitations is 'The invitee accepts or declines a pending invitation.';
comment on policy group_invitations_update_manager on nestly.group_invitations is 'The inviter, the Owner or a Group Admin cancels a pending invitation.';
comment on policy group_bans_select_party on nestly.group_bans is 'The blocked user (their own row) and the Group''s Moderators and higher.';
comment on policy group_bans_insert_manager on nestly.group_bans is 'A Group Moderator or higher blocks a user of a lower Role, or a non-member (ERR-019).';
comment on policy group_bans_delete_manager on nestly.group_bans is 'A Group Moderator or higher unblocks.';
comment on policy group_notification_preferences_select_own on nestly.group_notification_preferences is 'The member reads their own modes.';
comment on policy group_notification_preferences_insert_own on nestly.group_notification_preferences is 'The member sets a mode for a Group they belong to (the foreign key proves it).';
comment on policy group_notification_preferences_update_own on nestly.group_notification_preferences is 'The member changes their own mode.';
comment on policy group_notification_preferences_select_notify on nestly.group_notification_preferences is 'notify_group only (nestly.notify_scope = group): the recipients'' modes.';
comment on policy group_recommendations_select_party on nestly.group_recommendations is 'The sender and the recipient.';
comment on policy group_recommendations_insert_sender on nestly.group_recommendations is 'A Regular user recommends an active Group to an active Friend (AC-050).';
comment on policy group_highlight_configurations_select_all on nestly.group_highlight_configurations is 'Every version is readable by an active account (a constant, no personal data). No write policy for any role.';
comment on policy private_group_content_views_select_own on nestly.private_group_content_views is 'A staff member reads their own views.';
comment on policy private_group_content_views_insert_staff on nestly.private_group_content_views is 'PRIVATE_GROUP_MODERATE (REPORTS_VIEW with it; the Admin always) opens a report on Private Group content (the trigger checks the report); audited.';
comment on policy posts_group_hide on nestly.posts is 'RESTRICTIVE (I10): a group post is readable while its Group is active and Public or the caller is a member (AC-036/037, NFR-PRIV-002, ERR-017); to staff only inside the transaction of an audited view of a report on it (ERR-024); counted on the analytics screen.';
comment on policy posts_group_insert on nestly.posts is 'RESTRICTIVE (I10): only a member posts in an active Group (AC-036).';
comment on policy posts_delete_group_manager on nestly.posts is 'A Group Moderator or higher removes a post of a lower Role in the Group (an anonymous post counts as a member''s).';
comment on policy posts_update_group_manager on nestly.posts is 'The same manager holds such a post (status deleted) when an open report prevents its deletion (delete_post).';
comment on policy posts_select_group_held on nestly.posts is 'The manager reads the post they held, inside the holding transaction only (the UPDATE needs it).';
comment on policy comments_group_hide on nestly.comments is 'RESTRICTIVE (I10): a group comment is readable as its post''s Group allows; to staff only inside an audited view of a report on it.';
comment on policy comments_group_insert on nestly.comments is 'RESTRICTIVE (I10): only a member comments or replies on a group post (AC-036).';
comment on policy comments_delete_group_manager on nestly.comments is 'A Group Moderator or higher removes a comment of a lower Role in the Group.';
comment on policy comments_update_group_manager on nestly.comments is 'The same manager holds such a comment when an open report prevents its deletion (delete_comment).';
comment on policy comments_select_group_held on nestly.comments is 'The manager reads the comment they held, inside the holding transaction only.';
comment on policy reactions_group_insert on nestly.reactions is 'RESTRICTIVE (I10): only a member likes a group post or a comment on one (AC-036).';
comment on policy regular_names_select_group_member on nestly.regular_names is 'I10: the name of a member of a Group the caller belongs to.';
comment on policy regular_names_select_group_requester on nestly.regular_names is 'I10: the name of a pending requester, to whoever reads the request (the Group''s Owner and Admins).';
comment on policy regular_names_select_group_banned on nestly.regular_names is 'I10: the name of a user blocked from a Group, to that Group''s Moderators and higher.';
