-- =====================================================================================================================
-- The Intent Signal in the feed -- I7 (FR-ALG-008; Afik 20.10.2026, decisions-in-force.md §6), migration only.
--
-- SRS: FR-ALG-008 (topics of the user's searches rank matching content up, with an influence that decays over time and is deleted after 30 days) ·
--      BR-059 (the algorithm configuration is versioned and append-only).
--
-- algorithm_configurations   two columns: w_intent (the weight of the decayed topic term, 0 to 2) and intent_half_life_hours (its half-life,
--                            1 to 720 hours). Added with constant defaults 0.5 and 168, catalog-only: no row is written or rewritten, the guard
--                            does not fire, and every stored version (v1) reads those values for the two new columns. The defaults then become
--                            0 and 168 for any later version, which must state its own weight. Why not a v2 row: main's code and tests answer
--                            configVersion 1 on a first page, and this schema must keep them green while it waits for production (P6); the
--                            columns of v1 that existed are unchanged, and the code before this change has no intent term to read.
-- No new table, policy, grant or function. Phase: expand. Down script: supabase/rollback/20261021200000_feed_intent_weight.down.sql.
-- =====================================================================================================================

alter table nestly.algorithm_configurations
  add column w_intent numeric not null default 0.5
    constraint algorithm_configurations_w_intent_check check (w_intent between 0 and 2),
  add column intent_half_life_hours integer not null default 168
    constraint algorithm_configurations_intent_half_life_hours_check check (intent_half_life_hours between 1 and 720);

alter table nestly.algorithm_configurations alter column w_intent set default 0;

comment on column nestly.algorithm_configurations.w_intent is
  'FR-ALG-008: weight of the Intent Signal term (a post matching a topic of the viewer''s recent searches ranks up); 0 = off. 0 to 2. Versions stored before the column read 0.5.';
comment on column nestly.algorithm_configurations.intent_half_life_hours is
  'FR-ALG-008: half-life of a search topic''s influence, in hours (it decays with time; the topic itself is deleted after 30 days). 1 to 720.';
