-- =====================================================================================================================
-- Marketplace — I12, migration only.
--
-- SRS: FR-MKT-001, FR-MKT-002, FR-MKT-003, FR-MKT-005 · FR-ADMIN-009 · FR-ALG-006 · FR-CHAT-002 (the Marketplace exception) · BR-005, BR-007,
--      BR-017, BR-018, BR-046, BR-069 · VAL-013, VAL-024, VAL-041 · ERR-006, ERR-021 · AC-008, AC-019, AC-020, AC-021 (listings), AC-058, AC-059,
--      AC-097 · §3.2 (MARKETPLACE_MODERATE, SPONSORED_PRODUCT_MANAGE) · §12 (a city or area from a list) · decisions-in-force.md §3 items 11-12
--      (title, category, condition, price or "for free", city and images; "sold/given"; expiry after 60 days; contact by chat only; no coupons
--      or affiliate code) and §2 (images: private storage, the background check, the approval queue).
--
-- marketplace_listings     MarketplaceListing (FR-MKT-002, BR-017, VAL-013, AC-019): a Regular's item for sale or to give away, a commercial
--                          entity of its own, never a post. Title, category, condition, price (NULL = "למסירה"), city (from the §12 list).
--                          The owner marks it sold/given (status sold) or back; it expires 60 days after it was published (expires_at, the
--                          database clock, never granted). Every active account reads an active, not hidden, not expired listing of an active
--                          owner it has no user block with and has not reported; the owner reads all its own; MARKETPLACE_MODERATE reads every
--                          listing and hides or restores it (is_hidden, audited). The owner edits and deletes its own. No payment, purchase or
--                          delivery column exists (BR-069, AC-097).
-- sponsored_products       SponsoredProduct (FR-ADMIN-009, BR-046, AC-058): created and managed by the Admin only (SPONSORED_PRODUCT_MANAGE, an
--                          Admin Only key), draft -> published <-> paused, and removed (final). Every active account reads a published one;
--                          every write is audited. Sample coupons for the demo are ordinary sponsored products whose text says they are samples
--                          (OP-023: no coupon entity and no demo code).
-- media_assets             gain the kinds listing (up to 6 images, positions 0-5, VAL-041) and sponsored (one image), attached once by their
--                          uploader to its own listing / to a sponsored product it manages. Readable to others only after the check passed or
--                          staff approved, through a listing or a sponsored product they can read (the I5 pipeline, unchanged otherwise).
-- conversations            gain the context marketplace with listing_id (FR-MKT-005, FR-CHAT-002, BR-007, AC-059): any active Regular or
--                          Professional opens a conversation with the owner of an active listing it can read, never its own, never across a
--                          user block. One conversation per pair stays (conversations_pair_key): an existing one is reused by the server.
-- reports                  a listing can be reported (target_kind listing, listing_id; the title is copied as the reported text). Handling it
--                          needs MARKETPLACE_MODERATE. A listing its owner deletes leaves an open report on it open, with the copied title.
-- media_training_candidate a listing's checked images become training candidates after a handled listing report, as a post's (Afik 21.10.2026,
--                          decisions-in-force.md §9.7: every staff decision on an image feeds the training set, except a suspected child abuse).
-- regular_names            a listing's owner's name is readable with the listing (regular_names_select_listing_reader).
-- audit_trigger()          replaced: the body of 20261022300000 plus the marketplace_listings (hide / restore) and sponsored_products branches
--                          (rule 18; still the one approved audit definer).
--
-- Every new table: RLS + FORCE, client policies TO authenticated gated by is_active_account(), per-column write grants, owner columns
-- defaulting to auth.uid(). No new SECURITY DEFINER, no TO app_owner policy; one TO app_media_jobs policy changed (orphan listing and
-- sponsored images purged after a day, as orphan post images).
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261022600000_marketplace.down.sql (refuses once a new table holds a row or a report, conversation or image uses a new
-- value).
-- =====================================================================================================================

-- 1. marketplace_listings ------------------------------------------------------------------------------------------------
create table nestly.marketplace_listings (
  id                 uuid        not null default gen_random_uuid()
    constraint marketplace_listings_pkey primary key,
  owner_id           uuid        not null default auth.uid(),
  owner_account_type text        not null default 'regular'
    constraint marketplace_listings_owner_account_type_check check (owner_account_type = 'regular'),
  owner_status       text        not null default 'active',
  title              text        not null
    constraint marketplace_listings_title_check check (pg_catalog.char_length(pg_catalog.btrim(title)) between 2 and 80),
  category           text        not null
    constraint marketplace_listings_category_check check (category in ('strollers', 'car_seats', 'furniture', 'clothing', 'toys', 'feeding',
      'bath_care', 'maternity', 'books', 'other')),
  item_condition     text        not null
    constraint marketplace_listings_item_condition_check check (item_condition in ('new', 'like_new', 'good', 'used')),
  price              integer
    constraint marketplace_listings_price_check check (price is null or price between 1 and 100000),
  city               text        not null
    constraint marketplace_listings_city_check check (city in ('jerusalem', 'tel_aviv', 'center', 'sharon', 'shfela', 'haifa', 'north',
      'south', 'beer_sheva', 'eilat', 'judea_samaria')),
  status             text        not null default 'active'
    constraint marketplace_listings_status_check check (status in ('active', 'sold')),
  sold_at            timestamptz,
  is_hidden          boolean     not null default false,
  hidden_at          timestamptz,
  hidden_by          uuid
    constraint marketplace_listings_hidden_by_fkey references nestly.users (id) on delete set null,
  expires_at         timestamptz not null default (now() + interval '60 days'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint marketplace_listings_sold_at_check check ((sold_at is not null) = (status = 'sold')),
  constraint marketplace_listings_hidden_at_check check ((hidden_at is not null) = is_hidden),
  constraint marketplace_listings_expires_at_check check (expires_at > created_at),
  constraint marketplace_listings_owner_fkey foreign key (owner_id, owner_account_type)
    references nestly.users (id, account_type) on delete cascade,
  constraint marketplace_listings_owner_status_fkey foreign key (owner_id, owner_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create index marketplace_listings_live_idx on nestly.marketplace_listings (created_at desc)
  where status = 'active' and not is_hidden;
create index marketplace_listings_owner_created_idx on nestly.marketplace_listings (owner_id, created_at desc);
create index marketplace_listings_hidden_by_idx on nestly.marketplace_listings (hidden_by) where hidden_by is not null;

-- 2. sponsored_products --------------------------------------------------------------------------------------------------
create table nestly.sponsored_products (
  id           uuid        not null default gen_random_uuid()
    constraint sponsored_products_pkey primary key,
  sponsor_name text        not null
    constraint sponsored_products_sponsor_name_check check (pg_catalog.char_length(pg_catalog.btrim(sponsor_name)) between 2 and 80),
  title        text        not null
    constraint sponsored_products_title_check check (pg_catalog.char_length(pg_catalog.btrim(title)) between 2 and 80),
  description  text
    constraint sponsored_products_description_check check (description is null
      or (description ~ '[^[:space:]]' and pg_catalog.char_length(description) <= 1000)),
  category     text        not null
    constraint sponsored_products_category_check check (category in ('strollers', 'car_seats', 'furniture', 'clothing', 'toys', 'feeding',
      'bath_care', 'maternity', 'books', 'other')),
  link_url     text
    constraint sponsored_products_link_url_check check (link_url is null
      or (link_url ~ '^https://[^[:space:]/?#@]*\.[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' and pg_catalog.char_length(link_url) <= 500)),
  status       text        not null default 'draft'
    constraint sponsored_products_status_check check (status in ('draft', 'published', 'paused', 'removed')),
  created_by   uuid        default auth.uid()
    constraint sponsored_products_created_by_fkey references nestly.users (id) on delete set null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint sponsored_products_published_at_check check (status = 'draft' or published_at is not null or status = 'removed')
);

create index sponsored_products_published_idx on nestly.sponsored_products (published_at desc) where status = 'published';
create index sponsored_products_created_by_idx on nestly.sponsored_products (created_by) where created_by is not null;

-- 3. media_assets: listing and sponsored images (VAL-041: up to 6 per listing; one per sponsored product) -----------------
alter table nestly.media_assets add column listing_id uuid
  constraint media_assets_listing_id_fkey references nestly.marketplace_listings (id) on delete set null;
alter table nestly.media_assets add column sponsored_product_id uuid
  constraint media_assets_sponsored_product_id_fkey references nestly.sponsored_products (id) on delete set null;
alter table nestly.media_assets drop constraint media_assets_kind_check;
alter table nestly.media_assets add constraint media_assets_kind_check check (kind in ('post', 'profile', 'story', 'listing', 'sponsored'));
alter table nestly.media_assets drop constraint media_assets_position_check;
alter table nestly.media_assets add constraint media_assets_position_check check (position is null
  or position between 0 and (case kind when 'listing' then 5 when 'sponsored' then 0 else 3 end));
alter table nestly.media_assets add constraint media_assets_listing_kind_check check (listing_id is null or kind = 'listing');
alter table nestly.media_assets add constraint media_assets_sponsored_kind_check check (sponsored_product_id is null or kind = 'sponsored');
alter table nestly.media_assets add constraint media_assets_attached_position_check check (
  (listing_id is null or position is not null) and (sponsored_product_id is null or position is not null));
alter table nestly.media_assets add constraint media_assets_listing_id_position_key unique (listing_id, position);
alter table nestly.media_assets add constraint media_assets_sponsored_product_id_position_key unique (sponsored_product_id, position);

-- 4. conversations: the Marketplace context (FR-MKT-005, FR-CHAT-002, AC-059) --------------------------------------------
alter table nestly.conversations add column listing_id uuid
  constraint conversations_listing_id_fkey references nestly.marketplace_listings (id) on delete set null;
alter table nestly.conversations drop constraint conversations_context_check;
alter table nestly.conversations add constraint conversations_context_check
  check (context in ('friends', 'request', 'professional', 'outreach', 'marketplace'));
alter table nestly.conversations add constraint conversations_listing_id_check check (listing_id is null or context = 'marketplace');
create index conversations_listing_id_idx on nestly.conversations (listing_id) where listing_id is not null;

-- 5. reports: a listing can be reported. Its FK is SET NULL: a listing its owner deleted leaves the report (with the copied title) for
--    staff to close; the open-target check therefore does not name listing_id, and reports_insert_check requires it on a new report.
alter table nestly.reports add column listing_id uuid;
alter table nestly.reports
  add constraint reports_listing_id_fkey foreign key (listing_id) references nestly.marketplace_listings (id) on delete set null,
  add constraint reports_reporter_listing_key unique (reporter_id, listing_id);
alter table nestly.reports drop constraint reports_target_kind_check;
alter table nestly.reports add constraint reports_target_kind_check check (target_kind in ('post', 'comment', 'user', 'message', 'listing'));
alter table nestly.reports drop constraint reports_one_target_check;
alter table nestly.reports add constraint reports_one_target_check check (num_nonnulls(post_id, comment_id, reported_user_id, message_id, listing_id) <= 1);
alter table nestly.reports drop constraint reports_open_target_check;
alter table nestly.reports add constraint reports_open_target_check check (
  status <> 'open'
  or case target_kind
       when 'post' then post_id is not null
       when 'comment' then comment_id is not null
       when 'message' then message_id is not null
       when 'listing' then num_nonnulls(post_id, comment_id, reported_user_id, message_id) = 0
       else reported_user_id is not null
     end);
create index reports_listing_id_idx on nestly.reports (listing_id) where listing_id is not null;

-- 6. Triggers (SECURITY INVOKER; auth.uid() is the actor; current_user tells a client from the owner's cascades) ------------

-- marketplace_listings: the owner edits its fields and marks the item sold/given (or back); MARKETPLACE_MODERATE hides or restores it and
-- changes nothing else. The key, the owner, the expiry and the clocks are the database's. A cascade (owner_status) passes.
create function nestly.marketplace_listings_update_guard()
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

-- sponsored_products: draft -> published or removed; published -> paused or removed; paused -> published or removed; removed is final (the
-- update policy no longer reaches it). published_at is the first publication; the creator and the clocks are the database's.
create function nestly.sponsored_products_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.created_by, new.created_at) is distinct from (old.id, old.created_by, old.created_at)
     and current_user = 'authenticated' then
    raise exception 'sponsored_products: immutable column' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status in ('published', 'removed'))
         or (old.status = 'published' and new.status in ('paused', 'removed'))
         or (old.status = 'paused' and new.status in ('published', 'removed'))) then
      raise exception 'sponsored_products: transition refused' using errcode = '23514';
    end if;
    if new.status = 'published' and old.published_at is null then
      new.published_at := pg_catalog.now();
    end if;
  elsif new.published_at is distinct from old.published_at and current_user = 'authenticated' then
    raise exception 'sponsored_products: published_at is the database''s' using errcode = '42501';
  end if;
  if (new.sponsor_name, new.title, new.description, new.category, new.link_url, new.status)
     is distinct from (old.sponsor_name, old.title, old.description, old.category, old.link_url, old.status) then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end
$$;

-- media_assets: the I5 guard (20261021500000), with listing and sponsored images: the uploader attaches an unattached image of either kind
-- once, to its own listing / to a sponsored product it manages; a listing report is a ground for staff to remove a checked image.
create or replace function nestly.media_assets_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mine boolean;
  v_suspected boolean;
begin
  if new.is_held is distinct from old.is_held and current_user <> 'authenticated' then
    raise exception 'media: only a staff decision holds an image' using errcode = '42501';
  end if;
  if current_user = 'app_media_jobs' then
    if new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id
       or new.position is distinct from old.position or new.decided_at is distinct from old.decided_at then
      raise exception 'media: the job cannot decide' using errcode = '42501';
    end if;
    if old.status = 'rejected' then
      -- a rejected image's file is gone: the job records only that (Afik 20.10.2026)
      if new.status <> 'rejected' or not new.is_file_removed or new.check_attempts <> old.check_attempts then
        raise exception 'media: the job only records a removed file' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status <> 'pending' or new.status not in ('pending', 'passed', 'queued') or new.is_file_removed or new.check_attempts < old.check_attempts then
      raise exception 'media: the check moves only a pending image, to passed or queued' using errcode = '42501';
    end if;
    if new.status = 'queued' and not exists (select 1 from nestly.media_reviews r where r.media_id = new.id and r.queue_reason is not null) then
      raise exception 'media: a queued image has its reason first' using errcode = '23514';
    end if;
    if new.status is distinct from old.status then new.checked_at := pg_catalog.now(); end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status then
    -- a staff decision (BR-076 as of 20.10.2026): a queued image approved or rejected; a passed or approved one rejected after a report (not
    -- a dismissed one) or as a suspicion
    if not (select nestly.has_permission('CONTENT_MODERATE')) then
      raise exception 'media: a decision needs CONTENT_MODERATE' using errcode = '42501';
    end if;
    if new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = '42501';
    end if;
    select coalesce(bool_or(r.is_suspected), false) into v_suspected from nestly.media_reviews r where r.media_id = new.id;
    if old.status = 'queued' and new.status in ('approved', 'rejected') then
      if v_suspected and new.status <> 'rejected' then
        raise exception 'media: a suspected image is rejected' using errcode = '23514';
      end if;
    elsif old.status in ('passed', 'approved') and new.status = 'rejected' then
      -- after a report on its post, its listing or its uploader that is open (the moderator acts, then closes it) or was handled with action
      -- taken; a dismissed report is no ground. Or as a suspicion. The uploader sees the same rejection either way.
      if not (select nestly.has_permission('REPORTS_VIEW')) or not (v_suspected
          or exists (select 1 from nestly.reports r where (r.status = 'open' or r.resolution = 'action_taken')
                       and ((old.post_id is not null and r.post_id = old.post_id)
                         or (old.listing_id is not null and r.listing_id = old.listing_id)
                         or r.reported_user_id = old.owner_id))) then
        raise exception 'media: a checked image is removed only after a report or as a suspicion' using errcode = '42501';
      end if;
    else
      raise exception 'media: not a decision' using errcode = '23514';
    end if;
    new.is_held := v_suspected;
    new.decided_by := (select auth.uid());
    new.decided_at := pg_catalog.now();
    return new;
  end if;
  if new.is_held is distinct from old.is_held then
    raise exception 'media: only a decision holds an image' using errcode = '42501';
  end if;
  if old.status = 'rejected' or old.post_id is not null or old.listing_id is not null or old.sponsored_product_id is not null then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  if old.kind = 'listing' then
    -- the uploader attaches a listing image to a listing of its own, once (FR-MKT-002; VAL-041: at most 6, by the unique position)
    if new.listing_id is null or new.post_id is not null or new.sponsored_product_id is not null then
      raise exception 'media: this image cannot be attached' using errcode = '42501';
    end if;
    select exists (select 1 from nestly.marketplace_listings l where l.id = new.listing_id and l.owner_id = (select auth.uid())) into v_mine;
    if not v_mine then
      raise exception 'media: the listing is not yours' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.kind = 'sponsored' then
    -- the Admin attaches a sponsored image to a sponsored product it manages, once (FR-ADMIN-009; one image, position 0)
    if new.sponsored_product_id is null or new.post_id is not null or new.listing_id is not null
       or not (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE'))
       or not exists (select 1 from nestly.sponsored_products sp where sp.id = new.sponsored_product_id and sp.status <> 'removed') then
      raise exception 'media: this image cannot be attached' using errcode = '42501';
    end if;
    return new;
  end if;
  -- the uploader attaches an unattached post image to a post of their own, once (FR-FEED-002; VAL-041: at most 4, by the unique position)
  if new.post_id is null or old.kind <> 'post' or new.listing_id is not null or new.sponsored_product_id is not null then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  select exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = (select auth.uid()))
      or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = (select auth.uid()))
    into v_mine;
  if not v_mine then
    raise exception 'media: the post is not yours' using errcode = '42501';
  end if;
  return new;
end
$$;

-- reports: a reported listing must be readable to the reporter and not its own; everything else as 20261022100000.
create or replace function nestly.reports_insert_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target record;
begin
  if new.post_id is not null then
    -- a readable post that is not the reporter's own; absent and unreadable look the same (no oracle)
    select p.author_id into target from nestly.posts p where p.id = new.post_id;
    if not found
       or target.author_id = uid
       or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = uid) then
      raise exception 'reports: the post cannot be reported' using errcode = '42501';
    end if;
  elsif new.comment_id is not null then
    select c.author_id, c.post_id into target from nestly.comments c where c.id = new.comment_id;
    if not found
       or target.author_id = uid
       or (target.author_id is null
           and exists (select 1 from nestly.post_authors pa where pa.post_id = target.post_id and pa.author_id = uid)) then
      raise exception 'reports: the comment cannot be reported' using errcode = '42501';
    end if;
  elsif new.message_id is not null then
    -- the reporter's own read of the message (a party only); its text is not copied (reports_insert_snapshot copies posts and comments only)
    select m.sender_id into target from nestly.messages m where m.id = new.message_id;
    if not found or target.sender_id = uid then
      raise exception 'reports: the message cannot be reported' using errcode = '42501';
    end if;
  elsif new.listing_id is not null then
    -- the reporter's own read of the listing (FR-MKT-001); absent, hidden, expired and unreadable look the same
    select l.owner_id into target from nestly.marketplace_listings l where l.id = new.listing_id;
    if not found or target.owner_id = uid then
      raise exception 'reports: the listing cannot be reported' using errcode = '42501';
    end if;
  elsif new.target_kind = 'listing' then
    raise exception 'reports: a listing report names its listing' using errcode = '23514';
  end if;
  return new;
end
$$;

-- reports: the reported text of a listing is its title (as of the report). The rest is the text of 20261020300000.
create or replace function nestly.reports_insert_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.post_id is not null then
    select p.body into new.target_text from nestly.posts p where p.id = new.post_id;
  elsif new.comment_id is not null then
    select c.body into new.target_text from nestly.comments c where c.id = new.comment_id;
  elsif new.listing_id is not null then
    select l.title into new.target_text from nestly.marketplace_listings l where l.id = new.listing_id;
  end if;
  return new;
end
$$;

-- the training set (Afik 21.10.2026, decisions-in-force.md §9.7: every staff decision on an image feeds the training set except a suspected
-- child abuse): a listing's images become candidates after a listing report is handled with action taken, the listing is hidden, or an image
-- of it is rejected from passed after such a report, as a post's (20261021500000). Everything else as there.
create or replace function nestly.media_training_candidate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post uuid;
  v_listing uuid;
  v_owner uuid;
begin
  if tg_table_name = 'posts' then v_post := new.id;
  elsif tg_table_name = 'marketplace_listings' then v_listing := new.id;
  else v_post := new.post_id; v_listing := new.listing_id;
  end if;
  -- the uploader (a child-safety report on the uploader excludes the image too): the image row's own owner when it fired the trigger, else the
  -- listing's owner or the post's named author (an anonymous post's author is not readable here; its post reports still count)
  if tg_table_name = 'media_assets' then v_owner := new.owner_id;
  elsif v_listing is not null then v_owner := (select l.owner_id from nestly.marketplace_listings l where l.id = v_listing);
  else v_owner := (select p.author_id from nestly.posts p where p.id = v_post);
  end if;
  if current_user <> 'authenticated' or (v_post is null and v_listing is null)
     or not (select nestly.has_permission('REPORTS_VIEW')) or not (select nestly.has_permission('CONTENT_MODERATE')) then
    return null;
  end if;
  insert into nestly.media_training_candidates (media_id)
  select m.id
    from nestly.media_assets m
   where ((v_post is not null and m.post_id = v_post
           and exists (select 1 from nestly.reports r where r.post_id = v_post and r.status = 'handled' and r.resolution = 'action_taken')
           and not exists (select 1 from nestly.reports r where r.post_id = v_post and r.reason = 'child_safety')
           and (m.status = 'rejected'
             or (m.status in ('passed', 'approved') and exists (select 1 from nestly.posts p where p.id = v_post and p.status = 'removed'))))
       or (v_listing is not null and m.listing_id = v_listing
           and exists (select 1 from nestly.reports r where r.listing_id = v_listing and r.status = 'handled' and r.resolution = 'action_taken')
           and not exists (select 1 from nestly.reports r where r.listing_id = v_listing and r.reason = 'child_safety')
           and (m.status = 'rejected'
             or (m.status in ('passed', 'approved') and exists (select 1 from nestly.marketplace_listings l where l.id = v_listing and l.is_hidden)))))
     and (v_owner is null or not exists (select 1 from nestly.reports r where r.reported_user_id = v_owner and r.reason = 'child_safety'))
     and not exists (select 1 from nestly.media_reviews v where v.media_id = m.id and (v.is_suspected or v.queue_reason is not null))
     and (tg_table_name <> 'media_assets' or m.id = new.id)
  on conflict do nothing;
  return null;
end
$$;

drop trigger reports_training_candidate on nestly.reports;
create trigger reports_training_candidate
  after update of status on nestly.reports
  for each row when (new.status = 'handled' and old.status = 'open' and new.resolution = 'action_taken'
    and (new.post_id is not null or new.listing_id is not null))
  execute function nestly.media_training_candidate();

drop trigger media_assets_training_candidate on nestly.media_assets;
create trigger media_assets_training_candidate
  after update of status on nestly.media_assets
  for each row when (new.status = 'rejected' and old.status = 'passed' and (new.post_id is not null or new.listing_id is not null))
  execute function nestly.media_training_candidate();

create trigger marketplace_listings_training_candidate
  after update of is_hidden on nestly.marketplace_listings
  for each row when (new.is_hidden and not old.is_hidden)
  execute function nestly.media_training_candidate();

revoke execute on function nestly.marketplace_listings_update_guard() from public;
revoke execute on function nestly.sponsored_products_update_guard() from public;

create trigger marketplace_listings_update_guard before update on nestly.marketplace_listings
  for each row execute function nestly.marketplace_listings_update_guard();
create trigger sponsored_products_update_guard before update on nestly.sponsored_products
  for each row execute function nestly.sponsored_products_update_guard();

-- 7. The audit trigger, replaced with the marketplace_listings and sponsored_products branches ------------------------------
create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'status_guides' then
    -- FR-ADMIN-012: an Admin-only action (no assignable Permission Key applies). Before/After carry what the guide is, not its text.
    v_action := case
      when tg_op = 'INSERT' then 'guide_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then case v_new ->> 'status'
        when 'published' then 'guide_published' when 'hidden' then 'guide_hidden' else 'guide_unpublished' end
      else 'guide_edited' end;
    v_kind := 'guide';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'stageKind', v_old ->> 'stage_kind', 'rangeFrom', v_old -> 'range_from', 'rangeTo', v_old -> 'range_to',
      'sourceCheckedOn', v_old ->> 'source_checked_on', 'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'stageKind', v_new ->> 'stage_kind',
      'rangeFrom', v_new -> 'range_from', 'rangeTo', v_new -> 'range_to', 'sourceCheckedOn', v_new ->> 'source_checked_on',
      'bodyChars', pg_catalog.char_length(v_new ->> 'body'), 'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on an image (a queued one approved or rejected; a checked one rejected after
    -- a report or as a suspicion). heldAsSuspected: the image is kept 90 days and never enters the training set.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'heldAsSuspected', v_new -> 'is_held');
  elsif tg_table_name = 'media_reviews' then
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told).
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_suspected';
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after');
  elsif tg_table_name = 'support_requests' then
    -- FR-ADMIN-002: a status change of a Support request (the trigger fires only when the status moves).
    v_key := 'SUPPORT_HANDLE';
    v_action := 'support_status_changed';
    v_kind := 'support_request';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'topic', v_new ->> 'topic');
  elsif tg_table_name = 'support_messages' then
    -- FR-ADMIN-002, FR-CHAT-004: a reply in the name of Support or an internal note (the trigger fires only for author_kind 'support').
    -- The entry carries what it was, never the text.
    v_key := 'SUPPORT_HANDLE';
    v_action := case when (v_new ->> 'is_internal')::boolean then 'support_note_added' else 'support_replied' end;
    v_kind := 'support_request';
    v_target := (v_new ->> 'support_request_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('internal', v_new -> 'is_internal', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'));
  elsif tg_table_name = 'reported_message_views' then
    -- §9.6 (Afik 20.10.2026): a staff member opened a reported chat message (only that message; never the conversation).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_message_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'moderator_invitations' then
    -- FR-ADMIN-004: the Admin invites or revokes an invitation (its redemption is audited on staff_roles). Never the code or its hash.
    if tg_op = 'INSERT' then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invited';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_after := pg_catalog.jsonb_build_object('note', v_new ->> 'note', 'expiresAt', v_new ->> 'expires_at');
    elsif v_new ->> 'revoked_at' is not null and v_old ->> 'revoked_at' is null then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invitation_revoked';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_before := pg_catalog.jsonb_build_object('note', v_old ->> 'note');
    else
      raise exception 'audit_trigger: only an invitation issued or revoked is audited here' using errcode = '42501';
    end if;
  elsif tg_table_name = 'staff_roles' then
    -- FR-ADMIN-004: a Moderator created from an invitation (the new staff role exists now, so the entry carries it as the actor).
    v_action := 'moderator_joined';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
  elsif tg_table_name = 'system_announcements' then
    -- FR-ADMIN-008, AC-049: created, edited, published or removed. Before/After carry the status, the title and the body's length.
    v_key := 'SYSTEM_ANNOUNCEMENTS';
    v_action := case
      when tg_op = 'INSERT' then 'announcement_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'announcement_' || (v_new ->> 'status')
      else 'announcement_edited' end;
    v_kind := 'announcement';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'private_group_content_views' then
    -- NFR-PRIV-002, BR-040 (I10): a staff member opened reported Private Group content (only that post or comment; never the Group).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_content_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('targetKind', case when v_new ->> 'post_id' is not null then 'post' else 'comment' end);
  elsif tg_table_name = 'marketplace_listings' then
    -- §3.2 MARKETPLACE_MODERATE (I12): a listing hidden or restored (the trigger fires only when is_hidden moves). Never its title.
    v_key := 'MARKETPLACE_MODERATE';
    v_action := case when (v_new ->> 'is_hidden')::boolean then 'listing_hidden' else 'listing_restored' end;
    v_kind := 'listing';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('hidden', v_old -> 'is_hidden');
    v_after := pg_catalog.jsonb_build_object('hidden', v_new -> 'is_hidden', 'status', v_new ->> 'status', 'category', v_new ->> 'category');
  elsif tg_table_name = 'sponsored_products' then
    -- FR-ADMIN-009, AC-058 (I12): a Sponsored Product created, edited, published, paused or removed (Admin Only key).
    v_key := 'SPONSORED_PRODUCT_MANAGE';
    v_action := case
      when tg_op = 'INSERT' then 'sponsored_product_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'sponsored_product_' || (v_new ->> 'status')
      else 'sponsored_product_edited' end;
    v_kind := 'sponsored_product';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'sponsor', v_old ->> 'sponsor_name', 'category', v_old ->> 'category', 'linkUrl', v_old ->> 'link_url') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'sponsor', v_new ->> 'sponsor_name',
      'category', v_new ->> 'category', 'linkUrl', v_new ->> 'link_url',
      'descriptionChanged', tg_op = 'UPDATE' and v_new ->> 'description' is distinct from v_old ->> 'description');
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger marketplace_listings_moderation_audit
  after update of is_hidden on nestly.marketplace_listings
  for each row when (old.is_hidden is distinct from new.is_hidden) execute function nestly.audit_trigger();
create trigger sponsored_products_audit_insert
  after insert on nestly.sponsored_products
  for each row execute function nestly.audit_trigger();
create trigger sponsored_products_audit_update
  after update on nestly.sponsored_products
  for each row when (old.* is distinct from new.*) execute function nestly.audit_trigger();

-- 8. RLS, grants and policies ---------------------------------------------------------------------------------------------
alter table nestly.marketplace_listings enable row level security, force row level security;
alter table nestly.sponsored_products enable row level security, force row level security;

revoke all on table nestly.marketplace_listings, nestly.sponsored_products from public, anon, authenticated;

-- The owner's status copy and type, and the staff member who hid a listing, are never granted for SELECT (the Audit Log names the actor).
grant select (id, owner_id, title, category, item_condition, price, city, status, sold_at, is_hidden, hidden_at, expires_at, created_at, updated_at)
  on table nestly.marketplace_listings to authenticated;
grant insert (title, category, item_condition, price, city) on table nestly.marketplace_listings to authenticated;
grant update (title, category, item_condition, price, city, status, is_hidden) on table nestly.marketplace_listings to authenticated;
grant delete on table nestly.marketplace_listings to authenticated;
grant select (id, sponsor_name, title, description, category, link_url, status, published_at, created_at, updated_at)
  on table nestly.sponsored_products to authenticated;
grant insert (sponsor_name, title, description, category, link_url) on table nestly.sponsored_products to authenticated;
grant update (sponsor_name, title, description, category, link_url, status) on table nestly.sponsored_products to authenticated;
grant select (listing_id, sponsored_product_id) on table nestly.media_assets to authenticated;
grant update (listing_id, sponsored_product_id) on table nestly.media_assets to authenticated;
grant select (listing_id, sponsored_product_id) on table nestly.media_assets to app_media_jobs;
grant insert (listing_id) on table nestly.conversations to authenticated;
grant insert (listing_id) on table nestly.reports to authenticated;

-- marketplace_listings.
create policy marketplace_listings_select_viewer on nestly.marketplace_listings
  for select to authenticated
  using ((select nestly.is_active_account()) and (owner_id = (select auth.uid())
    or (status = 'active' and not is_hidden and expires_at > now() and owner_status = 'active'
        and owner_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
        and not exists (select 1 from nestly.reports r where r.reporter_id = (select auth.uid()) and r.listing_id = marketplace_listings.id))));

create policy marketplace_listings_select_staff on nestly.marketplace_listings
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('MARKETPLACE_MODERATE')));

create policy marketplace_listings_insert_owner on nestly.marketplace_listings
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and owner_status = 'active'
    and status = 'active' and not is_hidden and (select nestly.caller_account_type()) = 'regular');

create policy marketplace_listings_update_owner on nestly.marketplace_listings
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()));

create policy marketplace_listings_update_staff on nestly.marketplace_listings
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('MARKETPLACE_MODERATE')))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('MARKETPLACE_MODERATE')));

create policy marketplace_listings_delete_owner on nestly.marketplace_listings
  for delete to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()));

-- sponsored_products.
create policy sponsored_products_select_viewer on nestly.sponsored_products
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'published');

create policy sponsored_products_select_manager on nestly.sponsored_products
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE')));

create policy sponsored_products_insert_manager on nestly.sponsored_products
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE'))
    and created_by = (select auth.uid()) and status = 'draft' and published_at is null);

create policy sponsored_products_update_manager on nestly.sponsored_products
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE')) and status <> 'removed')
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE')));

-- media_assets: listing and sponsored images (the I5 policies, widened).
drop policy media_assets_select_viewer on nestly.media_assets;
create policy media_assets_select_viewer on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_status = 'active' and status in ('passed', 'approved') and (
    (kind = 'post' and post_id is not null and exists (select 1 from nestly.posts p where p.id = media_assets.post_id))
    or (kind = 'profile' and exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id))
    or (kind = 'story' and exists (select 1 from nestly.stories s where s.media_id = media_assets.id))
    or (kind = 'listing' and listing_id is not null
        and exists (select 1 from nestly.marketplace_listings l where l.id = media_assets.listing_id))
    or (kind = 'sponsored' and sponsored_product_id is not null
        and exists (select 1 from nestly.sponsored_products sp where sp.id = media_assets.sponsored_product_id))));

drop policy media_assets_insert_owner on nestly.media_assets;
create policy media_assets_insert_owner on nestly.media_assets
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and owner_status = 'active'
    and status = 'pending' and post_id is null and listing_id is null and sponsored_product_id is null and position is null
    and not is_held and not is_file_removed
    and ((kind not in ('listing', 'sponsored') and (select nestly.caller_account_type()) in ('regular', 'professional'))
      or (kind = 'listing' and (select nestly.caller_account_type()) = 'regular')
      or (kind = 'sponsored' and (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE')))));

drop policy media_assets_update_owner on nestly.media_assets;
create policy media_assets_update_owner on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and kind in ('post', 'listing', 'sponsored')
    and post_id is null and listing_id is null and sponsored_product_id is null)
  with check (owner_id = (select auth.uid()) and num_nonnulls(post_id, listing_id, sponsored_product_id) = 1);

drop policy media_assets_delete_jobs on nestly.media_assets;
create policy media_assets_delete_jobs on nestly.media_assets
  for delete to app_media_jobs
  using (
    (is_held and exists (select 1 from nestly.media_reviews r where r.media_id = media_assets.id and r.purge_after <= now())
      -- a sample of it is deleted first (it is deletable while this row says held): it never outlives the row that marks it suspected
      and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = media_assets.id))
    or (not is_held and status <> 'queued' and (status <> 'rejected' or is_file_removed) and (
      (kind = 'story' and created_at <= now() - interval '25 hours'
        and not exists (select 1 from nestly.stories s where s.media_id = media_assets.id and s.expires_at > now()))
      or (status = 'rejected' and decided_at <= now() - interval '30 days')
      or (kind in ('post', 'listing', 'sponsored') and post_id is null and listing_id is null and sponsored_product_id is null
          and created_at <= now() - interval '24 hours')
      or (kind = 'profile' and created_at <= now() - interval '24 hours'
        and not exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id)))));

-- media_training_candidates: a listing's image as a post's (§9.7); the I5 policy, widened.
drop policy media_training_candidates_insert_staff on nestly.media_training_candidates;
create policy media_training_candidates_insert_staff on nestly.media_training_candidates
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (
      select 1 from nestly.media_assets m
      where m.id = media_training_candidates.media_id
        and not exists (select 1 from nestly.media_reviews v where v.media_id = m.id and (v.is_suspected or v.queue_reason is not null))
        and ((m.post_id is not null
              and exists (select 1 from nestly.reports r where r.post_id = m.post_id and r.status = 'handled' and r.resolution = 'action_taken')
              and not exists (select 1 from nestly.reports r where r.post_id = m.post_id and r.reason = 'child_safety')
              and (m.status = 'rejected'
                or (m.status in ('passed', 'approved') and exists (select 1 from nestly.posts p where p.id = m.post_id and p.status = 'removed'))))
          or (m.listing_id is not null
              and exists (select 1 from nestly.reports r where r.listing_id = m.listing_id and r.status = 'handled' and r.resolution = 'action_taken')
              and not exists (select 1 from nestly.reports r where r.listing_id = m.listing_id and r.reason = 'child_safety')
              and (m.status = 'rejected'
                or (m.status in ('passed', 'approved')
                    and exists (select 1 from nestly.marketplace_listings l where l.id = m.listing_id and l.is_hidden)))))));

-- conversations. As 20261022400000, plus (FR-MKT-005, FR-CHAT-002, BR-007, AC-059): an active Regular or Professional opens one with the
-- owner of an active listing it can read (the listing's own policy: not hidden, not expired, an active owner, no user block, not reported
-- by the caller), never about its own listing.
drop policy conversations_insert_party on nestly.conversations;
create policy conversations_insert_party on nestly.conversations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select auth.uid()) in (user_a, user_b)
    and a_status = 'active' and b_status = 'active'
    and (case when user_a = (select auth.uid()) then user_b else user_a end) <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and ((context = 'friends' and exists (
           select 1 from nestly.friendships f where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id) = conversations.user_a and greatest(f.requester_id, f.addressee_id) = conversations.user_b))
      or (context = 'request' and exists (
           select 1 from nestly.chat_requests r where r.id = conversations.chat_request_id and r.status = 'accepted'
            and least(r.requester_id, r.target_id) = conversations.user_a and greatest(r.requester_id, r.target_id) = conversations.user_b))
      or (context = 'professional' and (select nestly.caller_account_type()) = 'regular' and exists (
           select 1 from nestly.professional_profiles pp
            where pp.user_id =(case when conversations.user_a = (select auth.uid()) then conversations.user_b else conversations.user_a end)))
      or (context = 'outreach' and exists (
           select 1 from nestly.outreach_requests o where o.id = conversations.outreach_request_id and o.status = 'accepted'
            and o.professional_id <> (select auth.uid())
            and least(o.professional_id, (select auth.uid())) = conversations.user_a
            and greatest(o.professional_id, (select auth.uid())) = conversations.user_b))
      or (context = 'marketplace' and (select nestly.caller_account_type()) in ('regular', 'professional') and exists (
           select 1 from nestly.marketplace_listings l where l.id = conversations.listing_id
            and l.status = 'active' and not l.is_hidden and l.expires_at > now()
            and l.owner_id <> (select auth.uid())
            and l.owner_id = (case when conversations.user_a = (select auth.uid()) then conversations.user_b else conversations.user_a end)))));

-- reports: a listing report is handled with MARKETPLACE_MODERATE (§3.2); the rest as 20261022100000.
drop policy reports_update_staff on nestly.reports;
create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case when target_kind in ('user', 'message')
           then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                 or (select nestly.has_permission('USER_BAN')))
           when target_kind = 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled');

-- regular_names: the owner's name of a listing the caller can read (under the listing's own policies). The restrictive block policy holds.
create policy regular_names_select_listing_reader on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.marketplace_listings l where l.owner_id = regular_names.user_id));

-- 9. Comments ---------------------------------------------------------------------------------------------------------------
comment on table nestly.marketplace_listings is
  'SRS MarketplaceListing (§13, FR-MKT-002, BR-017, VAL-013, AC-019; OP-012 closed 18.10.2026): a Regular''s item for sale or to give away, a commercial entity of its own, never a post. Expires 60 days after it was published; the owner marks it sold/given. No payment, purchase or delivery (BR-069, AC-097). Read by every active account while active, visible and unexpired (owner active, no user block, not reported by the reader); the owner reads its own; MARKETPLACE_MODERATE reads all and hides or restores.';
comment on column nestly.marketplace_listings.id is 'The listing id.';
comment on column nestly.marketplace_listings.owner_id is 'The Regular who published it (default auth.uid(), rule 12). Read with the listing: the contact is a chat with them (FR-MKT-005).';
comment on column nestly.marketplace_listings.owner_account_type is 'Always regular: with the composite FK to users (id, account_type) only a Regular publishes a listing (FR-MKT-002). Never granted.';
comment on column nestly.marketplace_listings.owner_status is 'Copy of the owner''s users.status (FK, ON UPDATE CASCADE): a suspended owner''s listings are hidden. Never granted.';
comment on column nestly.marketplace_listings.title is 'FR-MKT-002: the title, 2 to 80 characters after trimming.';
comment on column nestly.marketplace_listings.category is 'FR-MKT-002: the product category, from the list in packages/shared (the SRS list is TBD; default list, I12). Also an Intent Signal topic (FR-ALG-008).';
comment on column nestly.marketplace_listings.item_condition is 'FR-MKT-002: new, like_new, good or used (the SRS list is TBD; default list, I12).';
comment on column nestly.marketplace_listings.price is 'FR-MKT-002: the asking price in whole shekels, 1 to 100000; NULL = "למסירה" (to give away). Shown only; no payment in the product (BR-069).';
comment on column nestly.marketplace_listings.city is 'FR-MKT-002, §12: a city or area from the list in packages/shared (the same list as professional_profiles.area); no GPS.';
comment on column nestly.marketplace_listings.status is 'active, or sold ("נמכר/נמסר", marked by the owner; it can be put back). A sold listing leaves the Marketplace.';
comment on column nestly.marketplace_listings.sold_at is 'When the owner marked it sold/given, the database clock; NULL exactly while active.';
comment on column nestly.marketplace_listings.is_hidden is '§3.2 MARKETPLACE_MODERATE: hidden by staff (audited); only staff change it. A hidden listing is read by its owner and staff only.';
comment on column nestly.marketplace_listings.hidden_at is 'When staff hid it, the database clock; NULL exactly while not hidden.';
comment on column nestly.marketplace_listings.hidden_by is 'The staff member who hid it (set by the guard). Never granted: the Audit Log names the actor.';
comment on column nestly.marketplace_listings.expires_at is 'FR-MKT-002: 60 days after publication, set by the database (no client writes it); after it the listing leaves the Marketplace (its owner still reads it).';
comment on column nestly.marketplace_listings.created_at is 'When the listing was published. UTC. A freshness signal (FR-ALG-006).';
comment on column nestly.marketplace_listings.updated_at is 'The last edit of its content or status by its owner, the database clock.';
comment on index nestly.marketplace_listings_live_idx is 'The Marketplace: active, visible listings, newest first (FR-MKT-001, FR-ALG-006).';
comment on index nestly.marketplace_listings_owner_created_idx is 'An owner''s listings, newest first ("My listings").';
comment on index nestly.marketplace_listings_hidden_by_idx is 'The hidden_by FK (SET NULL when a staff account goes).';

comment on table nestly.sponsored_products is
  'SRS SponsoredProduct (§13, FR-ADMIN-009, BR-046, AC-058): a company''s or sponsor''s product, created and managed by the Admin only (SPONSORED_PRODUCT_MANAGE, Admin Only), always marked as sponsored (BR-005, AC-008). draft -> published <-> paused; removed is final. Every write is audited. Every active account reads a published one.';
comment on column nestly.sponsored_products.id is 'The sponsored product id.';
comment on column nestly.sponsored_products.sponsor_name is 'The company, brand or sponsor shown with the product (FR-MKT-003), 2 to 80 characters.';
comment on column nestly.sponsored_products.title is 'The title, 2 to 80 characters.';
comment on column nestly.sponsored_products.description is 'Optional text, up to 1000 characters. A sample coupon for the demo says here that it is a sample (OP-023).';
comment on column nestly.sponsored_products.category is 'The product category (the same list as marketplace_listings.category): its relevance in the Marketplace (FR-ALG-006).';
comment on column nestly.sponsored_products.link_url is 'The commercial follow-up action (FR-MKT-005): an https address of the sponsor''s page (no user part: the host shown is the host opened), optional, up to 500 characters. Opened outside the product; no purchase in Nestly (BR-069).';
comment on column nestly.sponsored_products.status is 'draft, published, paused or removed (FR-ADMIN-009: Create / Edit / Publish / Pause / Remove). Only published is shown to users.';
comment on column nestly.sponsored_products.created_by is 'The Admin who created it (default auth.uid()). Never granted: the Audit Log names the actor.';
comment on column nestly.sponsored_products.published_at is 'The first publication, the database clock (sponsored_products_update_guard).';
comment on column nestly.sponsored_products.created_at is 'When it was created. UTC.';
comment on column nestly.sponsored_products.updated_at is 'The last change of its content or status, the database clock.';
comment on index nestly.sponsored_products_published_idx is 'The published sponsored products, newest first (the Marketplace''s sponsored units).';
comment on index nestly.sponsored_products_created_by_idx is 'The created_by FK (SET NULL when the account goes).';

comment on column nestly.media_assets.kind is 'post, profile, story (I5), listing or sponsored (I12).';
comment on column nestly.media_assets.listing_id is 'The listing a listing image is attached to (once, by its uploader, the listing''s owner); at most 6 by position 0-5 (VAL-041). SET NULL when the listing is deleted: the job then removes the image after a day.';
comment on column nestly.media_assets.sponsored_product_id is 'The sponsored product a sponsored image is attached to (once, by the Admin who uploaded it); one image, position 0. SET NULL when the product row goes.';
comment on column nestly.media_assets.position is 'The image''s place: 0-3 in a post, 0-5 in a listing, 0 for a sponsored product; NULL until attached (and for profile and Story images).';
comment on constraint media_assets_listing_id_position_key on nestly.media_assets is 'VAL-041: at most 6 images per listing, one per position.';
comment on constraint media_assets_sponsored_product_id_position_key on nestly.media_assets is 'One image per sponsored product.';

comment on column nestly.conversations.context is 'friends, request (I8), professional (FR-SERV-004), outreach (FR-SERV-006) or marketplace (opened from an active listing with its owner, FR-MKT-005, AC-059).';
comment on column nestly.conversations.listing_id is 'The listing a marketplace conversation was opened from (FR-MKT-005); SET NULL when the listing is deleted. Only on context marketplace.';
comment on index nestly.conversations_listing_id_idx is 'The listing FK (SET NULL on delete).';

comment on column nestly.reports.target_kind is 'post, comment, user, message or listing; survives the target''s SET NULL.';
comment on column nestly.reports.listing_id is 'The reported listing (I12). SET NULL when its owner deletes it: the report stays for staff with the copied title (target_text). Handled with MARKETPLACE_MODERATE.';
comment on constraint reports_reporter_listing_key on nestly.reports is 'One report per reporter and listing (ERR-046).';
comment on index nestly.reports_listing_id_idx is 'The reports on a listing (staff screens, the FK).';

comment on function nestly.marketplace_listings_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The id and the owner never change; a client never changes the expiry or created_at. A change of is_hidden needs MARKETPLACE_MODERATE and changes nothing else (hidden_at, hidden_by set here); every other change is the owner''s (sold_at and updated_at are the database clock). A cascade passes.';
comment on function nestly.sponsored_products_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. draft -> published | removed, published -> paused | removed, paused -> published | removed; published_at is the first publication; updated_at the database clock; the creator and created_at never change.';
comment on function nestly.media_assets_update_guard() is 'SECURITY INVOKER. Who may change which column of media_assets: the job moves a pending image to passed or queued (a queued one has its reason first) and records a rejected image''s removed file; staff with CONTENT_MODERATE decide a queued image, or reject a checked one with REPORTS_VIEW after a report (on its post, its listing or its uploader) or as a suspicion (who, when and the hold set here); the uploader attaches an unattached post image to a post of their own, a listing image to a listing of their own, or (SPONSORED_PRODUCT_MANAGE) a sponsored image to a sponsored product.';
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert on reports: the reported post, comment, message or listing must be readable to the reporter (absent and unreadable look the same) and not their own; a listing report names its listing.';
comment on function nestly.reports_insert_snapshot() is 'SECURITY INVOKER. Before insert on reports: copies the reported post or comment text, or the listing''s title, read under the reporter''s RLS.';
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one, a System Announcement created, edited, published or removed, a staff view of reported Private Group content, a Marketplace listing hidden or restored, or a Sponsored Product created, edited, published, paused or removed: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

comment on function nestly.media_training_candidate() is 'SECURITY INVOKER, in the moderator''s transaction. After a post or listing report is handled with action taken, a reported post is removed or a reported listing hidden, or an image is rejected from passed after such a report: the post''s or listing''s images that passed and are now removed become training candidates, unless a report on it is a child-safety report or the image is suspected (decisions-in-force.md §9.7).';
comment on trigger media_assets_training_candidate on nestly.media_assets is 'An image rejected from passed after a handled report (on its post or its listing) becomes a training candidate (unless suspected or after a child-safety report).';
comment on trigger marketplace_listings_training_candidate on nestly.marketplace_listings is 'A listing hidden after a handled report: its checked images become training candidates (unless suspected or after a child-safety report).';
comment on policy media_training_candidates_insert_staff on nestly.media_training_candidates is 'CONTENT_MODERATE with REPORTS_VIEW, in the trigger: an image removed after a handled post or listing report (action taken), never with a child-safety report on it, never a queued-path or suspected image.';
comment on trigger marketplace_listings_moderation_audit on nestly.marketplace_listings is 'A listing hidden or restored by staff is appended to the Audit Log in the same transaction (rule 18).';
comment on trigger sponsored_products_audit_insert on nestly.sponsored_products is 'A Sponsored Product created is appended to the Audit Log (FR-ADMIN-009).';
comment on trigger sponsored_products_audit_update on nestly.sponsored_products is 'A Sponsored Product edited, published, paused or removed is appended to the Audit Log (FR-ADMIN-009).';

comment on policy marketplace_listings_select_viewer on nestly.marketplace_listings is 'The owner reads its own; every active account reads an active, visible, unexpired listing of an active owner with no user block between them and that it has not reported (FR-MKT-001).';
comment on policy marketplace_listings_select_staff on nestly.marketplace_listings is 'MARKETPLACE_MODERATE reads every listing (hidden, sold and expired included).';
comment on policy marketplace_listings_insert_owner on nestly.marketplace_listings is 'An active Regular publishes its own listing, active and visible (FR-MKT-002).';
comment on policy marketplace_listings_update_owner on nestly.marketplace_listings is 'The owner edits its listing and marks it sold/given (column grant; the guard keeps it off is_hidden).';
comment on policy marketplace_listings_update_staff on nestly.marketplace_listings is 'MARKETPLACE_MODERATE hides or restores a listing (the guard allows nothing else; audited).';
comment on policy marketplace_listings_delete_owner on nestly.marketplace_listings is 'The owner deletes its listing (gone at once; its images and conversations lose the link).';
comment on policy sponsored_products_select_viewer on nestly.sponsored_products is 'Every active account reads a published sponsored product (FR-MKT-001).';
comment on policy sponsored_products_select_manager on nestly.sponsored_products is 'SPONSORED_PRODUCT_MANAGE (Admin Only) reads every sponsored product (FR-ADMIN-009).';
comment on policy sponsored_products_insert_manager on nestly.sponsored_products is 'SPONSORED_PRODUCT_MANAGE creates a draft (BR-046, AC-058); audited.';
comment on policy sponsored_products_update_manager on nestly.sponsored_products is 'SPONSORED_PRODUCT_MANAGE edits, publishes, pauses or removes a sponsored product that is not removed; audited.';
comment on policy media_assets_select_viewer on nestly.media_assets is 'Others read an image only after it passed or was approved, through a post, profile photo, Story, listing or sponsored product they can read.';
comment on policy media_assets_insert_owner on nestly.media_assets is 'A Regular or Professional uploads a post, profile or Story image; a Regular a listing image; SPONSORED_PRODUCT_MANAGE a sponsored image; always pending and unattached.';
comment on policy media_assets_update_owner on nestly.media_assets is 'The uploader attaches an unattached post, listing or sponsored image (the guard checks the post, the listing or the product).';
comment on policy media_assets_delete_jobs on nestly.media_assets is 'Rule 6 exception (BR-077, M6): a held image 90 days after the suspicion; otherwise never a queued or held image, and a rejected one only after its file is gone: an expired Story''s image, a rejected image 30 days after the decision, a post, listing or sponsored image never attached (or whose listing went) within a day, a profile image that is no one''s photo after a day.';
comment on policy conversations_insert_party on nestly.conversations is
  'A party opens a conversation: Friends (FR-CHAT-002), a pair''s accepted chat request (I8), a Regular with an active Professional (FR-SERV-004, AC-010), the author of an accepted Offer Help with its Professional (FR-SERV-006, AC-013), or a Regular or Professional with the owner of an active listing it can read (FR-MKT-005, AC-059). Never across a user block.';
comment on policy reports_update_staff on nestly.reports is 'REPORTS_VIEW closes an open report as handled; a post or comment report needs CONTENT_MODERATE, a user or message report a user key (USER_WARN, USER_SUSPEND or USER_BAN), a listing report MARKETPLACE_MODERATE.';
comment on policy regular_names_select_listing_reader on nestly.regular_names is 'An active account reads the name of the owner of a listing it can read (FR-MKT-005: the seller is named on the listing).';
