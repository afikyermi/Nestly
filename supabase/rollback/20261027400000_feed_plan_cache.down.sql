-- =====================================================================================================================
-- Down script for supabase/migrations/20261027400000_feed_plan_cache.sql: drops the seventeen plan-cached read functions (with their
-- grants and comments) and the migration's history row. The server of the previous commit sends the statements itself.
-- =====================================================================================================================

begin;

drop function nestly.read_feed_ranking_regular(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer);
drop function nestly.read_feed_ranking_regular_intent(timestamptz, float8, float8, float8, float8, float8, float8, float8, float8, text[], float8, text[], float8[], boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer);
drop function nestly.read_feed_ranking_content(timestamptz, float8, float8, float8, float8, float8, float8, float8, uuid, boolean, timestamptz, uuid, integer, float8, timestamptz, uuid, integer);
drop function nestly.read_feed_display(uuid[]);
drop function nestly.read_feed_config_rows();
drop function nestly.read_post_counts(uuid[]);
drop function nestly.read_liked_target_ids(uuid[]);
drop function nestly.read_post_images(uuid[]);
drop function nestly.read_muted_group_ids(uuid[]);
drop function nestly.read_professional_authors(uuid[]);
drop function nestly.read_promoted_post_candidates();
drop function nestly.read_promoted_profile_candidates();
drop function nestly.read_promoted_listing_candidates();
drop function nestly.read_promotion_config();
drop function nestly.read_recent_post_count();
drop function nestly.read_matching_posts(uuid[], text[]);
drop function nestly.read_today_impressions(uuid[]);

delete from supabase_migrations.schema_migrations where version = '20261027400000';

commit;
