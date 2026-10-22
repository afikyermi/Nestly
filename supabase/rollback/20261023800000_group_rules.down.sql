-- =====================================================================================================================
-- Down script for supabase/migrations/20261023800000_group_rules.sql (I10 completion C: Highlights v2, group_highlights, invitations
-- by any member with approval, group_member_enforcements, no plain removal, the mute). Outside supabase/migrations on purpose: the CLI
-- never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while no enforcement record exists and no invitation needed approval (refuses otherwise: data would be lost). The
--           Highlight rows are derived (the notifications they caused stay) and go with their table.
-- Restores: notify_group() and group_invitations_decide() as 20261022300000 wrote them, its invitation, member-removal, insert and
--           recommendation policies, constraints and index, and the Highlights configuration v1 as the active one. Drops what the
--           migration added; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the group rules down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only, for
  -- the checks and the configuration rows; put back below.
  alter table nestly.group_member_enforcements no force row level security;
  alter table nestly.group_invitations no force row level security;
  if exists (select 1 from nestly.group_member_enforcements) or exists (select 1 from nestly.group_invitations where needs_approval) then
    raise exception 'an I10 completion C row exists (an enforcement record or an invitation that needed approval): the down script refuses';
  end if;
  alter table nestly.group_invitations force row level security;
end
$$;

-- notify_group(), as 20261022300000 wrote it
drop trigger notify_group_enforcement on nestly.group_member_enforcements;
drop trigger notify_group_invitation_decided on nestly.group_invitations;
drop policy group_bans_select_notify on nestly.group_bans;
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
  v_threshold integer;
  v_count bigint;
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
    -- a like or a comment on a group post: the post becomes a highlight when the likes and comments by others reach the threshold. Tried
    -- at the threshold and a little past it (concurrent engagements can step over the exact count); notify_deliver delivers it once.
    select coalesce(p.author_id, pa.author_id) into v_author
      from nestly.posts p left join nestly.post_authors pa on pa.post_id = p.id
     where p.id = v_post;
    select c.engagement_threshold into v_threshold from nestly.group_highlight_configurations c where c.is_active;
    if v_threshold is not null then
      v_count := (select count(*) from nestly.reactions x where x.post_id = v_post and not x.is_by_author)
               + (select count(*) from nestly.comments c where c.post_id = v_post and c.status = 'active' and not c.is_by_post_author);
      if v_count between v_threshold and v_threshold + 4 then
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
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

comment on function nestly.notify_group() is
  'SECURITY DEFINER (approved exception, rule 17; I10). After a Group recommendation (to the Friend), an invitation (to the invitee), a Join Request (to the Owner and Group Admins) or its approval (to the requester); a new group post (members whose mode is all); a pinned post or a post whose likes and comments by others reached the Highlights threshold (members on all or highlights; FR-ALG-010, BR-060: deterministic). Never to the actor, never across a block (notify_deliver), and every category switch is honoured. Declares nestly.notify_scope = group and clears it. No EXECUTE for any runtime role.';

-- names, the mute, member removal
drop policy regular_names_select_group_manager on nestly.regular_names;

alter policy group_suggestions_insert_sender on nestly.group_suggestions
  with check ((select nestly.caller_account_type()) = 'regular' and sender_id = (select auth.uid())
    and exists (select 1 from nestly.groups g where g.id = group_suggestions.group_id and g.status = 'active')
    and exists (select 1 from nestly.friendships f
                 where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
                   and ((f.requester_id = (select auth.uid()) and f.addressee_id = group_suggestions.recipient_id)
                     or (f.addressee_id = (select auth.uid()) and f.requester_id = group_suggestions.recipient_id))));

alter policy posts_group_insert on nestly.posts
  with check (group_id is null
    or (nestly.my_group_rank(group_id) > 0
      and exists (select 1 from nestly.groups g where g.id = posts.group_id and g.status = 'active')));

alter policy comments_group_insert on nestly.comments
  with check (exists (select 1 from nestly.posts p
                       where p.id = comments.post_id and (p.group_id is null or nestly.my_group_rank(p.group_id) > 0)));

alter policy reactions_group_insert on nestly.reactions
  with check (
    (post_id is not null and exists (select 1 from nestly.posts p
                                      where p.id = reactions.post_id and (p.group_id is null or nestly.my_group_rank(p.group_id) > 0)))
    or (comment_id is not null and exists (select 1 from nestly.comments c
                                            where c.id = reactions.comment_id and (c.group_id is null or nestly.my_group_rank(c.group_id) > 0))));

drop policy group_members_delete_blocked on nestly.group_members;
create policy group_members_delete_manager on nestly.group_members
  for delete to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 2
    and nestly.group_role_rank(role) < nestly.my_group_rank(group_id));

comment on policy group_members_delete_manager on nestly.group_members is 'A Group Moderator or higher removes a member of a lower Role (ERR-019).';

-- invitations
drop policy group_invitations_update_approver on nestly.group_invitations;
drop policy group_invitations_update_manager on nestly.group_invitations;
drop policy group_invitations_insert_member on nestly.group_invitations;
drop policy group_invitations_select_party on nestly.group_invitations;
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

create policy group_invitations_update_manager on nestly.group_invitations
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'pending'
    and (inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3))
  with check (status = 'cancelled' and (inviter_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 3));

comment on policy group_invitations_select_party on nestly.group_invitations is 'The invitee, the inviter and the Group''s Owner and Admins.';
comment on policy group_invitations_insert_manager on nestly.group_invitations is 'The Owner or a Group Admin invites an active Friend who is neither a member nor blocked from the Group.';
comment on policy group_invitations_update_manager on nestly.group_invitations is 'The inviter, the Owner or a Group Admin cancels a pending invitation.';

drop trigger group_invitations_route on nestly.group_invitations;
drop function nestly.group_invitations_route();
create or replace function nestly.group_invitations_decide()
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

comment on function nestly.group_invitations_decide() is 'BEFORE UPDATE, SECURITY INVOKER. An invitation is answered once, from pending; a blocked user cannot accept (NS028); decided_at and decided_xact are the database''s.';

drop index nestly.group_invitations_approved_by_idx;
drop index nestly.group_invitations_awaiting_idx;
drop index nestly.group_invitations_pending_key;
create unique index group_invitations_pending_key on nestly.group_invitations (group_id, invitee_id) where status = 'pending';
comment on index nestly.group_invitations_pending_key is 'One pending invitation per Group and invitee.';

alter table nestly.group_invitations
  drop constraint group_invitations_approval_check,
  drop constraint group_invitations_decided_check,
  drop constraint group_invitations_status_check,
  drop column approved_at,
  drop column approved_by,
  drop column needs_approval;
alter table nestly.group_invitations
  add constraint group_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  add constraint group_invitations_decided_check check ((status = 'pending') = (decided_at is null) and (decided_at is null) = (decided_xact is null));
comment on column nestly.group_invitations.status is 'pending, accepted, declined or cancelled; answered once.';

-- enforcement records
drop table nestly.group_member_enforcements;
drop function nestly.group_member_enforcements_apply();

-- Highlights: the rows, the threshold function, configuration v2
drop table nestly.group_highlights;
drop function nestly.group_highlight_threshold(integer);

alter table nestly.group_highlight_configurations no force row level security;
delete from nestly.group_highlight_configurations where version = 2;
update nestly.group_highlight_configurations set is_active = true where version = 1;
alter table nestly.group_highlight_configurations force row level security;

alter table nestly.group_highlight_configurations
  drop constraint group_highlight_configurations_rule_check,
  drop column maximum_threshold,
  drop column minimum_threshold,
  drop column member_percent,
  alter column engagement_threshold set not null;
comment on table nestly.group_highlight_configurations is 'FR-ALG-010, BR-060: the versioned Group Highlights threshold (deterministic, no ML). Written by migrations only; readable by every active account.';
comment on column nestly.group_highlight_configurations.engagement_threshold is 'Likes and comments by others on a group post at which it becomes a highlight (2-1,000).';

delete from supabase_migrations.schema_migrations where version = '20261023800000';

commit;
