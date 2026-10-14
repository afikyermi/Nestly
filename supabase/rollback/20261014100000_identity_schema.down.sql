-- =====================================================================================================================
-- Down script for supabase/migrations/20261014100000_identity_schema.sql (I1 F1.1 part b; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, the owner of nestly, in one transaction. CI runs it once per build (up -> down -> up) against
--           the disposable database. Against nestly-preview or nestly-prod it is a destructive change: Afik only
--           (CLAUDE.md hard rule 7).
-- Safe:     only while nestly.users and nestly.regular_profiles are empty, i.e. until F1.4 writes the first row. The
--           script refuses otherwise. FORCE RLS would hide every row from app_owner (no policy is TO app_owner), so it
--           lifts FORCE inside this transaction first; the owner then sees every row, and the count is real.
-- Takes:    the schema and everything in it, including the anchor FK of bootstrap step 2 (it lives on nestly.users);
--           restores the PUBLIC EXECUTE default for app_owner's functions; deletes the migration's history row, so the
--           CLI applies the migration again on the next push.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the identity schema down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

do $$
begin
  if to_regclass('nestly.legal_consents') is not null then
    raise exception 'run supabase/rollback/20261014200000_registration_account.down.sql first: the registration account migration is still applied';
  end if;
end
$$;

alter table nestly.users            no force row level security;
alter table nestly.regular_profiles no force row level security;

do $$
begin
  if exists (select 1 from nestly.users) or exists (select 1 from nestly.regular_profiles) then
    raise exception 'nestly.users or nestly.regular_profiles holds rows: rolling back would destroy personal data. Stop: this is Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

drop schema nestly cascade;

alter default privileges grant execute on functions to public;

delete from supabase_migrations.schema_migrations where version = '20261014100000';

commit;
