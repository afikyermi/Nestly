-- =====================================================================================================================
-- CI only -- fixtures for the Groups tests (I10; supabase/tests/96_groups.sql). Run as postgres by the `db` job in name order, after the
-- I10 migration and after 60_friend_fixtures.sql. Never a migration. Rows are written inside the test transaction only (the suite rolls
-- them back). Definers owned by postgres, fixed search_path, executable by app_server only.
--
--   tests.fx_gr_id(name)        the fixed ids of two more Regular accounts: gr_e, gr_f
--   tests.fx_gr_build()         creates them (users + regular_profiles), inside the test transaction
--   tests.fx_gr_roles(group)    'user:role' of every member of a Group, unfiltered, in user id order ('-' for none)
--   tests.fx_gr_state(group)    'privacy=… status=… pinned=<t|f>' of a Group, unfiltered, or ''
--   tests.fx_gr_access(group)   'user:role' of every group_access row of a Group, unfiltered ('-' for none)
--   tests.fx_gr_request(group, user)   the status of that user's newest Join Request to that Group, or ''
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the group fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.groups') is null then
    raise exception 'nestly.groups is missing: run the I10 migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_gr_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'gr_e' then '96000000-0000-4000-8000-0000000000a1'
    when 'gr_f' then '96000000-0000-4000-8000-0000000000a2'
  end::uuid;
begin
  if v is null then raise exception 'unknown group fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_gr_id(n), 'authenticated', 'authenticated', 'i10-' || n || '@example.invalid'
from unnest(array['gr_e', 'gr_f']) as n
on conflict (id) do nothing;

create or replace function tests.fx_gr_build() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_gr_build: call it inside the test transaction (its rows would be committed)';
  end if;
  insert into nestly.users (id, account_type, status) values
    (tests.fx_gr_id('gr_e'), 'regular', 'active'),
    (tests.fx_gr_id('gr_f'), 'regular', 'active');
  insert into nestly.regular_profiles (user_id, full_name, gender) values
    (tests.fx_gr_id('gr_e'), 'Eden Member', 'woman'),
    (tests.fx_gr_id('gr_f'), 'Fanny Fifth', 'woman');
end
$$;

create or replace function tests.fx_gr_roles(p_group uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(string_agg(m.user_id::text || ':' || m.role, ',' order by m.user_id), '-') from nestly.group_members m where m.group_id = p_group $$;

create or replace function tests.fx_gr_access(p_group uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(string_agg(a.user_id::text || ':' || a.role, ',' order by a.user_id), '-') from nestly.group_access a where a.group_id = p_group $$;

create or replace function tests.fx_gr_state(p_group uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select 'privacy=' || g.privacy || ' status=' || g.status || ' pinned=' || left((g.pinned_post_id is not null)::text, 1)
                     from nestly.groups g where g.id = p_group), '')
$$;

create or replace function tests.fx_gr_request(p_group uuid, p_user uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select r.status from nestly.group_join_requests r where r.group_id = p_group and r.user_id = p_user
                    order by r.created_at desc, r.id limit 1), '')
$$;

revoke all on function tests.fx_gr_build(), tests.fx_gr_roles(uuid), tests.fx_gr_access(uuid), tests.fx_gr_state(uuid),
  tests.fx_gr_request(uuid, uuid) from public;
grant execute on function tests.fx_gr_build(), tests.fx_gr_roles(uuid), tests.fx_gr_access(uuid), tests.fx_gr_state(uuid),
  tests.fx_gr_request(uuid, uuid) to app_server;

commit;
