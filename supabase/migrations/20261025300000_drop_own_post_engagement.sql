-- =====================================================================================================================
-- Drop own_post_engagement(integer) and the three policies that exist only for it — migration only.
--
-- Why. The Professional dashboard does not call it (the count stays a plain query under the caller's RLS), so the SECURITY DEFINER
-- function from 20261025100000 is unused in Production, and every call would write a trend_scopes row. Removing it takes one approved
-- SECURITY DEFINER function and three app_owner policies off the surface (decisions-in-force.md §19 approved it only for use).
--
-- Removes: function nestly.own_post_engagement(integer); policies trend_scopes_insert_engagement on nestly.trend_scopes,
--          reactions_select_within_engagement on nestly.reactions, comments_select_within_engagement on nestly.comments.
-- Keeps:   nestly.trend_scopes and its other policies (child_tracker_trends and the I14 / child-birthday scopes use them).
--
-- No table, no column, no data (a scope row lived only inside one call's transaction). Applied by the Supabase CLI as app_owner, in one
-- transaction with its history row. Down script: supabase/rollback/20261025300000_drop_own_post_engagement.down.sql (recreates all four).
-- =====================================================================================================================

drop function nestly.own_post_engagement(integer);
drop policy comments_select_within_engagement on nestly.comments;
drop policy reactions_select_within_engagement on nestly.reactions;
drop policy trend_scopes_insert_engagement on nestly.trend_scopes;
