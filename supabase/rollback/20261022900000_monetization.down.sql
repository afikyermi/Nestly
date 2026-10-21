-- =====================================================================================================================
-- Down script for supabase/migrations/20261022900000_monetization.sql (I13, Monetization).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while no payment, promotion or promotion event exists (refuses otherwise: data would be lost). The seeded sample price
--           list goes with its table.
-- Restores: nothing was replaced. The two attribution triggers on professional_follows and conversations, the four tables and the five
--           trigger functions go; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the monetization down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only, for
  -- the check; the tables are dropped below.
  alter table nestly.promotion_payments no force row level security;
  alter table nestly.promotions no force row level security;
  alter table nestly.promotion_events no force row level security;
  if exists (select 1 from nestly.promotion_payments) or exists (select 1 from nestly.promotions)
     or exists (select 1 from nestly.promotion_events) then
    raise exception 'an I13 payment, promotion or promotion event exists: the down script refuses';
  end if;
end
$$;

drop trigger professional_follows_promotion_attribution on nestly.professional_follows;
drop trigger conversations_promotion_attribution on nestly.conversations;

drop table nestly.promotion_events;
drop table nestly.promotions;
drop table nestly.promotion_payments;
drop table nestly.promotion_plans;

drop function nestly.promotion_attribution();
drop function nestly.promotion_events_guard();
drop function nestly.promotions_update_guard();
drop function nestly.promotions_prepare();
drop function nestly.promotion_payments_prepare();

delete from supabase_migrations.schema_migrations where version = '20261022900000';

commit;
