-- pgTAP, run by pg_prove as app_server (CI `db` job, F3.1-a criterion 6: the posts.body length cap, carried by F3.0b's migration).
-- Source of expected values: .work/post-create/spec.md criterion 6 and VAL "2,000 characters", not the migration text.
-- 2,000 characters insert; 2,001 -> 23514 on insert, on update and on share text. The up -> down -> up of the migration is the CI
-- migrations step (fingerprint compare), which covers the CHECK; the structure expectation is in file 73.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.1-a c6] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.dml(p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), p_sql)
$f$;

-- boundary: exactly 2,000 characters, and a multibyte (Hebrew) body that is 2,000 characters but 4,000 bytes
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat('x', 2000))), 'OK:1', '[F3.1-a c6] a 2,000-character body is accepted');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat(U&'\05D0', 2000))), 'OK:1', '[F3.1-a c6] 2,000 Hebrew characters (4,000 bytes) are accepted: the cap counts characters');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat('x', 2001))), 'ERR:23514', '[F3.1-a c6] a 2,001-character body is refused with 23514 on insert');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat(U&'\05D0', 2001))), 'ERR:23514', '[F3.1-a c6] 2,001 Hebrew characters are refused too');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat('x', 100000))), 'ERR:23514', '[F3.1-a c6] a very long body is refused');

-- update
select set_config('t.p', tests.fx_po_add(tests.fx_id('a'))::text, true);
select is(pg_temp.dml(format($q$ update nestly.posts set body = %L where id = %L $q$, repeat('y', 2000), current_setting('t.p'))), 'OK:1', '[F3.1-a c6] updating to 2,000 characters is accepted');
select is(pg_temp.dml(format($q$ update nestly.posts set body = %L where id = %L $q$, repeat('y', 2001), current_setting('t.p'))), 'ERR:23514', '[F3.1-a c6] updating to 2,001 characters is refused with 23514');
select is(tests.fx_po_state(current_setting('t.p')::uuid) ~ ('body=' || repeat('y', 2000) || '$'), true, '[F3.1-a c6] and the stored body is the 2,000-character one');

-- share text (a share is a post whose body is the sharer's own words)
select set_config('t.o', tests.fx_po_add(tests.fx_id('b'))::text, true);
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, shared_post_id, body) values ('everyone', %L, %L) $q$, current_setting('t.o'), repeat('s', 2000))), 'OK:1', '[F3.1-a c6] share text of 2,000 characters is accepted');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, shared_post_id, body) values ('everyone', %L, %L) $q$, current_setting('t.o'), repeat('s', 2001))), 'ERR:23514', '[F3.1-a c6] share text of 2,001 characters is refused with 23514');
select is(pg_temp.dml(format($q$ insert into nestly.posts (audience, shared_post_id) values ('everyone', %L) $q$, current_setting('t.o'))), 'OK:1', '[F3.1-a c6] a share with no text is still accepted (NULL passes)');

select * from finish();

rollback;
