-- =====================================================================================================================
-- CI only -- fixtures for the profile_view tests (I2 F2.3b, .work/profile-privacy/spec.md c7-c15; schema.md "pgTAP" F2.3b).
-- Run as postgres by the `db` job, in name order AFTER 10_ .. 50_ and before the suite (ci.yml: "for f in
-- supabase/tests/setup/*.sql"). Never a migration.
--
-- Committed here: only auth.users rows for the people below (like 10_'s f1..f5), no nestly row. Their nestly rows are made by
-- tests.fx_pv_build() INSIDE the test transaction and rolled back with it, so no other file sees a new journey or child.
--   pv_v  V, an active Regular viewer (never a Friend: none exists before F2.4), 'Vered Viewer', man, nothing else
--   pv_b  B, the target of the spec: 'דנה כהן', woman; children נועה (girl, 2023-05-04, slot 1) and איתי (boy, 2025-01-10,
--         slot 2), created in that order; a pregnant journey (due 2027-03-01) and a has_child journey
--   pv_e  planning only, 'Empty Planner', woman       pv_z  zero journeys, 'Empty Planner', woman (same name and gender as pv_e)
--   pv_g  pregnant only (due 2027-03-01), 'Gila Pregnant', woman
--   pv_l  an active Regular viewer whose link check is pending (F2.0: affected, not cleared), 'Lior Pending', man
--   pv_n  a Regular users row with no regular_profiles row
-- The Professional viewer P and the Professional target are 10_'s `p`; suspended / banned are 10_'s `s` / `x` (as viewers)
-- and B with tests.set_status (as a target).
--
--   tests.fx_pv_id(name)              the fixed uuid of a person above; an unknown name raises
--   tests.fx_pv_build()               writes all their nestly rows (inside a transaction only)
--   tests.fx_pv_child(user, slot, name, sex, birth, created_at)   a child with a chosen created_at (the display order is
--                                     (created_at, slot): one transaction gives every default created_at the same now())
--   tests.fx_pv_delete_child(user, slot)  removes one child (a reused seat)
--   tests.fx_age(birth, at)           nestly.child_age_months(birth, at): the helper has no runtime EXECUTE (schema.md), so
--                                     the suite reaches it through this definer, owned by postgres (a member of app_owner)
-- Definers owned by postgres, fixed search_path, executable by app_server only (the grant at the end).
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the profile_view fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regprocedure('tests.fx_id_checked(text)') is null then
    raise exception 'tests.fx_id_checked is missing: run 10_identity_fixtures.sql first';
  end if;
  if to_regprocedure('nestly.child_age_months(date, timestamptz)') is null then
    raise exception 'nestly.child_age_months(date, timestamptz) is missing: run the F2.3b migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_pv_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'pv_v' then '53000000-0000-4000-8000-0000000000a1'
    when 'pv_b' then '53000000-0000-4000-8000-0000000000b2'
    when 'pv_e' then '53000000-0000-4000-8000-0000000000e3'
    when 'pv_z' then '53000000-0000-4000-8000-0000000000e4'
    when 'pv_g' then '53000000-0000-4000-8000-0000000000e5'
    when 'pv_l' then '53000000-0000-4000-8000-0000000000c6'
    when 'pv_n' then '53000000-0000-4000-8000-0000000000c7'
  end::uuid;
begin
  if v is null then raise exception 'unknown profile_view fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_pv_id(n), 'authenticated', 'authenticated', 'f23b-' || n || '@example.invalid'
from unnest(array['pv_v', 'pv_b', 'pv_e', 'pv_z', 'pv_g', 'pv_l', 'pv_n']) as n
on conflict (id) do nothing;

create or replace function tests.fx_pv_child(
  p_user uuid, p_slot int, p_name text, p_sex text, p_birth date, p_created_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.children (user_id, slot, name, sex, birth_date, created_at)
  values (p_user, p_slot, p_name, p_sex, p_birth, p_created_at);
end
$$;

create or replace function tests.fx_pv_delete_child(p_user uuid, p_slot int) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from nestly.children where user_id = p_user and slot = p_slot;
  if not found then raise exception 'tests.fx_pv_delete_child: no child in slot % of %', p_slot, p_user; end if;
end
$$;

create or replace function tests.fx_pv_build() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_v uuid := tests.fx_pv_id('pv_v');
  v_b uuid := tests.fx_pv_id('pv_b');
  v_e uuid := tests.fx_pv_id('pv_e');
  v_z uuid := tests.fx_pv_id('pv_z');
  v_g uuid := tests.fx_pv_id('pv_g');
  v_l uuid := tests.fx_pv_id('pv_l');
  v_n uuid := tests.fx_pv_id('pv_n');
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_pv_build: call it inside the test transaction (its rows would be committed)';
  end if;
  insert into nestly.users (id, account_type, status) values
    (v_v, 'regular', 'active'), (v_b, 'regular', 'active'), (v_e, 'regular', 'active'), (v_z, 'regular', 'active'),
    (v_g, 'regular', 'active'), (v_l, 'regular', 'active'), (v_n, 'regular', 'active');
  insert into nestly.regular_profiles (user_id, full_name, gender) values
    (v_v, 'Vered Viewer', 'man'), (v_b, 'דנה כהן', 'woman'), (v_e, 'Empty Planner', 'woman'),
    (v_z, 'Empty Planner', 'woman'), (v_g, 'Gila Pregnant', 'woman'), (v_l, 'Lior Pending', 'man');
  insert into nestly.journey_contexts (user_id, stage, due_date) values
    (v_b, 'pregnant', date '2027-03-01'), (v_b, 'has_child', null), (v_e, 'planning', null), (v_g, 'pregnant', date '2027-03-01');
  perform tests.fx_pv_child(v_b, 1, 'נועה', 'girl', date '2023-05-04', timestamptz '2026-01-01 10:00+00');
  perform tests.fx_pv_child(v_b, 2, 'איתי', 'boy',  date '2025-01-10', timestamptz '2026-02-01 10:00+00');
  -- pv_l: F2.0 link check affected and not cleared = pending (session_guard), so is_active_account() is false for it
  insert into nestly.identity_link_checks (user_id, verdict, checked_session_id)
  values (v_l, 'affected', '53000000-1111-4111-8111-1111111111c6');
end
$$;

create or replace function tests.fx_age(p_birth date, p_at timestamptz) returns integer
language sql stable security definer set search_path = ''
as $$ select nestly.child_age_months(p_birth, p_at) $$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
