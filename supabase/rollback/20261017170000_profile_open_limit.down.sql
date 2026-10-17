-- =====================================================================================================================
-- Down script for supabase/migrations/20261017170000_profile_open_limit.sql (I2 F2.4c1; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F2.4c1 server code first (the viewer route and the send's count read profile_view's new columns), then run this.
-- Safe:     only while security_events holds no row: an event is a Security record, and after real use the way back is a forward
--           migration (data-model rule 7). FORCE RLS would hide every row from app_owner, so it is lifted inside this transaction
--           first and the check is real. Every account's open window restarts (profile_open_counts is working state).
-- Restores: profile_view(text) as F2.3b left it (20261017150000, verbatim), drops the two policies on friendships and
--           regular_names, drops security_events, profile_open_counts, security_limits (with their policies and index), and
--           deletes this version's history row only (never 20261017160000, F2.4a's).
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the profile open limit down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.security_events no force row level security;

do $$
begin
  if exists (select 1 from nestly.security_events) then
    raise exception 'nestly.security_events holds a row: rolling back would delete a Security record. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

drop function nestly.profile_view(text);

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

comment on function nestly.profile_view(text) is
  'One other Regular account''s profile as a non-Friend (FR-PRIV-001, BR-044, AC-054, OP-020; F2.3b): 0 or 1 row. full_name, children_count, is_pregnant, shows_empty_journey_sentence always; gender and child_ages ([{years, months}], (created_at, slot) order) only when the target is Open. Never a child''s name, sex, birth date, id or slot, a due date, a setting or a status. Caller active (is_active_account()); target active and Regular, else 0 rows, as for an unknown or malformed id (DR-5 A). SECURITY DEFINER (data-model.md "Approved exceptions", DR-G1); EXECUTE authenticated.';

drop policy regular_names_select_profile_view on nestly.regular_names;

drop policy friendships_select_profile_view on nestly.friendships;

drop table nestly.security_events;

drop table nestly.profile_open_counts;

drop table nestly.security_limits;

delete from supabase_migrations.schema_migrations where version = '20261017170000';

commit;
