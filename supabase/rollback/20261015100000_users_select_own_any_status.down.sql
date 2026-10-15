-- =====================================================================================================================
-- Down script for supabase/migrations/20261015100000_users_select_own_any_status.sql (I1 F1.5 part a; schema.md
-- "Rollback"). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           On nestly-preview / nestly-prod the rollback is level 1, not this script: a new forward migration with the
--           old USING, through CI (prod after Afik's `db-production` approval).
-- Roll back the code with it. With the old policy and GET /api/me still deployed, a stopped account answers
--           `unregistered`, is sent into completion (criterion 16), gets 409, asks /api/me again and gets
--           `unregistered` again: no data leaks (everything still fails closed) but the user loops. Revert part a's
--           route together with the policy.
-- Takes:    the policy qual and two comments back to their previous text. No row is touched; deletes the migration's
--           history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the users_select_own_any_status down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter policy users_select_own on nestly.users
  using (id = (select auth.uid()) and status = 'active');

comment on policy users_select_own on nestly.users is
  'An active account reads its own row only (NFR-SEC-002, layer 1). Status checked inline: no function that reads users.';
comment on column nestly.users.status is
  'Whether the account may use the product now: active, suspended or banned (FR-MOD-002, BR-024). Anything but active reads nothing, from the next statement (platform rule 15). A warning is not a status.';

delete from supabase_migrations.schema_migrations where version = '20261015100000';

commit;
