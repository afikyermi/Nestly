-- =====================================================================================================================
-- The feed page's read statements as plan-cached SECURITY INVOKER functions — migration only (performance, 27.10.2026).
--
-- Why. The database spends most of a feed page's time PLANNING: every statement over a policy-heavy table (posts, reactions, comments,
-- regular_names) re-expands its whole nested policy tree, and the pooler (transaction mode) keeps no prepared statement between requests.
-- A plpgsql function caches its statements' plans per backend connection, and the pooler's backends persist, so after one call per
-- backend the planning cost is gone.
--
-- Each function is the statement the server sent before, verbatim except that its bound values are the function's arguments (and a list
-- of ids `p.id in ($1, $2, …)` is `p.id = any(p_ids)`). SECURITY INVOKER (the default): it runs as the caller (`authenticated`, with the
-- request's claims), so which rows it reads is still decided by the row policies alone. stable (the promotion candidates: volatile, they
-- order by random()), search_path '', a generic plan (plan_cache_mode = force_generic_plan: planned once per connection and reused).
-- `#variable_conflict use_column`: a name that is both a column and an output column always means the column. Executable by
-- authenticated only (never anon or public).
--
-- The ranking statement had one text per profile, intent and cursor; it is now three static functions:
--   read_feed_ranking_regular — the Regular profile without the Intent Signal term (no topic, or wIntent 0): the text without the term.
--   read_feed_ranking_regular_intent — the Regular profile with it (FR-ALG-008): the text with the term (and the post's text read for it).
--   read_feed_ranking_content — the content profile (a Professional; and the staff review feed with p_viewer_id null). The Follow term is
--     always in the text; with no viewer it adds exactly +0. No Friend, Stage, tag or identity term, as before.
--   The cursor: a first page passes tier -1 (every row is after it, as the literal `true` was); whether tier 0 is read is a boolean
--   argument (it was the literal true/false); the tier-1 keyset (created_at, id) < (…) is always present, and without a tier-1 cursor it
--   is ('infinity', ffffffff-…), which every post is below. Rows, order and keyset are the same as before.
--
-- No table, policy or grant on a table changes. No data. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261027400000_feed_plan_cache.down.sql (drops the functions; the server of the previous commit sends
-- the statements itself).
-- =====================================================================================================================

-- The ranking: Regular profile, no topic (or wIntent 0) --------------------------------------------------------------------------------
create function nestly.read_feed_ranking_regular(
  p_as_of timestamptz, p_window_edge_secs float8, p_window_hours float8,
  p_w_fresh float8, p_half_life_hours float8, p_w_friend float8, p_w_quality float8, p_quality_cap float8,
  p_w_stage float8, p_stages text[],
  p_scores_tier0 boolean, p_tier1_created_at timestamptz, p_tier1_id uuid,
  p_after_tier integer, p_after_score float8, p_after_created_at timestamptz, p_after_id uuid, p_limit integer)
returns table ("id" uuid, "authorId" uuid, "isAnonymous" boolean, "sharedPostId" uuid, "tier" integer, "score" float8, "createdAt" text)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    with candidates as (
      select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.stage_tag, p.created_at,
             extract(epoch from (p_as_of::timestamptz - p.created_at))::float8 / 3600::float8 as age_hours
      from nestly.posts p
      where p.created_at <= p_as_of::timestamptz and p.created_at >= (p_as_of::timestamptz - make_interval(secs => p_window_edge_secs::float8)) and p_scores_tier0
        and (p.group_id is null
        or exists (select 1 from nestly.group_highlights h where h.post_id = p.id and h.reached_at <= p_as_of::timestamptz)
        or exists (select 1 from nestly.groups g join nestly.group_access a on a.group_id = g.id where g.pinned_post_id = p.id))
    ), tiered as (
      select c.*, case when c.age_hours <= p_window_hours::float8 then 0 else 1 end as tier
      from candidates c
    ), scored as (
      select t.id, t.author_id, t.is_anonymous, t.shared_post_id, t.created_at, t.tier,
        case when t.tier = 1 then 0::float8 else
          p_w_fresh::float8 * power(2::float8, -t.age_hours / p_half_life_hours::float8)
          + p_w_friend::float8 * (case
              when t.is_anonymous or t.author_id is null then 0::float8
              when exists (
                select 1 from nestly.friendships f
                where f.status = 'accepted'
                  and ((f.requester_id = (select auth.uid()) and f.addressee_id = t.author_id)
                    or (f.addressee_id = (select auth.uid()) and f.requester_id = t.author_id))
              ) then 1::float8 else 0::float8 end)
          + p_w_quality::float8 * least(
              ln(1::float8 + (
                (select count(*) from nestly.reactions r where r.post_id = t.id and not r.is_by_author and r.created_at <= p_as_of::timestamptz)
                + (select count(*) from nestly.comments m where m.post_id = t.id and not m.is_by_post_author and m.created_at <= p_as_of::timestamptz)
              )::float8) / ln(1::float8 + p_quality_cap::float8),
              1::float8)
          + p_w_stage::float8 * (case when t.stage_tag = any(p_stages::text[]) then 1::float8 else 0::float8 end)
        end as score
      from tiered t
    ), older as (
      select s.id, s.author_id, s.is_anonymous, s.shared_post_id, s.created_at, s.tier, s.score
      from (
        select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.created_at, 1 as tier, 0::float8 as score
        from nestly.posts p
        where p.created_at <= p_as_of::timestamptz and p.created_at < (p_as_of::timestamptz - make_interval(secs => p_window_edge_secs::float8)) + make_interval(secs => 2::float8) and (p.created_at, p.id) < (p_tier1_created_at::timestamptz, p_tier1_id::uuid)
          and extract(epoch from (p_as_of::timestamptz - p.created_at))::float8 / 3600::float8 > p_window_hours::float8
          and (p.group_id is null
        or exists (select 1 from nestly.group_highlights h where h.post_id = p.id and h.reached_at <= p_as_of::timestamptz)
        or exists (select 1 from nestly.groups g join nestly.group_access a on a.group_id = g.id where g.pinned_post_id = p.id))
      ) s
      where (s.tier > p_after_tier::integer
    or (s.tier = p_after_tier::integer and (s.score < p_after_score::float8
      or (s.score = p_after_score::float8 and (s.created_at < p_after_created_at::timestamptz
        or (s.created_at = p_after_created_at::timestamptz and s.id < p_after_id::uuid))))))
      order by s.created_at desc, s.id desc
      limit p_limit
    ), ranked as (
      select r.id, r.author_id, r.is_anonymous, r.shared_post_id, r.created_at, r.tier, r.score from scored r where r.tier = 0
      union all
      select o.id, o.author_id, o.is_anonymous, o.shared_post_id, o.created_at, o.tier, o.score from older o
    )
    select s.id, s.author_id as "authorId", s.is_anonymous as "isAnonymous", s.shared_post_id as "sharedPostId", s.tier, s.score,
           to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt"
    from ranked s
    where (s.tier > p_after_tier::integer
    or (s.tier = p_after_tier::integer and (s.score < p_after_score::float8
      or (s.score = p_after_score::float8 and (s.created_at < p_after_created_at::timestamptz
        or (s.created_at = p_after_created_at::timestamptz and s.id < p_after_id::uuid))))))
    order by s.tier asc, s.score desc, s.created_at desc, s.id desc
    limit p_limit;
end
$fn$;

-- The ranking: Regular profile with the Intent Signal term (FR-ALG-008) ------------------------------------------------------------
create function nestly.read_feed_ranking_regular_intent(
  p_as_of timestamptz, p_window_edge_secs float8, p_window_hours float8,
  p_w_fresh float8, p_half_life_hours float8, p_w_friend float8, p_w_quality float8, p_quality_cap float8,
  p_w_stage float8, p_stages text[], p_w_intent float8, p_intent_patterns text[], p_intent_weights float8[],
  p_scores_tier0 boolean, p_tier1_created_at timestamptz, p_tier1_id uuid,
  p_after_tier integer, p_after_score float8, p_after_created_at timestamptz, p_after_id uuid, p_limit integer)
returns table ("id" uuid, "authorId" uuid, "isAnonymous" boolean, "sharedPostId" uuid, "tier" integer, "score" float8, "createdAt" text)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    with candidates as (
      select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.stage_tag, p.body, p.created_at,
             extract(epoch from (p_as_of::timestamptz - p.created_at))::float8 / 3600::float8 as age_hours
      from nestly.posts p
      where p.created_at <= p_as_of::timestamptz and p.created_at >= (p_as_of::timestamptz - make_interval(secs => p_window_edge_secs::float8)) and p_scores_tier0
        and (p.group_id is null
        or exists (select 1 from nestly.group_highlights h where h.post_id = p.id and h.reached_at <= p_as_of::timestamptz)
        or exists (select 1 from nestly.groups g join nestly.group_access a on a.group_id = g.id where g.pinned_post_id = p.id))
    ), tiered as (
      select c.*, case when c.age_hours <= p_window_hours::float8 then 0 else 1 end as tier
      from candidates c
    ), scored as (
      select t.id, t.author_id, t.is_anonymous, t.shared_post_id, t.created_at, t.tier,
        case when t.tier = 1 then 0::float8 else
          p_w_fresh::float8 * power(2::float8, -t.age_hours / p_half_life_hours::float8)
          + p_w_friend::float8 * (case
              when t.is_anonymous or t.author_id is null then 0::float8
              when exists (
                select 1 from nestly.friendships f
                where f.status = 'accepted'
                  and ((f.requester_id = (select auth.uid()) and f.addressee_id = t.author_id)
                    or (f.addressee_id = (select auth.uid()) and f.requester_id = t.author_id))
              ) then 1::float8 else 0::float8 end)
          + p_w_quality::float8 * least(
              ln(1::float8 + (
                (select count(*) from nestly.reactions r where r.post_id = t.id and not r.is_by_author and r.created_at <= p_as_of::timestamptz)
                + (select count(*) from nestly.comments m where m.post_id = t.id and not m.is_by_post_author and m.created_at <= p_as_of::timestamptz)
              )::float8) / ln(1::float8 + p_quality_cap::float8),
              1::float8)
          + p_w_stage::float8 * (case when t.stage_tag = any(p_stages::text[]) then 1::float8 else 0::float8 end)
          + p_w_intent::float8 * least(1::float8, (
              select coalesce(sum(i.weight), 0::float8)
              from unnest(p_intent_patterns::text[], p_intent_weights::float8[]) as i(pattern, weight)
              where t.body ~* i.pattern))
        end as score
      from tiered t
    ), older as (
      select s.id, s.author_id, s.is_anonymous, s.shared_post_id, s.created_at, s.tier, s.score
      from (
        select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.created_at, 1 as tier, 0::float8 as score
        from nestly.posts p
        where p.created_at <= p_as_of::timestamptz and p.created_at < (p_as_of::timestamptz - make_interval(secs => p_window_edge_secs::float8)) + make_interval(secs => 2::float8) and (p.created_at, p.id) < (p_tier1_created_at::timestamptz, p_tier1_id::uuid)
          and extract(epoch from (p_as_of::timestamptz - p.created_at))::float8 / 3600::float8 > p_window_hours::float8
          and (p.group_id is null
        or exists (select 1 from nestly.group_highlights h where h.post_id = p.id and h.reached_at <= p_as_of::timestamptz)
        or exists (select 1 from nestly.groups g join nestly.group_access a on a.group_id = g.id where g.pinned_post_id = p.id))
      ) s
      where (s.tier > p_after_tier::integer
    or (s.tier = p_after_tier::integer and (s.score < p_after_score::float8
      or (s.score = p_after_score::float8 and (s.created_at < p_after_created_at::timestamptz
        or (s.created_at = p_after_created_at::timestamptz and s.id < p_after_id::uuid))))))
      order by s.created_at desc, s.id desc
      limit p_limit
    ), ranked as (
      select r.id, r.author_id, r.is_anonymous, r.shared_post_id, r.created_at, r.tier, r.score from scored r where r.tier = 0
      union all
      select o.id, o.author_id, o.is_anonymous, o.shared_post_id, o.created_at, o.tier, o.score from older o
    )
    select s.id, s.author_id as "authorId", s.is_anonymous as "isAnonymous", s.shared_post_id as "sharedPostId", s.tier, s.score,
           to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt"
    from ranked s
    where (s.tier > p_after_tier::integer
    or (s.tier = p_after_tier::integer and (s.score < p_after_score::float8
      or (s.score = p_after_score::float8 and (s.created_at < p_after_created_at::timestamptz
        or (s.created_at = p_after_created_at::timestamptz and s.id < p_after_id::uuid))))))
    order by s.tier asc, s.score desc, s.created_at desc, s.id desc
    limit p_limit;
end
$fn$;

-- The ranking: content profile ----------------------------------------------------------------------------------------------------------
create function nestly.read_feed_ranking_content(
  p_as_of timestamptz, p_window_edge_secs float8, p_window_hours float8,
  p_w_fresh float8, p_half_life_hours float8, p_w_quality float8, p_quality_cap float8, p_w_friend float8, p_viewer_id uuid,
  p_scores_tier0 boolean, p_tier1_created_at timestamptz, p_tier1_id uuid,
  p_after_tier integer, p_after_score float8, p_after_created_at timestamptz, p_after_id uuid, p_limit integer)
returns table ("id" uuid, "authorId" uuid, "isAnonymous" boolean, "sharedPostId" uuid, "tier" integer, "score" float8, "createdAt" text)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    with candidates as (
      select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.created_at,
             extract(epoch from (p_as_of::timestamptz - p.created_at))::float8 / 3600::float8 as age_hours
      from nestly.posts p
      where p.created_at <= p_as_of::timestamptz and p.created_at >= (p_as_of::timestamptz - make_interval(secs => p_window_edge_secs::float8)) and p_scores_tier0
        and (p.group_id is null
        or exists (select 1 from nestly.group_highlights h where h.post_id = p.id and h.reached_at <= p_as_of::timestamptz)
        or exists (select 1 from nestly.groups g join nestly.group_access a on a.group_id = g.id where g.pinned_post_id = p.id))
    ), tiered as (
      select c.*, case when c.age_hours <= p_window_hours::float8 then 0 else 1 end as tier
      from candidates c
    ), scored as (
      select t.id, t.author_id, t.is_anonymous, t.shared_post_id, t.created_at, t.tier,
        case when t.tier = 1 then 0::float8 else
          p_w_fresh::float8 * power(2::float8, -t.age_hours / p_half_life_hours::float8)
          + p_w_quality::float8 * least(
              ln(1::float8 + (
                (select count(*) from nestly.reactions r where r.post_id = t.id and not r.is_by_author and r.created_at <= p_as_of::timestamptz)
                + (select count(*) from nestly.comments m where m.post_id = t.id and not m.is_by_post_author and m.created_at <= p_as_of::timestamptz)
              )::float8) / ln(1::float8 + p_quality_cap::float8),
              1::float8)
          + p_w_friend::float8 * (case
              when p_viewer_id is not null and t.author_id is not null and t.author_id <> p_viewer_id::uuid
                and exists (select 1 from nestly.professional_follows pf where pf.professional_id = t.author_id)
              then 1::float8 else 0::float8 end)
        end as score
      from tiered t
    ), older as (
      select s.id, s.author_id, s.is_anonymous, s.shared_post_id, s.created_at, s.tier, s.score
      from (
        select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.created_at, 1 as tier, 0::float8 as score
        from nestly.posts p
        where p.created_at <= p_as_of::timestamptz and p.created_at < (p_as_of::timestamptz - make_interval(secs => p_window_edge_secs::float8)) + make_interval(secs => 2::float8) and (p.created_at, p.id) < (p_tier1_created_at::timestamptz, p_tier1_id::uuid)
          and extract(epoch from (p_as_of::timestamptz - p.created_at))::float8 / 3600::float8 > p_window_hours::float8
          and (p.group_id is null
        or exists (select 1 from nestly.group_highlights h where h.post_id = p.id and h.reached_at <= p_as_of::timestamptz)
        or exists (select 1 from nestly.groups g join nestly.group_access a on a.group_id = g.id where g.pinned_post_id = p.id))
      ) s
      where (s.tier > p_after_tier::integer
    or (s.tier = p_after_tier::integer and (s.score < p_after_score::float8
      or (s.score = p_after_score::float8 and (s.created_at < p_after_created_at::timestamptz
        or (s.created_at = p_after_created_at::timestamptz and s.id < p_after_id::uuid))))))
      order by s.created_at desc, s.id desc
      limit p_limit
    ), ranked as (
      select r.id, r.author_id, r.is_anonymous, r.shared_post_id, r.created_at, r.tier, r.score from scored r where r.tier = 0
      union all
      select o.id, o.author_id, o.is_anonymous, o.shared_post_id, o.created_at, o.tier, o.score from older o
    )
    select s.id, s.author_id as "authorId", s.is_anonymous as "isAnonymous", s.shared_post_id as "sharedPostId", s.tier, s.score,
           to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt"
    from ranked s
    where (s.tier > p_after_tier::integer
    or (s.tier = p_after_tier::integer and (s.score < p_after_score::float8
      or (s.score = p_after_score::float8 and (s.created_at < p_after_created_at::timestamptz
        or (s.created_at = p_after_created_at::timestamptz and s.id < p_after_id::uuid))))))
    order by s.tier asc, s.score desc, s.created_at desc, s.id desc
    limit p_limit;
end
$fn$;

-- The display statement (readDisplayPosts) ------------------------------------------------------------------------------------------------
create function nestly.read_feed_display(p_ids uuid[])
returns table (
  "id" uuid, "isShare" boolean, "isAnonymous" boolean, "body" text, "audience" text, "stageTag" text, "createdAt" text, "isMine" boolean,
  "offerHelp" text, "authorName" text, "authorField" text, "authorFieldOther" text,
  "originalId" uuid, "originalBody" text, "originalAudience" text, "originalCreatedAt" text, "originalIsAnonymous" boolean,
  "originalIsMine" boolean, "originalAuthorName" text, "originalAuthorField" text, "originalAuthorFieldOther" text,
  "groupId" uuid, "groupName" text, "groupPrivacy" text)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    with page as (
      select p.id, p.is_share, p.is_anonymous, p.body, p.audience, p.stage_tag, p.created_at, p.author_id, p.group_id,
             o.id as original_id, o.body as original_body, o.audience as original_audience, o.created_at as original_created_at,
             o.is_anonymous as original_is_anonymous, o.author_id as original_author_id
      from nestly.posts p
      left join nestly.posts o on o.id = p.shared_post_id
      where p.id = any(p_ids)
    ), authors as (
      select a.author_id as user_id from page a where a.author_id is not null
      union
      select a.original_author_id from page a where a.original_author_id is not null
    ), names as (
      select n.user_id, n.full_name from nestly.regular_names n where n.user_id in (select w.user_id from authors w)
    ), profiles as (
      select pp.user_id, pp.full_name, pp.field, pp.field_other from nestly.professional_profiles pp where pp.user_id in (select w.user_id from authors w)
    )
    select p.id, p.is_share as "isShare", p.is_anonymous as "isAnonymous", p.body, p.audience, p.stage_tag as "stageTag",
           to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
           coalesce(p.author_id = (select auth.uid()), false) as "isMine", case when (select nestly.caller_account_type()) = 'professional' and not p.is_share
      and (p.author_id is null or not exists (select 1 from nestly.professional_profiles opp where opp.user_id = p.author_id))
    then case when exists (select 1 from nestly.outreach_requests oro where oro.post_id = p.id and oro.professional_id = (select auth.uid()))
              then 'sent' else 'available' end
    end as "offerHelp",
           coalesce(n.full_name, ap.full_name) as "authorName", ap.field as "authorField", ap.field_other as "authorFieldOther",
           p.original_id as "originalId", p.original_body as "originalBody", p.original_audience as "originalAudience",
           to_char(p.original_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "originalCreatedAt", p.original_is_anonymous as "originalIsAnonymous",
           coalesce(p.original_author_id = (select auth.uid()), false) as "originalIsMine",
           coalesce(oa.full_name, oap.full_name) as "originalAuthorName", oap.field as "originalAuthorField",
           oap.field_other as "originalAuthorFieldOther",
           gg.id as "groupId", gg.name as "groupName", gg.privacy as "groupPrivacy"
    from page p
    left join nestly.groups gg on gg.id = p.group_id
    left join names n on n.user_id = p.author_id
    left join profiles ap on ap.user_id = p.author_id
    left join names oa on oa.user_id = p.original_author_id
    left join profiles oap on oap.user_id = p.original_author_id;
end
$fn$;

-- The feed's configuration rows (readFeedConfigRows) -------------------------------------------------------------------------------------
create function nestly.read_feed_config_rows()
returns table (
  "version" integer, "isActive" boolean, "wFresh" float8, "halfLifeHours" integer, "wFriend" float8, "wQuality" float8, "qualityCap" integer,
  "wStage" float8, "scoredWindowDays" integer, "maxSameCreatorInWindow" integer, "diversityWindow" integer, "maxAnonymousInWindow" integer,
  "pageSize" integer, "wIntent" float8, "intentHalfLifeHours" integer)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select version, is_active as "isActive", w_fresh::float8 as "wFresh", half_life_hours as "halfLifeHours", w_friend::float8 as "wFriend",
           w_quality::float8 as "wQuality", quality_cap as "qualityCap", w_stage::float8 as "wStage", scored_window_days as "scoredWindowDays",
           max_same_creator_in_window as "maxSameCreatorInWindow", diversity_window as "diversityWindow",
           max_anonymous_in_window as "maxAnonymousInWindow", page_size as "pageSize",
           w_intent::float8 as "wIntent", intent_half_life_hours as "intentHalfLifeHours"
    from nestly.algorithm_configurations
    where surface = 'regular_feed';
end
$fn$;

-- The displayed counts of posts (readPostCounts) ------------------------------------------------------------------------------------------
create function nestly.read_post_counts(p_ids uuid[])
returns table ("targetId" uuid, "likeCount" integer, "commentCount" integer)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select t.id as "targetId",
           (select count(*)::int from nestly.reactions r where r.post_id = t.id) as "likeCount",
           (select count(*)::int from nestly.comments c
             where c.post_id = t.id and (c.parent_id is null or exists (select 1 from nestly.comments p where p.id = c.parent_id))) as "commentCount"
    from unnest(p_ids) as t(id);
end
$fn$;

-- The like-state (readLikedTargetIds) -----------------------------------------------------------------------------------------------------
create function nestly.read_liked_target_ids(p_ids uuid[])
returns table ("target_id" uuid)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select target_id from nestly.reaction_owners where target_id = any(p_ids);
end
$fn$;

-- The images of posts (readImagesOfPosts) -------------------------------------------------------------------------------------------------
create function nestly.read_post_images(p_ids uuid[])
returns table ("id" uuid, "status" text, "width" integer, "height" integer, "postId" uuid, "position" smallint)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select m.id, m.status, m.width, m.height, m.post_id as "postId", m.position
    from nestly.media_assets m
    where m.post_id = any(p_ids)
    order by m.post_id, m.position;
end
$fn$;

-- The caller's muted Groups among these (readMutedGroupIds) -------------------------------------------------------------------------------
create function nestly.read_muted_group_ids(p_ids uuid[])
returns table ("groupId" uuid)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select distinct e.group_id as "groupId" from nestly.group_member_enforcements e
    where e.group_id = any(p_ids) and e.user_id = (select auth.uid()) and e.kind = 'warn_mute' and e.mute_until > now();
end
$fn$;

-- The Professionals among these posts' authors (readProfessionalAuthors) ------------------------------------------------------------------
create function nestly.read_professional_authors(p_ids uuid[])
returns table ("id" uuid, "posts" integer)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select p.author_id as id, count(*)::integer as posts from nestly.posts p join nestly.professional_profiles pr on pr.user_id = p.author_id
    where p.id = any (p_ids) and p.author_id <> (select auth.uid()) group by p.author_id;
end
$fn$;

-- The running promotions another account may be shown, one function per kind (readPromotedCandidates) -------------------------------------
create function nestly.read_promoted_post_candidates()
returns table ("promotionId" uuid, "targetId" uuid)
language plpgsql volatile security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select p.id as "promotionId", p.post_id as "targetId" from nestly.promotions p
    where p.target_kind = 'post' and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
      and p.owner_id <> (select auth.uid()) and exists (select 1 from nestly.posts po where po.id = p.post_id and po.status = 'active' and po.audience = 'everyone' and po.group_id is null and not po.is_share)
    order by random() limit 500;
end
$fn$;

create function nestly.read_promoted_profile_candidates()
returns table ("promotionId" uuid, "targetId" uuid)
language plpgsql volatile security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select p.id as "promotionId", p.owner_id as "targetId" from nestly.promotions p
    where p.target_kind = 'profile' and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
      and p.owner_id <> (select auth.uid()) and exists (select 1 from nestly.professional_profiles pr where pr.user_id = p.owner_id)
    order by random() limit 500;
end
$fn$;

create function nestly.read_promoted_listing_candidates()
returns table ("promotionId" uuid, "targetId" uuid)
language plpgsql volatile security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select p.id as "promotionId", p.listing_id as "targetId" from nestly.promotions p
    where p.target_kind = 'listing' and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
      and p.owner_id <> (select auth.uid()) and exists (select 1 from nestly.marketplace_listings l where l.id = p.listing_id and l.status = 'active' and not l.is_hidden and l.expires_at > now())
    order by random();
end
$fn$;

-- The newest promotion settings (readPromotionConfig) -------------------------------------------------------------------------------------
create function nestly.read_promotion_config()
returns table ("version" integer, "dailyCap" integer, "directoryUnitsPerPage" integer, "feedGapMin" integer, "feedGapMax" integer,
               "feedLowPosts" integer, "feedHighPosts" integer)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select version, daily_cap as "dailyCap", directory_units_per_page as "directoryUnitsPerPage", feed_gap_min as "feedGapMin",
      feed_gap_max as "feedGapMax", feed_low_posts as "feedLowPosts", feed_high_posts as "feedHighPosts"
    from nestly.promotion_settings order by version desc limit 1;
end
$fn$;

-- The feed's posts of the last 48 hours the caller can read (readRecentPostCount) ---------------------------------------------------------
create function nestly.read_recent_post_count()
returns table ("n" bigint)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select count(*) as n from nestly.posts p where p.created_at > now() - interval '48 hours' and p.group_id is null;
end
$fn$;

-- The posts among these whose text matches one of the patterns (readMatchingPosts) --------------------------------------------------------
create function nestly.read_matching_posts(p_ids uuid[], p_patterns text[])
returns table ("id" uuid, "byTopic" boolean)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select p.id, (p.body ~* any (p_patterns)) is true as "byTopic" from nestly.posts p
    where p.id = any (p_ids)
      and (p.body ~* any (p_patterns)) is true;
end
$fn$;

-- The caller's own impressions today of these promotions (readTodayImpressions) -----------------------------------------------------------
create function nestly.read_today_impressions(p_ids uuid[])
returns table ("id" uuid, "times" integer)
language plpgsql stable security invoker
set search_path = '' set plan_cache_mode = force_generic_plan
as $fn$
#variable_conflict use_column
begin
  return query
    select e.promotion_id as id, e.times from nestly.promotion_events e
    where e.kind = 'impression' and e.occurred_on = (now() at time zone 'Asia/Jerusalem')::date and e.promotion_id = any (p_ids);
end
$fn$;

-- Grants and comments -------------------------------------------------------------------------------------------------------------------
revoke all on function nestly.read_feed_ranking_regular(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) from public, anon;
grant execute on function nestly.read_feed_ranking_regular(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) to authenticated;
comment on function nestly.read_feed_ranking_regular(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) is
  'The feed''s ranking statement, Regular profile without the Intent Signal term (feed-repository.ts readRankedPostsExact), as a plan-cached invoker function: the caller''s own policies decide every row (performance, 27.10.2026).';

revoke all on function nestly.read_feed_ranking_regular_intent(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], float8, text[], float8[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) from public, anon;
grant execute on function nestly.read_feed_ranking_regular_intent(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], float8, text[], float8[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) to authenticated;
comment on function nestly.read_feed_ranking_regular_intent(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], float8, text[], float8[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) is
  'The feed''s ranking statement, Regular profile with the Intent Signal term (FR-ALG-008), as a plan-cached invoker function: the caller''s own policies decide every row (performance, 27.10.2026).';

revoke all on function nestly.read_feed_ranking_content(timestamptz, float8, float8, float8, float8, float8, float8, float8, uuid, boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) from public, anon;
grant execute on function nestly.read_feed_ranking_content(timestamptz, float8, float8, float8, float8, float8, float8, float8, uuid, boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) to authenticated;
comment on function nestly.read_feed_ranking_content(timestamptz, float8, float8, float8, float8, float8, float8, float8, uuid, boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer) is
  'The feed''s ranking statement, content profile (a Professional; the staff review feed with no viewer), as a plan-cached invoker function: no Friend, Stage, tag or identity term (performance, 27.10.2026).';

revoke all on function nestly.read_feed_display(uuid[]) from public, anon;
grant execute on function nestly.read_feed_display(uuid[]) to authenticated;
comment on function nestly.read_feed_display(uuid[]) is
  'The feed''s display statement (feed-repository.ts readDisplayPosts) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_feed_config_rows() from public, anon;
grant execute on function nestly.read_feed_config_rows() to authenticated;
comment on function nestly.read_feed_config_rows() is
  'The regular feed configuration rows (feed-repository.ts readFeedConfigRows) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_post_counts(uuid[]) from public, anon;
grant execute on function nestly.read_post_counts(uuid[]) to authenticated;
comment on function nestly.read_post_counts(uuid[]) is
  'The displayed like and comment counts of posts (likes-repository.ts readPostCounts) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_liked_target_ids(uuid[]) from public, anon;
grant execute on function nestly.read_liked_target_ids(uuid[]) to authenticated;
comment on function nestly.read_liked_target_ids(uuid[]) is
  'The caller''s like-state (likes-repository.ts readLikedTargetIds) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_post_images(uuid[]) from public, anon;
grant execute on function nestly.read_post_images(uuid[]) to authenticated;
comment on function nestly.read_post_images(uuid[]) is
  'The images of posts the caller may read (media-repository.ts readImagesOfPosts) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_muted_group_ids(uuid[]) from public, anon;
grant execute on function nestly.read_muted_group_ids(uuid[]) to authenticated;
comment on function nestly.read_muted_group_ids(uuid[]) is
  'The caller''s muted Groups among these (group-rules-repository.ts readMutedGroupIds) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_professional_authors(uuid[]) from public, anon;
grant execute on function nestly.read_professional_authors(uuid[]) to authenticated;
comment on function nestly.read_professional_authors(uuid[]) is
  'The Professionals among these posts'' authors (promotions-repository.ts readProfessionalAuthors) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_promoted_post_candidates() from public, anon;
grant execute on function nestly.read_promoted_post_candidates() to authenticated;
comment on function nestly.read_promoted_post_candidates() is
  'Running post promotions another account may be shown (promotions-repository.ts readPromotedCandidates, post) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_promoted_profile_candidates() from public, anon;
grant execute on function nestly.read_promoted_profile_candidates() to authenticated;
comment on function nestly.read_promoted_profile_candidates() is
  'Running profile promotions another account may be shown (promotions-repository.ts readPromotedCandidates, profile) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_promoted_listing_candidates() from public, anon;
grant execute on function nestly.read_promoted_listing_candidates() to authenticated;
comment on function nestly.read_promoted_listing_candidates() is
  'Running listing promotions another account may be shown (promotions-repository.ts readPromotedCandidates, listing) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_promotion_config() from public, anon;
grant execute on function nestly.read_promotion_config() to authenticated;
comment on function nestly.read_promotion_config() is
  'The newest promotion settings (promotions-repository.ts readPromotionConfig) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_recent_post_count() from public, anon;
grant execute on function nestly.read_recent_post_count() to authenticated;
comment on function nestly.read_recent_post_count() is
  'The feed''s posts of the last 48 hours the caller can read (promotions-repository.ts readRecentPostCount) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_matching_posts(uuid[], text[]) from public, anon;
grant execute on function nestly.read_matching_posts(uuid[], text[]) to authenticated;
comment on function nestly.read_matching_posts(uuid[], text[]) is
  'The posts among these matching a search topic (promotions-repository.ts readMatchingPosts) as a plan-cached invoker function (performance, 27.10.2026).';

revoke all on function nestly.read_today_impressions(uuid[]) from public, anon;
grant execute on function nestly.read_today_impressions(uuid[]) to authenticated;
comment on function nestly.read_today_impressions(uuid[]) is
  'The caller''s own impressions today of these promotions (promotions-repository.ts readTodayImpressions) as a plan-cached invoker function (performance, 27.10.2026).';
