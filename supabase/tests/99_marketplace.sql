-- pgTAP, run by pg_prove as app_server (CI `db` job, I12: Marketplace; FR-MKT-001/002/003/005, FR-ADMIN-009, FR-CHAT-002 (the Marketplace
-- exception), BR-005, BR-007, BR-017, BR-018, BR-046, BR-069, VAL-013, VAL-041, AC-008, AC-019, AC-020, AC-021, AC-058, AC-059, AC-097;
-- decisions-in-force.md §3 items 11-12 and §9.7).
-- Source of expected values: the SRS and Afik's decisions (who publishes, reads, edits, hides and reports a listing; who manages a Sponsored
-- Product; who contacts a seller; which images others see), not the migration text.
-- People: a, b (Regular), s (suspended Regular), p (the identity fixtures' Professional), d = fr_d (Admin), m1 = sf_m1 (Moderator, no key),
-- m4 = sf_m4 (MARKETPLACE_MODERATE, REPORTS_VIEW, CONTENT_MODERATE), m5 = sf_m5 (REPORTS_VIEW, CONTENT_MODERATE: no Marketplace key).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F12.1-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_sf_grant(tests.fx_sf_id('sf_m4'), array['MARKETPLACE_MODERATE', 'REPORTS_VIEW', 'CONTENT_MODERATE']);
select tests.fx_sf_grant(tests.fx_sf_id('sf_m5'), array['REPORTS_VIEW', 'CONTENT_MODERATE']);

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 's' then tests.fx_id('s') when 'p' then tests.fx_id('p')
    when 'd' then tests.fx_fr_id('fr_d') when 'm1' then tests.fx_sf_id('sf_m1') when 'm4' then tests.fx_sf_id('sf_m4')
    when 'm5' then tests.fx_sf_id('sf_m5')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create temporary table ids (k text primary key, v uuid not null);
grant all on ids to public;
create function pg_temp.v(p_k text) returns uuid language sql as $f$ select v from pg_temp.ids where k = p_k $f$;
create function pg_temp.keep(p_k text, p_v text) returns text language plpgsql as $f$
begin
  if p_v is null or p_v !~ '^[0-9a-f-]{36}$' then return coalesce(p_v, 'null'); end if;
  insert into pg_temp.ids values (p_k, p_v::uuid);
  return 'kept';
end
$f$;
-- a listing published by p_who, its id kept as p_k
create function pg_temp.list(p_who text, p_k text, p_title text, p_price int default 450, p_cat text default 'strollers') returns text language sql as $f$
  select pg_temp.keep(p_k, pg_temp.q(p_who, format($q$ insert into nestly.marketplace_listings (title, category, item_condition, price, city)
    values (%L, %L, 'like_new', %s, 'tel_aviv') returning id::text $q$, p_title, p_cat, coalesce(p_price::text, 'null'))))
$f$;
create function pg_temp.sees(p_who text, p_k text) returns text language sql as $f$
  select pg_temp.q(p_who, format('select count(*)::text from nestly.marketplace_listings where id = %L', pg_temp.v(p_k)))
$f$;
create function pg_temp.up(p_who text, p_kind text, p_k text) returns text language sql as $f$
  select pg_temp.keep(p_k, pg_temp.q(p_who, format($q$ insert into nestly.media_assets (kind, mime, width, height, byte_size)
    values (%L, 'image/webp', 800, 600, 120000) returning id::text $q$, p_kind)))
$f$;
create function pg_temp.pass(p_k text) returns text language sql as $f$
  select tests.media_dml(format('update nestly.media_assets set status = ''passed'' where id = %L', pg_temp.v(p_k)))
$f$;
create function pg_temp.open_conv(p_by text, p_with text, p_listing uuid) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.conversations (context, user_a, user_b, listing_id) values ('marketplace', %L, %L, %L) $q$,
    least(pg_temp.id(p_by), pg_temp.id(p_with)), greatest(pg_temp.id(p_by), pg_temp.id(p_with)), p_listing))
$f$;
create function pg_temp.report(p_by text, p_listing uuid, p_reason text default 'spam') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.reports (target_kind, listing_id, reason) values ('listing', %L, %L) $q$, p_listing, p_reason))
$f$;

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('marketplace_listings', 'sponsored_products') and c.relrowsecurity and c.relforcerowsecurity), 2::bigint,
  '[F12.1-a c1] the two new tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('marketplace_listings', 'sponsored_products') and pl.polname !~ '_(auto_hide|delete_staff|deletion_jobs|expiry_jobs)$'),
  'marketplace_listings.marketplace_listings_delete_owner:d, marketplace_listings.marketplace_listings_insert_owner:a, marketplace_listings.marketplace_listings_select_analytics:r, '
  || 'marketplace_listings.marketplace_listings_select_staff:r, marketplace_listings.marketplace_listings_select_viewer:r, '
  || 'marketplace_listings.marketplace_listings_update_owner:w, marketplace_listings.marketplace_listings_update_staff:w, '
  || 'sponsored_products.sponsored_products_insert_manager:a, sponsored_products.sponsored_products_select_manager:r, '
  || 'sponsored_products.sponsored_products_select_viewer:r, sponsored_products.sponsored_products_update_manager:w',
  '[F12.1-a c1] exactly these policies: staff never delete a listing outside a justified decision (completion B, file 103), nobody deletes a Sponsored Product (removed is a status); the SRS-audit fixes add the analytics read (file 102) (I9: the deletion job''s *_deletion_jobs reads TO app_jobs, file 110)');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('marketplace_listings', 'sponsored_products') and pl.polname !~ '_auto_hide$' and pl.polname !~ '_(deletion|expiry)_jobs$' -- I9 and I12-B (file 120): the deletion job''s reads TO app_jobs (rule 6, file 110)
            and (pl.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[] or not pl.polpermissive
                 or (coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), '')) !~ 'is_active_account\(\)')),
  0::bigint, '[F12.1-a c1 platform r15] every policy of the new tables is permissive, TO authenticated and gated by is_active_account()');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('marketplace_listings', 'sponsored_products') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'marketplace_listings.category, marketplace_listings.city, marketplace_listings.description, marketplace_listings.item_condition, marketplace_listings.price, marketplace_listings.title, '
  || 'sponsored_products.category, sponsored_products.description, sponsored_products.link_url, sponsored_products.sponsor_name, sponsored_products.title',
  '[F12.1-a c1 conventions] INSERT per column: never an owner, a status, a hide, an expiry or a clock');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('marketplace_listings', 'sponsored_products') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'marketplace_listings.category, marketplace_listings.city, marketplace_listings.description, marketplace_listings.is_hidden, marketplace_listings.item_condition, marketplace_listings.price, '
  || 'marketplace_listings.status, marketplace_listings.title, '
  || 'sponsored_products.category, sponsored_products.description, sponsored_products.link_url, sponsored_products.sponsor_name, sponsored_products.status, '
  || 'sponsored_products.title',
  '[F12.1-a c1 conventions] UPDATE per column: never the owner, the expiry, the publication time or a clock');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('marketplace_listings', 'sponsored_products') and a.attnum > 0 and not a.attisdropped
              and not has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'marketplace_listings.hidden_by, marketplace_listings.owner_account_type, marketplace_listings.owner_status, sponsored_products.created_by',
  '[F12.1-a c1] never readable: the owner''s status copy and type, and which staff member hid or created (the Audit Log names the actor)');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname in ('marketplace_listings_update_guard', 'sponsored_products_update_guard', 'media_training_candidate')),
  0::bigint, '[F12.1-a c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('marketplace_listings', 'sponsored_products')
            and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[F12.1-a c1 rule 7] anon holds nothing on the new tables');
select is((select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname = 'marketplace_listings'
              and a.attname ~ '(payment|purchase|order|delivery|shipping|buyer|card)'),
  0::bigint, '[F12.1-a c1 BR-069 AC-097] no payment, purchase or delivery column');

-- ---- publishing a listing (FR-MKT-002, BR-017, VAL-013, AC-019) ------------------------------------------------------------
select is(pg_temp.list('a', 'l1', 'עגלת תינוק'), 'kept', '[F12.1-a c2 FR-MKT-002] a Regular publishes a listing');
select is(pg_temp.list('a', 'l_free', 'בגדי תינוק', null, 'clothing'), 'kept', '[F12.1-a c2 FR-MKT-002] for free ("למסירה": no price)');
select is(pg_temp.list('p', 'x', 'מוצר מקצועי'), 'ERR:42501', '[F12.1-a c2 FR-MKT-002] a Professional does not publish a listing');
select is(pg_temp.list('d', 'x', 'מוצר מנהל'), 'ERR:42501', '[F12.1-a c2 BR-034] an Admin does not publish a listing');
select is(pg_temp.list('m4', 'x', 'מוצר מודרטור'), 'ERR:42501', '[F12.1-a c2 BR-034] a Moderator does not publish a listing');
select is(pg_temp.list('s', 'x', 'מוצר מושעה'), 'ERR:42501', '[F12.1-a c2 rule 15] a suspended account does not publish');
select is(pg_temp.list('a', 'x', 'מחיר אפס', 0), 'ERR:23514', '[F12.1-a c2 VAL-013] a price is at least 1 shekel');
select is(pg_temp.list('a', 'x', 'מחיר גבוה', 100001), 'ERR:23514', '[F12.1-a c2 VAL-013] and at most 100,000');
select is(pg_temp.list('a', 'x', 'א'), 'ERR:23514', '[F12.1-a c2 VAL-013] a title of 2 to 80 characters');
select is(pg_temp.list('a', 'x', repeat('א', 81)), 'ERR:23514', '[F12.1-a c2 VAL-013] not 81');
select is(pg_temp.list('a', 'x', 'רכב', 450, 'cars'), 'ERR:23514', '[F12.1-a c2] a category from the list');
select is(pg_temp.dml('a', $q$ insert into nestly.marketplace_listings (title, category, item_condition, city) values ('מיטה', 'furniture', 'broken', 'haifa') $q$),
  'ERR:23514', '[F12.1-a c2] a condition from the list');
select is(pg_temp.dml('a', $q$ insert into nestly.marketplace_listings (title, category, item_condition, city) values ('מיטה', 'furniture', 'good', 'mars') $q$),
  'ERR:23514', '[F12.1-a c2 §12] a city or area from the list');
select is(pg_temp.dml('a', format($q$ insert into nestly.marketplace_listings (owner_id, title, category, item_condition, city) values (%L, 'מיטה', 'furniture', 'good', 'haifa') $q$, pg_temp.id('b'))),
  'ERR:42501', '[F12.1-a c2 rule 12] the owner is the database''s (never granted)');
select is(pg_temp.dml('a', $q$ insert into nestly.marketplace_listings (title, category, item_condition, city, is_hidden) values ('מיטה', 'furniture', 'good', 'haifa', true) $q$),
  'ERR:42501', '[F12.1-a c2] never published hidden');
select is(pg_temp.q('a', format($q$ select (expires_at - created_at = interval '60 days')::text from nestly.marketplace_listings where id = %L $q$, pg_temp.v('l1'))),
  'true', '[F12.1-a c2 decisions §3.11] a listing expires 60 days after it was published');

-- ---- reading (FR-MKT-001, AC-020) --------------------------------------------------------------------------------------------
select is(pg_temp.sees('b', 'l1'), '1', '[F12.1-a c3 FR-MKT-001] a Regular reads an active listing');
select is(pg_temp.sees('p', 'l1'), '1', '[F12.1-a c3 FR-MKT-001] a Professional reads it');
select is(pg_temp.sees('m1', 'l1'), '1', '[F12.1-a c3] staff read it as any active account');
select is(pg_temp.sees('s', 'l1'), '0', '[F12.1-a c3 rule 15] a suspended account reads none');
select is(pg_temp.q('b', format('select title || ''/'' || coalesce(price::text, ''free'') || ''/'' || status from nestly.marketplace_listings where id = %L', pg_temp.v('l1'))),
  'עגלת תינוק/450/active', '[F12.1-a c3 FR-MKT-001] title, price and status');
select is(pg_temp.q('b', format('select coalesce(price::text, ''free'') from nestly.marketplace_listings where id = %L', pg_temp.v('l_free'))),
  'free', '[F12.1-a c3] a listing for free has no price');
select is(pg_temp.q('b', format('select owner_id::text from nestly.marketplace_listings where id = %L', pg_temp.v('l1'))), pg_temp.id('a')::text,
  '[F12.1-a c3 FR-MKT-005] the seller is named on the listing (the contact)');
select is(pg_temp.q('p', format('select full_name from nestly.regular_names where user_id = %L', pg_temp.id('a'))), 'Alice Aaron',
  '[F12.1-a c3 FR-MKT-005] the seller''s name is readable with a listing the reader can read');

-- ---- editing, sold/given (FR-MKT-002, decisions §3.11) -----------------------------------------------------------------------
select is(pg_temp.dml('b', format('update nestly.marketplace_listings set title = ''נפרץ'' where id = %L', pg_temp.v('l1'))), 'OK:0',
  '[F12.1-a c4] nobody edits another''s listing');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set title = ''עגלת תינוק כחולה'', price = 400 where id = %L', pg_temp.v('l1'))), 'OK:1',
  '[F12.1-a c4 FR-MKT-002] the owner edits its listing');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set expires_at = now() + interval ''1 year'' where id = %L', pg_temp.v('l1'))), 'ERR:42501',
  '[F12.1-a c4] the owner never extends the expiry (never granted)');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set is_hidden = true where id = %L', pg_temp.v('l1'))), 'ERR:42501',
  '[F12.1-a c4 §3.2] the owner never hides or unhides (MARKETPLACE_MODERATE)');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set status = ''sold'' where id = %L', pg_temp.v('l1'))), 'OK:1',
  '[F12.1-a c4 decisions §3.11] the owner marks it sold/given');
select is(pg_temp.q('a', format('select (sold_at is not null)::text from nestly.marketplace_listings where id = %L', pg_temp.v('l1'))), 'true',
  '[F12.1-a c4] sold_at is the database clock');
select is(pg_temp.sees('b', 'l1'), '0', '[F12.1-a c4 FR-MKT-001] a sold listing leaves the Marketplace');
select is(pg_temp.sees('a', 'l1'), '1', '[F12.1-a c4] its owner still reads it');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set status = ''active'' where id = %L', pg_temp.v('l1'))), 'OK:1',
  '[F12.1-a c4] and can put it back');
select is(pg_temp.sees('b', 'l1'), '1', '[F12.1-a c4] back in the Marketplace');

-- ---- user block, suspended owner, expiry -----------------------------------------------------------------------------------
select is(pg_temp.dml('b', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('a'))), 'OK:1',
  '[F12.1-a c5] control: b blocks a');
select is(pg_temp.sees('b', 'l1'), '0', '[F12.1-a c5 FR-REL-002] a user block hides the listing (the blocker)');
select is(pg_temp.open_conv('b', 'a', pg_temp.v('l1')), 'ERR:42501', '[F12.1-a c5 FR-REL-002] and no conversation across a user block');
select is(pg_temp.dml('b', format($q$ update nestly.user_blocks set lifted_at = now() where blocked_id = %L and lifted_at is null $q$, pg_temp.id('a'))), 'OK:1',
  '[F12.1-a c5] control: b unblocks a');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.sees('b', 'l1'), '0', '[F12.1-a c5 BR-073] a suspended owner''s listings are hidden');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.sees('b', 'l1'), '1', '[F12.1-a c5] back when the owner is active');
select is(pg_temp.list('a', 'l_old', 'שידה ישנה', 200, 'furniture'), 'kept', '[F12.1-a c5] control: a listing to expire');
select tests.fx_mkt_expire(pg_temp.v('l_old'));
select is(pg_temp.sees('b', 'l_old'), '0', '[F12.1-a c5 decisions §3.11] an expired listing leaves the Marketplace');
select is(pg_temp.sees('a', 'l_old'), '1', '[F12.1-a c5 OP retention] its owner still reads it (kept)');
select is(pg_temp.open_conv('b', 'a', pg_temp.v('l_old')), 'ERR:42501', '[F12.1-a c5] no conversation about an expired listing');

-- ---- contact through chat (FR-MKT-005, FR-CHAT-002, BR-007, AC-059) --------------------------------------------------------
select is(pg_temp.open_conv('a', 'b', pg_temp.v('l1')), 'ERR:42501', '[F12.1-a c6 AC-059] the seller does not open a conversation about its own listing');
select is(pg_temp.open_conv('d', 'a', pg_temp.v('l1')), 'ERR:42501', '[F12.1-a c6 BR-034] an Admin does not open one');
select is(pg_temp.open_conv('b', 's', pg_temp.v('l1')), 'ERR:42501', '[F12.1-a c6] only with the listing''s owner');
select is(pg_temp.open_conv('b', 'a', pg_temp.v('l1')), 'OK:1', '[F12.1-a c6 FR-MKT-005 AC-059] a Regular opens a conversation with the seller, no Friendship needed');
select is(pg_temp.open_conv('p', 'a', pg_temp.v('l1')), 'OK:1', '[F12.1-a c6 FR-MKT-005] a Professional too');
select is(pg_temp.open_conv('b', 'a', pg_temp.v('l_free')), 'ERR:23505', '[F12.1-a c6] one conversation per pair (the server reuses it)');
select is(pg_temp.q('a', format($q$ select context || '/' || (listing_id = %L)::text from nestly.conversations where user_a = least(%L::uuid, %L::uuid) and user_b = greatest(%L::uuid, %L::uuid) $q$,
    pg_temp.v('l1'), pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('a'), pg_temp.id('b'))),
  'marketplace/true', '[F12.1-a c6 FR-CHAT-002] the seller reads the conversation with its Marketplace context');

-- ---- images (FR-MKT-002, VAL-041, AC-021) ----------------------------------------------------------------------------------
select is(pg_temp.up('a', 'listing', 'i0'), 'kept', '[F12.1-a c7 AC-021] a Regular uploads a listing image');
select is(pg_temp.up('p', 'listing', 'x'), 'ERR:42501', '[F12.1-a c7] a Professional does not');
select is(pg_temp.up('a', 'sponsored', 'x'), 'ERR:42501', '[F12.1-a c7 FR-ADMIN-009] a Regular does not upload a sponsored image');
select is(pg_temp.dml('a', format('update nestly.media_assets set listing_id = %L, position = 0 where id = %L', pg_temp.v('l_free'), pg_temp.v('i0'))), 'OK:1',
  '[F12.1-a c7] the uploader attaches it to its own listing');
select is(pg_temp.dml('a', format('update nestly.media_assets set listing_id = %L, position = 1 where id = %L', pg_temp.v('l1'), pg_temp.v('i0'))), 'OK:0',
  '[F12.1-a c7] once');
select is(pg_temp.list('b', 'lb', 'כיסא בטיחות', 300, 'car_seats'), 'kept', '[F12.1-a c7] control: b''s listing');
select is(pg_temp.up('a', 'listing', 'i1'), 'kept', '[F12.1-a c7] control: a second image');
select is(pg_temp.dml('a', format('update nestly.media_assets set listing_id = %L, position = 0 where id = %L', pg_temp.v('lb'), pg_temp.v('i1'))), 'ERR:42501',
  '[F12.1-a c7] never to another''s listing');
select is(pg_temp.dml('a', format('update nestly.media_assets set listing_id = %L, position = 6 where id = %L', pg_temp.v('l1'), pg_temp.v('i1'))), 'ERR:23514',
  '[F12.1-a c7 VAL-041] at most 6 images (positions 0-5)');
select is(pg_temp.dml('a', format('update nestly.media_assets set listing_id = %L, position = 0 where id = %L', pg_temp.v('l_free'), pg_temp.v('i1'))), 'ERR:23505',
  '[F12.1-a c7 VAL-041] one image per position');
select is(pg_temp.dml('a', format('update nestly.media_assets set listing_id = %L, position = 5 where id = %L', pg_temp.v('l1'), pg_temp.v('i1'))), 'OK:1',
  '[F12.1-a c7] the sixth place is allowed');
select is(pg_temp.q('b', format('select count(*)::text from nestly.media_assets where id = %L', pg_temp.v('i0'))), '0',
  '[F12.1-a c7 NFR-MEDIA-001] others never read an image before the check');
select is(pg_temp.pass('i0'), 'OK:1', '[F12.1-a c7] control: the check passes it');
select is(pg_temp.q('b', format('select count(*)::text from nestly.media_assets where id = %L', pg_temp.v('i0'))), '1',
  '[F12.1-a c7 AC-021] then a reader of the listing reads it');
select is(pg_temp.q('s', format('select count(*)::text from nestly.media_assets where id = %L', pg_temp.v('i0'))), '0', '[F12.1-a c7] a suspended account does not');

-- ---- reports (FR-MKT-001, §3.2 MARKETPLACE_MODERATE; Afik 21.10.2026 §9.7) --------------------------------------------------
select is(pg_temp.report('a', pg_temp.v('l1')), 'ERR:42501', '[F12.1-a c8] nobody reports its own listing');
select is(pg_temp.dml('b', $q$ insert into nestly.reports (target_kind, reason) values ('listing', 'spam') $q$), 'ERR:23514', '[F12.1-a c8] a listing report names its listing');
select is(pg_temp.report('b', pg_temp.v('l_free')), 'OK:1', '[F12.1-a c8 FR-MOD-002] a reader reports a listing');
select is(tests.fx_mkt_text(format('select target_text from nestly.reports where listing_id = %L', pg_temp.v('l_free'))), 'בגדי תינוק',
  '[F12.1-a c8 Afik 21.10] the title as it was at the report is kept with it');
select is(pg_temp.sees('b', 'l_free'), '0', '[F12.1-a c8] a reported listing is hidden from its reporter');
select is(pg_temp.sees('p', 'l_free'), '1', '[F12.1-a c8] and from nobody else');
select is(pg_temp.report('b', pg_temp.v('l_free')) like 'ERR:%', true, '[F12.1-a c8] once');
select is(pg_temp.dml('m5', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where listing_id = %L $q$, pg_temp.v('l_free'))), 'OK:0',
  '[F12.1-a c8 §3.2] a listing report is not handled without MARKETPLACE_MODERATE');

-- ---- staff hide and restore (§3.2 MARKETPLACE_MODERATE, audited) ----------------------------------------------------------------
select is(pg_temp.dml('m1', format('update nestly.marketplace_listings set is_hidden = true where id = %L', pg_temp.v('l_free'))), 'OK:0',
  '[F12.1-a c9 §3.2] a Moderator without the key hides nothing');
select is(pg_temp.dml('m5', format('update nestly.marketplace_listings set is_hidden = true where id = %L', pg_temp.v('l_free'))), 'OK:0',
  '[F12.1-a c9 §3.2] nor with CONTENT_MODERATE only');
select is(pg_temp.dml('m4', format('update nestly.marketplace_listings set is_hidden = true, title = ''שונה'' where id = %L', pg_temp.v('l_free'))), 'ERR:42501',
  '[F12.1-a c9] a moderation changes nothing else');
select is(pg_temp.dml('m4', format('update nestly.marketplace_listings set price = 1 where id = %L', pg_temp.v('l_free'))), 'ERR:42501',
  '[F12.1-a c9] staff never edit a listing');
select is(tests.fx_sf_audit('listing_hidden'), 0::bigint, '[F12.1-a c9] control: no hide audited yet');
select is(pg_temp.dml('m4', format('update nestly.marketplace_listings set is_hidden = true where id = %L', pg_temp.v('l_free'))), 'OK:1',
  '[F12.1-a c9 §3.2] MARKETPLACE_MODERATE hides a listing');
select is(tests.fx_sf_audit('listing_hidden'), 1::bigint, '[F12.1-a c9 NFR-AUDIT-001] in the same transaction as its Audit entry');
select is(pg_temp.sees('p', 'l_free'), '0', '[F12.1-a c9] a hidden listing leaves the Marketplace');
select is(pg_temp.q('a', format('select is_hidden::text from nestly.marketplace_listings where id = %L', pg_temp.v('l_free'))), 'true',
  '[F12.1-a c9] its owner reads it, marked hidden');
select is(pg_temp.open_conv('p', 'a', pg_temp.v('l_free')) like 'ERR:%', true, '[F12.1-a c9] no new conversation about a hidden listing');
select is(pg_temp.dml('m4', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where listing_id = %L $q$, pg_temp.v('l_free'))), 'OK:1',
  '[F12.1-a c9 §3.2] MARKETPLACE_MODERATE closes the listing report');
select is(tests.fx_mkt_count(format('nestly.media_training_candidates where media_id = %L', pg_temp.v('i0'))), 1::bigint,
  '[F12.1-a c9 Afik 21.10 §9.7] the hidden listing''s checked image enters the training set as a candidate');
select is(pg_temp.dml('m4', format('update nestly.marketplace_listings set is_hidden = false where id = %L', pg_temp.v('l_free'))), 'OK:1',
  '[F12.1-a c9] and restores it');
select is(tests.fx_sf_audit('listing_restored'), 1::bigint, '[F12.1-a c9 NFR-AUDIT-001] audited');

-- a child-safety report keeps a listing's images out of the training set
select is(pg_temp.up('b', 'listing', 'ib'), 'kept', '[F12.1-a c9] control: b''s listing image');
select is(pg_temp.dml('b', format('update nestly.media_assets set listing_id = %L, position = 0 where id = %L', pg_temp.v('lb'), pg_temp.v('ib'))), 'OK:1', '[F12.1-a c9] control');
select is(pg_temp.pass('ib'), 'OK:1', '[F12.1-a c9] control: passed');
select is(pg_temp.report('a', pg_temp.v('lb'), 'child_safety'), 'OK:1', '[F12.1-a c9] control: a child-safety report on b''s listing');
select is(pg_temp.dml('m4', format('update nestly.marketplace_listings set is_hidden = true where id = %L', pg_temp.v('lb'))), 'OK:1', '[F12.1-a c9] control: hidden');
select is(pg_temp.dml('m4', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where listing_id = %L $q$, pg_temp.v('lb'))), 'OK:1',
  '[F12.1-a c9] control: handled');
select is(tests.fx_mkt_count(format('nestly.media_training_candidates where media_id = %L', pg_temp.v('ib'))), 0::bigint,
  '[F12.1-a c9 §9.7] never after a child-safety report');

-- ---- deleting (decision: deleted at once) -----------------------------------------------------------------------------------
select is(pg_temp.report('p', pg_temp.v('l1')), 'OK:1', '[F12.1-a c10] control: an open report on l1');
select is(pg_temp.dml('b', format('delete from nestly.marketplace_listings where id = %L', pg_temp.v('l1'))), 'OK:0', '[F12.1-a c10] nobody deletes another''s listing');
select is(pg_temp.dml('m4', format('delete from nestly.marketplace_listings where id = %L', pg_temp.v('l1'))), 'OK:0', '[F12.1-a c10] staff hide, never delete');
select is(pg_temp.dml('a', format('delete from nestly.marketplace_listings where id = %L', pg_temp.v('l1'))), 'OK:1', '[F12.1-a c10] the owner deletes its listing');
select is(tests.fx_mkt_count(format('nestly.marketplace_listings where id = %L', pg_temp.v('l1'))), 0::bigint, '[F12.1-a c10 decisions] gone at once');
select is(tests.fx_mkt_text(format($q$ select status || '/' || target_text || '/' || (listing_id is null)::text from nestly.reports where reporter_id = %L and target_kind = 'listing' $q$, pg_temp.id('p'))),
  'open/עגלת תינוק כחולה/true', '[F12.1-a c10] its open report stays for staff, with the title');
select is(tests.fx_mkt_count(format($q$ nestly.conversations where context = 'marketplace' and listing_id is null and %L in (user_a, user_b) $q$, pg_temp.id('b'))), 1::bigint,
  '[F12.1-a c10 BR-042] the conversation stays, without the listing');
select is(tests.fx_mkt_count(format('nestly.media_assets where id = %L and listing_id is null', pg_temp.v('i1'))), 1::bigint,
  '[F12.1-a c10] its images lose the link (the job removes them after a day)');

-- ---- Sponsored Products (FR-ADMIN-009, BR-005, BR-046, AC-008, AC-058) ------------------------------------------------------
select is(pg_temp.keep('sp1', pg_temp.q('d', $q$ insert into nestly.sponsored_products (sponsor_name, title, description, category, link_url)
    values ('בייבי סטור', 'קופון 10% לעגלות', 'דוגמה: קופון לדוגמה בלבד', 'strollers', 'https://example.com/stroller') returning id::text $q$)), 'kept',
  '[F12.1-a c11 FR-ADMIN-009 AC-058] the Admin creates a Sponsored Product (a draft)');
select is(tests.fx_sf_audit('sponsored_product_created'), 1::bigint, '[F12.1-a c11 AC-058] audited');
select is(pg_temp.dml('a', $q$ insert into nestly.sponsored_products (sponsor_name, title, category) values ('חברה', 'מוצר', 'toys') $q$), 'ERR:42501',
  '[F12.1-a c11 BR-046] a Regular does not');
select is(pg_temp.dml('m4', $q$ insert into nestly.sponsored_products (sponsor_name, title, category) values ('חברה', 'מוצר', 'toys') $q$), 'ERR:42501',
  '[F12.1-a c11 BR-046 §3.2] a Moderator does not (SPONSORED_PRODUCT_MANAGE is Admin Only)');
select is(pg_temp.dml('d', $q$ insert into nestly.sponsored_products (sponsor_name, title, category, link_url) values ('חברה', 'מוצר', 'toys', 'http://example.com/x') $q$),
  'ERR:23514', '[F12.1-a c11] a link is https');
select is(pg_temp.dml('d', $q$ insert into nestly.sponsored_products (sponsor_name, title, category, link_url) values ('חברה', 'מוצר', 'toys', 'https://shop.co.il@other.example/x') $q$),
  'ERR:23514', '[F12.1-a c11] a link never hides its host behind a user part');
select is(pg_temp.dml('d', $q$ insert into nestly.sponsored_products (sponsor_name, title, category, link_url) values ('חברה', 'מוצר', 'toys', 'https://shop.example.co.il/a?b=1#c') $q$, false),
  'OK:1', '[F12.1-a c11] control: a host, a path, a query and a fragment');
select is(pg_temp.dml('d', $q$ insert into nestly.sponsored_products (sponsor_name, title, category, status) values ('חברה', 'מוצר', 'toys', 'published') $q$),
  'ERR:42501', '[F12.1-a c11] created as a draft only');
select is(pg_temp.q('a', format('select count(*)::text from nestly.sponsored_products where id = %L', pg_temp.v('sp1'))), '0', '[F12.1-a c11] a draft is not shown');
select is(pg_temp.dml('d', format('update nestly.sponsored_products set status = ''paused'' where id = %L', pg_temp.v('sp1'))), 'ERR:23514',
  '[F12.1-a c11] a draft is published or removed, never paused');
select is(pg_temp.dml('d', format('update nestly.sponsored_products set status = ''published'' where id = %L', pg_temp.v('sp1'))), 'OK:1',
  '[F12.1-a c11 FR-ADMIN-009] the Admin publishes it');
select is(tests.fx_sf_audit('sponsored_product_published'), 1::bigint, '[F12.1-a c11 AC-058] audited');
select is(pg_temp.q('a', format('select title || ''/'' || sponsor_name || ''/'' || (published_at is not null)::text from nestly.sponsored_products where id = %L', pg_temp.v('sp1'))),
  'קופון 10% לעגלות/בייבי סטור/true', '[F12.1-a c11 FR-MKT-003 AC-008] every active account reads a published one, with its sponsor');
select is(pg_temp.q('s', 'select count(*)::text from nestly.sponsored_products'), '0', '[F12.1-a c11 rule 15] a suspended account reads none');
select is(pg_temp.dml('a', format('update nestly.sponsored_products set title = ''x'' where id = %L', pg_temp.v('sp1'))), 'OK:0', '[F12.1-a c11] a Regular edits none');
select is(pg_temp.dml('d', format('update nestly.sponsored_products set published_at = now() where id = %L', pg_temp.v('sp1'))), 'ERR:42501',
  '[F12.1-a c11] the publication time is the database''s');
select is(pg_temp.up('d', 'sponsored', 'is'), 'kept', '[F12.1-a c11] the Admin uploads a sponsored image');
select is(pg_temp.dml('d', format('update nestly.media_assets set sponsored_product_id = %L, position = 0 where id = %L', pg_temp.v('sp1'), pg_temp.v('is'))), 'OK:1',
  '[F12.1-a c11] and attaches it to the product');
select is(pg_temp.pass('is'), 'OK:1', '[F12.1-a c11] control: passed');
select is(pg_temp.q('b', format('select count(*)::text from nestly.media_assets where id = %L', pg_temp.v('is'))), '1',
  '[F12.1-a c11] readers of the product read its image');
select is(pg_temp.dml('d', format('update nestly.sponsored_products set status = ''paused'' where id = %L', pg_temp.v('sp1'))), 'OK:1', '[F12.1-a c11] paused');
select is(pg_temp.q('a', format('select count(*)::text from nestly.sponsored_products where id = %L', pg_temp.v('sp1'))), '0', '[F12.1-a c11] a paused one is not shown');
select is(pg_temp.q('b', format('select count(*)::text from nestly.media_assets where id = %L', pg_temp.v('is'))), '0', '[F12.1-a c11] nor its image');
select is(pg_temp.dml('d', format('update nestly.sponsored_products set status = ''removed'' where id = %L', pg_temp.v('sp1'))), 'OK:1', '[F12.1-a c11] removed');
select is(pg_temp.dml('d', format('update nestly.sponsored_products set status = ''published'' where id = %L', pg_temp.v('sp1'))), 'OK:0', '[F12.1-a c11] removed is final');
select is(tests.fx_sf_audit('sponsored_product_removed'), 1::bigint, '[F12.1-a c11 AC-058] audited');
select is(pg_temp.dml('d', format('delete from nestly.sponsored_products where id = %L', pg_temp.v('sp1'))), 'ERR:42501', '[F12.1-a c11] never deleted');

select * from finish();
rollback;
