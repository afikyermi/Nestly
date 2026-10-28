-- =====================================================================================================================
-- Plan-cached reads for Groups: the Groups list and the feed's Group suggestions as SECURITY INVOKER plpgsql functions — migration only.
--
-- Why. Load test 27.10.2026 (performance brief "plan-cache"): the database's CPU goes mostly to PLANNING. A statement over the Group
-- tables re-expands every policy on groups, group_members, group_access, posts and comments on each call, and the pooler (transaction
-- mode) keeps no prepared statement between requests. A plpgsql function caches its statements' plans per backend connection, and the
-- pooler's backend connections persist across requests, so after one call per backend the planning cost is gone.
--   GET /api/groups (readGroupSummaries): mean 201 ms per call under load; planning ~16 ms per call on Preview (discover).
--   The feed's Group suggestions (readFeedGroupSuggestions): mean 138 ms under load; planning ~32 ms per call on Preview.
--
-- Changes: 1. nestly.group_summaries(text, text, integer, integer, double precision, integer): the four statements readGroupSummaries
--             sent (scope 'mine' or 'discover', with or without a search pattern), each verbatim as a static `return query`.
--          2. nestly.feed_group_suggestions(integer, integer, double precision, integer): the statement readFeedGroupSuggestions sent, verbatim.
--          Both SECURITY INVOKER (the default): they run as the caller (authenticated), under exactly the policies the statements ran under;
--          nothing is read that the caller could not read before. STABLE, search_path '', plan_cache_mode force_generic_plan (the plan is
--          cached from the first call). EXECUTE for authenticated only (revoked from public and anon). No table, policy or grant on a
--          table changes. The activity constants (minimum events, half-life, window) stay in the server and arrive as arguments.
--
-- No data. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261027300000_plan_cache_groups.down.sql (drops both functions).
-- =====================================================================================================================

-- 1. group_summaries ----------------------------------------------------------------------------------------------------
create function nestly.group_summaries(
  p_scope text,
  p_like text,
  p_limit integer,
  p_min_events integer,
  p_half_life_hours double precision,
  p_window_days integer
)
returns table (
  id uuid,
  name text,
  description text,
  privacy text,
  member_rows integer,
  my_role text,
  requested boolean,
  invitation_id uuid,
  blocked boolean
)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  if p_scope = 'mine' and p_like is null then
    return query
    select g.id, g.name, g.description, g.privacy,
      (select count(*) from nestly.group_members m where m.group_id = g.id)::int as "memberRows",
      a.role as "myRole",
      exists (select 1 from nestly.group_join_requests r where r.group_id = g.id and r.user_id = (select auth.uid()) and r.status = 'pending') as requested,
      (select i.id from nestly.group_invitations i where i.group_id = g.id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
        order by i.created_at desc limit 1) as "invitationId",
      exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid())) as blocked
    from nestly.groups g
    left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid())
    where g.status = 'active'
      and a.role is not null
    order by g.name, g.id
    limit p_limit;
  elsif p_scope = 'mine' then
    return query
    select g.id, g.name, g.description, g.privacy,
      (select count(*) from nestly.group_members m where m.group_id = g.id)::int as "memberRows",
      a.role as "myRole",
      exists (select 1 from nestly.group_join_requests r where r.group_id = g.id and r.user_id = (select auth.uid()) and r.status = 'pending') as requested,
      (select i.id from nestly.group_invitations i where i.group_id = g.id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
        order by i.created_at desc limit 1) as "invitationId",
      exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid())) as blocked
    from nestly.groups g
    left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid())
    where g.status = 'active'
      and a.role is not null
      and (lower(g.name) like p_like or lower(coalesce(g.description, '')) like p_like)
    order by g.name, g.id
    limit p_limit;
  elsif p_scope = 'discover' and p_like is null then
    return query
    select g.id, g.name, g.description, g.privacy,
      (select count(*) from nestly.group_members m where m.group_id = g.id)::int as "memberRows",
      a.role as "myRole",
      exists (select 1 from nestly.group_join_requests r where r.group_id = g.id and r.user_id = (select auth.uid()) and r.status = 'pending') as requested,
      (select i.id from nestly.group_invitations i where i.group_id = g.id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
        order by i.created_at desc limit 1) as "invitationId",
      exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid())) as blocked
    from nestly.groups g
    left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid())
    where g.status = 'active'
    order by (select case when count(*) >= p_min_events
                  then sum(power(2::float8, -(extract(epoch from (now() - e.at)) / 3600::float8) / p_half_life_hours))
                  else 0::float8 end
             from (select p.created_at as at from nestly.posts p
                    where p.group_id = g.id and p.created_at > now() - make_interval(days => p_window_days)
                   union all
                   select c.created_at from nestly.comments c
                    where c.group_id = g.id and c.created_at > now() - make_interval(days => p_window_days)
                   union all
                   select m.created_at from nestly.group_members m
                    where m.group_id = g.id and m.role <> 'owner' and m.member_status = 'active' and m.created_at > now() - make_interval(days => p_window_days)) e) desc,
             g.created_at desc, g.id desc
    limit p_limit;
  elsif p_scope = 'discover' then
    return query
    select g.id, g.name, g.description, g.privacy,
      (select count(*) from nestly.group_members m where m.group_id = g.id)::int as "memberRows",
      a.role as "myRole",
      exists (select 1 from nestly.group_join_requests r where r.group_id = g.id and r.user_id = (select auth.uid()) and r.status = 'pending') as requested,
      (select i.id from nestly.group_invitations i where i.group_id = g.id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
        order by i.created_at desc limit 1) as "invitationId",
      exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid())) as blocked
    from nestly.groups g
    left join nestly.group_access a on a.group_id = g.id and a.user_id = (select auth.uid())
    where g.status = 'active'
      and (lower(g.name) like p_like or lower(coalesce(g.description, '')) like p_like)
    order by (lower(g.name) like p_like) desc,
             (select case when count(*) >= p_min_events
                  then sum(power(2::float8, -(extract(epoch from (now() - e.at)) / 3600::float8) / p_half_life_hours))
                  else 0::float8 end
             from (select p.created_at as at from nestly.posts p
                    where p.group_id = g.id and p.created_at > now() - make_interval(days => p_window_days)
                   union all
                   select c.created_at from nestly.comments c
                    where c.group_id = g.id and c.created_at > now() - make_interval(days => p_window_days)
                   union all
                   select m.created_at from nestly.group_members m
                    where m.group_id = g.id and m.role <> 'owner' and m.member_status = 'active' and m.created_at > now() - make_interval(days => p_window_days)) e) desc,
             g.created_at desc, g.id desc
    limit p_limit;
  else
    raise exception 'group_summaries: unknown scope' using errcode = '22023';
  end if;
end
$$;

revoke all on function nestly.group_summaries(text, text, integer, integer, double precision, integer) from public, anon;
grant execute on function nestly.group_summaries(text, text, integer, integer, double precision, integer) to authenticated;

comment on function nestly.group_summaries(text, text, integer, integer, double precision, integer) is
  'FR-GRP-001, FR-ALG-010, FR-SEARCH-001: the Groups list (GET /api/groups): the caller''s own Groups by name (scope mine) or every active Group the caller may read, the most active first (scope discover), optionally filtered by a lower-case LIKE pattern. Replaces the statement of readGroupSummaries (groups-repository.ts) verbatim, as a plpgsql function so its plan is cached per connection (performance brief plan-cache, 27.10.2026). SECURITY INVOKER: rows and counts are exactly what the caller''s policies show.';

-- 2. feed_group_suggestions ---------------------------------------------------------------------------------------------
create function nestly.feed_group_suggestions(
  p_limit integer,
  p_min_events integer,
  p_half_life_hours double precision,
  p_window_days integer
)
returns table (
  id uuid,
  name text,
  description text,
  member_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select s.id, s.name, s.description, s."memberCount"
  from (
    select g.id, g.name, g.description, g.created_at,
           (select count(*) from nestly.group_members m where m.group_id = g.id and m.member_status = 'active')::int as "memberCount",
           (select case when count(*) >= p_min_events
                then sum(power(2::float8, -(extract(epoch from (now() - e.at)) / 3600::float8) / p_half_life_hours))
                else 0::float8 end
           from (select p.created_at as at from nestly.posts p
                  where p.group_id = g.id and p.created_at > now() - make_interval(days => p_window_days)
                 union all
                 select c.created_at from nestly.comments c
                  where c.group_id = g.id and c.created_at > now() - make_interval(days => p_window_days)
                 union all
                 select m.created_at from nestly.group_members m
                  where m.group_id = g.id and m.role <> 'owner' and m.member_status = 'active' and m.created_at > now() - make_interval(days => p_window_days)) e) as activity
    from nestly.groups g
    where g.privacy = 'public'
      and not exists (select 1 from nestly.group_access a where a.group_id = g.id)
      and not exists (select 1 from nestly.group_bans b where b.group_id = g.id and b.user_id = (select auth.uid()))
  ) s
  where s.activity > 0
  order by s.activity desc, s.created_at desc, s.id desc
  limit p_limit;
end
$$;

revoke all on function nestly.feed_group_suggestions(integer, integer, double precision, integer) from public, anon;
grant execute on function nestly.feed_group_suggestions(integer, integer, double precision, integer) to authenticated;

comment on function nestly.feed_group_suggestions(integer, integer, double precision, integer) is
  'FR-ALG-010, FR-FEED-001 (§11.14): the feed''s Group unit — up to p_limit active Public Groups the caller is not a member of and is not blocked from, the most active first; a quiet Group is never suggested. Replaces the statement of readFeedGroupSuggestions (group-activity-repository.ts) verbatim, as a plpgsql function so its plan is cached per connection (performance brief plan-cache, 27.10.2026). SECURITY INVOKER: rows and counts are exactly what the caller''s policies show.';
