-- =====================================================================================================================
-- CI only -- fixtures for the feed tests (I3 F3.0a, .work/feed-groundwork/spec.md c1-c9, c13, c16-c19).
-- Run as postgres by the `db` job in name order AFTER 10_ .. 60_ (ci.yml: "for f in supabase/tests/setup/*.sql"). Never a migration.
-- People are 10_'s a, b, s, x, p and 60_'s fr_c (built inside a test transaction). Posts are written inside the test
-- transaction only (the suite rolls them back). Definers owned by postgres, fixed search_path, executable by app_server only.
--
--   tests.fx_po_add(author, audience, anon, status, body, tag, shared)   a post written as the author's identity (claims set for the
--                                              statement, so the database fills author_id / separation row itself); returns its id
--   tests.fx_po_status(id, status)             sets posts.status (hidden / removed / deleted: no runtime role may)
--   tests.fx_po_state(id)                      'status=active aud=everyone anon=f author=<uuid|null> tag=<..> share=<f|t:uuid|t:null> body=<..>'
--   tests.fx_po_count() / fx_pa_count() / fx_ph_count()   rows of posts / post_authors / post_hides, unfiltered
--   tests.fx_pa_author(post)                   the real author of an anonymous post (unfiltered), or null
--   tests.fx_ph_add(user, post)                a hide row written as postgres
--   tests.fx_restrict(user)                    sets the profile visibility to restricted
--   tests.fx_cfg_exec(sql)                     one INSERT / UPDATE / DELETE on nestly.algorithm_configurations as the owner role:
--                                              'OK:<rows>' or 'ERR:<sqlstate>'
--   tests.fx_cfg_json()                        the active v1 row as jsonb (unfiltered)
--   tests.fx_cleanup_user(id)                  the Preview cleanup's delete order for one user (schema.md "Cleanup tool"), as postgres
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the feed fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.posts') is null then
    raise exception 'nestly.posts is missing: run the F3.0a migration before these fixtures';
  end if;
  if to_regprocedure('tests.fx_fr_add(uuid,uuid,text,boolean)') is null then
    raise exception 'tests.fx_fr_add is missing: run 60_friend_fixtures.sql first';
  end if;
end
$$;

create or replace function tests.fx_po_add(
  p_author uuid, p_audience text default 'everyone', p_anon boolean default false, p_status text default 'active',
  p_body text default 'post body', p_tag text default null, p_shared uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_po_add: call it inside the test transaction (its row would be committed)';
  end if;
  perform set_config('request.jwt.claims', tests.claims(p_author), true);
  insert into nestly.posts (audience, is_anonymous, body, stage_tag, shared_post_id)
  values (p_audience, p_anon, p_body, p_tag, p_shared)
  returning id into v_id;
  perform set_config('request.jwt.claims', '', true);
  if p_status <> 'active' then
    update nestly.posts set status = p_status where id = v_id;
  end if;
  return v_id;
end
$$;

create or replace function tests.fx_po_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.posts set status = p_status where id = p_id;
  if not found then raise exception 'tests.fx_po_status: no post %', p_id; end if;
end
$$;

create or replace function tests.fx_po_state(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select 'status=' || p.status || ' aud=' || p.audience || ' anon=' || left(p.is_anonymous::text, 1)
      || ' author=' || coalesce(p.author_id::text, 'null') || ' tag=' || coalesce(p.stage_tag, 'null')
      || ' share=' || case when p.is_share then 't:' || coalesce(p.shared_post_id::text, 'null') else 'f' end
      || ' body=' || coalesce(p.body, 'null')
    from nestly.posts p where p.id = p_id
$$;

create or replace function tests.fx_po_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.posts $$;

create or replace function tests.fx_pa_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.post_authors $$;

create or replace function tests.fx_ph_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.post_hides $$;

create or replace function tests.fx_pa_author(p_post uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select a.author_id from nestly.post_authors a where a.post_id = p_post $$;

create or replace function tests.fx_ph_add(p_user uuid, p_post uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.post_hides (user_id, post_id) values (p_user, p_post);
end
$$;

create or replace function tests.fx_restrict(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.regular_profiles set profile_visibility = 'restricted' where user_id = p_user;
  if not found then raise exception 'tests.fx_restrict: no profile for %', p_user; end if;
end
$$;

create or replace function tests.fx_cfg_exec(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_cfg_exec: call it inside the test transaction';
  end if;
  if p_sql !~* '^\s*(insert\s+into|update|delete\s+from)\s+nestly\.algorithm_configurations\M' then
    raise exception 'tests.fx_cfg_exec: only DML on nestly.algorithm_configurations';
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    -- keep the effect of a successful statement only until the caller's rollback
    return 'OK:' || n;
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end
$$;

create or replace function tests.fx_cfg_json() returns jsonb
language sql stable security definer set search_path = ''
as $$ select to_jsonb(c) from nestly.algorithm_configurations c where c.is_active and c.surface = 'regular_feed' $$;

-- The order of preview-e2e-cleanup-cli.ts for the new tables, then the rest of the user chain.
create or replace function tests.fx_cleanup_user(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_cleanup_user: call it inside the test transaction';
  end if;
  delete from nestly.post_hides where user_id = p_id;
  delete from nestly.posts
   where author_id = p_id or id in (select post_id from nestly.post_authors where author_id = p_id);
  delete from nestly.friendships where requester_id = p_id or addressee_id = p_id;
  delete from nestly.regular_names where user_id = p_id;
  delete from nestly.regular_profiles where user_id = p_id;
  delete from nestly.users where id = p_id;
  delete from auth.users where id = p_id;
end
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
