-- =====================================================================================================================
-- CI only — fixtures for 94_moderators_team.sql (I14: Moderator invitations, System Announcements, the analytics reads). Run as postgres,
-- in name order after 90_ and 93_. Never a migration.
--
-- Committed here:  mt_n1 .. mt_n3  three Auth accounts with no Nestly row yet (people who will redeem an invitation).
--   tests.fx_mt_id(name)            the fixed uuid of mt_n1 .. mt_n3
--   tests.fx_mt_expire(hash)        moves an invitation's expiry into the past (inside a transaction only)
--   tests.fx_mt_count(rel)          count(*) of one of the analytics tables, whoever may read it
--   tests.fx_mt_invitation(hash)    'accepted:<bool> revoked:<bool>' of an invitation, whoever may read it
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the moderators fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.moderator_invitations') is null then
    raise exception 'nestly.moderator_invitations is missing: run the I14 migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_mt_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'mt_n1' then '94000000-0000-4000-8000-0000000000b1'
    when 'mt_n2' then '94000000-0000-4000-8000-0000000000b2'
    when 'mt_n3' then '94000000-0000-4000-8000-0000000000b3'
  end::uuid;
begin
  if v is null then raise exception 'unknown moderators fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_mt_id(n), 'authenticated', 'authenticated', 'i14-' || n || '@example.invalid'
from unnest(array['mt_n1', 'mt_n2', 'mt_n3']) as n
on conflict (id) do nothing;

create or replace function tests.fx_mt_expire(p_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_mt_expire: call it inside the test transaction';
  end if;
  update nestly.moderator_invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '8 days' where code_hash = p_hash;
  if not found then raise exception 'tests.fx_mt_expire: no invitation'; end if;
end
$$;

create or replace function tests.fx_mt_count(p_rel text) returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  v bigint;
begin
  if p_rel not in ('users', 'posts', 'comments', 'reactions', 'reports', 'user_enforcements', 'friendships', 'children') then
    raise exception 'tests.fx_mt_count: not an analytics table: %', p_rel;
  end if;
  execute format('select count(*) from nestly.%I', p_rel) into v;
  return v;
end
$$;

create or replace function tests.fx_mt_invitation(p_hash text) returns text
language sql stable security definer set search_path = ''
as $$
  select 'accepted:' || (accepted_by is not null)::text || ' revoked:' || (revoked_at is not null)::text
  from nestly.moderator_invitations where code_hash = p_hash
$$;

revoke all on function tests.fx_mt_expire(text), tests.fx_mt_count(text), tests.fx_mt_invitation(text) from public;
grant execute on function tests.fx_mt_id(text) to app_server;
grant execute on function tests.fx_mt_expire(text) to app_server;
grant execute on function tests.fx_mt_count(text) to app_server;
grant execute on function tests.fx_mt_invitation(text) to app_server;

commit;
