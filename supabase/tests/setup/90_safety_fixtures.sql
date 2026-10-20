-- =====================================================================================================================
-- CI only — fixtures for the safety and admin core tests (staff roles, Moderator permissions, Audit Log, moderation, enforcement,
-- report reasons; supabase/tests/90_safety_core.sql). Run as postgres by the `db` job, in name order after 70_ .. 80_. Never a migration.
--
-- Committed here:  sf_m1 .. sf_m5  five active Moderator accounts (no permission) — with 60_'s fr_m (Moderator) and fr_d (Admin).
--   tests.fx_sf_id(name)               the fixed uuid of sf_m1 .. sf_m5
--   tests.fx_sf_grant(user, keys[])    gives the Moderator these Permission Keys (written as postgres; inside a test transaction only)
--   tests.fx_sf_audit(action)          how many audit_log rows carry this action (unfiltered)
--   tests.fx_sf_audit_state()          md5 over every audit_log row (unfiltered)
--   tests.fx_sf_enf(user)              'kind:suggested:skipped,...' of a user's enforcements, oldest first (unfiltered)
--   tests.fx_sf_enf_add(user, kind, hours, ago)   an enforcement row written as postgres, dated `ago` in the past (inside a transaction only)
--   tests.fx_sf_expire(user)           moves a suspension's end time into the past (inside a transaction only)
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the safety fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.user_enforcements') is null then
    raise exception 'nestly.user_enforcements is missing: run the moderation migration before these fixtures';
  end if;
  if to_regprocedure('tests.fx_fr_id(text)') is null then
    raise exception 'tests.fx_fr_id is missing: run 60_friend_fixtures.sql first';
  end if;
end
$$;

create or replace function tests.fx_sf_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'sf_m1' then '90000000-0000-4000-8000-0000000000a1'
    when 'sf_m2' then '90000000-0000-4000-8000-0000000000a2'
    when 'sf_m3' then '90000000-0000-4000-8000-0000000000a3'
    when 'sf_m4' then '90000000-0000-4000-8000-0000000000a4'
    when 'sf_m5' then '90000000-0000-4000-8000-0000000000a5'
  end::uuid;
begin
  if v is null then raise exception 'unknown safety fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_sf_id(n), 'authenticated', 'authenticated', 'i4-' || n || '@example.invalid'
from unnest(array['sf_m1', 'sf_m2', 'sf_m3', 'sf_m4', 'sf_m5']) as n
on conflict (id) do nothing;

insert into nestly.users (id, account_type, status) values
  (tests.fx_sf_id('sf_m1'), 'moderator', 'active'),
  (tests.fx_sf_id('sf_m2'), 'moderator', 'active'),
  (tests.fx_sf_id('sf_m3'), 'moderator', 'active'),
  (tests.fx_sf_id('sf_m4'), 'moderator', 'active'),
  (tests.fx_sf_id('sf_m5'), 'moderator', 'active')
on conflict (id) do nothing;

create or replace function tests.fx_sf_grant(p_user uuid, p_keys text[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_sf_grant: call it inside the test transaction (its rows would be committed)';
  end if;
  insert into nestly.moderator_permissions (user_id, permission_key, granted_by)
  select p_user, k, tests.fx_fr_id('fr_d') from unnest(p_keys) as k;
end
$$;

create or replace function tests.fx_sf_staff_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.users where account_type in ('admin', 'moderator') $$;

create or replace function tests.fx_audit_rows() returns setof nestly.audit_log
language sql stable security definer set search_path = ''
as $$ select * from nestly.audit_log order by occurred_at, id $$;

create or replace function tests.fx_sf_revoke_all(p_user uuid) returns void
language sql security definer set search_path = ''
as $$ delete from nestly.moderator_permissions where user_id = p_user $$;

create or replace function tests.fx_sf_audit(p_action text) returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.audit_log where action = p_action $$;

create or replace function tests.fx_sf_audit_state() returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(md5(string_agg(a::text, ',' order by a.id)), '-') from nestly.audit_log a $$;

create or replace function tests.fx_sf_enf(p_user uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(e.kind || ':' || coalesce(e.suggested_kind, '-') || ':' || left(e.is_step_skipped::text, 1), ',' order by e.created_at, e.kind, e.is_step_skipped, e.suggested_kind, e.id), '-')
    from nestly.user_enforcements e where e.user_id = p_user
$$;

create or replace function tests.fx_sf_enf_add(p_user uuid, p_kind text, p_hours integer, p_ago interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_sf_enf_add: call it inside the test transaction (its row would be committed)';
  end if;
  insert into nestly.user_enforcements (user_id, actor_id, kind, reason, duration_hours, suspended_until, created_at)
  values (p_user, tests.fx_fr_id('fr_d'), p_kind, 'fixture', p_hours,
          case when p_kind = 'suspension' then now() - p_ago + make_interval(hours => p_hours) end, now() - p_ago);
end
$$;

create or replace function tests.fx_sf_expire(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.users set suspended_until = now() - interval '1 minute' where id = p_user and status = 'suspended';
  if not found then raise exception 'tests.fx_sf_expire: no suspended user %', p_user; end if;
end
$$;

-- A statement run as `authenticated` with the claims AND the admin screens' purpose named (nestly.staff_view = on), as the admin routes do before
-- they read accounts. 'OK:<rows>' or 'ERR:<sqlstate>'; the statement is kept unless p_keep is false.
create or replace function tests.dml_staff(p_claims text, p_sql text, p_keep boolean default true) returns text
language plpgsql
as $$
declare
  v text;
  n bigint;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  set local role authenticated;
  perform set_config('nestly.staff_view', 'on', true);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := 'OK:' || n;
    if not p_keep then
      raise exception 'rollback this statement' using errcode = 'ZZ001';
    end if;
  exception
    when sqlstate 'ZZ001' then null;
    when others then v := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('nestly.staff_view', '', true);
  return v;
end
$$;

create or replace function tests.fn_staff(p_claims text, p_sql text) returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  set local role authenticated;
  perform set_config('nestly.staff_view', 'on', true);
  begin
    execute p_sql into v;
  exception when others then v := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('nestly.staff_view', '', true);
  return v;
end
$$;

revoke all on function tests.dml_staff(text, text, boolean) from public;
revoke all on function tests.fn_staff(text, text) from public;
grant execute on function tests.dml_staff(text, text, boolean) to app_server;
grant execute on function tests.fn_staff(text, text) to app_server;

revoke all on function tests.fx_sf_grant(uuid, text[]) from public;
revoke all on function tests.fx_sf_revoke_all(uuid) from public;
grant execute on function tests.fx_sf_revoke_all(uuid) to app_server;
revoke all on function tests.fx_sf_staff_count() from public;
revoke all on function tests.fx_audit_rows() from public;
revoke all on function tests.fx_sf_audit(text) from public;
revoke all on function tests.fx_sf_audit_state() from public;
revoke all on function tests.fx_sf_enf(uuid) from public;
revoke all on function tests.fx_sf_enf_add(uuid, text, integer, interval) from public;
revoke all on function tests.fx_sf_expire(uuid) from public;
grant execute on function tests.fx_sf_grant(uuid, text[]) to app_server;
grant execute on function tests.fx_sf_staff_count() to app_server;
grant execute on function tests.fx_audit_rows() to app_server;
grant execute on function tests.fx_sf_audit(text) to app_server;
grant execute on function tests.fx_sf_audit_state() to app_server;
grant execute on function tests.fx_sf_enf(uuid) to app_server;
grant execute on function tests.fx_sf_enf_add(uuid, text, integer, interval) to app_server;
grant execute on function tests.fx_sf_expire(uuid) to app_server;
grant execute on function tests.fx_sf_id(text) to app_server;

commit;
