-- =====================================================================================================================
-- CI only — shows that tests.rls_gate_product() covers every schema app_owner owns, not only nestly (part a CRITIC
-- finding 5). Run as app_owner after rls-gate.sql, in the disposable database: postgres cannot create a schema owned
-- by app_owner (it holds app_owner with SET FALSE), so this one case runs as the owner itself.
-- One transaction, always rolled back. Raises — and so fails the CI step — when the gate does not report the table.
-- =====================================================================================================================

begin;

create schema zz_fire_owned;
create table zz_fire_owned.zz_t (id int);

do $$
begin
  if not exists (
    select 1 from tests.rls_gate_product() g
    where g.check_name = 'rls_disabled' and g.object = 'zz_fire_owned.zz_t'
  ) then
    raise exception 'rls-gate-fire (app_owner): the gate did not report rls_disabled (zz_fire_owned.zz_t): a schema app_owner owns is not covered';
  end if;
  raise notice 'rls-gate-fire (app_owner): a second schema owned by app_owner is gated';
end
$$;

rollback;
