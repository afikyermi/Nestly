-- =====================================================================================================================
-- Down script for supabase/migrations/20261026400000_group_rules_followup.sql: restores, verbatim as 20261022300000_groups.sql and
-- 20261023800000_group_rules.sql left them, nestly.my_group_rank(), notify_group() (likes plus comments), the policies
-- group_member_enforcements_select_party, regular_names_select_group_manager, group_bans_insert_manager and group_bans_delete_manager,
-- and their comments; drops reaction_owners_select_notify; deletes configuration v3 and makes v2 active again.
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod: Afik only.
-- Refuses:  once a Highlight was recorded under v3 (its row references v3; deleting it would drop a Highlight from members' feeds).
-- Restores: the state before the migration; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the group rules follow-up down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.group_highlights no force row level security;
do $$
begin
  if exists (select 1 from nestly.group_highlights h where h.configuration_version = 3) then
    raise exception 'group rules follow-up down: a Highlight was recorded under configuration v3; not rolled back';
  end if;
end
$$;
alter table nestly.group_highlights force row level security;

alter table nestly.group_highlight_configurations no force row level security;
delete from nestly.group_highlight_configurations where version = 3;
update nestly.group_highlight_configurations set is_active = true where version = 2;
alter table nestly.group_highlight_configurations force row level security;

drop policy reaction_owners_select_notify on nestly.reaction_owners;

-- notify_group() as 20261023800000_group_rules.sql created it.
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

comment on table nestly.group_highlight_configurations is
  'SRS FR-ALG-010, BR-059, BR-060: the versioned Highlights threshold. v1: a fixed count (5, inactive since I10 completion C). v2: member_percent of the Group''s active members, rounded up, within minimum_threshold..maximum_threshold (5%, 3, 20; Afik 21.10.2026). Exactly one version is active; a change is a new version by migration (no write policy).';
comment on column nestly.group_highlights.threshold is 'The threshold the post reached (likes and comments by others).';
comment on function nestly.notify_group() is
  'SECURITY DEFINER (approved exception, rule 17; I10, extended in I10 completion C). After a Group recommendation (to the Friend), an invitation (pending: to the invitee; awaiting approval: to the Owner and Group Admins), its approval (to the invitee and the inviter) or rejection (to the inviter), a mute notice (to the member, critical), a Join Request (to the Owner and Group Admins) or its approval (to the requester); a new group post (members whose mode is all); a pinned post, or a post whose likes and comments by others reached the threshold of the active version for the Group''s active members (members on all or highlights; FR-ALG-010, BR-060: deterministic), recorded once in group_highlights. Never to the actor, never across a block (notify_deliver), and every category switch is honoured but for the mute notice. Declares nestly.notify_scope = group and clears it. No EXECUTE for any runtime role.';

-- my_group_rank() as 20261022300000_groups.sql created it.
create or replace function nestly.my_group_rank(p_group uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select nestly.group_role_rank(a.role) from nestly.group_access a where a.group_id = p_group and a.user_id = auth.uid()), 0)
$$;

comment on function nestly.my_group_rank(uuid) is 'SECURITY INVOKER, caller only. The caller''s Group Role rank in that Group (0 = not a member), from the caller''s own group_access row. Never used by a policy of group_access.';

drop policy group_member_enforcements_select_party on nestly.group_member_enforcements;
create policy group_member_enforcements_select_party on nestly.group_member_enforcements
  for select to authenticated
  using ((select nestly.is_active_account()) and (user_id = (select auth.uid()) or nestly.my_group_rank(group_id) >= 2));
comment on policy group_member_enforcements_select_party on nestly.group_member_enforcements is 'The member it names, and the Group''s Moderators and higher (⭐ OP-047).';

drop policy regular_names_select_group_manager on nestly.regular_names;
create policy regular_names_select_group_manager on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and (exists (select 1 from nestly.group_invitations i
                  where i.invitee_id = regular_names.user_id and i.status = 'awaiting_approval' and nestly.my_group_rank(i.group_id) >= 3)
      or exists (select 1 from nestly.group_member_enforcements e
                  where e.user_id = regular_names.user_id and nestly.my_group_rank(e.group_id) >= 2)));
comment on policy regular_names_select_group_manager on nestly.regular_names is 'The Group''s Owner and Admins read the names of invitees awaiting their approval; its Moderators and higher the names in its enforcement history.';

drop policy group_bans_insert_manager on nestly.group_bans;
create policy group_bans_insert_manager on nestly.group_bans
  for insert to authenticated
  with check ((select nestly.is_active_account()) and banned_by = (select auth.uid()) and user_id <> (select auth.uid())
    and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = group_bans.group_id and m.user_id = group_bans.user_id), 0) < nestly.my_group_rank(group_id));

drop policy group_bans_delete_manager on nestly.group_bans;
create policy group_bans_delete_manager on nestly.group_bans
  for delete to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = group_bans.group_id and m.user_id = group_bans.banned_by), 0) <= nestly.my_group_rank(group_id));
comment on policy group_bans_insert_manager on nestly.group_bans is 'A Group Moderator or higher blocks a user of a lower Role, or a non-member (ERR-019).';
comment on policy group_bans_delete_manager on nestly.group_bans is 'A Group Moderator or higher unblocks, never a block made by a higher Role (ERR-019).';

delete from supabase_migrations.schema_migrations where version = '20261026400000';

commit;
