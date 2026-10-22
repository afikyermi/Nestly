-- pgTAP, run by pg_prove as app_server (CI `db` job, I13: Monetization; FR-SERV-010, FR-MKT-004, FR-PRO-002, FR-ALG-007, NFR-SEC-007,
-- BR-003, BR-004, BR-005, BR-020, BR-047, BR-053, BR-054, BR-057, VAL-012, VAL-030, VAL-032, AC-057, AC-062, AC-068, AC-072, AC-098; OP-030;
-- decisions-in-force.md §3 items 12-13).
-- Source of expected values: the SRS and Afik's decisions (who buys which promotion, that the payment is simulated and names no card, that
-- the price is the sample list's, that a promotion runs for its period and is read by others only while running, that the owner counts paid
-- events and never learns who), not the migration text.
-- People: a, b (Regular), s (suspended Regular), p (the identity fixtures' Professional, no profile), q1 = pr_1, q2 = pr_2 (Professionals
-- with a profile), d = fr_d (Admin), m1 = sf_m1 (Moderator, no key).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F13.1-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 's' then tests.fx_id('s') when 'p' then tests.fx_id('p')
    when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
    when 'd' then tests.fx_fr_id('fr_d') when 'm1' then tests.fx_sf_id('sf_m1')
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
-- a simulated payment of p_plan by p_who, kept as p_k
create function pg_temp.pay(p_who text, p_k text, p_plan text) returns text language sql as $f$
  select pg_temp.keep(p_k, pg_temp.q(p_who, format($q$ insert into nestly.promotion_payments (plan_key) values (%L) returning id::text $q$, p_plan)))
$f$;
-- a promotion by p_who with payment p_pay, kept as p_k
create function pg_temp.promote(p_who text, p_k text, p_kind text, p_plan text, p_pay text, p_post uuid default null, p_listing uuid default null)
returns text language sql as $f$
  select pg_temp.keep(p_k, pg_temp.q(p_who, format($q$ insert into nestly.promotions (target_kind, plan_key, payment_id, post_id, listing_id)
    values (%L, %L, %L, %L, %L) returning id::text $q$, p_kind, p_plan, pg_temp.v(p_pay), p_post, p_listing)))
$f$;
create function pg_temp.sees(p_who text, p_k text) returns text language sql as $f$
  select pg_temp.q(p_who, format('select count(*)::text from nestly.promotions where id = %L', pg_temp.v(p_k)))
$f$;
create function pg_temp.event(p_who text, p_k text, p_kind text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.promotion_events (promotion_id, kind) values (%L, %L) $q$, pg_temp.v(p_k), p_kind))
$f$;
create function pg_temp.times(p_k text, p_who text, p_kind text) returns text language sql as $f$
  select tests.fx_promo_text(format('select coalesce(sum(times), 0)::text from nestly.promotion_events where promotion_id = %L and viewer_id = %L and kind = %L',
    pg_temp.v(p_k), pg_temp.id(p_who), p_kind))
$f$;

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events') and c.relrowsecurity and c.relforcerowsecurity),
  4::bigint, '[F13.1-a c1] the four new tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events')),
  'promotion_events.promotion_events_delete_jobs:d, promotion_events.promotion_events_insert_viewer:a, promotion_events.promotion_events_select_finance:r, '
  || 'promotion_events.promotion_events_select_jobs:r, promotion_events.promotion_events_select_owner:r, promotion_events.promotion_events_select_viewer:r, '
  || 'promotion_events.promotion_events_update_viewer:w, '
  || 'promotion_payments.promotion_payments_insert_payer:a, promotion_payments.promotion_payments_select_finance:r, '
  || 'promotion_payments.promotion_payments_select_jobs:r, promotion_payments.promotion_payments_select_payer:r, promotion_plans.promotion_plans_select_reader:r, '
  || 'promotions.promotions_insert_owner:a, promotions.promotions_select_finance:r, promotions.promotions_select_jobs:r, promotions.promotions_select_owner:r, '
  || 'promotions.promotions_select_staff:r, promotions.promotions_select_viewer:r, promotions.promotions_update_owner:w, promotions.promotions_update_staff:w',
  '[F13.1-a c1] exactly these policies: nobody writes the price list, nobody updates or deletes a payment, no client deletes a promotion or an event (the I13 follow-up adds the staff stop and the retention job''s reads and 12-month delete, file 104)');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events')
            and pl.polname !~ '_jobs$'
            and (pl.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[] or not pl.polpermissive
                 or (coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), '')) !~ 'is_active_account\(\)')),
  0::bigint, '[F13.1-a c1 platform r15] every client policy of the new tables is permissive, TO authenticated and gated by is_active_account() (the retention job''s, file 104, are TO app_jobs)');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'promotion_events.kind, promotion_events.promotion_id, promotion_payments.plan_key, promotions.listing_id, promotions.payment_id, '
  || 'promotions.plan_key, promotions.post_id, promotions.target_kind',
  '[F13.1-a c1 conventions NFR-SEC-007] INSERT per column: a payment names its plan only (never an amount, a provider or a status); never an owner, a period or a clock');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'promotion_events.times, promotions.status',
  '[F13.1-a c1 conventions] UPDATE per column: a promotion''s status (stop) and an event''s count only');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events') and a.attnum > 0 and not a.attisdropped
              and not has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'promotion_events.created_at, promotion_events.id, promotion_events.updated_at, promotion_events.viewer_id, promotion_plans.created_at, promotions.payment_id',
  '[F13.1-a c1 BR-057 AC-072] never readable: who saw or acted on a promotion (nor a row id that follows one viewer), any time finer than the day, and which payment bought it');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname in ('promotion_payments_prepare', 'promotions_prepare', 'promotions_update_guard', 'promotion_events_guard', 'promotion_attribution')),
  0::bigint, '[F13.1-a c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events')
            and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[F13.1-a c1 rule 7] anon holds nothing on the new tables');
select is((select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('promotion_payments', 'promotions') and a.attnum > 0 and not a.attisdropped
              and a.attname ~ '(card|cvv|cvc|expiry|iban|account_number|billing_address|token)'),
  0::bigint, '[F13.1-a c1 AC-098 NFR-SEC-007] no card, bank account or billing address column');
select is((select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('promotion_plans', 'promotion_payments', 'promotions', 'promotion_events') and a.attnum > 0
              and not a.attisdropped and a.attname ~ '(child|birth|pregnan|tracker|journey|cycle|message|support|group)'),
  0::bigint, '[F13.1-a c1 BR-053 AC-068 VAL-030] no paid-targeting input names a child, a pregnancy, a tracker, a chat, Support or a Group');

-- ---- the sample price list (OP-030) ---------------------------------------------------------------------------------------
select is(pg_temp.q('a', 'select string_agg(key || '':'' || target_kind || '':'' || days || '':'' || sample_price_ils, '','' order by target_kind, sort_order) from nestly.promotion_plans'),
  'listing_3:listing:3:9,listing_7:listing:7:19,post_3:post:3:19,post_7:post:7:39,profile_7:profile:7:49,profile_30:profile:30:149',
  '[F13.1-a c2 OP-030] every active account reads the sample price list');
select is(pg_temp.dml('d', $$ update nestly.promotion_plans set sample_price_ils = 1 $$), 'ERR:42501', '[F13.1-a c2] nobody changes a price, the Admin included');
select is(pg_temp.dml('d', $$ insert into nestly.promotion_plans (key, target_kind, days, sample_price_ils, sort_order) values ('x_1', 'post', 1, 1, 9) $$),
  'ERR:42501', '[F13.1-a c2] nobody adds a plan');
select is(pg_temp.q('s', 'select count(*)::text from nestly.promotion_plans'), '0', '[F13.1-a c2 r15] a suspended account reads nothing');

-- ---- simulated payment (NFR-SEC-007, AC-098) ------------------------------------------------------------------------------
select is(pg_temp.pay('q1', 'pay_q1_profile', 'profile_7'), 'kept', '[F13.1-a c3 FR-SERV-010] a Professional pays for a profile plan');
select is(tests.fx_promo_text(format($q$ select amount_ils || ':' || currency || ':' || provider || ':' || is_simulated || ':' || status || ':' || target_kind
            from nestly.promotion_payments where id = %L $q$, pg_temp.v('pay_q1_profile'))),
  '49:ILS:simulated:true:succeeded:profile', '[F13.1-a c3 NFR-SEC-007 OP-030] the database writes the sample price and marks the payment simulated');
select is(pg_temp.dml('q1', $$ insert into nestly.promotion_payments (plan_key, amount_ils) values ('profile_7', 1) $$), 'ERR:42501',
  '[F13.1-a c3] the client never sends an amount');
select is(pg_temp.dml('q1', $$ insert into nestly.promotion_payments (plan_key) values ('listing_3') $$), 'ERR:42501',
  '[F13.1-a c3 FR-MKT-004] a Professional does not buy a listing plan');
select is(pg_temp.dml('a', $$ insert into nestly.promotion_payments (plan_key) values ('profile_7') $$), 'ERR:42501',
  '[F13.1-a c3 BR-047] a Regular does not buy a Professional plan');
select is(pg_temp.dml('a', $$ insert into nestly.promotion_payments (plan_key) values ('nothing') $$), 'ERR:23503', '[F13.1-a c3] no such plan');
select is(pg_temp.dml('d', $$ insert into nestly.promotion_payments (plan_key) values ('post_3') $$), 'ERR:42501', '[F13.1-a c3] the Admin buys nothing');
select is(pg_temp.pay('a', 'pay_a_listing', 'listing_3'), 'kept', '[F13.1-a c3 BR-020] a Regular pays for a listing plan');
select is(pg_temp.q('b', format('select count(*)::text from nestly.promotion_payments where id = %L', pg_temp.v('pay_q1_profile'))), '0',
  '[F13.1-a c3] another user never reads a payment');
select is(pg_temp.q('q1', 'select count(*)::text from nestly.promotion_payments'), '1', '[F13.1-a c3 PG-042] the payer reads its own payments');
select is(pg_temp.q('d', format('select count(*)::text from nestly.promotion_payments where id in (%L, %L)', pg_temp.v('pay_q1_profile'), pg_temp.v('pay_a_listing'))),
  '2', '[F13.1-a c3 §3.2] BILLING_FINANCE_MANAGE (the Admin) reads every payment');
select is(pg_temp.q('m1', 'select count(*)::text from nestly.promotion_payments'), '0', '[F13.1-a c3 §3.2] a Moderator never (Admin Only)');
select is(pg_temp.dml('q1', format('update nestly.promotion_payments set status = %L where id = %L', 'succeeded', pg_temp.v('pay_q1_profile'))), 'ERR:42501',
  '[F13.1-a c3] nobody updates a payment');
select is(pg_temp.dml('q1', format('delete from nestly.promotion_payments where id = %L', pg_temp.v('pay_q1_profile'))), 'ERR:42501',
  '[F13.1-a c3] nobody deletes a payment');

-- ---- promotions (FR-SERV-010, FR-MKT-004, BR-047, BR-020) -----------------------------------------------------------------
select is(pg_temp.promote('q2', 'x', 'profile', 'profile_7', 'pay_q1_profile'), 'ERR:42501', '[F13.1-a c4] another''s payment buys nothing');
select is(pg_temp.promote('q1', 'pr_q1', 'profile', 'profile_7', 'pay_q1_profile'), 'kept', '[F13.1-a c4 FR-SERV-010 Profile Promotion] the Professional promotes its profile');
select is(tests.fx_promo_text(format($q$ select (ends_at - starts_at = interval '7 days' and starts_at = now() and status = 'active' and owner_id = %L)::text
            from nestly.promotions where id = %L $q$, pg_temp.id('q1'), pg_temp.v('pr_q1'))),
  'true', '[F13.1-a c4] the period is the database''s: from the purchase, for the plan''s days');
select is(pg_temp.pay('q1', 'pay_q1_profile2', 'profile_30'), 'kept', '[F13.1-a c4] a second payment');
select is(pg_temp.promote('q1', 'x', 'profile', 'profile_30', 'pay_q1_profile'), 'ERR:23505', '[F13.1-a c4] a payment buys one promotion');
select is(pg_temp.promote('q1', 'x', 'profile', 'profile_30', 'pay_q1_profile2'), 'ERR:23505', '[F13.1-a c4] one running promotion per target');
select is(pg_temp.promote('q1', 'x', 'post', 'profile_30', 'pay_q1_profile2', tests.fx_id('a')), 'ERR:23503', '[F13.1-a c4] a plan is sold for its own kind only');
select is(pg_temp.pay('p', 'pay_p', 'profile_7'), 'kept', '[F13.1-a c4] a Professional with no profile pays');
select is(pg_temp.promote('p', 'x', 'profile', 'profile_7', 'pay_p'), 'ERR:42501', '[F13.1-a c4] but has no profile to promote');

-- posts: q1's public post, followers-only post; q2's post
select pg_temp.keep('post_pub', pg_temp.q('q1', $$ insert into nestly.posts (audience, body) values ('everyone', 'שינה של תינוקות') returning id::text $$));
select pg_temp.keep('post_fol', pg_temp.q('q1', $$ insert into nestly.posts (audience, body) values ('followers', 'לעוקבים') returning id::text $$));
select pg_temp.keep('post_q2', pg_temp.q('q2', $$ insert into nestly.posts (audience, body) values ('everyone', 'של אחרת') returning id::text $$));
select is(pg_temp.pay('q1', 'pay_post', 'post_3'), 'kept', '[F13.1-a c4] a post plan payment');
select is(pg_temp.promote('q1', 'x', 'post', 'post_3', 'pay_post', pg_temp.v('post_q2')), 'ERR:42501', '[F13.1-a c4] never another''s post');
select is(pg_temp.promote('q1', 'x', 'post', 'post_3', 'pay_post', pg_temp.v('post_fol')), 'ERR:42501',
  '[F13.1-a c4] never a followers-only post (paid reach never widens an audience)');
select is(pg_temp.promote('q1', 'pr_post', 'post', 'post_3', 'pay_post', pg_temp.v('post_pub')), 'kept', '[F13.1-a c4 FR-SERV-010 Post Promotion] the Professional promotes its public post');

-- listings: a's active listing, b's listing
select pg_temp.keep('l_a', pg_temp.q('a', $$ insert into nestly.marketplace_listings (title, category, item_condition, price, city)
  values ('עגלה', 'strollers', 'good', 300, 'tel_aviv') returning id::text $$));
select pg_temp.keep('l_b', pg_temp.q('b', $$ insert into nestly.marketplace_listings (title, category, item_condition, price, city)
  values ('כיסא', 'car_seats', 'good', 200, 'haifa') returning id::text $$));
select is(pg_temp.promote('a', 'x', 'listing', 'listing_3', 'pay_a_listing', null, pg_temp.v('l_b')), 'ERR:42501', '[F13.1-a c4 BR-020] never another''s listing');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set status = ''sold'' where id = %L', pg_temp.v('l_a'))), 'OK:1', 'a marks its listing sold');
select is(pg_temp.promote('a', 'x', 'listing', 'listing_3', 'pay_a_listing', null, pg_temp.v('l_a')), 'ERR:42501', '[F13.1-a c4 FR-MKT-004] never a sold listing');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set status = ''active'' where id = %L', pg_temp.v('l_a'))), 'OK:1', 'and back');
select is(pg_temp.promote('a', 'pr_l', 'listing', 'listing_3', 'pay_a_listing', null, pg_temp.v('l_a')), 'kept', '[F13.1-a c4 FR-MKT-004 BR-020] a Regular promotes its active listing');
select is(pg_temp.dml('a', format('update nestly.promotions set ends_at = ends_at + interval ''30 days'' where id = %L', pg_temp.v('pr_l'))), 'ERR:42501',
  '[F13.1-a c4] the period is never written by a client');

-- ---- who reads a promotion -----------------------------------------------------------------------------------------------
select is(pg_temp.sees('b', 'pr_q1'), '1', '[F13.1-a c5 FR-ALG-007] another active account reads a running promotion (to be shown, labelled)');
select is(pg_temp.sees('s', 'pr_q1'), '0', '[F13.1-a c5 r15] a suspended account does not');
select is(pg_temp.q('b', format('select count(payment_id)::text from nestly.promotions where id = %L', pg_temp.v('pr_q1'))), 'ERR:42501',
  '[F13.1-a c5] nobody reads which payment bought a promotion (the payer lists its own payments)');
select is(pg_temp.dml('b', format('update nestly.promotions set status = ''stopped'' where id = %L', pg_temp.v('pr_q1'))), 'OK:0',
  '[F13.1-a c5] nobody else stops a promotion');
select is(pg_temp.dml('q1', format('update nestly.promotions set status = ''stopped'' where id = %L', pg_temp.v('pr_post'))), 'OK:1',
  '[F13.1-a c5 FR-SERV-010] the owner stops its promotion early');
select is(tests.fx_promo_text(format('select (stopped_at = now())::text from nestly.promotions where id = %L', pg_temp.v('pr_post'))), 'true',
  '[F13.1-a c5] stopped_at is the database clock');
select is(pg_temp.sees('b', 'pr_post'), '0', '[F13.1-a c5] a stopped promotion is no longer read by others');
select is(pg_temp.sees('q1', 'pr_post'), '1', '[F13.1-a c5] its owner still reads it');
select is(pg_temp.dml('q1', format('update nestly.promotions set status = ''active'' where id = %L', pg_temp.v('pr_post'))), 'ERR:23514',
  '[F13.1-a c5] a stopped promotion stays stopped');
select is(pg_temp.q('d', format('select count(*)::text from nestly.promotions where id in (%L, %L, %L)', pg_temp.v('pr_q1'), pg_temp.v('pr_post'), pg_temp.v('pr_l'))),
  '3', '[F13.1-a c5 §3.2] BILLING_FINANCE_MANAGE reads every promotion, stopped included');
select is(pg_temp.q('m1', format('select count(*)::text from nestly.promotions where id = %L', pg_temp.v('pr_post'))), '0',
  '[F13.1-a c5] a Moderator without the key reads only running ones like anyone');
select is(pg_temp.dml('q1', format('delete from nestly.promotions where id = %L', pg_temp.v('pr_q1'))), 'ERR:42501', '[F13.1-a c5] nobody deletes a promotion');

-- ---- paid events (FR-PRO-002, AC-062, AC-072) ------------------------------------------------------------------------------
select is(pg_temp.event('b', 'pr_q1', 'impression'), 'OK:1', '[F13.1-a c6 FR-ALG-007] a viewer records an impression of a running promotion');
select is(pg_temp.event('b', 'pr_q1', 'impression'), 'OK:0', '[F13.1-a c6] a repeat the same day adds to the same row (no new row)');
select is(pg_temp.times('pr_q1', 'b', 'impression'), '2', '[F13.1-a c6] times counts the repeats (the frequency cap reads it)');
select is(pg_temp.dml('b', format('update nestly.promotion_events set times = times + 5 where promotion_id = %L', pg_temp.v('pr_q1'))), 'ERR:42501',
  '[F13.1-a c6] a repeat adds exactly one');
select is(pg_temp.q('b', format('select coalesce(sum(times), 0)::text from nestly.promotion_events where promotion_id = %L', pg_temp.v('pr_q1'))), '2',
  '[F13.1-a c6] the viewer reads its own rows');
select is(pg_temp.event('q1', 'pr_q1', 'impression'), 'ERR:42501', '[F13.1-a c6 AC-062] the owner never counts itself');
select is(pg_temp.event('b', 'pr_post', 'impression'), 'ERR:42501', '[F13.1-a c6] no event on a stopped promotion');
select is(pg_temp.event('d', 'pr_q1', 'impression'), 'ERR:42501', '[F13.1-a c6] a staff account records nothing');
select is(pg_temp.event('b', 'pr_q1', 'follow'), 'ERR:42501', '[F13.1-a c6 FR-PRO-002] a paid follow needs the viewer''s click first');
select is(pg_temp.event('b', 'pr_q1', 'click'), 'OK:1', '[F13.1-a c6] a click');
select is(pg_temp.dml('b', format('insert into nestly.professional_follows (professional_id) values (%L)', pg_temp.id('q1'))), 'OK:1', 'b follows q1 after the click');
select is(pg_temp.times('pr_q1', 'b', 'follow'), '1', '[F13.1-a c6 FR-PRO-002] the follow after a click is the promotion''s paid follow');
select is(pg_temp.dml('b', format($q$ insert into nestly.conversations (context, user_a, user_b) values ('professional', %L, %L) $q$,
  least(pg_temp.id('b'), pg_temp.id('q1')), greatest(pg_temp.id('b'), pg_temp.id('q1')))), 'OK:1', 'b opens a conversation with q1');
select is(pg_temp.times('pr_q1', 'b', 'chat_start'), '1', '[F13.1-a c6 FR-PRO-002] the conversation after a click is the promotion''s paid chat start');
select is(pg_temp.dml('a', format('insert into nestly.professional_follows (professional_id) values (%L)', pg_temp.id('q1'))), 'OK:1', 'a follows q1 with no click');
select is(pg_temp.times('pr_q1', 'a', 'follow'), '0', '[F13.1-a c6 AC-062] a follow with no click stays organic only');
select is(pg_temp.q('q1', format('select coalesce(sum(times), 0)::text from nestly.promotion_events where promotion_id = %L', pg_temp.v('pr_q1'))), '5',
  '[F13.1-a c6 FR-PRO-002 VAL-032] the owner counts its promotion''s events');
select is(pg_temp.q('q1', format('select count(viewer_id)::text from nestly.promotion_events where promotion_id = %L', pg_temp.v('pr_q1'))), 'ERR:42501',
  '[F13.1-a c6 BR-057 AC-072] and never learns who');
select is(pg_temp.q('q1', format('select count(id)::text from nestly.promotion_events where promotion_id = %L', pg_temp.v('pr_q1'))), 'ERR:42501',
  '[F13.1-a c6 BR-057] nor follows one viewer''s row by its id');
select is(pg_temp.q('q2', format('select count(*)::text from nestly.promotion_events where promotion_id = %L', pg_temp.v('pr_q1'))), '0',
  '[F13.1-a c6 VAL-032] another Professional reads none of it');
select is(pg_temp.q('d', format('select count(*)::text from nestly.promotion_events where promotion_id = %L', pg_temp.v('pr_q1'))), '4',
  '[F13.1-a c6 §3.2] BILLING_FINANCE_MANAGE counts every promotion''s rows');
select is(tests.fx_promo_count('nestly.professional_follows where professional_id = ''' || pg_temp.id('q1') || ''''), 2::bigint,
  '[F13.1-a c6 BR-004 AC-062] the organic follows are unchanged: payment writes no organic row');
select is(pg_temp.event('b', 'pr_l', 'click'), 'OK:1', '[F13.1-a c6] a click on a promoted listing');
select is(pg_temp.dml('b', format($q$ insert into nestly.conversations (context, user_a, user_b, listing_id) values ('marketplace', %L, %L, %L) $q$,
  least(pg_temp.id('b'), pg_temp.id('a')), greatest(pg_temp.id('b'), pg_temp.id('a')), pg_temp.v('l_a'))), 'OK:1', 'b contacts the seller');
select is(pg_temp.times('pr_l', 'b', 'chat_start'), '1', '[F13.1-a c6 FR-MKT-004] the contact after the click is the listing promotion''s chat start');

-- ---- paid events cannot be made up (FR-PRO-002, VAL-032) -------------------------------------------------------------------
select is(pg_temp.event('q2', 'pr_q1', 'click'), 'OK:1', 'q2 clicks q1''s promotion');
select is(pg_temp.event('q2', 'pr_q1', 'follow'), 'ERR:42501', '[F13.1-a c9] a paid follow needs a real follow in the same transaction');
select is(pg_temp.event('q2', 'pr_q1', 'chat_start'), 'ERR:42501', '[F13.1-a c9] a paid chat start needs a real conversation in the same transaction');
select is(pg_temp.dml('b', format('delete from nestly.professional_follows where professional_id = %L', pg_temp.id('q1'))), 'OK:1', 'b unfollows q1');
select is(pg_temp.dml('b', format('insert into nestly.professional_follows (professional_id) values (%L)', pg_temp.id('q1'))), 'OK:1', 'and follows again');
select is(pg_temp.times('pr_q1', 'b', 'follow'), '1', '[F13.1-a c9] a paid follow counts once per promotion and viewer (unfollow and follow again is not a new one)');
select tests.fx_promo_age_events(pg_temp.v('pr_q1'));
select is(pg_temp.dml('b', format($q$ update nestly.promotion_events set times = times + 1 where promotion_id = %L and kind = 'impression' $q$, pg_temp.v('pr_q1'))),
  'ERR:42501', '[F13.1-a c9] an earlier day''s count never changes');
select is(pg_temp.event('b', 'pr_q1', 'impression'), 'OK:1', '[F13.1-a c9] a new day starts a new row');
select is(pg_temp.dml('b', format($q$ update nestly.promotion_events set times = times + 1 where promotion_id = %L and kind = 'click' $q$, pg_temp.v('pr_q1'))),
  'ERR:42501', '[F13.1-a c9] (the clicks of the earlier day neither)');

-- ---- a target that stops being eligible (FR-ALG-007, BR-054, AC-063) -----------------------------------------------------
select pg_temp.keep('post_pub2', pg_temp.q('q1', $$ insert into nestly.posts (audience, body) values ('everyone', 'עוד פוסט') returning id::text $$));
select is(pg_temp.pay('q1', 'pay_post2', 'post_7'), 'kept', 'a second post plan');
select is(pg_temp.promote('q1', 'pr_post2', 'post', 'post_7', 'pay_post2', pg_temp.v('post_pub2')), 'kept', 'q1 promotes another public post');
select is(pg_temp.sees('b', 'pr_post2'), '1', 'b reads it');
select is(pg_temp.dml('q1', format('update nestly.posts set audience = ''followers'' where id = %L', pg_temp.v('post_pub2'))), 'OK:1', 'q1 narrows the post to its followers');
select is(pg_temp.sees('b', 'pr_post2'), '0', '[F13.1-a c10 AC-063] a promoted post no longer to everyone is not shown, though paid');
select is(pg_temp.event('b', 'pr_post2', 'impression'), 'ERR:42501', '[F13.1-a c10 AC-063] and records no paid event');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set status = ''sold'' where id = %L', pg_temp.v('l_a'))), 'OK:1', 'a marks its promoted listing sold');
select is(pg_temp.sees('b', 'pr_l'), '0', '[F13.1-a c10 AC-063] a sold listing''s promotion is not shown');
select is(pg_temp.sees('a', 'pr_l'), '1', '[F13.1-a c10] its owner still reads it');
select is(pg_temp.dml('a', format('update nestly.marketplace_listings set status = ''active'' where id = %L', pg_temp.v('l_a'))), 'OK:1', 'and back');

-- ---- a promotion that ended ------------------------------------------------------------------------------------------------
select tests.fx_promo_end(pg_temp.v('pr_q1'));
select is(pg_temp.sees('b', 'pr_q1'), '0', '[F13.1-a c7 FR-ALG-007] an ended promotion is no longer read by others');
select is(pg_temp.sees('q1', 'pr_q1'), '1', '[F13.1-a c7] its owner still reads it (the results screen)');
select is(pg_temp.event('a', 'pr_q1', 'impression'), 'ERR:42501', '[F13.1-a c7] no event after the end');
select is(pg_temp.dml('q1', format('update nestly.promotions set status = ''stopped'' where id = %L', pg_temp.v('pr_q1'))), 'ERR:23514',
  '[F13.1-a c7] an ended promotion is not stopped');
select is(pg_temp.promote('q1', 'pr_q1b', 'profile', 'profile_30', 'pay_q1_profile2'), 'kept', '[F13.1-a c7] after the end the profile can be promoted again');

-- ---- a user block ----------------------------------------------------------------------------------------------------------
select is(pg_temp.sees('b', 'pr_l'), '1', 'b reads a''s running listing promotion');
select is(pg_temp.dml('b', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('a'))), 'OK:1', 'b blocks a');
select is(pg_temp.sees('b', 'pr_l'), '0', '[F13.1-a c8 FR-REL-002] never across a user block');

select * from finish();
rollback;
