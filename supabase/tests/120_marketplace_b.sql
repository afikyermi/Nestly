-- pgTAP, run by pg_prove as app_server (CI `db` job, I12 part B: Afik's decisions §10.5–§10.6; FR-MKT-002, VAL-013, BR-090, BR-091,
-- ERR-054, AC-200..AC-205; migration 20261026600000_marketplace_b.sql).
-- Source of expected values: the decisions (category "מכשירי חשמל", a description up to 1,000, an expired listing deleted, a sold one kept)
-- and the SRS rows written from them, not the migration text.
-- People: a, b (Regular), d = fr_d (Admin), m4 = sf_m4 (MARKETPLACE_MODERATE). The retention job runs as app_jobs (71_'s tests.jobs_as).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F12.2-a c1 I12-B fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_sf_grant(tests.fx_sf_id('sf_m4'), array['MARKETPLACE_MODERATE', 'REPORTS_VIEW', 'CONTENT_MODERATE']);

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'd' then tests.fx_fr_id('fr_d') when 'm4' then tests.fx_sf_id('sf_m4') end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
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
create function pg_temp.list(p_who text, p_k text, p_cat text default 'strollers', p_description text default null) returns text language sql as $f$
  select pg_temp.keep(p_k, pg_temp.q(p_who, format($q$ insert into nestly.marketplace_listings (title, category, item_condition, price, city, description)
    values ('פריט לבדיקה', %L, 'good', 120, 'center', %L) returning id::text $q$, p_cat, p_description)))
$f$;
create function pg_temp.exists_(p_k text) returns bigint language sql as $f$
  select tests.fx_mkt_count(format('nestly.marketplace_listings where id = %L', pg_temp.v(p_k)))
$f$;

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is(tests.fx_mkt_text($q$ select string_agg(p.proname || ':' || r.rolname, ',' order by p.proname, r.rolname)
                               from pg_proc p cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_media_jobs')) as r(rolname)
                              where p.pronamespace = 'nestly'::regnamespace and p.proname = 'purge_expired_listings'
                                and has_function_privilege(r.rolname, p.oid, 'EXECUTE') $q$),
  'purge_expired_listings:app_jobs', '[F12.2-a c1 I12-B BR-090 rule 6] only the retention job runs the expiry purge');
select is(tests.fx_mkt_text($q$ select p.prosecdef::text from pg_proc p where p.pronamespace = 'nestly'::regnamespace and p.proname = 'purge_expired_listings' $q$),
  'false', '[F12.2-a c1 I12-B rule 10] the purge is SECURITY INVOKER: what it deletes is what the job''s policies open');
select is(tests.fx_mkt_text($q$ select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a
                               where a.attrelid = 'nestly.marketplace_listings'::regclass and a.attnum > 0 and not a.attisdropped
                                 and has_column_privilege('app_jobs', a.attrelid, a.attnum, 'SELECT') $q$),
  'expires_at, id, owner_id, owner_status, status', '[F12.2-a c1 I12-B rule 6] app_jobs reads no title, description, price or seller text of a listing');
select is(tests.fx_mkt_text($q$ select has_column_privilege('authenticated', 'nestly.marketplace_listings', 'description', 'SELECT')::text
                                     || has_column_privilege('authenticated', 'nestly.marketplace_listings', 'description', 'INSERT')::text
                                     || has_column_privilege('authenticated', 'nestly.marketplace_listings', 'description', 'UPDATE')::text $q$),
  'truetruetrue', '[F12.2-a c1 I12-B VAL-013] the description is written by the owner and read with the listing');

-- ---- AC-200: the category "מכשירי חשמל" ----------------------------------------------------------------------------------
select is(pg_temp.list('a', 'el', 'electrical'), 'kept', '[F12.2-a c1 I12-B AC-200 FR-MKT-002] a Regular publishes a listing in "מכשירי חשמל"');
select is(pg_temp.q('b', format('select category from nestly.marketplace_listings where id = %L', pg_temp.v('el'))), 'electrical',
  '[F12.2-a c1 I12-B AC-200] another user reads it in that category');
select is(pg_temp.dml('d', $q$ insert into nestly.sponsored_products (sponsor_name, title, category) values ('חברת בדיקה', 'מוצר חשמל', 'electrical') $q$),
  'OK:1', '[F12.2-a c1 I12-B AC-200 FR-ADMIN-009] a Sponsored Product takes the same category');
select is(pg_temp.q('a', $q$ insert into nestly.marketplace_listings (title, category, item_condition, price, city) values ('x x', 'phones', 'good', 1, 'center') returning id::text $q$),
  'ERR:23514', '[F12.2-a c1 I12-B FR-MKT-002] a category outside the list is refused');

-- ---- AC-201: the description (VAL-013) -------------------------------------------------------------------------------------
select is(pg_temp.list('a', 'd1000', 'toys', repeat('ש', 1000)), 'kept', '[F12.2-a c1 I12-B AC-201 VAL-013] a description of 1,000 Hebrew letters is accepted');
select is(pg_temp.list('a', 'd1001', 'toys', repeat('ש', 1001)), 'ERR:23514', '[F12.2-a c1 I12-B AC-201 VAL-013] 1,001 characters: refused (23514)');
select is(pg_temp.list('a', 'demoji', 'toys', repeat(chr(128512), 1000)), 'kept', '[F12.2-a c1 I12-B VAL-013] the cap counts characters (code points), not bytes');
select is(pg_temp.list('a', 'dblank', 'toys', '   '), 'ERR:23514', '[F12.2-a c1 I12-B VAL-013] a blank description is refused (no description is NULL)');
select is(pg_temp.dml('a', format($q$ update nestly.marketplace_listings set description = 'עובד מצוין, עם קופסה' where id = %L $q$, pg_temp.v('el'))),
  'OK:1', '[F12.2-a c1 I12-B AC-201] the owner edits the description');
select is(pg_temp.q('b', format('select description from nestly.marketplace_listings where id = %L', pg_temp.v('el'))), 'עובד מצוין, עם קופסה',
  '[F12.2-a c1 I12-B AC-201 FR-MKT-005] another user reads the description on the listing');
select is(pg_temp.dml('b', format($q$ update nestly.marketplace_listings set description = 'זה שלי' where id = %L $q$, pg_temp.v('el'))),
  'OK:0', '[I12-B] nobody else edits it (no row is the caller''s)');
select is(pg_temp.dml('m4', format($q$ update nestly.marketplace_listings set is_hidden = true, description = 'מוסתר' where id = %L $q$, pg_temp.v('el'))),
  'ERR:42501', '[F12.2-a c1 I12-B FR-MKT-001] a moderation hides and changes nothing else, the description included');

-- ---- ERR-054 / BR-091: sold, then past its 60 days ------------------------------------------------------------------------
select is(pg_temp.list('a', 'sold'), 'kept', '[F12.2-a c1 I12-B setup] a listing to sell');
select is(pg_temp.dml('a', format($q$ update nestly.marketplace_listings set status = 'sold' where id = %L $q$, pg_temp.v('sold'))), 'OK:1',
  '[F12.2-a c1 I12-B BR-091] the owner marks it sold');
select is(pg_temp.q('b', format('select count(*)::text from nestly.marketplace_listings where id = %L', pg_temp.v('sold'))), '0',
  '[F12.2-a c1 I12-B AC-202 BR-091] a sold listing leaves the Marketplace: another user no longer reads it');
select tests.fx_mkt_expire(pg_temp.v('sold'));
select is(pg_temp.q('a', format('select status from nestly.marketplace_listings where id = %L', pg_temp.v('sold'))), 'sold',
  '[F12.2-a c1 I12-B AC-202 BR-091] its owner still has it after its 60 days');
select is(pg_temp.dml('a', format($q$ update nestly.marketplace_listings set status = 'active' where id = %L $q$, pg_temp.v('sold'))), 'ERR:23514',
  '[F12.2-a c1 I12-B ERR-054] a sold listing past its 60 days does not return to sale');

-- ---- AC-203 / BR-090: the expiry purge ------------------------------------------------------------------------------------
select is(pg_temp.list('a', 'live'), 'kept', '[F12.2-a c1 I12-B setup] a live listing');
select is(pg_temp.list('a', 'exp'), 'kept', '[F12.2-a c1 I12-B setup] a listing that will expire');
select is(pg_temp.list('a', 'rep'), 'kept', '[F12.2-a c1 I12-B setup] a listing that will be reported, then expire');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, listing_id, reason) values ('listing', %L, 'spam') $q$, pg_temp.v('rep'))), 'OK:1',
  '[F12.2-a c1 I12-B setup] b reports it (open)');
select is(pg_temp.list('a', 'img'), 'kept', '[F12.2-a c1 I12-B setup] a listing with an image');
select is(pg_temp.keep('m', pg_temp.q('a', $q$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('listing', 'image/webp', 800, 600, 120000) returning id::text $q$)),
  'kept', '[F12.2-a c1 I12-B setup] a listing image');
select is(pg_temp.dml('a', format($q$ update nestly.media_assets set listing_id = %L, position = 0 where id = %L $q$, pg_temp.v('img'), pg_temp.v('m'))), 'OK:1',
  '[F12.2-a c1 I12-B setup] attached to it');
select tests.fx_mkt_expire(pg_temp.v('exp'));
select tests.fx_mkt_expire(pg_temp.v('rep'));
select tests.fx_mkt_expire(pg_temp.v('img'));

select is(pg_temp.q('a', 'select nestly.purge_expired_listings()::text'), 'ERR:42501', '[F12.2-a c1 I12-B rule 6] a user cannot run the purge');
select is(tests.jobs_as(format('select title from nestly.marketplace_listings where id = %L', pg_temp.v('exp'))), 'ERR:42501',
  '[F12.2-a c1 I12-B rule 6] the job reads no title');
select is(tests.jobs_dml(format('delete from nestly.marketplace_listings where id = %L', pg_temp.v('live'))), 'OK:0',
  '[F12.2-a c1 I12-B BR-090] the job cannot delete a live listing');
select is(tests.jobs_dml(format('delete from nestly.marketplace_listings where id = %L', pg_temp.v('sold'))), 'OK:0',
  '[F12.2-a c1 I12-B BR-091] nor a sold one past its 60 days');

select cmp_ok(tests.jobs_as('select nestly.purge_expired_listings()::text')::int, '>=', 2, '[F12.2-a c1 I12-B AC-203 BR-090] the purge runs as app_jobs and deletes');
select is(pg_temp.exists_('exp'), 0::bigint, '[F12.2-a c1 I12-B AC-203 BR-090] an expired listing is deleted');
select is(pg_temp.exists_('img'), 0::bigint, '[F12.2-a c1 I12-B AC-203 BR-090] an expired listing with an image is deleted');
select is(tests.fx_mkt_text(format('select coalesce(listing_id::text, ''none'') from nestly.media_assets where id = %L', pg_temp.v('m'))), 'none',
  '[F12.2-a c1 I12-B BR-090 BR-077] its image lost the link (the media job deletes an unattached image a day after its upload)');
select is(pg_temp.exists_('live'), 1::bigint, '[F12.2-a c1 I12-B BR-090] a live listing stays');
select is(pg_temp.exists_('sold'), 1::bigint, '[F12.2-a c1 I12-B AC-202 BR-091] a sold listing stays after its 60 days');
select is(pg_temp.exists_('rep'), 1::bigint, '[F12.2-a c1 I12-B BR-090] an open report holds an expired listing until the report is closed');
select is(tests.fx_mkt_count(format('nestly.reports where listing_id = %L and status = ''open''', pg_temp.v('rep'))), 1::bigint,
  '[F12.2-a c1 I12-B BR-090] the report stays open and keeps its listing');
select is(tests.jobs_as('select nestly.purge_expired_listings()::text'), '0', '[F12.2-a c1 I12-B BR-090] a second run finds nothing more to delete');

select * from finish();
rollback;
