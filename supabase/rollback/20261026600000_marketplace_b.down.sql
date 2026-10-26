-- =====================================================================================================================
-- Down script for supabase/migrations/20261026600000_marketplace_b.sql: drops purge_expired_listings(), the two TO app_jobs policies and
-- the job's added grants; restores marketplace_listings_update_guard() and its comment verbatim as 20261022600000_marketplace.sql left
-- them; drops the description column; restores both category CHECKs without "electrical".
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod: Afik only.
-- Refuses:  once a listing or a Sponsored Product uses the category "electrical", or a listing has a description (dropping it would lose
--           a seller's text).
-- Restores: the state before the migration; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the marketplace part B down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.marketplace_listings no force row level security;
alter table nestly.sponsored_products no force row level security;
do $$
begin
  if exists (select 1 from nestly.marketplace_listings where category = 'electrical' or description is not null)
     or exists (select 1 from nestly.sponsored_products where category = 'electrical') then
    raise exception 'the marketplace part B down script refuses: a listing or product uses "electrical", or a listing has a description';
  end if;
end
$$;
alter table nestly.marketplace_listings force row level security;
alter table nestly.sponsored_products force row level security;

drop function nestly.purge_expired_listings();
drop policy marketplace_listings_delete_expiry_jobs on nestly.marketplace_listings;
drop policy marketplace_listings_select_expiry_jobs on nestly.marketplace_listings;
revoke select (status, expires_at), delete on table nestly.marketplace_listings from app_jobs;

create or replace function nestly.marketplace_listings_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.owner_id, new.owner_account_type) is distinct from (old.id, old.owner_id, old.owner_account_type) then
    raise exception 'marketplace_listings: immutable column' using errcode = '42501';
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.expires_at, new.created_at) is distinct from (old.expires_at, old.created_at) then
    raise exception 'marketplace_listings: the clocks are the database''s' using errcode = '42501';
  end if;
  if new.is_hidden is distinct from old.is_hidden then
    if not (select nestly.has_permission('MARKETPLACE_MODERATE')) then
      raise exception 'marketplace_listings: hiding needs MARKETPLACE_MODERATE' using errcode = '42501';
    end if;
    if (new.title, new.category, new.item_condition, new.price, new.city, new.status)
       is distinct from (old.title, old.category, old.item_condition, old.price, old.city, old.status) then
      raise exception 'marketplace_listings: a moderation changes nothing else' using errcode = '42501';
    end if;
    new.hidden_at := case when new.is_hidden then pg_catalog.now() end;
    new.hidden_by := case when new.is_hidden then (select auth.uid()) end;
    return new;
  end if;
  if (new.hidden_at, new.hidden_by) is distinct from (old.hidden_at, old.hidden_by) then
    raise exception 'marketplace_listings: only a moderation hides' using errcode = '42501';
  end if;
  if (select auth.uid()) is distinct from old.owner_id then
    raise exception 'marketplace_listings: only the owner edits a listing' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    new.sold_at := case when new.status = 'sold' then pg_catalog.now() end;
  end if;
  if (new.title, new.category, new.item_condition, new.price, new.city, new.status)
     is distinct from (old.title, old.category, old.item_condition, old.price, old.city, old.status) then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end
$$;
comment on function nestly.marketplace_listings_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The id and the owner never change; a client never changes the expiry or created_at. A change of is_hidden needs MARKETPLACE_MODERATE and changes nothing else (hidden_at, hidden_by set here); every other change is the owner''s (sold_at and updated_at are the database clock). A cascade passes.';

alter table nestly.marketplace_listings drop column description;

alter table nestly.marketplace_listings drop constraint marketplace_listings_category_check;
alter table nestly.marketplace_listings add constraint marketplace_listings_category_check check (category in ('strollers', 'car_seats', 'furniture',
  'clothing', 'toys', 'feeding', 'bath_care', 'maternity', 'books', 'other'));
alter table nestly.sponsored_products drop constraint sponsored_products_category_check;
alter table nestly.sponsored_products add constraint sponsored_products_category_check check (category in ('strollers', 'car_seats', 'furniture',
  'clothing', 'toys', 'feeding', 'bath_care', 'maternity', 'books', 'other'));

delete from supabase_migrations.schema_migrations where version = '20261026600000';

commit;
