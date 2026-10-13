-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part a).
-- Criterion 4 [F1.1-a c4]: each check of criterion 3 is shown to fire. The test creates the violating object inside a
-- transaction, asserts that tests.rls_gate() reports it, and rolls back.
--
-- How: app_server can create TEMP tables, views, sequences and functions (supabase/ci/rls-gate.sql, header). The gate
-- takes any schema name, so it is pointed at this session's temp schema. Everything app_server creates there is owned by
-- app_server, which is itself a violation of "owned by app_owner" and is how that check is shown to fire.
-- Every check is tested both ways: the violating object is reported, and the compliant variant is not.
--
-- Not testable here (see the report): "anon holds a privilege on the schema itself", and a table in public when
-- app_server cannot create in public (the probe at the end then skips). Both would need a role app_server does not have.
-- Written without a database to run against (no Docker or psql on the author's machine): CI is the first run.

begin;

select plan(50);

-- ---- helpers (temp, gone at rollback) -------------------------------------------------------------------------------
-- Number of gate rows of one check whose object name contains a fragment, looking at this session's temp schema.
create function pg_temp.hits(p_check text, p_fragment text) returns bigint
language sql as $$
  select count(*) from tests.rls_gate(pg_my_temp_schema()::regnamespace::text) g
  where g.check_name = p_check and strpos(g.object, p_fragment) > 0
$$;

-- ---- the objects ----------------------------------------------------------------------------------------------------
-- RLS family: tables
create temp table zz_t_plain (id int);                                    -- RLS off, FORCE off, no policy
create temp table zz_t_rlsonly (id int);                                  -- RLS on only
alter table zz_t_rlsonly enable row level security;
create temp table zz_t_nopolicy (id int);                                 -- RLS on, FORCE on, no policy
alter table zz_t_nopolicy enable row level security;
alter table zz_t_nopolicy force row level security;
create temp table zz_t_noforce (id int);                                  -- RLS on, policy, FORCE off
alter table zz_t_noforce enable row level security;
create policy zz_p_noforce on zz_t_noforce for select using (true);
create temp table zz_t_polonly (id int);                                  -- policy exists, RLS off
create policy zz_p_polonly on zz_t_polonly for select using (true);
create temp table zz_t_part (id int) partition by range (id);             -- partitioned table, RLS off
create temp table zz_t_ok (id int);                                       -- compliant on every RLS check
alter table zz_t_ok enable row level security;
alter table zz_t_ok force row level security;
create policy zz_p_ok on zz_t_ok for select using (true);

-- ownership: all of these are owned by app_server
create temp table zz_o_tab (id int);
create temp view zz_o_view as select 1 as a;
create temp sequence zz_o_seq;
create function pg_temp.zz_o_fn() returns int language sql as $$ select 1 $$;

-- views
create temp view zz_v_plain as select 1 as a;
create temp view zz_v_secinv with (security_invoker = true) as select 1 as a;
create temp view zz_v_secfalse with (security_invoker = false) as select 1 as a;
create temp view zz_v_barrier with (security_barrier = true) as select 1 as a;

-- SECURITY DEFINER functions
create function pg_temp.zz_d_nosp() returns int language sql security definer as $$ select 1 $$;
create function pg_temp.zz_d_fixed() returns int language sql security definer set search_path = '' as $$ select 1 $$;
create function pg_temp.zz_d_cfg() returns int language sql security definer set statement_timeout = '5s' as $$ select 1 $$;
create function pg_temp.zz_d_invoker() returns int language sql security invoker as $$ select 1 $$;

-- anon
create temp table zz_a_clean (id int);
create temp table zz_a_sel (id int);
grant select on zz_a_sel to anon;
create temp table zz_a_col (id int, secret int);
grant select (id) on zz_a_col to anon;
create temp table zz_a_pub (id int);
grant select on zz_a_pub to public;
create temp table zz_a_trunc (id int);
grant truncate on zz_a_trunc to anon;
create temp view zz_a_view as select 1 as a;
grant select on zz_a_view to anon;
create temp sequence zz_a_seqgrant;
grant usage on sequence zz_a_seqgrant to anon;
create temp sequence zz_a_seqclean;
create function pg_temp.zz_a_fnpub() returns int language sql as $$ select 1 $$;        -- EXECUTE goes to PUBLIC by default
create function pg_temp.zz_a_fnrev() returns int language sql as $$ select 1 $$;
revoke all on function pg_temp.zz_a_fnrev() from public;

-- ---- the session ----------------------------------------------------------------------------------------------------
select is(session_user::text, 'app_server'::text,
  '[F1.1-a c2] session_user is app_server (repeated: this file must not run under another login)');

-- ---- rls_disabled / force_rls_disabled / no_policy (platform r8 and "every table") ------------------------------------
select is(pg_temp.hits('rls_disabled', 'zz_t_plain'), 1::bigint, '[F1.1-a c4] rls_disabled fires for a table with RLS off');
select is(pg_temp.hits('force_rls_disabled', 'zz_t_plain'), 1::bigint, '[F1.1-a c4] force_rls_disabled fires for a table with FORCE RLS off');
select is(pg_temp.hits('no_policy', 'zz_t_plain'), 1::bigint, '[F1.1-a c4] no_policy fires for a table with no policy');

select is(pg_temp.hits('rls_disabled', 'zz_t_rlsonly'), 0::bigint, '[F1.1-a c4] rls_disabled does not fire once RLS is on');
select is(pg_temp.hits('force_rls_disabled', 'zz_t_rlsonly'), 1::bigint, '[F1.1-a c4] force_rls_disabled fires for RLS on but not forced');
select is(pg_temp.hits('no_policy', 'zz_t_rlsonly'), 1::bigint, '[F1.1-a c4] no_policy fires for RLS on and no policy');

select is(pg_temp.hits('rls_disabled', 'zz_t_nopolicy'), 0::bigint, '[F1.1-a c4] rls_disabled does not fire for RLS on and forced');
select is(pg_temp.hits('force_rls_disabled', 'zz_t_nopolicy'), 0::bigint, '[F1.1-a c4] force_rls_disabled does not fire once forced');
select is(pg_temp.hits('no_policy', 'zz_t_nopolicy'), 1::bigint, '[F1.1-a c4] no_policy fires for a table with RLS on, forced, and no policy');

select is(pg_temp.hits('rls_disabled', 'zz_t_noforce'), 0::bigint, '[F1.1-a c4] rls_disabled does not fire for a table with RLS on and a policy');
select is(pg_temp.hits('force_rls_disabled', 'zz_t_noforce'), 1::bigint, '[F1.1-a c4] force_rls_disabled fires for RLS on and a policy but FORCE off');
select is(pg_temp.hits('no_policy', 'zz_t_noforce'), 0::bigint, '[F1.1-a c4] no_policy does not fire once a policy exists');

select is(pg_temp.hits('rls_disabled', 'zz_t_polonly'), 1::bigint, '[F1.1-a c4] rls_disabled fires for a table that has a policy but RLS off (a policy alone protects nothing)');
select is(pg_temp.hits('no_policy', 'zz_t_polonly'), 0::bigint, '[F1.1-a c4] no_policy does not fire for a table that has a policy');

select is(pg_temp.hits('rls_disabled', 'zz_t_part'), 1::bigint, '[F1.1-a c4] rls_disabled fires for a partitioned table with RLS off');

select is(pg_temp.hits('rls_disabled', 'zz_t_ok'), 0::bigint, '[F1.1-a c4] the compliant table: rls_disabled does not fire');
select is(pg_temp.hits('force_rls_disabled', 'zz_t_ok'), 0::bigint, '[F1.1-a c4] the compliant table: force_rls_disabled does not fire');
select is(pg_temp.hits('no_policy', 'zz_t_ok'), 0::bigint, '[F1.1-a c4] the compliant table: no_policy does not fire');

-- ---- not_owned_by_app_owner (platform r1, r2: nothing is owned by app_server) ---------------------------------------------
select is(pg_temp.hits('not_owned_by_app_owner', 'zz_o_tab'), 1::bigint, '[F1.1-a c4] not_owned_by_app_owner fires for a table owned by app_server');
select is(pg_temp.hits('not_owned_by_app_owner', 'zz_o_view'), 1::bigint, '[F1.1-a c4] not_owned_by_app_owner fires for a view owned by app_server');
select is(pg_temp.hits('not_owned_by_app_owner', 'zz_o_seq'), 1::bigint, '[F1.1-a c4] not_owned_by_app_owner fires for a sequence owned by app_server');
select is(pg_temp.hits('not_owned_by_app_owner', 'zz_o_fn'), 1::bigint, '[F1.1-a c4] not_owned_by_app_owner fires for a function owned by app_server');
select is(
  (select min(g.object) from tests.rls_gate(pg_my_temp_schema()::regnamespace::text) g
    where g.check_name = 'not_owned_by_app_owner' and strpos(g.object, 'zz_o_tab') > 0),
  pg_my_temp_schema()::regnamespace::text || '.zz_o_tab',
  '[F1.1-a c3] a violation names the object, schema-qualified');

-- ---- view_not_security_invoker (platform r9) --------------------------------------------------------------------------
select is(pg_temp.hits('view_not_security_invoker', 'zz_v_plain'), 1::bigint, '[F1.1-a c4] view_not_security_invoker fires for a view with no option');
select is(pg_temp.hits('view_not_security_invoker', 'zz_v_secinv'), 0::bigint, '[F1.1-a c4] view_not_security_invoker does not fire for security_invoker = true');
select is(pg_temp.hits('view_not_security_invoker', 'zz_v_secfalse'), 1::bigint, '[F1.1-a c4] view_not_security_invoker fires for security_invoker = false');
select is(pg_temp.hits('view_not_security_invoker', 'zz_v_barrier'), 1::bigint, '[F1.1-a c4] view_not_security_invoker fires for a view with only security_barrier');

-- ---- definer_not_approved / definer_without_search_path (platform r10) ------------------------------------------------
select is(pg_temp.hits('definer_not_approved', 'zz_d_nosp'), 1::bigint, '[F1.1-a c4] definer_not_approved fires for a SECURITY DEFINER function that is not on the list');
select is(pg_temp.hits('definer_without_search_path', 'zz_d_nosp'), 1::bigint, '[F1.1-a c4] definer_without_search_path fires for a SECURITY DEFINER function with no search_path');
select is(pg_temp.hits('definer_not_approved', 'zz_d_fixed'), 1::bigint, '[F1.1-a c4] a fixed search_path does not make an unlisted SECURITY DEFINER function approved');
select is(pg_temp.hits('definer_without_search_path', 'zz_d_fixed'), 0::bigint, '[F1.1-a c4] definer_without_search_path does not fire when search_path is fixed');
select is(pg_temp.hits('definer_without_search_path', 'zz_d_cfg'), 1::bigint, '[F1.1-a c4] definer_without_search_path fires when other settings are fixed but search_path is not');
select is(pg_temp.hits('definer_not_approved', 'zz_d_invoker'), 0::bigint, '[F1.1-a c4] definer_not_approved does not fire for a SECURITY INVOKER function');
select is(pg_temp.hits('definer_without_search_path', 'zz_d_invoker'), 0::bigint, '[F1.1-a c4] definer_without_search_path does not fire for a SECURITY INVOKER function');

-- ---- anon_privilege (platform r7) -------------------------------------------------------------------------------------
select is(pg_temp.hits('anon_privilege', 'zz_a_clean'), 0::bigint, '[F1.1-a c4] anon_privilege does not fire for a table anon has no grant on');
select is(pg_temp.hits('anon_privilege', 'zz_a_sel'), 1::bigint, '[F1.1-a c4] anon_privilege fires for SELECT granted to anon on a table');
select is(pg_temp.hits('anon_privilege', 'zz_a_col'), 1::bigint, '[F1.1-a c4] anon_privilege fires for a column-level SELECT granted to anon');
select is(pg_temp.hits('anon_privilege', 'zz_a_pub'), 1::bigint, '[F1.1-a c4] anon_privilege fires for SELECT granted to PUBLIC (anon inherits it)');
select is(pg_temp.hits('anon_privilege', 'zz_a_trunc'), 1::bigint, '[F1.1-a c4] anon_privilege fires for any privilege, not only SELECT (TRUNCATE)');
select is(pg_temp.hits('anon_privilege', 'zz_a_view'), 1::bigint, '[F1.1-a c4] anon_privilege fires for SELECT granted to anon on a view');
select is(pg_temp.hits('anon_privilege', 'zz_a_seqgrant'), 1::bigint, '[F1.1-a c4] anon_privilege fires for USAGE granted to anon on a sequence');
select is(pg_temp.hits('anon_privilege', 'zz_a_seqclean'), 0::bigint, '[F1.1-a c4] anon_privilege does not fire for a sequence anon has no grant on');
select is(pg_temp.hits('anon_privilege', 'zz_a_fnpub'), 1::bigint, '[F1.1-a c4] anon_privilege fires for a function whose EXECUTE is left with PUBLIC');
select is(pg_temp.hits('anon_privilege', 'zz_a_fnrev'), 0::bigint, '[F1.1-a c4] anon_privilege does not fire once EXECUTE is revoked from PUBLIC');

-- ---- the temp objects do not leak into the product schema's verdict -------------------------------------------------
-- (before the public probe below, which would add a relation_in_public row of its own)
select is_empty(
  $$ select check_name, object from tests.rls_gate('nestly') $$,
  '[F1.1-a c3] the objects above, all violations, are not reported for the nestly schema (the gate looks only at the schema it is given)');

-- ---- relation_in_public (platform r7) ---------------------------------------------------------------------------------
select is(pg_temp.hits('relation_in_public', 'zz_'), 0::bigint,
  '[F1.1-a c4] relation_in_public looks only at public: none of the temp objects above is reported by it');

create temp table zz_pub_flag (created boolean);
do $$
begin
  if has_schema_privilege(current_user, 'public', 'CREATE') then
    execute 'create table public.zz_ci_public_probe (id int)';
    insert into zz_pub_flag values (true);
  else
    insert into zz_pub_flag values (false);
  end if;
end
$$;

select case when (select created from zz_pub_flag)
  then ok(
    exists (select 1 from tests.rls_gate('nestly')
             where check_name = 'relation_in_public' and object = 'public.zz_ci_public_probe'),
    '[F1.1-a c4] relation_in_public fires for a table created in public')
  else skip('app_server cannot create tables in public (good: platform r7); the check cannot be fired from this role', 1)
end;

-- ---- a violation made inside a transaction can be rolled back -------------------------------------------------------
savepoint before_violation;
create temp table zz_rb_tab (id int);
select is(pg_temp.hits('rls_disabled', 'zz_rb_tab'), 1::bigint, '[F1.1-a c4] the violating object is reported while it exists');
rollback to savepoint before_violation;
select is(pg_temp.hits('rls_disabled', 'zz_rb_tab'), 0::bigint, '[F1.1-a c4] after the rollback the violation is gone and the gate reports nothing');

select * from finish();

rollback;
