-- =====================================================================================================================
-- CI only — fixtures for 104_promotion_rules.sql (I13 follow-up: usage events, professional views, promotion settings, the staff stop,
-- monthly summaries). Run as postgres, in name order (104_ sorts before 10_ by code point; it needs only the migration). Never a migration.
-- Commits no row.
--
--   tests.fx_usage_age(user, days)  moves an account's usage events p_days back (inside a test transaction only)
--   tests.fx_pv_age(pro, days)      moves a Professional's view rows p_days back (inside a test transaction only)
--   tests.fx_usage_purge()          runs the usage purge (a definer owned by postgres cannot SET ROLE app_jobs, so it runs the
--                                   statement the job runs; that only app_jobs may EXECUTE it is checked by privilege)
--   tests.fx_promo_age(promo, days) moves a promotion's paid events p_days back (inside a test transaction only)
--   tests.fx_promo_drop(promo)      deletes a promotion (as when its owner's account goes; inside a test transaction only)
--   tests.fx_promo_purge()          runs purge_promotion_data() (the same way)
-- Counts and texts as postgres: tests.fx_promo_count / tests.fx_promo_text (101's fixtures).
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the promotion rules fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.usage_events') is null then
    raise exception 'nestly.usage_events is missing: run the I13 follow-up migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_usage_age(p_user uuid, p_days integer) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_usage_age: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.usage_events set occurred_on = occurred_on - p_days where user_id = p_user;
end
$$;

create or replace function tests.fx_pv_age(p_pro uuid, p_days integer) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_pv_age: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.professional_views set occurred_on = occurred_on - p_days where professional_id = p_pro;
end
$$;

create or replace function tests.fx_usage_purge() returns integer
language sql security definer set search_path = ''
as $$ select nestly.purge_usage_events() $$;

revoke all on function tests.fx_usage_age(uuid, integer) from public;
revoke all on function tests.fx_pv_age(uuid, integer) from public;
revoke all on function tests.fx_usage_purge() from public;
grant execute on function tests.fx_usage_age(uuid, integer) to app_server;
grant execute on function tests.fx_pv_age(uuid, integer) to app_server;
grant execute on function tests.fx_usage_purge() to app_server;

create or replace function tests.fx_promo_age(p_promo uuid, p_days integer) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_promo_age: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.promotion_events set occurred_on = occurred_on - p_days where promotion_id = p_promo;
end
$$;

create or replace function tests.fx_promo_drop(p_promo uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_promo_drop: call it inside the test transaction (its change would be committed)';
  end if;
  delete from nestly.promotions where id = p_promo;
end
$$;

create or replace function tests.fx_promo_purge() returns integer
language sql security definer set search_path = ''
as $$ select nestly.purge_promotion_data() $$;

revoke all on function tests.fx_promo_age(uuid, integer) from public;
revoke all on function tests.fx_promo_drop(uuid) from public;
revoke all on function tests.fx_promo_purge() from public;
grant execute on function tests.fx_promo_age(uuid, integer) to app_server;
grant execute on function tests.fx_promo_drop(uuid) to app_server;
grant execute on function tests.fx_promo_purge() to app_server;

commit;
