-- =====================================================================================================================
-- CI only -- fixtures for 112_reports_details_500.sql (the 500 report text cap and the older rows it keeps, VAL-048).
-- Run as postgres in name order (112_ sorts before 11_ by code point; it needs only the migrations and, at call time, 10_ / 71_).
-- Never a migration. Commits no row. Definers owned by postgres, fixed search_path, executable by app_server only.
--
--   tests.fx_rp_add_at(reporter, post, details, created_at)   a post report written as the reporter's identity with that creation
--                                                             time (a row as an older release wrote it); returns its id
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the reports details fixtures must run as postgres (current_user is %)', current_user;
  end if;
end
$$;

create or replace function tests.fx_rp_add_at(p_reporter uuid, p_post uuid, p_details text, p_created_at timestamptz) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_rp_add_at: call it inside the test transaction (its row would be committed)';
  end if;
  perform pg_catalog.set_config('request.jwt.claims', tests.claims(p_reporter), true);
  insert into nestly.reports (target_kind, post_id, reason, details, created_at)
  values ('post', p_post, 'other', p_details, p_created_at)
  returning id into v_id;
  perform pg_catalog.set_config('request.jwt.claims', '', true);
  return v_id;
end
$$;

revoke all on function tests.fx_rp_add_at(uuid, uuid, text, timestamptz) from public;
grant execute on function tests.fx_rp_add_at(uuid, uuid, text, timestamptz) to app_server;

commit;
