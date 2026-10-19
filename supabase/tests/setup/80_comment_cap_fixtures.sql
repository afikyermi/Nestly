-- =====================================================================================================================
-- CI only -- fixtures for 80_comment_body_cap.sql (I3 F3.3a, .work/comments-likes/schema.md "pgTAP for TEST ENGINEER").
-- Run as postgres by the `db` job in name order AFTER 71_feed_interactions_fixtures.sql. Never a migration.
-- Definers owned by postgres, fixed search_path, executable by app_server only; only inside the test transaction.
--
--   tests.fx_cm_set_body(id, body)   one UPDATE of comments.body as the owner role (the path no client has: I4 moderation, a future edit):
--                                    'OK:<rows>' or 'ERR:<sqlstate>'
--   tests.fx_cm_body(id)             the stored body of one comment (unfiltered), or null
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the comment-cap fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.comments') is null then
    raise exception 'nestly.comments is missing: run the migrations before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_cm_set_body(p_id uuid, p_body text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_cm_set_body: call it inside the test transaction';
  end if;
  begin
    update nestly.comments set body = p_body where id = p_id;
    get diagnostics n = row_count;
    return 'OK:' || n;
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end
$$;

create or replace function tests.fx_cm_body(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select c.body from nestly.comments c where c.id = p_id $$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
