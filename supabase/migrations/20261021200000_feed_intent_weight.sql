-- =====================================================================================================================
-- The Intent Signal in the feed -- I7 (FR-ALG-008; Afik 20.10.2026, decisions-in-force.md §6), migration only.
--
-- SRS: FR-ALG-008 (topics of the user's searches rank matching content up, with an influence that decays over time and is deleted after 30 days) ·
--      BR-059 (the algorithm configuration is versioned, append-only, Admin Only to change).
--
-- algorithm_configurations   two columns: w_intent (the weight of the decayed topic term, 0 to 2) and intent_half_life_hours (its half-life,
--                            1 to 720 hours). Added with constant defaults 0 and 168: catalog-only, no row written, and v1 keeps its meaning
--                            (no intent term). Then v2 = v1 with w_intent 0.5, half-life 168 hours, is inserted active and v1 is retired
--                            (the guard's one allowed change). Rows are written as the owner under NO FORCE for this transaction only
--                            (the backfill convention of data-model.md), FORCE again at once: the owner has no policy on this table.
-- No new table, policy, grant or function. Phase: expand; the code on main reads only the old columns and ranks the same under v2.
-- Down script: supabase/rollback/20261021200000_feed_intent_weight.down.sql.
-- =====================================================================================================================

alter table nestly.algorithm_configurations
  add column w_intent numeric not null default 0
    constraint algorithm_configurations_w_intent_check check (w_intent between 0 and 2),
  add column intent_half_life_hours integer not null default 168
    constraint algorithm_configurations_intent_half_life_hours_check check (intent_half_life_hours between 1 and 720);

comment on column nestly.algorithm_configurations.w_intent is
  'FR-ALG-008: weight of the Intent Signal term (a post matching a topic of the viewer''s recent searches ranks up); 0 = off. 0 to 2.';
comment on column nestly.algorithm_configurations.intent_half_life_hours is
  'FR-ALG-008: half-life of a search topic''s influence, in hours (it decays with time; the topic itself is deleted after 30 days). 1 to 720.';

alter table nestly.algorithm_configurations no force row level security;

update nestly.algorithm_configurations set is_active = false where surface = 'regular_feed' and version = 1 and is_active;

insert into nestly.algorithm_configurations
  (surface, version, is_active, w_fresh, w_friend, w_quality, w_stage, half_life_hours, quality_cap, scored_window_days,
   diversity_window, max_same_creator_in_window, max_anonymous_in_window, page_size, w_intent, intent_half_life_hours, created_by, reason)
select surface, 2, true, w_fresh, w_friend, w_quality, w_stage, half_life_hours, quality_cap, scored_window_days,
       diversity_window, max_same_creator_in_window, max_anonymous_in_window, page_size, 0.5, 168,
       'ALGORITHM & DATA, migration 20261021200000', 'FR-ALG-008 Intent Signal: v1 plus the decayed search-topic term (Afik 20.10.2026)'
  from nestly.algorithm_configurations
 where surface = 'regular_feed' and version = 1;

do $$
begin
  if (select count(*) from nestly.algorithm_configurations where surface = 'regular_feed' and is_active and version = 2) <> 1 then
    raise exception 'feed_intent_weight: v2 is not the one active regular_feed version';
  end if;
end
$$;

alter table nestly.algorithm_configurations force row level security;
