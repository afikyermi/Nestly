-- =====================================================================================================================
-- Profile view, one other Regular account's profile as a non-Friend — I2 F2.3b (profile-privacy).
--
-- Source: .work/profile-privacy/schema.md (F2.3b; "Approved (F2.3b)", ORCHESTRATOR 17.10.2026; DR-G1 approved by Afik,
-- decisions.md 2026-10-17 "I2 reserved items"); spec.md criteria 7-15 (c14: ages in completed years and months, DR-3, DR-6 A).
--   profile_view(text)        SECURITY DEFINER, owned by app_owner, search_path ''. 0 or 1 row: full_name, gender (Open only),
--                             children_count, child_ages (Open only, jsonb [{years, months}] in (created_at, slot) order),
--                             is_pregnant, shows_empty_journey_sentence. Never a child's name, sex, birth date, id or slot, a due
--                             date, a setting or a status. Caller active (is_active_account(), rule 15); target active and
--                             Regular, else 0 rows (c13, DR-5). Gender and ages sit behind one switch, s.is_full (F2.4c1 widens
--                             it with the Friend branch). EXECUTE authenticated only.
--   profile_view_target()     SECURITY INVOKER: the transaction-local GUC nestly.profile_view_target as a uuid, else NULL.
--   child_age_months(d, ts)   SECURITY INVOKER: completed calendar months from a birth date to an instant, on the date in
--                             Asia/Jerusalem, floored at 0 (DR-6 A). profile_view passes pg_catalog.now(): the instant is never
--                             a parameter of profile_view (a caller choosing the date could bisect the birth date).
--   4 policies                <table>_select_profile_view TO app_owner on users, regular_profiles, children, journey_contexts:
--                             only the row(s) of the uuid in the GUC, which profile_view sets and clears around its one query.
--                             No runtime role is in app_owner (rule 1), so a GUC a caller sets opens nothing (c9).
-- Why a definer: RLS hides rows, not columns — the caller's own rights would expose names, birth dates and gender under
-- Restricted. No table change, no backfill, no index. Helpers: no runtime EXECUTE. Applied by the Supabase CLI as app_owner, in
-- one transaction with its history row. Down script: supabase/rollback/20261017150000_profile_view.down.sql.
-- =====================================================================================================================

create function nestly.child_age_months(p_birth date, p_at timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(0, ((extract(year from t.d) - extract(year from p_birth)) * 12 + extract(month from t.d) - extract(month from p_birth)
                      - case when extract(day from t.d) < extract(day from p_birth) then 1 else 0 end)::integer)
  from (select pg_catalog.timezone('Asia/Jerusalem', p_at)::date as d) as t
$$;

create function nestly.profile_view_target()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case when pg_catalog.current_setting('nestly.profile_view_target', true) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then pg_catalog.current_setting('nestly.profile_view_target', true)::uuid end
$$;

-- No grant: only app_owner (the owner, inside profile_view and its policies) executes them.
revoke execute on function nestly.child_age_months(date, timestamptz), nestly.profile_view_target() from public;

create policy users_select_profile_view on nestly.users
  for select to app_owner
  using (id = (select nestly.profile_view_target()));

create policy regular_profiles_select_profile_view on nestly.regular_profiles
  for select to app_owner
  using (user_id = (select nestly.profile_view_target()));

create policy children_select_profile_view on nestly.children
  for select to app_owner
  using (user_id = (select nestly.profile_view_target()));

create policy journey_contexts_select_profile_view on nestly.journey_contexts
  for select to app_owner
  using (user_id = (select nestly.profile_view_target()));

create function nestly.profile_view(p_target text)
returns table (full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean,
               shows_empty_journey_sentence boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then
    return;
  end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  return query
    select p.full_name, case when s.is_full then p.gender end, k.n,
           case when s.is_full then (
             select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('years', a.m / 12, 'months', a.m % 12)
                                                  order by c.created_at, c.slot), '[]'::jsonb)
             from nestly.children c cross join lateral (select nestly.child_age_months(c.birth_date, pg_catalog.now()) as m) a
             where c.user_id = p.user_id) end,
           k.pregnant, (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown)
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select p.profile_visibility = 'open' as is_full) s   -- F2.4c1: "or <caller and target are Friends>"
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true);
end
$$;

revoke execute on function nestly.profile_view(text) from public;
grant  execute on function nestly.profile_view(text) to authenticated;

comment on function nestly.child_age_months(date, timestamptz) is
  'Completed calendar months from p_birth to the date of p_at in Asia/Jerusalem (spec c14, DR-3): 12 x year difference + month difference, minus one while the day of the month is before the birth day; floored at 0 (a future birth date reads 0, DR-6 A). SECURITY INVOKER; no runtime EXECUTE (only profile_view calls it, with pg_catalog.now()).';
comment on function nestly.profile_view_target() is
  'The transaction-local GUC nestly.profile_view_target as a uuid, NULL when unset, empty or not a uuid. Read by the four *_select_profile_view policies; set and cleared only by profile_view. SECURITY INVOKER; no runtime EXECUTE.';
comment on function nestly.profile_view(text) is
  'One other Regular account''s profile as a non-Friend (FR-PRIV-001, BR-044, AC-054, OP-020; F2.3b): 0 or 1 row. full_name, children_count, is_pregnant, shows_empty_journey_sentence always; gender and child_ages ([{years, months}], (created_at, slot) order) only when the target is Open. Never a child''s name, sex, birth date, id or slot, a due date, a setting or a status. Caller active (is_active_account()); target active and Regular, else 0 rows, as for an unknown or malformed id (DR-5 A). SECURITY DEFINER (data-model.md "Approved exceptions", DR-G1); EXECUTE authenticated.';

comment on policy users_select_profile_view on nestly.users is
  'profile_view only: app_owner (the definer''s owner, which no runtime role is a member of) reads the one row whose id is in the transaction-local nestly.profile_view_target, which profile_view sets and clears.';
comment on policy regular_profiles_select_profile_view on nestly.regular_profiles is
  'profile_view only: app_owner reads the one profile whose user_id is in the transaction-local nestly.profile_view_target, which profile_view sets and clears.';
comment on policy children_select_profile_view on nestly.children is
  'profile_view only: app_owner reads the children whose user_id is in the transaction-local nestly.profile_view_target (count and derived ages leave the function, nothing else).';
comment on policy journey_contexts_select_profile_view on nestly.journey_contexts is
  'profile_view only: app_owner reads the journeys whose user_id is in the transaction-local nestly.profile_view_target (only the presence of a pregnant journey leaves the function).';
