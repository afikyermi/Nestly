-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 rest PR-A: hiding a post, F3.9 S1-S3).
-- Source of expected values: .work/i3-rest-schema/schema.md (SQLSTATE contract) and .work/hide-post/spec.md (S1-S3), not the migration text.
-- Codes: 42501 the caller is not an active Regular account; NS003 the caller's own post; NS004 an unreadable or unknown post (the same code for both).
-- A repeat hide of a post the caller already hid is not refused by the guard: it reaches the primary key.
-- People: A (author), B (the hider), C = friend of A (built below), S, X = suspended, banned, P = Professional.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.9 fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'x' then tests.fx_id('x') when 'c' then tests.fx_fr_id('fr_c')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon)
$f$;
create function pg_temp.hide_sql(p_post uuid, p_skip boolean default false) returns text language sql as $f$
  select format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, p_post) || case when p_skip then ' on conflict do nothing' else '' end
$f$;
create function pg_temp.setst(p_post uuid, p_status text) returns uuid language plpgsql as $f$
begin
  perform tests.fx_po_status(p_post, p_status);
  return p_post;
end
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  perform tests.fx_feed_clear();
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'b', 'c'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
end
$f$;

select is(tests.fx_po_count() + tests.fx_pa_count() + tests.fx_ph_count(), 0::bigint, '[F3.9 fixture] no feed row exists before the file starts');

-- =====================================================================================================================
-- S1 -- a readable post of someone else; the repeat
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'OK:1', '[F3.9 c1] a readable post of another is hidden (1 row)');
select is(tests.fx_ph_count(), 1::bigint, '[F3.9 c1] one hide row exists');
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid, true)), 'OK:0', '[F3.9 c1] a repeat hide with on conflict do nothing is idempotent (0 rows)');
select is(tests.fx_ph_count(), 1::bigint, '[F3.9 c1] still one hide row');
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'ERR:23505', '[F3.9 c1] a plain repeat hide reaches the primary key (23505), not NS004');
select is(tests.fx_ph_count(), 1::bigint, '[F3.9 c1] and adds no row');

-- a Friend hides a friends-only post they can read
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.dml('c', pg_temp.hide_sql(pg_temp.post('a', 'friends'))), 'OK:1', '[F3.9 c1] a Friend hides a friends-only post they can read');

-- =====================================================================================================================
-- S2 -- unreadable and unknown: NS004, one code, no row
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('b', pg_temp.hide_sql(pg_temp.post('a', 'friends'))), 'ERR:NS004', '[F3.9 S1 c2] a friends-only post of a non-Friend (NS004)');
select is(pg_temp.dml('b', pg_temp.hide_sql(pg_temp.setst(pg_temp.post('a'), st.s))), 'ERR:NS004', '[F3.9 S1 c2] a post with status ' || st.s || ' (NS004)')
  from (values ('deleted'), ('hidden'), ('removed')) st(s);
select set_config('t.o', pg_temp.post('a')::text, true);
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'ERR:NS004', '[F3.9 S1 c2] the author is suspended (NS004)');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'ERR:NS004', '[F3.9 S1 c2] the author is banned (NS004)');
select tests.set_status(pg_temp.id('a'), 'active');
select set_config('t.o5', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.o5')::uuid, 'spam');
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o5')::uuid)), 'ERR:NS004', '[F3.9 S1 c2] a post the caller reported (NS004)');
select is(pg_temp.dml('b', pg_temp.hide_sql(gen_random_uuid())), 'ERR:NS004', '[F3.9 S1 c2] an unknown uuid is NS004, not 23503: the same code as an unreadable post');
select is(pg_temp.dml('b', pg_temp.hide_sql(gen_random_uuid(), true)), 'ERR:NS004', '[F3.9 S1 c2] an unknown uuid with on conflict do nothing is NS004 too');
select is(tests.fx_ph_count(), 0::bigint, '[F3.9 S1 c2] no refusal wrote a hide row');

-- =====================================================================================================================
-- S3 -- own post: NS003 when readable, NS004 when held
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('a', pg_temp.hide_sql(pg_temp.post('a'))), 'ERR:NS003', '[F3.9 S3 c3] the author''s own named post (NS003)');
select is(pg_temp.dml('a', pg_temp.hide_sql(pg_temp.post('a', 'everyone', true))), 'ERR:NS003', '[F3.9 S3 c3] the author''s own anonymous post (NS003)');
select is(pg_temp.dml('a', pg_temp.hide_sql(pg_temp.post('a', 'friends'))), 'ERR:NS003', '[F3.9 S3 c3] the author''s own friends-only post (NS003)');
select set_config('t.own_held', pg_temp.setst(pg_temp.post('a'), 'deleted')::text, true);
-- the author reads a post they just held only inside the holding transaction; move that mark away (the state after commit)
select tests.fx_hold_settle('post', current_setting('t.own_held')::uuid);
select is(pg_temp.dml('a', pg_temp.hide_sql(current_setting('t.own_held')::uuid)), 'ERR:NS004', '[F3.9 S3 c2] the author''s own held (deleted) post is unreadable: NS004');
select is(tests.fx_ph_count(), 0::bigint, '[F3.9 S3 c3] no refusal wrote a hide row');

-- =====================================================================================================================
-- c7 -- the caller must be an active Regular account: 42501
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'ERR:42501', '[F3.9 c7] a suspended caller (42501)');
select is(pg_temp.dml('b', pg_temp.hide_sql(gen_random_uuid())), 'ERR:42501', '[F3.9 c7] a suspended caller, unknown post: 42501, not NS004');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.dml('p', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'ERR:42501', '[F3.9 c7] a Professional (42501)');
select is(pg_temp.dml('p', pg_temp.hide_sql(gen_random_uuid())), 'ERR:42501', '[F3.9 c7] a Professional, unknown post: 42501, not NS004 or 23503');
select is(tests.fx_ph_count(), 0::bigint, '[F3.9 c7] no refusal wrote a hide row');

-- =====================================================================================================================
-- whose rows: a hide is private to the hider
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', pg_temp.hide_sql(current_setting('t.o')::uuid)), 'OK:1', '[F3.9 S2] B hides A''s post');
select is(tests.n_as(pg_temp.id('a'), 'nestly.post_hides'), '0', '[F3.9 S2] the post''s author reads 0 hides');
select is(tests.n_as(pg_temp.id('c'), 'nestly.post_hides'), '0', '[F3.9 S2] a third person reads 0 hides');
select is(tests.n_as(pg_temp.id('b'), 'nestly.post_hides'), '1', '[F3.9 S2] the hider reads their own hide');
select is(pg_temp.dml('a', 'delete from nestly.post_hides'), 'OK:0', '[F3.9 S2] the author deletes 0 of B''s hides');
select is(pg_temp.dml('c', 'delete from nestly.post_hides'), 'OK:0', '[F3.9 S2] a third person deletes 0 of B''s hides');
select is(tests.fx_ph_count(), 1::bigint, '[F3.9 S2] B''s hide is still there');

select * from finish();
rollback;
