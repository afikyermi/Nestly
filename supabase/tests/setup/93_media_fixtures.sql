-- =====================================================================================================================
-- Fixtures for 93_media_stories.sql (I5: images, reviews, profile photos, Stories, the queue and the training set). Run as postgres.
-- Nothing is committed here but the functions.
--
--   tests.media_dml(sql) / media_as(sql)       INVOKER: grants app_media_jobs to app_server for the call (inside the test transaction),
--                                              runs `sql` as app_media_jobs through tests.dml_as / as_role, revokes it
--   tests.fx_media_member()                    is app_server a member of app_media_jobs now (false outside the calls above)
--   tests.fx_media_age(id, interval)           moves an image's upload time (and, when decided, its decision time) back by the interval
--   tests.fx_media_suspicion_age(id, interval) moves a suspicion's clock and purge time back by the interval
--   tests.fx_story_age(id, interval)           moves a Story's publication and expiry back by the interval
--   tests.fx_sample_age(id, interval)          moves a training sample's copy time and expiry back by the interval
--   tests.fx_media_held(id)                    is_held of an image (not readable by any client)
--   tests.fx_media_rows(id)                    1 while the image row exists, whoever may read it
-- =====================================================================================================================

create or replace function tests.fx_media_jobs_on() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_media_jobs_on: call it inside the test transaction';
  end if;
  grant app_media_jobs to app_server;
end
$$;

create or replace function tests.fx_media_jobs_off() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  revoke app_media_jobs from app_server;
end
$$;

create or replace function tests.fx_media_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select pg_catalog.pg_has_role('app_server', 'app_media_jobs', 'member') $$;

create or replace function tests.media_dml(p_sql text) returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.fx_media_jobs_on();
  v := tests.dml_as('app_media_jobs', '', p_sql);
  perform tests.fx_media_jobs_off();
  return v;
end
$$;

create or replace function tests.media_as(p_sql text) returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.fx_media_jobs_on();
  v := tests.as_role('app_media_jobs', '', p_sql);
  perform tests.fx_media_jobs_off();
  return v;
end
$$;

create or replace function tests.fx_media_age(p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.media_assets set created_at = created_at - p_by, decided_at = decided_at - p_by where id = p_id;
  if not found then raise exception 'tests.fx_media_age: no image %', p_id; end if;
end
$$;

create or replace function tests.fx_media_suspicion_age(p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.media_reviews set suspected_at = suspected_at - p_by, purge_after = purge_after - p_by where media_id = p_id and is_suspected;
  if not found then raise exception 'tests.fx_media_suspicion_age: no suspicion on %', p_id; end if;
end
$$;

create or replace function tests.fx_story_age(p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.stories set created_at = created_at - p_by, expires_at = expires_at - p_by where id = p_id;
  if not found then raise exception 'tests.fx_story_age: no Story %', p_id; end if;
end
$$;

create or replace function tests.fx_sample_age(p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.media_training_samples set created_at = created_at - p_by, expires_at = expires_at - p_by where id = p_id;
  if not found then raise exception 'tests.fx_sample_age: no sample %', p_id; end if;
end
$$;

create or replace function tests.fx_media_held(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select is_held from nestly.media_assets where id = p_id $$;

create or replace function tests.fx_media_rows(p_media uuid) returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.media_assets where id = p_media $$;
