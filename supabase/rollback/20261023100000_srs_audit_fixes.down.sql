-- =====================================================================================================================
-- Down script for supabase/migrations/20261023100000_srs_audit_fixes.sql (SRS-audit fixes: People Search returns Professionals, child
-- birthday notifications, analytics of Professionals and Marketplace).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Order:    revert the code that reads account_type from search_people and calls deliver_child_birthdays() first, then run this.
-- Safe:     only while no child_birthday notification exists (refuses otherwise).
-- Restores: search_people(text, integer, integer) and its comment verbatim from 20261020400000_notifications_search.sql; drops what the
--           migration added; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the srs audit fixes down script must run as app_owner (current_user is %)', current_user;
  end if;
  alter table nestly.notifications no force row level security;
  if exists (select 1 from nestly.notifications where type = 'child_birthday') then
    raise exception 'a child_birthday notification exists: the down script refuses';
  end if;
  alter table nestly.notifications force row level security;
end
$$;

drop policy marketplace_listings_select_analytics on nestly.marketplace_listings;
drop policy conversations_select_analytics on nestly.conversations;
drop policy professional_follows_select_analytics on nestly.professional_follows;

drop function nestly.deliver_child_birthdays();
drop policy children_select_birthday on nestly.children;
drop policy regular_profiles_select_birthday on nestly.regular_profiles;

-- search_people as 20261020400000 created it
drop function nestly.search_people(text, integer, integer);

create function nestly.search_people(p_query text, p_limit integer default 20, p_offset integer default 0)
returns table (user_id uuid, full_name text, outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_q text;
  v_n integer;
  v_w integer;
  v_times timestamptz[];
  v_logged boolean;
  v_esc text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 200));
begin
  if not nestly.is_active_account() or coalesce(nestly.caller_account_type(), '') not in ('regular', 'professional') then
    return;
  end if;
  v_q := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'));
  if pg_catalog.char_length(v_q) < 2 or pg_catalog.char_length(v_q) > 100 then
    return;
  end if;
  perform pg_catalog.set_config('nestly.search_scope', 'people', true);
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'people_search';
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then
    raise exception 'search_people: people_search limit missing or invalid' using errcode = 'NS001';
  end if;
  insert into nestly.people_search_counts as c (user_id) values (v_me)
    on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.searched_at, c.is_refusal_recorded into v_times, v_logged;
  v_times := array(select t from pg_catalog.unnest(v_times) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_times) >= v_n then
    if not v_logged then
      insert into nestly.security_events (kind, user_id) values ('people_search_limit', v_me);
    end if;
    update nestly.people_search_counts c set searched_at = v_times, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.search_scope', '', true);
    return query select null::uuid, null::text, 'limited'::text;
    return;
  end if;
  update nestly.people_search_counts c set searched_at = v_times || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  v_esc := pg_catalog.regexp_replace(pg_catalog.lower(v_q), '([\\%_])', '\\\1', 'g');
  return query
    select n.user_id, n.full_name, 'found'::text
      from nestly.regular_names n
      join nestly.users u on u.id = n.user_id and u.status = 'active' and u.account_type = 'regular'
     where n.user_id <> v_me
       and pg_catalog.lower(n.full_name) like '%' || v_esc || '%'
     order by case when pg_catalog.lower(n.full_name) = pg_catalog.lower(v_q) then 0
                   when pg_catalog.lower(n.full_name) like v_esc || '%' then 1
                   when pg_catalog.lower(n.full_name) like '% ' || v_esc || '%' then 2
                   else 3 end,
              n.full_name, n.user_id
     limit v_limit offset v_offset;
  perform pg_catalog.set_config('nestly.search_scope', '', true);
end
$$;

revoke execute on function nestly.search_people(text, integer, integer) from public;
grant  execute on function nestly.search_people(text, integer, integer) to authenticated;

comment on function nestly.search_people(text, integer, integer) is
  'FR-SEARCH-001, NFR-SEC-006, BR-044, BR-063, VAL-037, AC-078: People Search. A query under two or over 100 characters returns nothing and is not counted. Counts the call (people_search limit from security_limits, 60 per 3600 s at the seed); the call over the limit returns one row with outcome limited and records one Security event per stretch; absent or invalid configuration raises NS001. Otherwise rows (user_id, full_name, outcome found) of active Regular accounts other than the caller, ranked exact, prefix, word prefix, contains; at most 50 per call, offset up to 200. Never a list without a query, never anything but id and full name. SECURITY DEFINER (data-model.md approved exceptions); EXECUTE authenticated.';

delete from supabase_migrations.schema_migrations where version = '20261023100000';

commit;
