-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.4a DR-6 A: regular_names, the name PG-036 shows next to a request).
-- Source of expected values: .work/friends/spec.md (c11: a list entry holds the other user's full name; DR-3 silent decline;
-- DR-5 inactive counterparty hidden) and schema.md F2.4a "Authorization" / "pgTAP" (who reads whose name, per status x side x
-- cancelled), not the migration text. Structure of the table: 60_friendships_structure.sql. Everything rolls back.
-- People: A = 'Alice Aaron', B = 'Bella Baruch' (10_'s a, b), C = 'Cora Third' (60_'s fr_c, built below), P = 10_'s p.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F2.4-a c11] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') end
$f$;
-- the names this person can read, sorted
create function pg_temp.names(p_who text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)),
    $q$ select coalesce(string_agg(full_name, ', ' order by full_name), '') from nestly.regular_names $q$)
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
begin
  perform tests.fx_fr_purge(pg_temp.id('a')); perform tests.fx_fr_purge(pg_temp.id('b')); perform tests.fx_fr_purge(pg_temp.id('c'));
  perform tests.set_status(pg_temp.id('a'), 'active'); perform tests.set_status(pg_temp.id('b'), 'active');
end
$f$;

-- ---- every profile has a name row, and it is the profile's name ---------------------------------------------------------
select is(split_part(tests.fx_rn_counts(), '/', 1), split_part(tests.fx_rn_counts(), '/', 2), '[F2.4-a c11 DR-6] regular_names holds one row per regular_profiles row (backfill and trigger)');
select is(tests.fx_rn_name(pg_temp.id('c')), 'Cora Third', '[F2.4-a c11 DR-6] a profile created now gets its name row at once');
select is(tests.fx_rn_name(pg_temp.id('a')), 'Alice Aaron', '[F2.4-a c11 DR-6] A''s stored name is its profile''s');

-- ---- no relationship: the owner's own name only -------------------------------------------------------------------------
select is(pg_temp.names('a'), 'Alice Aaron', '[F2.4-a c11 P1] with no request, A reads only its own name');
select is(pg_temp.names('b'), 'Bella Baruch', '[F2.4-a c11 P1] with no request, B reads only its own name');
select is(pg_temp.names('c'), 'Cora Third', '[F2.4-a c11 P1] C reads only its own name');
select is(pg_temp.names('p'), '', '[F2.4-a c11 P1] P (Professional) reads no name');

-- ---- per status x side x cancelled: A -> B -------------------------------------------------------------------------------
create function pg_temp.case_names(p_status text, p_cancelled boolean) returns text language plpgsql as $f$
begin
  perform pg_temp.reset();
  perform tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), p_status, p_cancelled);
  return pg_temp.names('a') || ' | ' || pg_temp.names('b') || ' | ' || pg_temp.names('c');
end
$f$;
select is(pg_temp.case_names('pending', false), 'Alice Aaron, Bella Baruch | Alice Aaron, Bella Baruch | Cora Third',
  '[F2.4-a c11 FR-REL-001] A->B pending: each reads the other''s name, C reads neither');
select is(pg_temp.case_names('pending', true), 'Alice Aaron | Bella Baruch | Cora Third',
  '[F2.4-a c11 DR-4] A->B pending but cancelled: neither reads the other''s name');
select is(pg_temp.case_names('declined', false), 'Alice Aaron, Bella Baruch | Bella Baruch | Cora Third',
  '[F2.4-a c11 DR-3] A->B declined: A (requester) still reads B''s name, B no longer reads A''s');
select is(pg_temp.case_names('declined', true), 'Alice Aaron | Bella Baruch | Cora Third',
  '[F2.4-a c11 DR-3 DR-4] A->B declined and cancelled: neither reads the other''s name');
select is(pg_temp.case_names('accepted', false), 'Alice Aaron, Bella Baruch | Alice Aaron, Bella Baruch | Cora Third',
  '[F2.4-a c11 FR-REL-001] A and B Friends: each reads the other''s name, C neither');
select is(pg_temp.case_names('removed', false), 'Alice Aaron | Bella Baruch | Cora Third',
  '[F2.4-a c11 FR-REL-001] removed: neither reads the other''s name');

-- a request between A and B never opens C's name, nor A's / B's to C, whoever sent it
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'pending');
select is(pg_temp.names('a') || ' | ' || pg_temp.names('b'), 'Alice Aaron, Cora Third | Bella Baruch', '[F2.4-a c11] C->A pending: A reads C''s name, B reads nothing of it');

-- ---- DR-5: an inactive counterparty hides the name, reactivation brings it back ------------------------------------------
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.names('a'), 'Alice Aaron', '[F2.4-a c11 DR-5] B suspended: A no longer reads B''s name');
select is(pg_temp.names('b'), '', '[F2.4-a c11 A9 rule 15] B suspended reads no name at all, not even its own');
select tests.set_status(pg_temp.id('b'), 'banned');
select is(pg_temp.names('a'), 'Alice Aaron', '[F2.4-a c11 DR-5] B banned: A no longer reads B''s name');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.names('a'), 'Alice Aaron, Bella Baruch', '[F2.4-a c11 DR-5] B active again: the name is back');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.names('a'), '', '[F2.4-a c11 A9 rule 15] A suspended reads no name');
select is(pg_temp.names('b'), 'Bella Baruch', '[F2.4-a c11 DR-5] A suspended: B no longer reads A''s name');
select tests.set_status(pg_temp.id('a'), 'active');

-- ---- a name edit shows (F2.1) --------------------------------------------------------------------------------------------
select is(pg_temp.dml('a', $q$ update nestly.regular_profiles set full_name = 'Alice Renamed' $q$), 'OK:1', '[F2.4-a c11 F2.1] A edits its own full name');
select is(tests.fx_rn_name(pg_temp.id('a')), 'Alice Renamed', '[F2.4-a c11 DR-6] the stored name follows the edit');
select is(pg_temp.names('b'), 'Alice Renamed, Bella Baruch', '[F2.4-a c11] and the Friend reads the new name');

-- ---- writes: only through the profile ------------------------------------------------------------------------------------
select is(pg_temp.dml('a', $q$ update nestly.regular_names set full_name = 'Mallory' $q$), 'ERR:42501', '[F2.4-a c11 rule 12] A cannot UPDATE a name row (no grant)');
select is(pg_temp.dml('a', $q$ delete from nestly.regular_names $q$), 'ERR:42501', '[F2.4-a c11 rule 12] A cannot DELETE a name row');
select ok((pg_temp.dml('a', $q$ insert into nestly.regular_names (user_id, full_name) values (auth.uid(), 'Mallory') $q$) like 'ERR:%'),
  '[F2.4-a c11 DR-6] A cannot insert a second or different name for itself');
select is(pg_temp.dml('a', format($q$ insert into nestly.regular_names (user_id, full_name) values (%L, 'Bella Baruch') $q$, pg_temp.id('b'))), 'ERR:42501',
  '[F2.4-a c11 A1] A cannot insert a name row for B');
select is(pg_temp.dml('a', $q$ insert into nestly.regular_names (user_id, full_name) values ('99999999-9999-4999-8999-999999999999', 'Ghost') $q$), 'ERR:42501',
  '[F2.4-a c11 A1] A cannot insert a name row for a random user');
select is(tests.fx_rn_name(pg_temp.id('b')), 'Bella Baruch', '[F2.4-a c11] B''s name is untouched');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('a')), 'select 1 from nestly.regular_names'), 'ERR:42501', '[F2.4-a c11 rule 3] anon reads no name');

select * from finish();

rollback;
