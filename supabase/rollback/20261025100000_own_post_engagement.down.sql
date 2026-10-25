-- =====================================================================================================================
-- Down script for supabase/migrations/20261025100000_own_post_engagement.sql (own_post_engagement(): the dashboard's engagement count
-- without the RLS chain). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Order:    revert the code that calls own_post_engagement() first, then run this.
-- Safe:     always: the migration wrote no data (a scope row lives only inside one call's transaction).
-- Restores: drops the function and its three policies; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the own post engagement down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop function nestly.own_post_engagement(integer);
drop policy comments_select_within_engagement on nestly.comments;
drop policy reactions_select_within_engagement on nestly.reactions;
drop policy trend_scopes_insert_engagement on nestly.trend_scopes;

delete from supabase_migrations.schema_migrations where version = '20261025100000';

commit;
