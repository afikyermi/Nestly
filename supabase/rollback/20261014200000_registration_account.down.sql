-- =====================================================================================================================
-- Down script for supabase/migrations/20261014200000_registration_account.sql (I1 F1.4 part a; schema.md "Rollback",
-- level 2). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, the owner of nestly, in one transaction. CI runs it once per build (up -> down -> up) against
--           the disposable database. Against nestly-preview or nestly-prod it is a destructive change: Afik only
--           (CLAUDE.md hard rule 7); the safe rollback there is level 1, a forward migration that drops the
--           *_insert_own policies and revokes INSERT.
-- Safe:     only while journey_contexts, children and legal_consents are empty. The script refuses otherwise. FORCE RLS
--           would hide every row from app_owner, so it lifts FORCE inside this transaction first and the count is real.
-- Takes:    the three tables, the five insert policies, INSERT on users and regular_profiles; deletes the migration's
--           history row. Accounts already created (users and profiles) stay.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the registration account down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.journey_contexts no force row level security;
alter table nestly.children         no force row level security;
alter table nestly.legal_consents   no force row level security;

do $$
begin
  if exists (select 1 from nestly.journey_contexts)
     or exists (select 1 from nestly.children)
     or exists (select 1 from nestly.legal_consents) then
    raise exception 'nestly.journey_contexts, nestly.children or nestly.legal_consents holds rows: rolling back would destroy minors'' and consent data. Stop: this is Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

drop policy users_insert_own            on nestly.users;
drop policy regular_profiles_insert_own on nestly.regular_profiles;

revoke insert on table nestly.users, nestly.regular_profiles from authenticated;

drop table nestly.legal_consents;
drop table nestly.children;
drop table nestly.journey_contexts;

delete from supabase_migrations.schema_migrations where version = '20261014200000';

commit;
