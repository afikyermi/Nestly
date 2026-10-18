-- CI only -- fixtures for the feed-view db tests (I3 F3.2a2, apps/server/tests/db/feed.db.test.ts). Run as postgres by the db job AFTER
-- 71_feed_interactions_fixtures.sql. Never a migration. Definers owned by postgres, fixed search_path, executable by app_server only.
--   tests.fx_fv_at(kind, id, ts) / fx_fv_ago(kind, id, ago)   created_at of a post / comment / reaction: a time / now() - ago
--   tests.fx_fv_cs(id, status)                                a comment's status (replies follow through parent_status)
--   tests.fx_fv_cm(author, post, n, ts) / fx_fv_rx(user, post, ts)   n comments by one author at ts / a like at ts; the last id
begin;
do $$
begin
  if current_user <> 'postgres' or to_regprocedure('tests.fx_cm_add(uuid,uuid,text,uuid)') is null then
    raise exception 'the feed-view fixtures run as postgres, after 71_feed_interactions_fixtures.sql';
  end if;
end
$$;

create or replace function tests.fx_fv_at(p_kind text, p_id uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_kind = 'post' then update nestly.posts set created_at = p_at where id = p_id;
  elsif p_kind = 'comment' then update nestly.comments set created_at = p_at where id = p_id;
  elsif p_kind = 'reaction' then update nestly.reactions set created_at = p_at where id = p_id;
  else raise exception 'tests.fx_fv_at: unknown kind %', p_kind;
  end if;
  if not found then raise exception 'tests.fx_fv_at: no % %', p_kind, p_id; end if;
end
$$;

create or replace function tests.fx_fv_ago(p_kind text, p_id uuid, p_ago interval) returns void
language sql security definer set search_path = '' as $$ select tests.fx_fv_at(p_kind, p_id, now() - p_ago) $$;

create or replace function tests.fx_fv_cs(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.comments set status = p_status where id = p_id;
  if not found then raise exception 'tests.fx_fv_cs: no comment %', p_id; end if;
end
$$;

create or replace function tests.fx_fv_cm(p_author uuid, p_post uuid, p_n int, p_at timestamptz) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  for i in 1 .. p_n loop
    v_id := tests.fx_cm_add(p_author, p_post, 'c' || i, null);
    perform tests.fx_fv_at('comment', v_id, p_at);
  end loop;
  return v_id;
end
$$;

create or replace function tests.fx_fv_rx(p_user uuid, p_post uuid, p_at timestamptz) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := tests.fx_rx_add(p_user, p_post, null);
begin
  perform tests.fx_fv_at('reaction', v_id, p_at);
  return v_id;
end
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
