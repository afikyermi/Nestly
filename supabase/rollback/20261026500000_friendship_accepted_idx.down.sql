-- =====================================================================================================================
-- Down script for supabase/migrations/20261026500000_friendship_accepted_idx.sql: drops the two partial indexes on nestly.friendships.
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod: Afik only.
-- Safe:     always: indexes only, no data.
-- Restores: the state before the migration; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the friendship accepted indexes down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop index nestly.friendships_requester_id_addressee_id_accepted_idx;
drop index nestly.friendships_addressee_id_requester_id_accepted_idx;

delete from supabase_migrations.schema_migrations where version = '20261026500000';

commit;
