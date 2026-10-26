-- pgTAP, run by pg_prove as app_server (CI `db` job): the report text cap moves to 500 (VAL-048, Afik 21.10.2026) and keeps every
-- report written before 2026-10-26 00:00 UTC at the older 1,000 bound, so no user data changes and an old report can still be closed.
-- Source of expected values: VAL-048 (500 code points) and the migration's stated cutoff (20261026200000_reports_details_500.sql).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[VAL-048 fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

select set_config('t.p1', tests.fx_po_add(tests.fx_id('a'))::text, true);
select set_config('t.p2', tests.fx_po_add(tests.fx_id('a'))::text, true);
select set_config('t.p3', tests.fx_po_add(tests.fx_id('a'))::text, true);

-- the constraint is validated (no NOT VALID left behind)
select is((select c.convalidated from pg_catalog.pg_constraint c
            where c.conrelid = (select cl.oid from pg_catalog.pg_class cl join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace where ns.nspname = 'nestly' and cl.relname = 'reports') and c.conname = 'reports_details_length_check'), true,
          '[VAL-048] reports_details_length_check is a validated CHECK');

-- an older report keeps up to 1,000
select lives_ok(format($q$ select tests.fx_rp_add_at(%L, %L, repeat('x', 800), timestamptz '2026-10-20 10:00:00+00') $q$, tests.fx_id('b'), current_setting('t.p1')),
                '[VAL-048] a report created before 2026-10-26 with 800 characters stays valid (older rows are not changed)');
select throws_ok(format($q$ select tests.fx_rp_add_at(%L, %L, repeat('x', 1001), timestamptz '2026-10-20 10:00:00+00') $q$, tests.fx_id('c'), current_setting('t.p1')),
                 '23514', null, '[VAL-048] even an older report is at most 1,000 characters');

-- closing that older report still works (the CHECK runs on every UPDATE of the row)
select lives_ok(format($q$ select tests.fx_rp_set(%L, 'handled') $q$, (select tests.fx_rp_id(tests.fx_id('b'), current_setting('t.p1')::uuid))),
                '[VAL-048] handling an older report with 800 characters succeeds');

-- from the cutoff on: 500
select throws_ok(format($q$ select tests.fx_rp_add_at(%L, %L, repeat('x', 501), timestamptz '2026-10-26 00:00:00+00') $q$, tests.fx_id('b'), current_setting('t.p2')),
                 '23514', null, '[VAL-048] a report created at the cutoff with 501 characters: 23514');
select throws_ok(format($q$ select tests.fx_rp_add_at(%L, %L, repeat(chr(128512), 501), now()) $q$, tests.fx_id('b'), current_setting('t.p2')),
                 '23514', null, '[VAL-048] a new report with 501 emoji: 23514');
select lives_ok(format($q$ select tests.fx_rp_add_at(%L, %L, repeat('ש', 500), now()) $q$, tests.fx_id('b'), current_setting('t.p2')),
                '[VAL-048] a new report with 500 Hebrew letters is accepted');

-- a client cannot claim the older bound: created_at is not writable by authenticated
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('b')),
            format($q$ insert into nestly.reports (target_kind, post_id, reason, details, created_at) values ('post', %L, 'other', repeat('x', 600), timestamptz '2026-10-01 00:00:00+00') $q$, current_setting('t.p3'))),
          'ERR:42501', '[VAL-048] a client insert that names created_at is refused (42501), so a new row cannot take the older bound');

select * from finish();
rollback;
