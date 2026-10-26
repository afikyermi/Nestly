-- =====================================================================================================================
-- Group rules follow-up — I10 completion C, migration only (the three items #180 left for a follow-up migration).
--
-- SRS: FR-ALG-010, BR-059, BR-060, FR-GRP-003, OP-068, OP-070, OP-077 (new, built per ⭐) · platform rules 8, 10, 15-17.
--
-- 1. Highlights counted by people (⭐ OP-077). The threshold of v2 is "5% of the active members, at least 3, at most 20" — a number of
--    people; until now it was compared to a number of likes plus comments, so one member writing five comments made a Highlight in a
--    small Group. From here a group post is a Highlight when the number of different people other than its author who liked or commented
--    on it reaches the threshold; each person counts once. BR-059 (a change is a new version): configuration v3, the same numbers
--    (5%, 3, 20), counted by people; v2 stays as history, inactive. Highlights already recorded stay (OP-068). notify_group() is replaced
--    (the approved definer, rule 17) with only the count changed; to tie a like to its person it reads reaction_owners under the new
--    reaction_owners_select_notify (TO app_owner, scope `group`, likes on group posts only, the pattern of group_bans_select_notify) — it counts them, nothing leaves.
-- 2. A muted Group manager manages nothing while muted (⭐ OP-070, FR-GRP-003: a muted member only reads). nestly.my_group_rank() — the
--    caller's rank behind every Group management policy — answers 1 (a member) for a Group Moderator or Admin (rank 2-3; a muted Owner, e.g. one who received ownership while muted, keeps 4) with an unexpired warn_mute
--    in that Group, so join requests, invitations, approvals, Pin, edits, content removal, enforcement, blocks and the blocked list are all
--    closed to them until the mute ends; membership and reading are unchanged (rank > 0). The Owner is never muted (no higher Role).
--    group_member_enforcements_select_party and the enforcement-history branch of regular_names_select_group_manager read the caller's
--    own group_access row directly instead (a policy of group_member_enforcements must not call a function that reads that table: no
--    recursion), so a muted manager still reads the Group's enforcement history and its names — it acts on nothing.
-- 3. group_bans only through an enforcement record. The insert policy needs a remove_block record and the delete policy an unblock record
--    for the same Group and user written in the same transaction (group_member_enforcements.created_at is the transaction's clock, set
--    by group_member_enforcements_apply), so a block or unblock without its history record is refused (42501). The enforcement path is
--    unchanged: its AFTER INSERT trigger writes the block with the caller's own rights, now seeing its own record.
--
-- No new table, no new SECURITY DEFINER, no change to grants. Data: configuration v3 inserted and v2 made inactive (FORCE lifted for those
-- two statements only). Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261026400000_group_rules_followup.down.sql (refuses once a Highlight was recorded under v3).
-- =====================================================================================================================

-- 1. Highlights counted by people ---------------------------------------------------------------------------------------------
alter table nestly.group_highlight_configurations no force row level security;
update nestly.group_highlight_configurations set is_active = false where version = 2;
insert into nestly.group_highlight_configurations (version, engagement_threshold, member_percent, minimum_threshold, maximum_threshold, is_active, reason)
values (3, null, 5, 3, 20, true,
  'OP-077 (built per the recommended default): the same threshold as v2 (5% of the active members, rounded up, 3 to 20), counted by the different people other than the author who liked or commented, each once');
alter table nestly.group_highlight_configurations force row level security;

-- notify_group: whose like on a group post it is (a count of different people only; scope group, TO app_owner).
create policy reaction_owners_select_notify on nestly.reaction_owners
  for select to app_owner
  using ((select nestly.notify_scope()) = 'group'
    and exists (select 1 from nestly.posts p where p.id = reaction_owners.target_id and p.group_id is not null));

-- notify_group(), replaced (rule 17, the approved definer): only the Highlight count changes.
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
    -- a like or a comment on a group post: the post becomes a Highlight when the number of different people other than its author who
    -- liked or commented on it reaches the threshold of the active version for the Group's active members now (5% rounded up, 3 to 20;
    -- §11.17; one person counts once however many likes and comments they leave, ⭐ OP-077). Recorded once (group_highlights); each
    -- member is told once, never the author nor the actor. A like is tied to its person through reaction_owners (read here only,
    -- reaction_owners_select_notify).
    select count(*)::integer into v_members from nestly.group_members m where m.group_id = v_group and m.member_status = 'active';
    select c.version into v_version from nestly.group_highlight_configurations c where c.is_active;
    v_threshold := nestly.group_highlight_threshold(v_members);
    if v_threshold is not null and v_version is not null
       and not exists (select 1 from nestly.group_highlights h where h.post_id = v_post) then
      -- The like being inserted has no reaction_owners row yet (notify_group_reaction sorts, and so fires, before
      -- reactions_insert_owner), so its person is the caller (reaction_owners.user_id is auth.uid() by default); any other like
      -- without an owner row, and a comment with no author (an account that is gone), names no one and does not count.
      v_count := (select count(distinct who) from (
                    select coalesce(o.user_id, case when tg_table_name = 'reactions' and x.id = new.id then v_me end) as who
                      from nestly.reactions x left join nestly.reaction_owners o on o.reaction_id = x.id
                     where x.post_id = v_post and not x.is_by_author
                    union all
                    select c.author_id
                      from nestly.comments c
                     where c.post_id = v_post and c.status = 'active' and not c.is_by_post_author) people
                   where who is not null);
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
  'SRS FR-ALG-010, BR-059, BR-060: the versioned Highlights threshold. v1: a fixed count (5, inactive since I10 completion C). v2: member_percent of the Group''s active members, rounded up, within minimum_threshold..maximum_threshold (5%, 3, 20; Afik 21.10.2026), compared to likes plus comments (inactive since the follow-up). v3: the same numbers, compared to the different people other than the author who liked or commented (⭐ OP-077). Exactly one version is active; a change is a new version by migration (no write policy).';
comment on column nestly.group_highlights.threshold is 'The threshold the post reached (v2: likes and comments by others; v3: different people other than the author who liked or commented).';
comment on policy reaction_owners_select_notify on nestly.reaction_owners is 'notify_group() only (TO app_owner, scope group), and only likes on a group post: counts the different people who liked it for its Highlight threshold (⭐ OP-077); nothing is returned to a client.';
comment on function nestly.notify_group() is
  'SECURITY DEFINER (approved exception, rule 17; I10, extended in I10 completion C and its follow-up). After a Group recommendation (to the Friend), an invitation (pending: to the invitee; awaiting approval: to the Owner and Group Admins), its approval (to the invitee and the inviter) or rejection (to the inviter), a mute notice (to the member, critical), a Join Request (to the Owner and Group Admins) or its approval (to the requester); a new group post (members whose mode is all); a pinned post, or a post whose different people other than its author who liked or commented reached the threshold of the active version for the Group''s active members (members on all or highlights; FR-ALG-010, BR-060: deterministic; ⭐ OP-077), recorded once in group_highlights. Never to the actor, never across a block (notify_deliver), and every category switch is honoured but for the mute notice. Declares nestly.notify_scope = group and clears it. No EXECUTE for any runtime role.';

-- 2. A muted Group manager manages nothing while muted -------------------------------------------------------------------------
create or replace function nestly.my_group_rank(p_group uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when r.rank in (2, 3) and exists (select 1 from nestly.group_member_enforcements e
                                         where e.group_id = p_group and e.user_id = auth.uid() and e.kind = 'warn_mute'
                                           and e.mute_until > pg_catalog.now())
             then 1
           else r.rank
         end
    from (select coalesce((select nestly.group_role_rank(a.role) from nestly.group_access a
                            where a.group_id = p_group and a.user_id = auth.uid()), 0) as rank) r
$$;

comment on function nestly.my_group_rank(uuid) is 'SECURITY INVOKER, caller only. The caller''s Group Role rank in that Group (0 = not a member), from the caller''s own group_access row; a Group Moderator or Admin with an unexpired warn_mute in that Group ranks as a member (1) until it ends (⭐ OP-070: a muted manager manages nothing). Never used by a policy of group_access or of group_member_enforcements (it reads both).';

drop policy group_member_enforcements_select_party on nestly.group_member_enforcements;
create policy group_member_enforcements_select_party on nestly.group_member_enforcements
  for select to authenticated
  using ((select nestly.is_active_account())
    and (user_id = (select auth.uid())
      or exists (select 1 from nestly.group_access a
                  where a.group_id = group_member_enforcements.group_id and a.user_id = (select auth.uid())
                    and a.role in ('owner', 'admin', 'moderator'))));

comment on policy group_member_enforcements_select_party on nestly.group_member_enforcements is 'The member it names, and the Group''s Moderators and higher (⭐ OP-047), read from the caller''s own group_access row (not my_group_rank: no recursion), so a muted manager still reads the history.';

drop policy regular_names_select_group_manager on nestly.regular_names;
create policy regular_names_select_group_manager on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and (exists (select 1 from nestly.group_invitations i
                  where i.invitee_id = regular_names.user_id and i.status = 'awaiting_approval' and nestly.my_group_rank(i.group_id) >= 3)
      or exists (select 1 from nestly.group_member_enforcements e
                  where e.user_id = regular_names.user_id
                    and exists (select 1 from nestly.group_access a
                                 where a.group_id = e.group_id and a.user_id = (select auth.uid())
                                   and a.role in ('owner', 'admin', 'moderator')))));

comment on policy regular_names_select_group_manager on nestly.regular_names is 'The Group''s Owner and Admins (not while muted) read the names of invitees awaiting their approval; its Moderators and higher the names in its enforcement history (also while muted, as the history itself).';

-- 3. group_bans only through an enforcement record ------------------------------------------------------------------------------
drop policy group_bans_insert_manager on nestly.group_bans;
create policy group_bans_insert_manager on nestly.group_bans
  for insert to authenticated
  with check ((select nestly.is_active_account()) and banned_by = (select auth.uid()) and user_id <> (select auth.uid())
    and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = group_bans.group_id and m.user_id = group_bans.user_id), 0) < nestly.my_group_rank(group_id)
    and exists (select 1 from nestly.group_member_enforcements e
                 where e.group_id = group_bans.group_id and e.user_id = group_bans.user_id and e.kind = 'remove_block'
                   and e.created_at = pg_catalog.now()));

drop policy group_bans_delete_manager on nestly.group_bans;
create policy group_bans_delete_manager on nestly.group_bans
  for delete to authenticated
  using ((select nestly.is_active_account()) and nestly.my_group_rank(group_id) >= 2
    and coalesce((select nestly.group_role_rank(m.role) from nestly.group_members m
                   where m.group_id = group_bans.group_id and m.user_id = group_bans.banned_by), 0) <= nestly.my_group_rank(group_id)
    and exists (select 1 from nestly.group_member_enforcements e
                 where e.group_id = group_bans.group_id and e.user_id = group_bans.user_id and e.kind = 'unblock'
                   and e.created_at = pg_catalog.now()));

comment on policy group_bans_insert_manager on nestly.group_bans is 'A Group Moderator or higher (not while muted) blocks a user of a lower Role, or a non-member (ERR-019), only with the remove_block record of this transaction (group_member_enforcements_apply): no block without its history.';
comment on policy group_bans_delete_manager on nestly.group_bans is 'A Group Moderator or higher (not while muted) unblocks, never a block made by a higher Role (ERR-019), only with the unblock record of this transaction: no unblock without its history.';
