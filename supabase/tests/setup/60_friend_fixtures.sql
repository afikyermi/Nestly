-- =====================================================================================================================
-- CI only -- fixtures for the friendship tests (I2 F2.4a, .work/friends/spec.md c1-c12; schema.md F2.4a "pgTAP").
-- Run as postgres by the `db` job, in name order AFTER 10_ .. 53_ (ci.yml: "for f in supabase/tests/setup/*.sql"). Never a migration.
--
-- Committed here:
--   fr_m  M, an active Moderator account (nestly.users row, no profile)       fr_d  D, an active Admin account (same)
--   fr_c  an Auth user only: its Regular rows are made by tests.fx_fr_build() INSIDE a test transaction ("Cora Third", woman)
-- A, B, S (suspended), X (banned) and P (professional) are 10_'s a, b, s, x, p. The server db tests register their own fresh
-- Regular users through the API and use fr_m / fr_d as the M and D actors and targets.
--
--   tests.fx_fr_id(name)                     the fixed uuid of fr_m, fr_d, fr_c; an unknown name raises
--   tests.fx_fr_build()                      C: an active Regular with a profile (inside a transaction only)
--   tests.fx_fr_add(req, addr, status, cancelled)   a friendship row written as postgres (bypasses RLS and the transition trigger);
--                                            copies both parties' current users.status; returns its id (inside a transaction only)
--   tests.fx_fr_find(req, addr)              the id of the newest row requester -> addressee, or null
--   tests.fx_fr_rows(a, b)                   the rows between two people, either direction, unfiltered by RLS, as
--                                            'a>b:pending ; b>a:declined+c' (direction relative to the arguments; '+c' = cancelled_at set;
--                                            labels sorted, so the order never depends on a clock)
--   tests.fx_fr_clock(id)                    'resp=t canc=f rem=f' -- which clocks of one row are set
--   tests.fx_fr_count()                      how many friendship rows exist at all (unfiltered)
--   tests.fx_fr_state()                      md5 over every friendship row, without the two *_status copies (unfiltered)
--   tests.fx_rn_counts()                     'regular_names rows/regular_profiles rows' (unfiltered); tests.fx_rn_name(id) one stored name
--   tests.fx_fr_purge(id)                    deletes every row naming id (server db tests clean up A and B with it)
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the friendship fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regprocedure('tests.fx_id_checked(text)') is null then
    raise exception 'tests.fx_id_checked is missing: run 10_identity_fixtures.sql first';
  end if;
  if to_regclass('nestly.friendships') is null then
    raise exception 'nestly.friendships is missing: run the F2.4a migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_fr_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'fr_m' then '60000000-0000-4000-8000-0000000000a1'
    when 'fr_d' then '60000000-0000-4000-8000-0000000000a2'
    when 'fr_c' then '60000000-0000-4000-8000-0000000000a3'
  end::uuid;
begin
  if v is null then raise exception 'unknown friendship fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_fr_id(n), 'authenticated', 'authenticated', 'f24a-' || n || '@example.invalid'
from unnest(array['fr_m', 'fr_d', 'fr_c']) as n
on conflict (id) do nothing;

insert into nestly.users (id, account_type, status) values
  (tests.fx_fr_id('fr_m'), 'moderator', 'active'),
  (tests.fx_fr_id('fr_d'), 'admin', 'active')
on conflict (id) do nothing;

create or replace function tests.fx_fr_build() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_fr_build: call it inside the test transaction (its rows would be committed)';
  end if;
  insert into nestly.users (id, account_type, status) values (tests.fx_fr_id('fr_c'), 'regular', 'active');
  insert into nestly.regular_profiles (user_id, full_name, gender) values (tests.fx_fr_id('fr_c'), 'Cora Third', 'woman');
end
$$;

create or replace function tests.fx_fr_add(p_req uuid, p_addr uuid, p_status text default 'pending', p_cancelled boolean default false) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_fr_add: call it inside the test transaction (its row would be committed)';
  end if;
  insert into nestly.friendships (requester_id, addressee_id, status, requester_status, addressee_status,
                                  responded_at, cancelled_at, removed_at)
  values (p_req, p_addr, p_status,
          (select u.status from nestly.users u where u.id = p_req),
          (select u.status from nestly.users u where u.id = p_addr),
          case when p_status = 'pending' then null else now() end,
          case when p_cancelled then now() else null end,
          case when p_status = 'removed' then now() else null end)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function tests.fx_fr_find(p_req uuid, p_addr uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select f.id from nestly.friendships f where f.requester_id = p_req and f.addressee_id = p_addr
   order by f.created_at desc, f.id limit 1
$$;

create or replace function tests.fx_fr_rows(p_a uuid, p_b uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(l.label, ' ; ' order by l.label), '')
    from (select case when f.requester_id = p_a then 'a>b' else 'b>a' end || ':' || f.status
                 || case when f.cancelled_at is not null then '+c' else '' end as label
            from nestly.friendships f
           where (f.requester_id = p_a and f.addressee_id = p_b) or (f.requester_id = p_b and f.addressee_id = p_a)) l
$$;

create or replace function tests.fx_fr_clock(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select 'resp=' || left((f.responded_at is not null)::text, 1) || ' canc=' || left((f.cancelled_at is not null)::text, 1)
      || ' rem=' || left((f.removed_at is not null)::text, 1)
    from nestly.friendships f where f.id = p_id
$$;

create or replace function tests.fx_fr_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.friendships $$;

create or replace function tests.fx_fr_state() returns text
language sql stable security definer set search_path = ''
as $$
  -- without the two *_status copies: they follow users.status by design (a suspension rewrites them), a test that flips
  -- a status must still see "no friendship changed"
  select md5(coalesce(string_agg(row(f.id, f.requester_id, f.addressee_id, f.status, f.requested_at, f.responded_at,
                                     f.cancelled_at, f.removed_at, f.created_at)::text, '|' order by f.id), ''))
    from nestly.friendships f
$$;

create or replace function tests.fx_fr_purge(p_id uuid) returns void
language sql security definer set search_path = ''
as $$ delete from nestly.friendships where requester_id = p_id or addressee_id = p_id $$;

create or replace function tests.fx_rn_counts() returns text
language sql stable security definer set search_path = ''
as $$ select (select count(*) from nestly.regular_names)::text || '/' || (select count(*) from nestly.regular_profiles)::text $$;

create or replace function tests.fx_rn_name(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select n.full_name from nestly.regular_names n where n.user_id = p_id $$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
