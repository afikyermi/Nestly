-- =====================================================================================================================
-- CI only -- fixtures for the privacy-settings tests (I2 F2.3a, .work/profile-privacy/spec.md c5, c6; schema.md "pgTAP").
-- Run as postgres by the `db` job, in name order AFTER 10_ .. 40_ and before the suite (ci.yml: "for f in
-- supabase/tests/setup/*.sql"). Never a migration. Commits no row: only helpers.
--
-- The observers read the three settings through to_jsonb(row), on purpose: they must keep working while the columns do NOT
-- exist (the c6 rollback test runs them between the down script and the re-apply), where a plain column reference would fail.
--   tests.fx_privacy(id)          'visibility/sentence/birthday' of one profile, e.g. 'open/true/true'; a missing column reads
--                                 '∅'; no profile row reads '-'
--   tests.fx_privacy_lacking(profiles_only)  how many Regular accounts (nestly.users, account_type regular, any status) lack
--                                 any of the three: no profile row, a NULL, or a missing column (c6). profiles_only = true skips
--                                 users rows with no profile row (the server db tests commit such rows: 30_'s
--                                 fx_recovery_new_account), counting only the profiles that exist
--   tests.fx_privacy_columns()    the three column names that exist on regular_profiles, comma separated ('' = none)
--   tests.fx_privacy_base()       md5 of users, regular_profiles WITHOUT the three settings, journey_contexts and children:
--                                 "profiles, journeys and children unchanged" across a down / up (c6)
--   tests.fx_privacy_put(id, v, s, b)  a writer that sets the three directly (definer): to give the rollback guard a
--                                 non-default row to find, and to restore
--   tests.fx_insert_journey(id, stage, due) / tests.fx_insert_child(id, slot, name, sex, birth)   narrow writers for the
--                                 c6 accounts (pregnant only, planning only, none ...)
-- Definers owned by postgres, fixed search_path, executable by app_server only (the grant at the end).
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the privacy fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regprocedure('tests.fx_id_checked(text)') is null then
    raise exception 'tests.fx_id_checked is missing: run 10_identity_fixtures.sql first';
  end if;
end
$$;

create or replace function tests.fx_privacy(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select coalesce(j ->> 'profile_visibility', '∅') || '/' || coalesce(j ->> 'is_empty_journey_sentence_shown', '∅')
            || '/' || coalesce(j ->> 'is_child_birthday_shared', '∅')
       from (select pg_catalog.to_jsonb(p) as j from nestly.regular_profiles p where p.user_id = p_id) r),
    '-')
$$;

create or replace function tests.fx_privacy_lacking(p_profiles_only boolean default false) returns bigint
language sql stable security definer set search_path = ''
as $$
  select count(*)
    from nestly.users u
    left join lateral (select pg_catalog.to_jsonb(p) as j from nestly.regular_profiles p where p.user_id = u.id) r on true
   where u.account_type = 'regular'
     and (r.j is not null or not p_profiles_only)
     and (r.j is null
          or r.j ->> 'profile_visibility' is null
          or r.j ->> 'is_empty_journey_sentence_shown' is null
          or r.j ->> 'is_child_birthday_shared' is null)
$$;

create or replace function tests.fx_privacy_columns() returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(a.attname::text, ',' order by a.attname), '')
    from pg_catalog.pg_attribute a
   where a.attrelid = 'nestly.regular_profiles'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('profile_visibility', 'is_empty_journey_sentence_shown', 'is_child_birthday_shared')
$$;

create or replace function tests.fx_privacy_base() returns text
language sql stable security definer set search_path = ''
as $$
  select md5(
    coalesce((select string_agg(u::text, '|' order by u.id) from nestly.users u), '')
    || '#' ||
    coalesce((select string_agg((pg_catalog.to_jsonb(p) - array['profile_visibility', 'is_empty_journey_sentence_shown',
                                                                 'is_child_birthday_shared'])::text, '|' order by p.user_id)
                from nestly.regular_profiles p), '')
    || '#' ||
    coalesce((select string_agg(j::text, '|' order by j.id) from nestly.journey_contexts j), '')
    || '#' ||
    coalesce((select string_agg(c::text, '|' order by c.id) from nestly.children c), '')
  )
$$;

-- plpgsql + dynamic SQL: created while the columns exist, still callable (and failing loudly) when they do not.
create or replace function tests.fx_privacy_put(p_id uuid, p_visibility text, p_sentence boolean, p_birthday boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  execute 'update nestly.regular_profiles set profile_visibility = $1, is_empty_journey_sentence_shown = $2, '
       || 'is_child_birthday_shared = $3 where user_id = $4'
    using p_visibility, p_sentence, p_birthday, p_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'tests.fx_privacy_put: no regular_profiles row for %', p_id; end if;
end
$$;

create or replace function tests.fx_insert_journey(p_user uuid, p_stage text, p_due date default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.journey_contexts (user_id, stage, due_date) values (p_user, p_stage, p_due);
end
$$;

create or replace function tests.fx_insert_child(p_user uuid, p_slot int, p_name text, p_sex text, p_birth date) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.children (user_id, slot, name, sex, birth_date) values (p_user, p_slot, p_name, p_sex, p_birth);
end
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
