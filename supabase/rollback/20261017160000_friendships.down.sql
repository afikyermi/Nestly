-- =====================================================================================================================
-- Down script for supabase/migrations/20261017160000_friendships.sql (I2 F2.4a; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F2.4a server code first (the friends routes read and write these tables), then run this.
-- Safe:     only while friendships holds no row: a request or Friendship is user data, and after real use the way back is a
--           forward migration (data-model rule 7). FORCE RLS would hide every row from app_owner, so it is lifted inside this
--           transaction first and the check is real. regular_names is derived from regular_profiles and is dropped with it.
-- Restores: drops the regular_profiles insert trigger and regular_names_insert(), regular_names, friendships (with their
--           policies, indexes and trigger), friendships_transition(), the two composite UNIQUEs; deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the friendships down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.friendships no force row level security;

do $$
begin
  if exists (select 1 from nestly.friendships) then
    raise exception 'nestly.friendships holds a row: rolling back would delete users'' requests and Friendships. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

drop trigger regular_profiles_name_insert on nestly.regular_profiles;

drop function nestly.regular_names_insert();

drop table nestly.regular_names;

drop table nestly.friendships;

drop function nestly.friendships_transition();

alter table nestly.regular_profiles drop constraint regular_profiles_user_id_full_name_key;

alter table nestly.users drop constraint users_id_status_key;

delete from supabase_migrations.schema_migrations where version = '20261017160000';

commit;
