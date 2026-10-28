-- =====================================================================================================================
-- Down script for supabase/migrations/20261028100000_assistant_limits.sql: drops nestly.assistant_message_counts (with its policies).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Safe:     always: the table holds only working state (the instants of recent assistant messages); without it the assistant answers
--           "unavailable" (the server cannot count), and nothing else reads it.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the assistant limits down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop table nestly.assistant_message_counts;

delete from supabase_migrations.schema_migrations where version = '20261028100000';

commit;
