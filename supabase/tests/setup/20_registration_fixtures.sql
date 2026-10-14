-- =====================================================================================================================
-- CI only -- fixtures for the registration pgTAP tests (I1 F1.4 part a, criteria 10 and 14).
-- Run as postgres by the `db` job, in name order AFTER 10_identity_fixtures.sql and before the suite
-- (ci.yml: "for f in supabase/tests/setup/*.sql"; the glob expands sorted, 10_ < 20_). Never a migration.
--
--   Committed rows: a = journeys pregnant (due 2027-03-01) + has_child, children slots 1-2, one consent;
--                   b = journey planning, child slot 1, one consent. Nobody else has a journey, child or consent
--                   (legal_consents.user_id is ON DELETE RESTRICT: a consent on c, p, f1..f5 would block tests that
--                   delete those users).
--   tests.fx_state()     REPLACED (same signature): md5 over the five nestly tables, unfiltered by RLS
--   tests.fx_counts(id)  'users/profiles/journeys/children/consents' counts for one user, e.g. '1/1/2/3/1'
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the registration fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.journey_contexts') is null
     or to_regclass('nestly.children') is null
     or to_regclass('nestly.legal_consents') is null then
    raise exception 'the registration tables are missing: run the migrations before the registration fixtures';
  end if;
  if to_regprocedure('tests.fx_id_checked(text)') is null then
    raise exception 'tests.fx_id_checked is missing: run 10_identity_fixtures.sql first';
  end if;
end
$$;

insert into nestly.journey_contexts (user_id, stage, due_date) values
  (tests.fx_id_checked('a'), 'pregnant',  date '2027-03-01'),
  (tests.fx_id_checked('a'), 'has_child', null),
  (tests.fx_id_checked('b'), 'planning',  null);

insert into nestly.children (user_id, slot, name, sex, birth_date) values
  (tests.fx_id_checked('a'), 1, 'Noa',  'girl',    date '2024-05-10'),
  (tests.fx_id_checked('a'), 2, 'Eli',  'boy',     date '2022-01-15'),
  (tests.fx_id_checked('b'), 1, 'Tali', 'unknown', date '2025-02-02');

insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values
  (tests.fx_id_checked('a'), 'fixture-terms-1', 'fixture-privacy-1', true),
  (tests.fx_id_checked('b'), 'fixture-terms-1', 'fixture-privacy-1', true);

create or replace function tests.fx_state() returns text
language sql security definer set search_path = ''
as $$
  select md5(
    coalesce((select string_agg(u::text, '|' order by u.id) from nestly.users u), '')
    || '#' ||
    coalesce((select string_agg(p::text, '|' order by p.user_id) from nestly.regular_profiles p), '')
    || '#' ||
    coalesce((select string_agg(j::text, '|' order by j.id) from nestly.journey_contexts j), '')
    || '#' ||
    coalesce((select string_agg(c::text, '|' order by c.id) from nestly.children c), '')
    || '#' ||
    coalesce((select string_agg(l::text, '|' order by l.id) from nestly.legal_consents l), '')
  )
$$;

create or replace function tests.fx_counts(p_id uuid) returns text
language sql security definer set search_path = ''
as $$
  select (select count(*) from nestly.users u where u.id = p_id)
    || '/' || (select count(*) from nestly.regular_profiles p where p.user_id = p_id)
    || '/' || (select count(*) from nestly.journey_contexts j where j.user_id = p_id)
    || '/' || (select count(*) from nestly.children c where c.user_id = p_id)
    || '/' || (select count(*) from nestly.legal_consents l where l.user_id = p_id)
$$;

-- 'terms/privacy/declared/clock': one user's consent rows, 'clock' = accepted_at equals this transaction's now() (the
-- database's clock: the suite is one transaction, so a row the suite just inserted must match).
create or replace function tests.fx_consent(p_id uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(string_agg(l.terms_version || '/' || l.privacy_version || '/' || l.has_declared_18_plus::text
                             || '/' || (l.accepted_at = now())::text, ' ; ' order by l.terms_version, l.privacy_version), '-')
  from nestly.legal_consents l where l.user_id = p_id
$$;

-- 'stage:due_date' per journey of one user, ordered by stage; '-' when none.
create or replace function tests.fx_journeys(p_id uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(string_agg(j.stage || ':' || coalesce(j.due_date::text, 'null'), ' ; ' order by j.stage), '-')
  from nestly.journey_contexts j where j.user_id = p_id
$$;

-- 'slot:name:sex:birth_date' per child of one user, ordered by slot; '-' when none.
create or replace function tests.fx_children(p_id uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(string_agg(c.slot || ':' || c.name || ':' || c.sex || ':' || c.birth_date::text, ' ; ' order by c.slot), '-')
  from nestly.children c where c.user_id = p_id
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
