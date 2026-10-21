-- =====================================================================================================================
-- CI only — fixtures for 97_professionals.sql (I11: Professional profiles, Follow, Offer Help, Professional conversations, reviews,
-- articles). Run as postgres, in name order after 95_. Never a migration.
--
-- Committed here:  pr_1, pr_2   two active Professional accounts with a profile (field doula / sleep, areas tel_aviv / haifa).
--   tests.fx_pr_id(name)           the fixed uuid of pr_1, pr_2
--   tests.fx_pr_count(sql_from)    count(*) of `select ... from <sql_from>` as postgres (RLS not applied): "no row was written" checks
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the professional fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.professional_profiles') is null then
    raise exception 'nestly.professional_profiles is missing: run the I11 migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_pr_id(p_name text) returns uuid
language plpgsql immutable
as $$
declare
  v uuid := case p_name
    when 'pr_1' then '97000000-0000-4000-8000-0000000000c1'
    when 'pr_2' then '97000000-0000-4000-8000-0000000000c2'
  end::uuid;
begin
  if v is null then raise exception 'unknown professional fixture %', p_name; end if;
  return v;
end
$$;

insert into auth.users (id, aud, role, email)
select tests.fx_pr_id(n), 'authenticated', 'authenticated', 'i11-' || n || '@example.invalid'
from unnest(array['pr_1', 'pr_2']) as n
on conflict (id) do nothing;

insert into nestly.users (id, account_type, status) values
  (tests.fx_pr_id('pr_1'), 'professional', 'active'),
  (tests.fx_pr_id('pr_2'), 'professional', 'active')
on conflict (id) do nothing;

insert into nestly.professional_profiles (user_id, full_name, business_name, gender, field, years_experience, area, about, price_from) values
  (tests.fx_pr_id('pr_1'), 'Dana Doula', 'Dana Births', 'woman', 'doula', 8, 'tel_aviv', 'Birth support', 1500),
  (tests.fx_pr_id('pr_2'), 'Shira Sleep', null, 'woman', 'sleep', 3, 'haifa', null, 400)
on conflict (user_id) do nothing;

create or replace function tests.fx_pr_count(p_from text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  execute 'select count(*) from ' || p_from into n;
  return n;
end
$$;

revoke all on function tests.fx_pr_id(text) from public;
revoke all on function tests.fx_pr_count(text) from public;
grant execute on function tests.fx_pr_id(text) to app_server;
grant execute on function tests.fx_pr_count(text) to app_server;

commit;
