-- =====================================================================================================================
-- Down script for supabase/migrations/20261018300000_feed_author_names.sql (I3 F3.2; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Safe:     at any time: the policy holds no data and nothing depends on it. No code revert is needed first.
-- Effect:   a name is readable again only by self, request counterparties and Friends; other authors show "חבר/ת בקהילה".
-- Restores: drops the policy; deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the feed_author_names down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop policy regular_names_select_post_reader on nestly.regular_names;

delete from supabase_migrations.schema_migrations where version = '20261018300000';

commit;
