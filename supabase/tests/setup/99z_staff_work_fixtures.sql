-- =====================================================================================================================
-- CI only — fixtures for 100_staff_work.sql (I14 completion: children's tracker trends, escalations, openings, the report's context). Run as
-- postgres, in name order after 99_ (the name 99z keeps it after every fixture it uses). Never a migration.
--
-- Committed here:  sw_p01 .. sw_p21, sw_n1   twenty-two Auth accounts (twenty-one parents, one person who will redeem an invitation).
--   tests.fx_sw_id(name)            the fixed uuid of sw_p01 .. sw_p21, sw_n1
--   tests.fx_sw_build()             inside the test transaction, twenty-one Regular parents, every child born nine months ago:
--                                   sw_p01 .. sw_p10 one girl each, two bottle events (100 ml and 150 ml, on two days of the last week);
--                                   sw_p11 .. sw_p19 one boy each, one bottle event (200 ml);
--                                   sw_p20 ten children of sex 'unknown', one bottle event each (50 ml): ten children of one family;
--                                   sw_p01's girl one medicine event (its name 'secret-med');
--                                   sw_p21 banned, with a girl and a bottle event of 1000 ml (an inactive account's child never counts).
--                                   Rows written as postgres
--   tests.fx_sw_count(rel)          count(*) of a relation, whoever may read it
--   tests.fx_sw_audit_after(action) the after_state of the newest audit entry with this action (unfiltered)
--   tests.fx_sw_audit_row(action)   'key|kind|target|reason' of the newest audit entry with this action (unfiltered)
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the staff work fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.report_escalations') is null then
    raise exception 'nestly.report_escalations is missing: run the I14 completion migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_sw_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'sw_n1' then '9a000000-0000-4000-8000-0000000000c3'
    else case when p_name ~ '^sw_p(0[1-9]|1[0-9]|2[01])$' then ('9a000000-0000-4000-8000-0000000001' || substr(p_name, 5, 2)) end
  end::uuid;
begin
  if v is null then raise exception 'unknown staff work fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_sw_id(n), 'authenticated', 'authenticated', 'i14c-' || n || '@example.invalid'
from (select 'sw_p' || lpad(i::text, 2, '0') from generate_series(1, 21) as i union all select 'sw_n1') as x(n)
on conflict (id) do nothing;

create or replace function tests.fx_sw_build() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  i integer;
  v_child uuid;
  v_birth date := current_date - interval '9 months';
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_sw_build: call it inside the test transaction (its rows would be committed)';
  end if;
  for i in 1..21 loop
    insert into nestly.users (id, account_type, status)
      values (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), 'regular', case when i = 21 then 'banned' else 'active' end);
    insert into nestly.regular_profiles (user_id, full_name, gender) values (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), 'Parent ' || i, 'woman');
  end loop;
  for i in 1..10 loop
    insert into nestly.children (user_id, slot, name, sex, birth_date) values (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), 1, 'Girl ' || i, 'girl', v_birth)
      returning id into v_child;
    insert into nestly.tracker_events (user_id, child_id, kind, occurred_at, amount_ml) values
      (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), v_child, 'bottle', now() - interval '2 days', 100),
      (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), v_child, 'bottle', now() - interval '3 days', 150);
    if i = 1 then
      insert into nestly.tracker_events (user_id, child_id, kind, occurred_at, name, dosage) values
        (tests.fx_sw_id('sw_p01'), v_child, 'medicine', now() - interval '1 day', 'secret-med', '5 ml');
    end if;
  end loop;
  for i in 11..19 loop
    insert into nestly.children (user_id, slot, name, sex, birth_date) values (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), 1, 'Boy ' || i, 'boy', v_birth)
      returning id into v_child;
    insert into nestly.tracker_events (user_id, child_id, kind, occurred_at, amount_ml) values
      (tests.fx_sw_id('sw_p' || lpad(i::text, 2, '0')), v_child, 'bottle', now() - interval '2 days', 200);
  end loop;
  for i in 1..10 loop
    insert into nestly.children (user_id, slot, name, sex, birth_date) values (tests.fx_sw_id('sw_p20'), i, 'Child ' || i, 'unknown', v_birth)
      returning id into v_child;
    insert into nestly.tracker_events (user_id, child_id, kind, occurred_at, amount_ml) values
      (tests.fx_sw_id('sw_p20'), v_child, 'bottle', now() - interval '2 days', 50);
  end loop;
  insert into nestly.children (user_id, slot, name, sex, birth_date) values (tests.fx_sw_id('sw_p21'), 1, 'Banned girl', 'girl', v_birth)
    returning id into v_child;
  insert into nestly.tracker_events (user_id, child_id, kind, occurred_at, amount_ml) values
    (tests.fx_sw_id('sw_p21'), v_child, 'bottle', now() - interval '2 days', 1000);
end
$$;

create or replace function tests.fx_sw_count(p_rel text) returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  v bigint;
begin
  execute 'select count(*) from ' || p_rel into v;
  return v;
end
$$;

create or replace function tests.fx_sw_audit_after(p_action text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select after_state from nestly.audit_log where action = p_action order by occurred_at desc, id desc limit 1
$$;

create or replace function tests.fx_sw_audit_row(p_action text) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(permission_key, '-') || '|' || target_kind || '|' || coalesce(target_id::text, '-') || '|' || coalesce(reason, '-')
  from nestly.audit_log where action = p_action order by occurred_at desc, id desc limit 1
$$;

revoke all on function tests.fx_sw_build(), tests.fx_sw_count(text), tests.fx_sw_audit_after(text), tests.fx_sw_audit_row(text) from public;
grant execute on function tests.fx_sw_id(text) to app_server;
grant execute on function tests.fx_sw_build() to app_server;
grant execute on function tests.fx_sw_count(text) to app_server;
grant execute on function tests.fx_sw_audit_after(text) to app_server;
grant execute on function tests.fx_sw_audit_row(text) to app_server;

commit;
