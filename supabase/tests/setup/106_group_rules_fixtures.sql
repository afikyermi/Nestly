-- =====================================================================================================================
-- CI only -- fixtures for 106_group_rules.sql (I10 completion C: the Highlights threshold, invitations with approval, the Group
-- enforcement history and the mute). Run as postgres in name order (106_ sorts before 10_ by code point; it needs only the migration).
-- Never a migration. Commits no row. Definers owned by postgres, fixed search_path, executable by app_server only.
--
--   tests.fx_grr_end_mute(group, user)       ends that member's mutes in that Group now (inside a test transaction only)
--   tests.fx_grr_highlight(post)             'threshold=… members=… version=…' of the post's Highlight row, unfiltered, or ''
--   tests.fx_grr_invitation(group, invitee)  'status needs_approval=<t|f> approved=<t|f>' of the open (else the newest) invitation, unfiltered, or ''
--   tests.fx_grr_banned(group, user)         whether the user is blocked from the Group, unfiltered
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the group rules fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.group_member_enforcements') is null then
    raise exception 'nestly.group_member_enforcements is missing: run the I10 completion C migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_grr_end_mute(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_grr_end_mute: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.group_member_enforcements set mute_until = pg_catalog.now() - interval '1 second'
   where group_id = p_group and user_id = p_user and kind = 'warn_mute';
end
$$;

create or replace function tests.fx_grr_highlight(p_post uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select 'threshold=' || h.threshold || ' members=' || h.member_count || ' version=' || h.configuration_version
                     from nestly.group_highlights h where h.post_id = p_post), '')
$$;

create or replace function tests.fx_grr_invitation(p_group uuid, p_invitee uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select i.status || ' needs_approval=' || left(i.needs_approval::text, 1) || ' approved=' || left((i.approved_at is not null)::text, 1)
                     from nestly.group_invitations i where i.group_id = p_group and i.invitee_id = p_invitee
                    order by (i.status in ('awaiting_approval', 'pending')) desc, i.created_at desc, i.id limit 1), '')
$$;

create or replace function tests.fx_grr_banned(p_group uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from nestly.group_bans b where b.group_id = p_group and b.user_id = p_user) $$;

revoke all on function tests.fx_grr_end_mute(uuid, uuid), tests.fx_grr_highlight(uuid), tests.fx_grr_invitation(uuid, uuid),
  tests.fx_grr_banned(uuid, uuid) from public;
grant execute on function tests.fx_grr_end_mute(uuid, uuid), tests.fx_grr_highlight(uuid), tests.fx_grr_invitation(uuid, uuid),
  tests.fx_grr_banned(uuid, uuid) to app_server;

commit;
