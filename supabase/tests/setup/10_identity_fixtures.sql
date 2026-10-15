-- =====================================================================================================================
-- CI only — fixtures and helpers for the identity pgTAP tests (I1 F1.1 part b, criteria 8, 10-19).
-- Run as postgres by the `db` job, after the migrations and bootstrap step 2, before the suite
-- (ci.yml: "for f in supabase/tests/setup/*.sql"). Never a migration; never in a real environment.
--
-- WHY THESE EXIST. The suite runs as app_server, which cannot see schema `nestly`, cannot write auth.users and cannot
-- change a status. The tests need (1) people to exist, (2) a status to flip in the middle of a test, (3) a way to look at
-- the tables as an observer that RLS does not filter, and (4) a way to be `authenticated` / `anon` with given claims
-- and get the result back as text, because pgTAP's own functions cannot be called as those roles. Everything the
-- suite's transactions change is rolled back by the suite.
--
--   People (committed here; auth.users + nestly rows, written as postgres, which bypasses RLS):
--     a  regular, active,     profile            b  regular, active, profile (the "other account")
--     s  regular, suspended,  profile            x  regular, banned, profile
--     p  professional, active, no profile        c  an Auth user with NO nestly.users row (fail closed, criterion 17)
--     f1 .. f5  Auth users with no nestly rows, free for tests to give a row inside their own rolled-back transaction
--
--   tests.fx_id(name)                         the fixed uuid of a person above
--   tests.claims(sub, extra)                  the request.jwt.claims text for an identity; `extra` is merged on top, so a
--                                             test can add (or override) role, app_metadata, user_metadata ...
--   tests.as_role(role, claims, sql)          run ONE statement as `role` ('authenticated', 'anon', or 'none' = stay
--                                             app_server) with those claims; returns its first column as text, or
--                                             'ERR:<sqlstate>' if it failed. Role and claims are restored afterwards.
--   tests.dml_as(role, claims, sql, keep)     the same for a statement that returns nothing: 'OK:<rows>' or
--                                             'ERR:<sqlstate>'. keep = false rolls the statement back even when it worked.
--   tests.n_as(sub, relation, extra)          count(*) of a relation as `authenticated` with that sub, as text
--   tests.set_status(id, status)              change a nestly.users status (definer, owner postgres)
--   tests.fx_insert_user / fx_insert_profile / fx_delete_auth_user      narrow writers for constraint tests
--   tests.fx_state() / fx_user(id) / fx_profile(id)                     observers that RLS does not filter
--
-- The definer functions are owned by postgres, live in `tests` (not gated, owned by postgres), have a fixed
-- search_path and are executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the identity fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if not (select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = current_user) then
    raise exception 'postgres cannot bypass RLS in this database: the fixtures write nestly.users and nestly.regular_profiles directly';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'auth.users does not exist';
  end if;
  if to_regclass('nestly.users') is null or to_regclass('nestly.regular_profiles') is null then
    raise exception 'nestly.users or nestly.regular_profiles is missing: run the migrations before the identity fixtures';
  end if;
end
$$;

create schema if not exists tests;

-- ---- people -----------------------------------------------------------------------------------------------------------
create or replace function tests.fx_id(p_name text) returns uuid
language plpgsql immutable
as $$
begin
  return case p_name
    when 'a'  then 'a0000000-0000-4000-8000-0000000000a1'
    when 'b'  then 'b0000000-0000-4000-8000-0000000000b2'
    when 'c'  then 'c0000000-0000-4000-8000-0000000000c3'
    when 's'  then '50000000-0000-4000-8000-000000000051'
    when 'x'  then 'e0000000-0000-4000-8000-0000000000e5'
    when 'p'  then 'd0000000-0000-4000-8000-0000000000d4'
    when 'f1' then 'f0000000-0000-4000-8000-0000000000f1'
    when 'f2' then 'f0000000-0000-4000-8000-0000000000f2'
    when 'f3' then 'f0000000-0000-4000-8000-0000000000f3'
    when 'f4' then 'f0000000-0000-4000-8000-0000000000f4'
    when 'f5' then 'f0000000-0000-4000-8000-0000000000f5'
    else null
  end::uuid
  ;
end
$$;

-- A typo in a test must fail loudly, not become a NULL identity that "reads nothing".
create or replace function tests.fx_id_checked(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := tests.fx_id(p_name);
begin
  if v is null then raise exception 'unknown identity fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_id_checked(n), 'authenticated', 'authenticated', 'f11b-' || n || '@example.invalid'
from unnest(array['a', 'b', 'c', 's', 'x', 'p', 'f1', 'f2', 'f3', 'f4', 'f5']) as n;

insert into nestly.users (id, account_type, status) values
  (tests.fx_id_checked('a'), 'regular',      'active'),
  (tests.fx_id_checked('b'), 'regular',      'active'),
  (tests.fx_id_checked('s'), 'regular',      'suspended'),
  (tests.fx_id_checked('x'), 'regular',      'banned'),
  (tests.fx_id_checked('p'), 'professional', 'active');

insert into nestly.regular_profiles (user_id, full_name, gender) values
  (tests.fx_id_checked('a'), 'Alice Aaron',    'woman'),
  (tests.fx_id_checked('b'), 'Bella Baruch',   null),
  (tests.fx_id_checked('s'), 'Sara Suspended', 'other'),
  (tests.fx_id_checked('x'), 'Xenia Banned',   'prefer_not_to_say');

-- ---- claims, and running a statement as another role -------------------------------------------------------------------
create or replace function tests.claims(p_sub uuid, p_extra jsonb default '{}'::jsonb) returns text
language sql immutable
as $$
  select (
    case when p_sub is null then '{}'::jsonb
         else jsonb_build_object('sub', p_sub::text, 'role', 'authenticated', 'aud', 'authenticated')
    end || coalesce(p_extra, '{}'::jsonb)
  )::text
$$;

-- INVOKER on purpose: it runs as app_server, which may SET ROLE authenticated / anon (bootstrap step 1) and nothing else.
create or replace function tests.as_role(p_role text, p_claims text, p_sql text) returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  if p_role <> 'none' then
    execute format('set local role %I', p_role);
  end if;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end
$$;

create or replace function tests.dml_as(p_role text, p_claims text, p_sql text, p_keep boolean default true) returns text
language plpgsql
as $$
declare
  v text;
  n bigint;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  if p_role <> 'none' then
    execute format('set local role %I', p_role);
  end if;
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
  return v;
end
$$;

create or replace function tests.n_as(p_sub uuid, p_rel text, p_extra jsonb default '{}'::jsonb) returns text
language sql
as $$
  select tests.as_role('authenticated', tests.claims(p_sub, p_extra), 'select count(*)::text from ' || p_rel)
$$;

-- ---- writers (definer, owner postgres: bypass RLS; the suite rolls their effect back) ------------------------------------
create or replace function tests.set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.users set status = p_status where id = p_id;
  if not found then raise exception 'tests.set_status: no nestly.users row for %', p_id; end if;
end
$$;

create or replace function tests.fx_insert_user(p_id uuid, p_account_type text, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.users (id, account_type, status) values (p_id, p_account_type, p_status);
end
$$;

create or replace function tests.fx_insert_profile(
  p_user_id uuid, p_full_name text, p_gender text, p_account_type text default 'regular'
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.regular_profiles (user_id, account_type, full_name, gender)
  values (p_user_id, p_account_type, p_full_name, p_gender);
end
$$;

create or replace function tests.fx_delete_auth_user(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.users where id = p_id;
  if not found then raise exception 'tests.fx_delete_auth_user: no auth.users row for %', p_id; end if;
end
$$;

-- Debt D1: add a select policy that lets `authenticated` read every nestly.users row, so a test can show that
-- is_active_account() does not lean on the users policy. DDL is transactional: the suite's rollback removes it.
create or replace function tests.fx_open_users_select() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_open_users_select: call it inside the test transaction (the policy would be committed)';
  end if;
  create policy zz_d1_open_select on nestly.users for select to authenticated using (true);
end
$$;

-- ---- observers: what is really in the tables, whatever RLS shows a signed-in user -----------------------------------------
create or replace function tests.fx_state() returns text
language sql security definer set search_path = ''
as $$
  select md5(
    coalesce((select string_agg(u::text, '|' order by u.id) from nestly.users u), '')
    || '#' ||
    coalesce((select string_agg(p::text, '|' order by p.user_id) from nestly.regular_profiles p), '')
  )
$$;

create or replace function tests.fx_user(p_id uuid) returns text
language sql security definer set search_path = ''
as $$
  select u.account_type || '/' || u.status from nestly.users u where u.id = p_id
$$;

create or replace function tests.fx_profile(p_id uuid) returns text
language sql security definer set search_path = ''
as $$
  select p.full_name || '/' || coalesce(p.gender, '-') from nestly.regular_profiles p where p.user_id = p_id
$$;

-- ---- who may call them ---------------------------------------------------------------------------------------------------
revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
