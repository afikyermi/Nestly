-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0b feed-groundwork: the plan of the feed's base query under RLS).
-- Source of the expectation: .work/feed-groundwork/schema.md "EXPLAIN check": as `authenticated` with a viewer's claims and sequential scans
-- discouraged, the base feed query, its keyset form and the 14-day window read posts_feed_idx in order, with no Sort node.
-- Run after the F3.0b migration (posts_select_viewer gained its held branch there). Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-b c16] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

-- a few rows so that the planner has something to choose from
select tests.fx_po_add(tests.fx_id('a'), 'everyone') from generate_series(1, 600);
select tests.fx_po_add(tests.fx_id('a'), 'friends') from generate_series(1, 100);
select tests.fx_analyze_posts();

create function pg_temp.plan(p_sql text) returns text language plpgsql as $f$
declare
  v text;
begin
  perform set_config('enable_seqscan', 'off', true);
  v := tests.as_role('authenticated', tests.claims(tests.fx_id('b')), 'explain (format json) ' || p_sql);
  perform set_config('enable_seqscan', 'on', true);
  return v;
end
$f$;

create function pg_temp.q(p_where text) returns text language sql as $f$
  select 'select id from nestly.posts where ' || p_where || ' order by created_at desc, id desc limit 21'
$f$;

select ok(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00'$$)) !~ '^ERR', '[F3.0-b c16] control: the base feed query plans as authenticated');
select matches(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00'$$)), '"Index Name": "posts_feed_idx"', '[F3.0-b c16] the base feed query reads posts_feed_idx');
select doesnt_match(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00'$$)), '"Node Type": "Sort"', '[F3.0-b c16] and has no Sort node');

select matches(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00' and (created_at, id) < ('2026-10-18 11:00:00+00', '8a000000-0000-4000-8000-000000000000')$$)),
  '"Index Name": "posts_feed_idx"', '[F3.0-b c16] the keyset form reads posts_feed_idx');
select doesnt_match(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00' and (created_at, id) < ('2026-10-18 11:00:00+00', '8a000000-0000-4000-8000-000000000000')$$)),
  '"Node Type": "Sort"', '[F3.0-b c16] and has no Sort node');

select matches(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00' and created_at > timestamptz '2026-10-18 12:00:00+00' - interval '14 days'$$)),
  '"Index Name": "posts_feed_idx"', '[F3.0-b c16] the 14-day window reads posts_feed_idx');
select doesnt_match(pg_temp.plan(pg_temp.q($$created_at <= '2026-10-18 12:00:00+00' and created_at > timestamptz '2026-10-18 12:00:00+00' - interval '14 days'$$)),
  '"Node Type": "Sort"', '[F3.0-b c16] and has no Sort node');

select * from finish();

rollback;
