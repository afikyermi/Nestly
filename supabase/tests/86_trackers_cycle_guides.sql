-- pgTAP, run by pg_prove as app_server (CI `db` job, I6: trackers, cycle, status guides).
-- Source of expected values: SRS FR-TRACK-001/002, AC-007, AC-023, AC-095, BR-053, BR-070 and Afik's decision of 18.10.2026
-- (OP-008: owner-only health data), not the migration text.
-- People (fixtures of supabase/tests/setup/): a regular active with children slot 1 and slot 2; b regular active with child slot 1;
-- s suspended; x banned; p professional. Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F6.0-a c1 · I6 fixture] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$ select tests.fx_id(p) $f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.rel(p_name text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'nestly' and c.relname = p_name
$f$;
-- A tracker_events INSERT: kind, child, and the value columns as a "col = value" list.
create function pg_temp.ev(p_child uuid, p_kind text, p_cols text, p_vals text) returns text language sql as $f$
  select format('insert into nestly.tracker_events (child_id, kind, %s) values (%L, %L, %s)', p_cols, p_child, p_kind, p_vals)
$f$;

create temp table zz_i6 as select
  tests.fx_child_id(tests.fx_id('a'), 1) as a1, tests.fx_child_id(tests.fx_id('a'), 2) as a2, tests.fx_child_id(tests.fx_id('b'), 1) as b1;
select ok((select a1 is not null and a2 is not null and b1 is not null from zz_i6), '[I6 fixture] the three child ids were read (the tests below are not vacuous)');
select is(tests.fx_te_count() + tests.fx_ce_count(), 0::bigint, '[I6 fixture] no tracker or cycle row exists before the file starts');

-- =====================================================================================================================
-- Structure
-- =====================================================================================================================
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('tracker_events', 'cycle_entries', 'status_guides')
      and c.relrowsecurity and c.relforcerowsecurity),
  3::bigint, '[I6 platform r8] the three tables have RLS enabled and forced');

select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('tracker_events', 'cycle_entries', 'status_guides') $$,
  $$ values ('tracker_events.tracker_events_select_own.r'), ('tracker_events.tracker_events_insert_own.a'),
            ('tracker_events.tracker_events_update_own.w'), ('tracker_events.tracker_events_delete_own.d'),
            ('cycle_entries.cycle_entries_select_own.r'), ('cycle_entries.cycle_entries_insert_own.a'),
            ('cycle_entries.cycle_entries_update_own.w'), ('cycle_entries.cycle_entries_delete_own.d'),
            ('status_guides.status_guides_select_published.r'), ('status_guides.status_guides_select_admin.r'),
            ('status_guides.status_guides_insert_admin.a'), ('status_guides.status_guides_update_admin.w') $$,
  '[I6 layer 9] the policies are exactly these twelve: the owner for events and cycle, published rows for users and the Admin''s own for guides (file 87)');

select is(
  (select count(*) from pg_catalog.pg_policy pol
    where pol.polrelid in (pg_temp.rel('tracker_events'), pg_temp.rel('cycle_entries'), pg_temp.rel('status_guides'))
      and pol.polroles <> array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]),
  0::bigint, '[I6] every policy is TO authenticated only');

select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = pg_temp.rel('tracker_events') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') $$,
  $$ values ('child_id'), ('kind'), ('occurred_at'), ('ended_at'), ('amount_ml'), ('choice'), ('name'), ('dosage'),
            ('weight_kg'), ('height_cm'), ('head_cm'), ('note') $$,
  '[I6 rules 12 13] authenticated can INSERT exactly the data columns of tracker_events (never id, user_id or created_at)');
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = pg_temp.rel('tracker_events') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  $$ values ('occurred_at'), ('ended_at'), ('amount_ml'), ('choice'), ('name'), ('dosage'), ('weight_kg'), ('height_cm'), ('head_cm'), ('note') $$,
  '[I6] authenticated can UPDATE the data columns of tracker_events, never kind or child_id');
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = pg_temp.rel('cycle_entries') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  $$ values ('start_date'), ('cycle_length_days') $$,
  '[I6] authenticated can UPDATE exactly start_date and cycle_length_days of cycle_entries');
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = pg_temp.rel('cycle_entries') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') $$,
  $$ values ('start_date'), ('cycle_length_days') $$,
  '[I6 rules 12 13] authenticated can INSERT exactly start_date and cycle_length_days');
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = pg_temp.rel('status_guides') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') $$,
  $$ values ('stage_kind'), ('range_from'), ('range_to'), ('title'), ('body'), ('source'), ('source_checked_on') $$,
  '[I6 AC-095] authenticated can INSERT exactly the content columns of status_guides (never status or published_at: a new guide is a draft)');
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = pg_temp.rel('status_guides') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  $$ values ('stage_kind'), ('range_from'), ('range_to'), ('title'), ('body'), ('source'), ('source_checked_on'), ('status') $$,
  '[I6 AC-095] authenticated can UPDATE the content columns and status, never published_at (the database stamps it)');
select is(has_table_privilege('authenticated', pg_temp.rel('status_guides'), 'DELETE'), false, '[I6 AC-095] authenticated cannot delete a guide');
select is(
  (select count(*) from (values ('tracker_events'), ('cycle_entries'), ('status_guides')) t(n)
    where has_any_column_privilege('anon', pg_temp.rel(t.n), 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_table_privilege('anon', pg_temp.rel(t.n), 'SELECT,INSERT,UPDATE,DELETE')),
  0::bigint, '[I6 rule 7] anon holds nothing on the three tables');

select is(
  (select count(*) from pg_catalog.pg_attribute a
    where a.attrelid in (pg_temp.rel('tracker_events'), pg_temp.rel('cycle_entries'), pg_temp.rel('status_guides'))
      and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', a.attrelid, a.attnum, 'REFERENCES')),
  0::bigint, '[I6] authenticated holds no column-level REFERENCES on the three tables');

-- =====================================================================================================================
-- tracker_events: whose rows (BR-053, layer 9, OP-008 "only the user sees")
-- =====================================================================================================================
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bottle', 'occurred_at, amount_ml', $$now(), 120$$)), 'OK:1',
  '[I6 AC-007] the owner saves a bottle event for their own child');
select is(tests.n_as(pg_temp.id('a'), 'nestly.tracker_events'), '1', '[I6 AC-007] and reads it back');
select is(tests.n_as(pg_temp.id('b'), 'nestly.tracker_events'), '0', '[I6 BR-053] another account reads 0 of it');
select is(tests.n_as(pg_temp.id('p'), 'nestly.tracker_events'), '0', '[I6 BR-053] a Professional reads 0 of it');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.tracker_events'), 'ERR:42501', '[I6 rule 7] anon is refused (42501)');
select is(pg_temp.dml('b', 'update nestly.tracker_events set amount_ml = 5'), 'OK:0', '[I6 BR-053] another account updates 0 rows');
select is(pg_temp.dml('b', 'delete from nestly.tracker_events'), 'OK:0', '[I6 BR-053] another account deletes 0 rows');
select is(pg_temp.dml('b', pg_temp.ev((select a1 from zz_i6), 'bottle', 'occurred_at, amount_ml', $$now(), 90$$)), 'ERR:42501',
  '[I6 layer 9] another account cannot log an event for someone else''s child (42501)');
select is(pg_temp.dml('a', pg_temp.ev((select b1 from zz_i6), 'bottle', 'occurred_at, amount_ml', $$now(), 90$$)), 'ERR:42501',
  '[I6 layer 9] and the reverse (42501)');
select is(pg_temp.dml('a', format($q$ insert into nestly.tracker_events (user_id, child_id, kind, occurred_at, amount_ml) values (%L, %L, 'bottle', now(), 50) $q$,
  pg_temp.id('b'), (select a1 from zz_i6))), 'ERR:42501', '[I6 rule 12] the owner column cannot be sent (42501)');
select is(pg_temp.dml('p', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at', 'now()')), 'ERR:42501', '[I6] a Professional cannot log an event, even naming a real child (42501)');
select is(tests.fx_te_count(), 1::bigint, '[I6] the refusals wrote no row');

select tests.set_status(pg_temp.id('a'), 'suspended');
select is(tests.n_as(pg_temp.id('a'), 'nestly.tracker_events'), '0', '[I6 rule 15] a suspended owner reads 0 rows');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at', 'now()')), 'ERR:42501', '[I6 rule 15] a suspended owner cannot write (42501)');
select is(pg_temp.dml('a', 'update nestly.tracker_events set amount_ml = 10'), 'OK:0', '[I6 rule 15] a suspended owner updates 0 rows');
select is(pg_temp.dml('a', 'delete from nestly.tracker_events'), 'OK:0', '[I6 rule 15] a suspended owner deletes 0 rows');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(tests.n_as(pg_temp.id('a'), 'nestly.tracker_events'), '0', '[I6 rule 15] a banned owner reads 0 rows');
select tests.set_status(pg_temp.id('a'), 'active');
select is(tests.n_as(pg_temp.id('a'), 'nestly.tracker_events'), '1', '[I6] the owner reads it again once active');

-- =====================================================================================================================
-- tracker_events: the fields of each kind (FR-TRACK-001, FR-TRACK-002, AC-023)
-- =====================================================================================================================
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'breastfeeding', 'occurred_at, ended_at, choice', $$'2026-10-20 08:00+00', '2026-10-20 08:20+00', 'left'$$)),
  'OK:1', '[I6 AC-023] a breastfeeding with an end after its start is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'breastfeeding', 'occurred_at, ended_at, choice', $$'2026-10-20 08:00+00', '2026-10-20 08:00+00', 'right'$$)),
  'OK:1', '[I6 AC-023] an end equal to the start is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'breastfeeding', 'occurred_at, ended_at, choice', $$'2026-10-20 08:00+00', '2026-10-20 07:59+00', 'left'$$)),
  'ERR:23514', '[I6 AC-023] an end before the start is refused (23514)');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'breastfeeding', 'occurred_at, ended_at, choice', $$'2026-10-20 08:00+00', '2026-10-20 08:10+00', 'middle'$$)),
  'ERR:23514', '[I6 FR-TRACK-002] a side other than left or right is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'breastfeeding', 'occurred_at, choice', $$'2026-10-20 08:00+00', 'left'$$)),
  'ERR:23514', '[I6 FR-TRACK-002] a breastfeeding without an end is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'sleep', 'occurred_at, ended_at', $$'2026-10-20 20:00+00', '2026-10-21 04:00+00'$$)),
  'OK:1', '[I6 FR-TRACK-001] a sleep with start and end is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'sleep', 'occurred_at, ended_at', $$'2026-10-20 20:00+00', '2026-10-20 19:00+00'$$)),
  'ERR:23514', '[I6 AC-023] a sleep ending before it starts is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'sleep', 'occurred_at', $$now()$$)), 'ERR:23514', '[I6] a sleep without an end is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bottle', 'occurred_at', 'now()')), 'ERR:23514', '[I6] a bottle without an amount is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bottle', 'occurred_at, amount_ml', 'now(), 0')), 'ERR:23514', '[I6] a bottle of 0 ml is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bottle', 'occurred_at, amount_ml', 'now(), 1001')), 'ERR:23514', '[I6] a bottle of 1001 ml is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'diaper', 'occurred_at, choice', $$now(), 'wet'$$)), 'OK:1', '[I6] a wet diaper is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'diaper', 'occurred_at, choice', $$now(), 'dirty'$$)), 'OK:1', '[I6] a dirty diaper is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'diaper', 'occurred_at, choice', $$now(), 'both'$$)), 'ERR:23514', '[I6] another diaper value is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'medicine', 'occurred_at, name, dosage', $$now(), 'אקמול', '2.5 מ"ל'$$)), 'OK:1', '[I6] a medicine with a name and a dose is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'medicine', 'occurred_at, name', $$now(), 'אקמול'$$)), 'ERR:23514', '[I6] a medicine without a dose is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'medicine', 'occurred_at, name, dosage', $$now(), '   ', '5'$$)), 'ERR:23514', '[I6] a blank medicine name is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'growth', 'occurred_at, weight_kg', 'now(), 4.35')), 'OK:1', '[I6] a growth with a weight only is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'growth', 'occurred_at, weight_kg, height_cm, head_cm', 'now(), 8.2, 70.5, 44.1')), 'OK:1', '[I6] a growth with weight, height and head is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'growth', 'occurred_at', 'now()')), 'ERR:23514', '[I6] a growth with no measure is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'growth', 'occurred_at, height_cm', 'now(), 10')), 'ERR:23514', '[I6] a height of 10 cm is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'vaccine', 'occurred_at, name', $$now(), 'MMR'$$)), 'OK:1', '[I6] a vaccine with a name is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'vaccine', 'occurred_at', 'now()')), 'ERR:23514', '[I6] a vaccine without a name is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at', 'now()')), 'OK:1', '[I6] a bath is saved with no value');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at, amount_ml', 'now(), 10')), 'ERR:23514', '[I6] a bath with a value of another kind is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bottle', 'occurred_at, amount_ml, name', $$now(), 100, 'x'$$)), 'ERR:23514', '[I6] a bottle with a column of another kind is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'nap', 'occurred_at', 'now()')), 'ERR:23514', '[I6] an unknown kind is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at, note', $$now(), 'שלום'$$)), 'OK:1', '[I6 OP-008] the optional note is saved');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at, note', $$now(), '   '$$)), 'ERR:23514', '[I6] a blank note is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at, note', format('now(), %L', repeat('x', 501)))), 'ERR:23514', '[I6] a note over 500 characters is refused');
select is(pg_temp.dml('a', pg_temp.ev((select a1 from zz_i6), 'bath', 'occurred_at', $$'1999-12-31 00:00+00'$$)), 'ERR:23514', '[I6] a time before 2000 is refused');

-- update: the data columns only
select is(pg_temp.dml('a', $$ update nestly.tracker_events set amount_ml = 150 where kind = 'bottle' $$), 'OK:1', '[I6 CRUD] the owner edits the amount of a bottle');
select is(pg_temp.dml('a', $$ update nestly.tracker_events set amount_ml = null where kind = 'bottle' $$), 'ERR:23514', '[I6 CRUD] an edit that breaks the kind''s fields is refused');
select is(pg_temp.dml('a', $$ update nestly.tracker_events set kind = 'bath' where kind = 'bottle' $$), 'ERR:42501', '[I6] the kind cannot be changed (42501)');
select is(pg_temp.dml('a', format($q$ update nestly.tracker_events set child_id = %L where kind = 'bottle' $q$, (select a2 from zz_i6))), 'ERR:42501', '[I6] the child cannot be changed (42501)');
select is(pg_temp.dml('a', format($q$ update nestly.tracker_events set user_id = %L where kind = 'bottle' $q$, pg_temp.id('b'))), 'ERR:42501', '[I6 rule 12] the owner cannot be changed (42501)');
select is(pg_temp.dml('a', $$ update nestly.tracker_events set ended_at = occurred_at - interval '1 minute' where kind = 'sleep' $$), 'ERR:23514', '[I6 AC-023] an edit that puts the end before the start is refused');

-- delete, and the cascade from a child
select is(pg_temp.dml('a', $$ delete from nestly.tracker_events where kind = 'bath' $$), 'OK:2', '[I6 CRUD] the owner deletes events');
select is(pg_temp.dml('a', pg_temp.ev((select a2 from zz_i6), 'bath', 'occurred_at', 'now()')), 'OK:1', '[I6] an event for the second child');
select is(pg_temp.dml('a', format($q$ delete from nestly.children where id = %L $q$, (select a2 from zz_i6))), 'OK:1', '[I6] the owner removes the second child');
select is(tests.n_as(pg_temp.id('a'), format('nestly.tracker_events where child_id = %L', (select a2 from zz_i6))), '0', '[I6] the removed child''s events went with it');

-- =====================================================================================================================
-- cycle_entries
-- =====================================================================================================================
select is(pg_temp.dml('a', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('2026-09-20', 28) $$), 'OK:1', '[I6 FR-TRACK-001] the owner saves a cycle start and length');
select is(tests.n_as(pg_temp.id('a'), 'nestly.cycle_entries'), '1', '[I6] and reads it back');
select is(tests.n_as(pg_temp.id('b'), 'nestly.cycle_entries'), '0', '[I6 BR-053] another account reads 0');
select is(tests.n_as(pg_temp.id('p'), 'nestly.cycle_entries'), '0', '[I6 BR-053] a Professional reads 0');
select is(pg_temp.dml('b', 'update nestly.cycle_entries set cycle_length_days = 30'), 'OK:0', '[I6 BR-053] another account updates 0');
select is(pg_temp.dml('b', 'delete from nestly.cycle_entries'), 'OK:0', '[I6 BR-053] another account deletes 0');
select is(pg_temp.dml('a', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('2026-09-20', 30) $$), 'ERR:23505', '[I6] a second entry for the same date is refused (23505)');
select is(pg_temp.dml('a', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('2026-08-20', 14) $$), 'ERR:23514', '[I6] a length of 14 days is refused');
select is(pg_temp.dml('a', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('2026-08-20', 61) $$), 'ERR:23514', '[I6] a length of 61 days is refused');
select is(pg_temp.dml('a', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('1999-12-31', 28) $$), 'ERR:23514', '[I6] a start before 2000 is refused');
select is(pg_temp.dml('a', format($q$ insert into nestly.cycle_entries (user_id, start_date, cycle_length_days) values (%L, '2026-08-20', 28) $q$, pg_temp.id('b'))), 'ERR:42501', '[I6 rule 12] the owner column cannot be sent (42501)');
select is(pg_temp.dml('p', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('2026-08-20', 28) $$), 'ERR:42501', '[I6] a Professional cannot save a cycle entry (42501)');
select is(pg_temp.dml('a', $$ update nestly.cycle_entries set cycle_length_days = 30 $$), 'OK:1', '[I6 CRUD] the owner edits the length');
select is(pg_temp.dml('a', format($q$ update nestly.cycle_entries set user_id = %L $q$, pg_temp.id('b'))), 'ERR:42501', '[I6 rule 12] the owner of an entry cannot be changed (42501)');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(tests.n_as(pg_temp.id('a'), 'nestly.cycle_entries'), '0', '[I6 rule 15] a suspended owner reads 0');
select is(pg_temp.dml('a', 'update nestly.cycle_entries set cycle_length_days = 29'), 'OK:0', '[I6 rule 15] a suspended owner updates 0 entries');
select is(pg_temp.dml('a', 'delete from nestly.cycle_entries'), 'OK:0', '[I6 rule 15] a suspended owner deletes 0 entries');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(pg_temp.dml('a', 'update nestly.cycle_entries set cycle_length_days = 29'), 'OK:0', '[I6 rule 15] a banned owner updates 0 entries');
select is(pg_temp.dml('a', 'delete from nestly.cycle_entries'), 'OK:0', '[I6 rule 15] a banned owner deletes 0 entries');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.dml('a', $$ insert into nestly.cycle_entries (start_date, cycle_length_days) values ('2026-08-20', 28) $$), 'ERR:42501', '[I6 rule 15] a suspended owner cannot write (42501)');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.dml('a', 'delete from nestly.cycle_entries'), 'OK:1', '[I6 CRUD] the owner deletes the entry');
select is(tests.fx_ce_count(), 0::bigint, '[I6] and it is gone');

-- =====================================================================================================================
-- status_guides (AC-095, BR-070)
-- =====================================================================================================================
select is(tests.fx_sg_count(), 9::bigint, '[I6 BR-070] nine guide texts exist');
select is(tests.fx_sg_count('draft'), 9::bigint, '[I6 BR-070] all of them are drafts awaiting approval');
select is(tests.n_as(pg_temp.id('a'), 'nestly.status_guides'), '0', '[I6 AC-095] a user reads no draft');
select is(tests.n_as(pg_temp.id('p'), 'nestly.status_guides'), '0', '[I6 AC-095] a Professional reads no draft');
select ok(tests.fx_sg_id('planning') is not null, '[I6] the planning guide exists');
select is(tests.fx_sg_exec(format($q$ update nestly.status_guides set status = 'published' where id = %L $q$, tests.fx_sg_id('planning'))), 'ERR:23514',
  '[I6 BR-070] a guide cannot be published without a source check date (23514)');
select is(tests.fx_sg_exec(format($q$ update nestly.status_guides set status = 'published', published_at = now(), source_checked_on = date '2026-10-20' where id = %L $q$, tests.fx_sg_id('planning'))), 'OK:1',
  '[I6 AC-095] a guide with a source date is published');
select is(tests.n_as(pg_temp.id('a'), 'nestly.status_guides'), '1', '[I6 AC-095] and a user reads that one guide');
select is(tests.n_as(pg_temp.id('b'), 'nestly.status_guides'), '1', '[I6 AC-095] every user reads it');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(tests.n_as(pg_temp.id('b'), 'nestly.status_guides'), '0', '[I6 rule 15] a suspended account reads none');
select tests.set_status(pg_temp.id('b'), 'active');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.status_guides'), 'ERR:42501', '[I6 rule 7] anon is refused (42501)');
select is(pg_temp.dml('a', $$ update nestly.status_guides set title = 'x' $$), 'OK:0', '[I6 AC-095] a user edits no guide (0 rows)');
select is(pg_temp.dml('a', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'x', 'y', 'z') $$), 'ERR:42501', '[I6 AC-095] a user cannot add a guide (42501)');
select is(tests.fx_sg_exec(format($q$ update nestly.status_guides set status = 'hidden' where id = %L $q$, tests.fx_sg_id('planning'))), 'OK:1', '[I6 AC-095] a guide is hidden');
select is(tests.n_as(pg_temp.id('a'), 'nestly.status_guides'), '0', '[I6 AC-095] and no user reads it');
select is(tests.fx_sg_exec(format($q$ update nestly.status_guides set range_from = 5 where id = %L $q$, tests.fx_sg_id('planning'))), 'ERR:23514', '[I6] a planning guide has no range (23514)');
select is(tests.fx_sg_exec(format($q$ update nestly.status_guides set range_to = 20 where id = %L $q$, tests.fx_sg_id('pregnancy', 14))), 'OK:1', '[I6] a pregnancy range inside 1..42 passes');
select is(tests.fx_sg_exec(format($q$ update nestly.status_guides set range_to = 43 where id = %L $q$, tests.fx_sg_id('pregnancy', 14))), 'ERR:23514', '[I6] a pregnancy range past week 42 is refused');
select is(tests.fx_sg_count(), 9::bigint, '[I6] no guide was added or removed by the refusals');

select * from finish();
rollback;
