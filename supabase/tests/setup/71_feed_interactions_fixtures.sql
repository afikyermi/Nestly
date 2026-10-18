-- =====================================================================================================================
-- CI only -- fixtures for the feed-interaction tests (I3 F3.0b, .work/feed-groundwork/spec.md c10-c16 reporter, c19).
-- Run as postgres by the `db` job in name order AFTER 70_feed_fixtures.sql and after the F3.0b migration. Never a migration.
-- Rows are written inside the test transaction only (the suite rolls them back). Definers owned by postgres, fixed search_path,
-- executable by app_server only.
--
--   tests.fx_cm_add(author, post, body, parent)  a comment written as the author's identity (claims set for the statement, so the
--                                                database fills author / mark itself); returns its id
--   tests.fx_cm_id(post, body)                   id of the comment with that body on that post (unfiltered), or null
--   tests.fx_cm_state(id)                        'status=active author=<uuid|null> mark=<t|f> parent=<uuid|null> post=<uuid>' or null
--   tests.fx_cm_count() / fx_rx_count() / fx_ro_count() / fx_rp_count()   rows of comments / reactions / reaction_owners / reports, unfiltered
--   tests.fx_rx_add(user, post, comment)         a like written as the user's identity; returns the reaction id
--   tests.fx_rx_statuses(target)                 the liker_status copies of the likes on one target, comma separated ('-' for none)
--   tests.fx_rp_add(reporter, kind, target, reason, details)   a report written as the reporter's identity; returns its id
--   tests.fx_rp_id(reporter, target)             id of that reporter's report whose target column is that id, or null
--   tests.fx_rp_list(reporter)                   'kind:status:<target|null>:closed=<t|f>' of every report by one reporter, comma separated
--   tests.fx_rp_clear()                          deletes every report (a section that counts reports starts clean)
--   tests.fx_feed_clear()                        deletes every report, like, comment, hide and post (a section that counts rows starts clean)
--   tests.fx_rp_set(id, status)                  sets a report to handled / expired (closed_at = now()) -- the work of I4 and the purge
--   tests.fx_hold_state(kind, id)                'none' or 'status=deleted hours=<held_until - held_at in hours>' of a post / comment
--   tests.fx_hold_exec(sql)                      one UPDATE of held_at / held_until / status on posts or comments as the owner role:
--                                                'OK:<rows>' or 'ERR:<sqlstate>'
--   tests.fx_hold_settle(kind, id)               moves the holding-transaction mark away from this transaction (the state after commit)
--   tests.fx_hold_shift(kind, id, by)            moves held_at and held_until `by` into the past (the DB clock decides everything)
--   tests.fx_jobs_on() / fx_jobs_off()           lets app_server SET ROLE app_jobs inside the test transaction (membership granted
--                                                here, revoked here, rolled back anyway); app_server never holds it outside (rule 6)
--   tests.fx_jobs_member()                       is app_server a member of app_jobs now?
--   tests.jobs_as(sql)                           INVOKER: fx_jobs_on, run `sql` as app_jobs through tests.as_role, fx_jobs_off
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the feed-interaction fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.comments') is null or to_regclass('nestly.reports') is null then
    raise exception 'nestly.comments / nestly.reports are missing: run the F3.0b migration before these fixtures';
  end if;
  if to_regprocedure('tests.fx_po_add(uuid,text,boolean,text,text,text,uuid)') is null then
    raise exception 'tests.fx_po_add is missing: run 70_feed_fixtures.sql first';
  end if;
end
$$;

create or replace function tests.fx_cm_add(p_author uuid, p_post uuid, p_body text default 'comment body', p_parent uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_cm_add: call it inside the test transaction (its row would be committed)';
  end if;
  perform set_config('request.jwt.claims', tests.claims(p_author), true);
  insert into nestly.comments (post_id, parent_id, body) values (p_post, p_parent, p_body) returning id into v_id;
  perform set_config('request.jwt.claims', '', true);
  return v_id;
end
$$;

create or replace function tests.fx_cm_id(p_post uuid, p_body text) returns uuid
language sql stable security definer set search_path = ''
as $$ select c.id from nestly.comments c where c.post_id = p_post and c.body = p_body limit 1 $$;

create or replace function tests.fx_cm_state(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select 'status=' || c.status || ' author=' || coalesce(c.author_id::text, 'null') || ' mark=' || left(c.is_by_post_author::text, 1)
      || ' parent=' || coalesce(c.parent_id::text, 'null') || ' post=' || c.post_id::text
    from nestly.comments c where c.id = p_id
$$;

create or replace function tests.fx_cm_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.comments $$;

create or replace function tests.fx_rx_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.reactions $$;

create or replace function tests.fx_ro_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.reaction_owners $$;

create or replace function tests.fx_rp_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.reports $$;

create or replace function tests.fx_rx_add(p_user uuid, p_post uuid default null, p_comment uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_rx_add: call it inside the test transaction (its row would be committed)';
  end if;
  perform set_config('request.jwt.claims', tests.claims(p_user), true);
  insert into nestly.reactions (post_id, comment_id) values (p_post, p_comment) returning id into v_id;
  perform set_config('request.jwt.claims', '', true);
  return v_id;
end
$$;

create or replace function tests.fx_rx_statuses(p_target uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(string_agg(r.liker_status, ',' order by r.liker_status), '-') from nestly.reactions r where r.target_id = p_target $$;

create or replace function tests.fx_rp_add(p_reporter uuid, p_kind text, p_target uuid, p_reason text default 'spam', p_details text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_rp_add: call it inside the test transaction (its row would be committed)';
  end if;
  perform set_config('request.jwt.claims', tests.claims(p_reporter), true);
  insert into nestly.reports (target_kind, post_id, comment_id, reported_user_id, reason, details)
  values (p_kind,
          case when p_kind = 'post' then p_target end,
          case when p_kind = 'comment' then p_target end,
          case when p_kind = 'user' then p_target end,
          p_reason, p_details)
  returning id into v_id;
  perform set_config('request.jwt.claims', '', true);
  return v_id;
end
$$;

create or replace function tests.fx_rp_id(p_reporter uuid, p_target uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select r.id from nestly.reports r
   where r.reporter_id = p_reporter and p_target in (r.post_id, r.comment_id, r.reported_user_id) limit 1
$$;

create or replace function tests.fx_rp_list(p_reporter uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(r.target_kind || ':' || r.status || ':' || coalesce(coalesce(r.post_id, r.comment_id, r.reported_user_id)::text, 'null')
                             || ':closed=' || left((r.closed_at is not null)::text, 1), ',' order by r.target_kind, r.status, r.id), '-')
    from nestly.reports r where r.reporter_id = p_reporter
$$;

create or replace function tests.fx_rp_clear() returns void
language sql security definer set search_path = ''
as $f$ delete from nestly.reports $f$;

create or replace function tests.fx_feed_clear() returns void
language plpgsql security definer set search_path = ''
as $f$
begin
  delete from nestly.reports;
  delete from nestly.reactions;
  delete from nestly.comments;
  delete from nestly.post_hides;
  delete from nestly.posts;
end
$f$;

create or replace function tests.fx_rp_set(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.reports set status = p_status, closed_at = now() where id = p_id;
  if not found then raise exception 'tests.fx_rp_set: no report %', p_id; end if;
end
$$;

create or replace function tests.fx_hold_state(p_kind text, p_id uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v text;
begin
  if p_kind = 'post' then
    select 'status=' || p.status || ' hours=' || coalesce((extract(epoch from p.held_until - p.held_at) / 3600)::bigint::text, 'null')
      into v from nestly.posts p where p.id = p_id;
  else
    select 'status=' || c.status || ' hours=' || coalesce((extract(epoch from c.held_until - c.held_at) / 3600)::bigint::text, 'null')
      into v from nestly.comments c where c.id = p_id;
  end if;
  return coalesce(v, 'none');
end
$$;

create or replace function tests.fx_hold_exec(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_hold_exec: call it inside the test transaction';
  end if;
  if p_sql !~* '^\s*update\s+nestly\.(posts|comments)\s+set\s+held_' then
    raise exception 'tests.fx_hold_exec: only UPDATE nestly.posts / comments SET held_...';
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    return 'OK:' || n;
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end
$$;

create or replace function tests.fx_hold_shift(p_kind text, p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_kind = 'post' then
    update nestly.posts set held_at = held_at - p_by, held_until = held_until - p_by where id = p_id and held_at is not null;
  else
    update nestly.comments set held_at = held_at - p_by, held_until = held_until - p_by where id = p_id and held_at is not null;
  end if;
  if not found then raise exception 'tests.fx_hold_shift: no held % %', p_kind, p_id; end if;
end
$$;

-- A hold is read by its own transaction only (schema-b.md "held branch": held_xact = the current transaction). A pgTAP file is one
-- transaction, so this moves the mark to another transaction id: what every later transaction, the author's included, would see.
create or replace function tests.fx_hold_settle(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_kind = 'post' then
    update nestly.posts set held_xact = '1'::xid8 where id = p_id and status = 'deleted' and held_at is not null;
  else
    update nestly.comments set held_xact = '1'::xid8 where id = p_id and status = 'deleted' and held_at is not null;
  end if;
end
$$;

create or replace function tests.fx_jobs_on() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_jobs_on: call it inside the test transaction';
  end if;
  grant app_jobs to app_server;
end
$$;

create or replace function tests.fx_jobs_off() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  revoke app_jobs from app_server;
end
$$;

create or replace function tests.fx_jobs_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select pg_catalog.pg_has_role('app_server', 'app_jobs', 'member') $$;

create or replace function tests.jobs_as(p_sql text) returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.fx_jobs_on();
  v := tests.as_role('app_jobs', '', p_sql);
  perform tests.fx_jobs_off();
  return v;
end
$$;

create or replace function tests.jobs_dml(p_sql text) returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.fx_jobs_on();
  v := tests.dml_as('app_jobs', '', p_sql);
  perform tests.fx_jobs_off();
  return v;
end
$$;

-- The order of preview-e2e-cleanup-cli.ts, now with the F3.0b rows (schema-b.md "Cleanup tool"): reports, then likes, then a's
-- hides; comments before posts. Replaces 70_'s definition (same name).
create or replace function tests.fx_cleanup_user(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_cleanup_user: call it inside the test transaction';
  end if;
  delete from nestly.reports
   where reporter_id = p_id or reported_user_id = p_id
      or post_id in (select id from nestly.posts where author_id = p_id or id in (select post_id from nestly.post_authors where author_id = p_id))
      or comment_id in (select c.id from nestly.comments c
                         where c.author_id = p_id
                            or c.post_id in (select id from nestly.posts where author_id = p_id or id in (select post_id from nestly.post_authors where author_id = p_id))
                            or c.parent_id in (select id from nestly.comments where author_id = p_id));
  delete from nestly.reactions where id in (select reaction_id from nestly.reaction_owners where user_id = p_id);
  delete from nestly.post_hides where user_id = p_id;
  delete from nestly.comments
   where author_id = p_id
      or (author_id is null and post_id in (select post_id from nestly.post_authors where author_id = p_id));
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
