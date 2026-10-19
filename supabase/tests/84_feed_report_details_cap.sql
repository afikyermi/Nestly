-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 rest PR-A: the report text cap, F3.7 c3 / Q1).
-- Source of expected values: .work/report/spec.md (details at most 1,000 code points) and .work/i3-rest-schema/schema.md (23514), not the migration text.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.7 fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.dml(p_who uuid, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(p_who), p_sql, p_keep)
$f$;
create function pg_temp.rp_sql(p_target uuid, p_reason text, p_details text) returns text language sql as $f$
  select format($q$ insert into nestly.reports (target_kind, post_id, reason, details) values ('post', %L, %L, %L) $q$, p_target, p_reason, p_details)
$f$;

select is(tests.fx_rp_count(), 0::bigint, '[F3.7 fixture] no report exists before the file starts');

select set_config('t.p', tests.fx_po_add(tests.fx_id('a'))::text, true);

-- boundary: 1,000 code points
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat('x', 1000)), false), 'OK:1', '[F3.7 c3 Q1] 1,000 ASCII characters are accepted');
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat(chr(128512), 1000)), false), 'OK:1', '[F3.7 c3 Q1] 1,000 emoji (4 bytes each, 1,000 code points) are accepted');
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat('ש', 1000)), false), 'OK:1', '[F3.7 c3 Q1] 1,000 Hebrew letters (2 bytes each) are accepted');

-- one past the maximum
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat('x', 1001))), 'ERR:23514', '[F3.7 c3 Q1] 1,001 ASCII characters: 23514');
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat(chr(128512), 1001))), 'ERR:23514', '[F3.7 c3 Q1] 1,001 emoji: 23514');
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat('ש', 1001))), 'ERR:23514', '[F3.7 c3 Q1] 1,001 Hebrew letters: 23514');
select is(pg_temp.dml(tests.fx_id('b'), pg_temp.rp_sql(current_setting('t.p')::uuid, 'other', repeat('x', 100000))), 'ERR:23514', '[F3.7 c3 Q1] a very long text: 23514');

-- the constraint is named, so the server can map it; an optional text may be absent
select is((select count(*) from pg_catalog.pg_constraint c where c.conrelid = (select cl.oid from pg_catalog.pg_class cl join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace where ns.nspname = 'nestly' and cl.relname = 'reports') and c.conname = 'reports_details_length_check' and c.contype = 'c'), 1::bigint, '[F3.7 c3 Q1] the cap is a named CHECK constraint, reports_details_length_check');
select is(pg_temp.dml(tests.fx_id('b'), format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'spam') $q$, current_setting('t.p')), false), 'OK:1', '[F3.7 c3] a report without text is accepted (NULL passes the cap)');
select is(tests.fx_rp_count(), 0::bigint, '[F3.7 c3] no refused report left a row');

select * from finish();
rollback;
