-- =====================================================================================================================
-- I12 part B — Marketplace: Afik's decisions §10.5–§10.6 (21.10.2026) — migration only.
--
-- SRS: FR-MKT-001, FR-MKT-002, FR-MKT-005 · VAL-013 · BR-090, BR-091 · ERR-054 · AC-200..AC-205 · §13.4 (OP-052 and OP-054 close).
--
-- What changes (expand only: main's code keeps working on this schema — P6):
-- 1. Category "מכשירי חשמל" (electrical): marketplace_listings_category_check and sponsored_products_category_check accept it (the two
--    share one list).
-- 2. Description: marketplace_listings.description, optional text of 1 to 1,000 characters (code points), not blank. The owner writes it
--    (INSERT/UPDATE grant), every reader of the listing reads it (SELECT grant). The price rule is unchanged here: "0 = למסירה" is stored as
--    the existing "no price" (the server maps 0 to it), so price keeps its CHECK (NULL or 1..100,000).
-- 3. The update guard (replaced): as before, with the description among the owner's fields (updated_at moves with it; a moderation changes
--    none of them), and a sold listing whose 60 days have passed does not return to sale (23514: it would be deleted at the next run).
-- 4. Expiry deletes (BR-090): purge_expired_listings(), SECURITY INVOKER, EXECUTE app_jobs only, the retention pattern of
--    purge_search_intents() and purge_usage_events(). It deletes every active listing past its 60 days that has no open report (an open
--    report holds it until the report is closed, as BR-080 holds an account's deletion, so the staff still see the item). A sold listing is
--    never purged (BR-091: kept until its owner deletes it or the account goes). The FKs do the rest as on the owner's delete: the images
--    lose the link and the media job deletes them a day later (media_assets_delete_jobs), a conversation and a report keep their rows
--    without the link (the report keeps its copied title), a promotion of it goes (cascade). Two TO app_jobs policies (select, delete) on
--    exactly those rows, and the columns they need (status, expires_at; table DELETE). Run daily with the other purges once the schedule
--    exists (bootstrap step 3, WORKPLAN "ממתין לך").
-- No new table, no SECURITY DEFINER, no TO app_owner policy, no data change.
-- Down script: supabase/rollback/20261026600000_marketplace_b.down.sql.
-- =====================================================================================================================

-- 1. The category list -------------------------------------------------------------------------------------------------
alter table nestly.marketplace_listings drop constraint marketplace_listings_category_check;
alter table nestly.marketplace_listings add constraint marketplace_listings_category_check check (category in ('strollers', 'car_seats', 'furniture',
  'clothing', 'toys', 'feeding', 'bath_care', 'maternity', 'books', 'electrical', 'other'));
alter table nestly.sponsored_products drop constraint sponsored_products_category_check;
alter table nestly.sponsored_products add constraint sponsored_products_category_check check (category in ('strollers', 'car_seats', 'furniture',
  'clothing', 'toys', 'feeding', 'bath_care', 'maternity', 'books', 'electrical', 'other'));

-- 2. The description ---------------------------------------------------------------------------------------------------
alter table nestly.marketplace_listings add column description text
  constraint marketplace_listings_description_check check (description is null
    or (pg_catalog.btrim(description) <> '' and pg_catalog.char_length(description) <= 1000));

grant select (description), insert (description), update (description) on table nestly.marketplace_listings to authenticated;

-- 3. The update guard (replaced) ----------------------------------------------------------------------------------------
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
    if (new.title, new.description, new.category, new.item_condition, new.price, new.city, new.status)
       is distinct from (old.title, old.description, old.category, old.item_condition, old.price, old.city, old.status) then
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
    -- ERR-054: a sold listing whose 60 days have passed stays sold (back on sale it would be deleted at the next run, BR-090)
    if new.status = 'active' and old.expires_at <= pg_catalog.now() then
      raise exception 'marketplace_listings: an expired listing does not return to sale' using errcode = '23514';
    end if;
    new.sold_at := case when new.status = 'sold' then pg_catalog.now() end;
  end if;
  if (new.title, new.description, new.category, new.item_condition, new.price, new.city, new.status)
     is distinct from (old.title, old.description, old.category, old.item_condition, old.price, old.city, old.status) then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end
$$;

-- 4. Expiry deletes (BR-090) ---------------------------------------------------------------------------------------------
create policy marketplace_listings_select_expiry_jobs on nestly.marketplace_listings
  for select to app_jobs
  using (status = 'active' and expires_at <= now());
create policy marketplace_listings_delete_expiry_jobs on nestly.marketplace_listings
  for delete to app_jobs
  using (status = 'active' and expires_at <= now()
    and not exists (select 1 from nestly.reports r where r.listing_id = marketplace_listings.id and r.status = 'open'));
grant select (status, expires_at), delete on table nestly.marketplace_listings to app_jobs;

create function nestly.purge_expired_listings()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  delete from nestly.marketplace_listings l
   where l.status = 'active' and l.expires_at <= pg_catalog.now()
     and not exists (select 1 from nestly.reports r where r.listing_id = l.id and r.status = 'open');
  get diagnostics n = row_count;
  return n;
end
$$;

revoke execute on function nestly.purge_expired_listings() from public;
grant execute on function nestly.purge_expired_listings() to app_jobs;

-- 5. Comments -----------------------------------------------------------------------------------------------------------
comment on column nestly.marketplace_listings.description is
  'FR-MKT-002, VAL-013 (Afik §10.6): the seller''s optional description, 1 to 1,000 characters (code points), never blank; the server trims and checks first.';
comment on constraint marketplace_listings_description_check on nestly.marketplace_listings is
  'VAL-013: NULL, or not blank and at most 1,000 characters (code points).';
comment on constraint marketplace_listings_category_check on nestly.marketplace_listings is
  'FR-MKT-002 (Afik §10.6): the category list, "מכשירי חשמל" (electrical) included; the same list as sponsored_products.';
comment on constraint sponsored_products_category_check on nestly.sponsored_products is
  'FR-ADMIN-009: the Marketplace''s category list (as marketplace_listings_category_check).';
comment on function nestly.marketplace_listings_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The id and the owner never change; a client never changes the expiry or created_at. A change of is_hidden needs MARKETPLACE_MODERATE and changes nothing else (hidden_at, hidden_by set here); every other change is the owner''s (sold_at and updated_at are the database clock; the description is one of the owner''s fields). A sold listing past its expiry does not return to sale (23514, ERR-054). A cascade and the retention job pass.';
comment on function nestly.purge_expired_listings() is
  'BR-090, §13.4 (Afik §10.6): deletes every active listing whose 60 days have passed and that has no open report (the report holds it until it is closed); a sold listing is kept (BR-091). Returns the number deleted. Images unlink and go with the media job a day later; conversations and reports keep their rows without the link. SECURITY INVOKER, EXECUTE app_jobs only; run daily with the other purges.';
comment on policy marketplace_listings_select_expiry_jobs on nestly.marketplace_listings is
  'Rule 6, BR-090: the retention job reads the active listings whose 60 days have passed (status and expiry only).';
comment on policy marketplace_listings_delete_expiry_jobs on nestly.marketplace_listings is
  'Rule 6, BR-090: the retention job deletes an active listing past its expiry, unless an open report holds it.';
