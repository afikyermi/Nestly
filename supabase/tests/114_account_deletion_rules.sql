-- pgTAP, run by pg_prove as app_server (CI `db` job): Afik's account deletion decisions of 26.10.2026 (decisions-in-force.md §22.4-§22.6),
-- migration 20261026500000_account_deletion_rules.sql.
-- Source of expected values: SRS BR-085 (a suspension or ban wins over a scheduled deletion), BR-073 (the text copy in reports emptied at
-- the execution; the Auth user removed once, by the deletion job), BR-084 (the cancel is recorded), AC-188..AC-191.
-- People: S and K (Regular accounts that schedule a deletion and are then suspended / banned), E (a Regular account whose deletion is
-- executed), B = 10_'s b, A = 10_'s a, adm = 60_'s fr_d (the Admin), mod = 90_'s sf_m1 (a Moderator, given the keys here). Everything
-- rolls back. 110_'s fixtures (tests.fx_dl_*) and 71_'s jobs helpers are reused.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[I9 §22] session_user is app_server');

select tests.fx_fr_build();
select set_config('t.s', tests.fx_dl_person('regular')::text, true);
select set_config('t.k', tests.fx_dl_person('regular')::text, true);
select set_config('t.e', tests.fx_dl_person('regular')::text, true);

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 's' then current_setting('t.s')::uuid when 'k' then current_setting('t.k')::uuid when 'e' then current_setting('t.e')::uuid
                when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b')
                when 'adm' then tests.fx_fr_id('fr_d') when 'mod' then tests.fx_sf_id('sf_m1') end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.staff(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_staff(tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.enforce(p_who text, p_target text, p_kind text, p_hours integer default null) returns text language sql as $f$
  select pg_temp.staff(p_who, format($q$ insert into nestly.user_enforcements (user_id, kind, reason, duration_hours) values (%L, %L, 'harassment', %L) $q$,
                                     pg_temp.id(p_target), p_kind, p_hours))
$f$;
create function pg_temp.refused(p_res text) returns text language sql as $f$ select case when p_res like 'ERR:%' or p_res = 'OK:0' then 'refused' else p_res end $f$;
create function pg_temp.pg(p_sql text) returns text language sql as $f$ select tests.fx_dl_text(p_sql) $f$;
create function pg_temp.x(p_sql text) returns text language sql as $f$ select tests.fx_dl_exec(p_sql) $f$;
create function pg_temp.request(p_who text) returns text language sql as $f$
  select pg_temp.dml(p_who, $q$ update nestly.users set status = 'deletion_scheduled' where id = auth.uid() $q$)
$f$;
create function pg_temp.cancel(p_who text) returns text language sql as $f$
  select pg_temp.dml(p_who, $q$ update nestly.users set status = 'active' where id = auth.uid() $q$)
$f$;
create function pg_temp.run() returns text language sql as $f$
  select tests.jobs_as('select (r.executed || ''/'' || r.waiting || ''/'' || r.failed) from nestly.execute_account_deletions() r')
$f$;
create function pg_temp.events(p_who text) returns text language sql as $f$
  select pg_temp.pg(format($q$ select coalesce(string_agg(kind, ',' order by kind), '-') from nestly.account_deletion_events where account_id = %L $q$, pg_temp.id(p_who)))
$f$;
create function pg_temp.state(p_who text) returns text language sql as $f$
  select pg_temp.pg(format($q$ select status || ':' || coalesce(deletion_due_at::text, 'no date') from nestly.users where id = %L $q$, pg_temp.id(p_who)))
$f$;
create function pg_temp.text_of(p_report text) returns text language sql as $f$
  select pg_temp.pg(format($q$ select coalesce(target_text, 'null') from nestly.reports where id = %L $q$, current_setting(p_report)))
$f$;

select tests.fx_sf_grant(pg_temp.id('mod'), array['REPORTS_VIEW', 'USER_VIEW', 'USER_WARN', 'USER_SUSPEND', 'USER_BAN']);

-- =====================================================================================================================
-- structure
-- =====================================================================================================================
select is(pg_temp.pg($q$ select string_agg(polname || ':' || polcmd::text || ':' || (select string_agg(rolname, '+') from pg_roles where oid = any (polroles)), ', ' order by polname)
                         from pg_policy where polrelid = 'nestly.account_deletion_events'::regclass $q$),
  'account_deletion_events_delete_jobs:d:app_jobs, account_deletion_events_insert_enforcement:a:authenticated, account_deletion_events_insert_jobs:a:app_jobs, '
  || 'account_deletion_events_insert_own:a:authenticated, account_deletion_events_select_admin:r:authenticated, account_deletion_events_select_jobs:r:app_jobs, '
  || 'account_deletion_events_select_own_execute:r:authenticated, account_deletion_events_update_jobs:w:app_jobs',
  '[I9 §22.4 §22.6 rule 6] the deletion record gains exactly the staff cancel (inside the trigger) and the job''s Auth stamp; no client UPDATE');
select is(pg_temp.pg($q$ select string_agg(a.attname || '=' || p.p, ', ' order by a.attname, p.p)
                         from pg_attribute a, unnest(array['INSERT', 'UPDATE']) p(p)
                        where a.attrelid = 'nestly.account_deletion_events'::regclass and a.attnum > 0 and not a.attisdropped
                          and has_column_privilege('authenticated', a.attrelid, a.attnum, p.p) $q$),
  'account_id=INSERT, account_type=INSERT, due_at=INSERT, kind=INSERT', '[I9 §22.4] authenticated may name the account in the trigger''s insert, and updates nothing');
select is(pg_temp.pg($q$ select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a
                        where a.attrelid = 'nestly.account_deletion_events'::regclass and a.attnum > 0 and not a.attisdropped
                          and has_column_privilege('app_jobs', a.attrelid, a.attnum, 'UPDATE') $q$),
  'auth_removed_at', '[I9 §22.6 rule 6] the job updates only the Auth removal time');
select is(pg_temp.pg($q$ select string_agg(a.attname, ', ' order by a.attname) from pg_attribute a
                        where a.attrelid = 'nestly.reports'::regclass and a.attnum > 0 and not a.attisdropped
                          and has_column_privilege('app_jobs', a.attrelid, a.attnum, 'UPDATE') $q$),
  'closed_at, status, target_text', '[I9 §22.5 rule 6] on reports the job may also empty the text copy, nothing more');
select is(pg_temp.pg($q$ select string_agg(polname || ':' || polcmd::text, ', ' order by polname) from pg_policy
                        where polrelid = 'nestly.reports'::regclass and polname like '%deletion_text%' $q$),
  'reports_select_deletion_text_jobs:r, reports_update_deletion_text_jobs:w', '[I9 §22.5] the two job policies on reports');
select is(pg_temp.pg($q$ select string_agg(p.proname || ':' || p.prosecdef::text, ',' order by p.proname) from pg_proc p
                        where p.pronamespace = 'nestly'::regnamespace
                          and p.proname in ('execute_account_deletions', 'account_deletion_record', 'users_status_guard', 'user_enforcements_apply') $q$),
  'account_deletion_record:false,execute_account_deletions:false,user_enforcements_apply:false,users_status_guard:false', '[I9 §22 rule 10] no new SECURITY DEFINER');

-- =====================================================================================================================
-- §22.4 (BR-085): a suspension wins over a scheduled deletion
-- =====================================================================================================================
select is(pg_temp.request('s'), 'OK:1', 'fixture: S schedules its deletion');
select set_config('t.s_due', pg_temp.pg(format($q$ select deletion_due_at::text from nestly.users where id = %L $q$, pg_temp.id('s'))), true);
select is(pg_temp.refused(pg_temp.staff('mod', format($q$ update nestly.users set status = 'suspended', suspended_until = now() + interval '1 day' where id = %L $q$, pg_temp.id('s')))),
  'refused', '[I9 BR-074] still never without the enforcement record');
select is(pg_temp.enforce('mod', 's', 'reinstate'), 'ERR:NS013', '[I9 BR-085] a reinstatement does not apply to a scheduled account (nothing to lift)');
select is(pg_temp.state('s'), 'deletion_scheduled:' || current_setting('t.s_due'), '[I9] and the deletion stays scheduled');
select is(pg_temp.enforce('mod', 's', 'suspension', 24), 'OK:1', '[I9 BR-085 AC-188] a Moderator with USER_SUSPEND suspends a scheduled account');
select is(pg_temp.state('s'), 'suspended:no date', '[I9 BR-085 AC-188] the suspension wins: the deletion is cancelled, no due date left');
select is(pg_temp.events('s'), 'cancel,request', '[I9 BR-084 AC-188] the record keeps the cancel');
select is(pg_temp.pg(format($q$ select (due_at = %L::timestamptz)::text from nestly.account_deletion_events where account_id = %L and kind = 'cancel' $q$,
                    current_setting('t.s_due'), pg_temp.id('s'))), 'true', '[I9 BR-084] with the due date of the request it closed (so the Admin''s pending counter drops it)');
select is(pg_temp.pg(format($q$ select status_before from nestly.user_enforcements where user_id = %L and kind = 'suspension' $q$, pg_temp.id('s'))), 'deletion_scheduled',
  '[I9 BR-074] the enforcement history says what the account was before');
select is(pg_temp.refused(pg_temp.cancel('s')), 'refused', '[I9 BR-085 AC-188] the account cannot undo the suspension by "cancelling the deletion"');
select is(pg_temp.refused(pg_temp.request('s')), 'refused', '[I9 BR-085 AC-188] nor by requesting the deletion again while suspended');
select is(pg_temp.state('s'), 'suspended:no date', '[I9 BR-085] it stays suspended');
select is(pg_temp.dml('s', format($q$ insert into nestly.account_deletion_events (account_id, account_type, kind, due_at) values (%L, 'regular', 'cancel', now()) $q$, pg_temp.id('s'))),
  'ERR:42501', '[I9 BR-084 AC-175] nobody writes the record directly (the account)');
select is(pg_temp.staff('mod', format($q$ insert into nestly.account_deletion_events (account_id, account_type, kind, due_at) values (%L, 'regular', 'cancel', now()) $q$, pg_temp.id('s'))),
  'ERR:42501', '[I9 BR-084 AC-175] nor staff (the cancel row comes only from the trigger)');
-- once the suspension ends the account is active with no deletion pending; a new request starts from scratch
select is(pg_temp.x(format($q$ update nestly.users set suspended_until = now() - interval '1 minute' where id = %L $q$, pg_temp.id('s'))), 'OK:1', 'fixture: the suspension has ended');
select is(pg_temp.cancel('s'), 'OK:1', '[I9] S ends its own expired suspension');
select is(pg_temp.state('s'), 'active:no date', '[I9 BR-085] active, and the old deletion is not back');
select is(pg_temp.request('s'), 'OK:1', '[I9 BR-085] a new request is a new 30 days');

-- =====================================================================================================================
-- §22.4 (BR-085): a ban wins over a scheduled deletion
-- =====================================================================================================================
select is(pg_temp.request('k'), 'OK:1', 'fixture: K schedules its deletion');
select tests.fx_dl_due(pg_temp.id('k'), interval '31 days');
select is(pg_temp.enforce('adm', 'k', 'ban'), 'OK:1', '[I9 BR-085 AC-189] the Admin bans a scheduled account, its due date already passed');
select is(pg_temp.state('k'), 'banned:no date', '[I9 BR-085 AC-189] the ban wins: no deletion left');
select is(pg_temp.events('k'), 'cancel,request', '[I9 BR-084 AC-189] the cancel is recorded');
select is(pg_temp.refused(pg_temp.cancel('k')), 'refused', '[I9 BR-085 AC-189] the banned account cannot cancel anything');
select is(pg_temp.refused(pg_temp.request('k')), 'refused', '[I9 BR-085 AC-189] nor request the deletion');
select is(pg_temp.run(), '0/0/0', '[I9 BR-085 AC-189] the job deletes nothing of it');
select is(pg_temp.state('k'), 'banned:no date', '[I9 BR-085] the banned account stays (the ban is kept with it)');
select is(pg_temp.enforce('adm', 'k', 'unban'), 'OK:1', '[I9 BR-085] an unban returns an active account');
select is(pg_temp.state('k'), 'active:no date', '[I9 BR-085] with no deletion scheduled');

-- =====================================================================================================================
-- §22.5 (BR-073): the text copy in reports on the account's content is emptied at the execution
-- =====================================================================================================================
select set_config('t.pe', tests.fx_po_add(pg_temp.id('e'), 'everyone', false, 'active', 'E''s post text')::text, true);
select set_config('t.pa', tests.fx_po_add(pg_temp.id('e'), 'everyone', true, 'active', 'E''s anonymous text')::text, true);
select set_config('t.pb', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', 'B''s post text')::text, true);
select set_config('t.ce', tests.fx_cm_add(pg_temp.id('e'), current_setting('t.pb')::uuid, 'E''s comment text')::text, true);
select set_config('t.ce_reply', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.pb')::uuid, 'B replies to E', current_setting('t.ce')::uuid)::text, true);
select set_config('t.cb', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.pe')::uuid, 'B''s comment under E''s post')::text, true);
select set_config('t.ce_lone', tests.fx_cm_add(pg_temp.id('e'), current_setting('t.pb')::uuid, 'E''s lone comment')::text, true);
select is(pg_temp.x(format($q$ insert into nestly.marketplace_listings (owner_id, title, category, item_condition, city) values (%L, 'E''s listing title', 'strollers', 'good', 'haifa') $q$, pg_temp.id('e'))), 'OK:1', 'fixture: a listing of E');
select set_config('t.r_pe', tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.pe')::uuid)::text, true);
select set_config('t.r_pa', tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.pa')::uuid)::text, true);
select set_config('t.r_ce', tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.ce')::uuid)::text, true);
select set_config('t.r_cb', tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.cb')::uuid)::text, true);
select set_config('t.r_cl', tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.ce_lone')::uuid)::text, true);
select set_config('t.r_pb', tests.fx_rp_add(pg_temp.id('a'), 'post', current_setting('t.pb')::uuid)::text, true);
select set_config('t.r_le', pg_temp.pg(format($q$ insert into nestly.reports (reporter_id, target_kind, listing_id, reason)
                                                   select %L, 'listing', l.id, 'spam' from nestly.marketplace_listings l where l.owner_id = %L returning id::text $q$, pg_temp.id('b'), pg_temp.id('e'))), true);
select is(pg_temp.text_of('t.r_pe') || ' | ' || pg_temp.text_of('t.r_ce') || ' | ' || pg_temp.text_of('t.r_le'), 'E''s post text | E''s comment text | E''s listing title',
  'control: the reports hold a copy of E''s text');
select tests.fx_rp_set(current_setting(r)::uuid, 'handled') from unnest(array['t.r_pe', 't.r_pa', 't.r_ce', 't.r_cb', 't.r_cl', 't.r_pb', 't.r_le']) r;

-- (the whole file is one transaction: this runs before the execution, whose row would mark every later deletion as the job's)
-- outside the job a deletion keeps the copy for staff, as before
select is(pg_temp.x(format($q$ insert into nestly.marketplace_listings (owner_id, title, category, item_condition, city) values (%L, 'B''s listing title', 'strollers', 'good', 'haifa') $q$, pg_temp.id('b'))), 'OK:1', 'fixture: a listing of B');
select set_config('t.r_lb', pg_temp.pg(format($q$ insert into nestly.reports (reporter_id, target_kind, listing_id, reason)
                                                   select %L, 'listing', l.id, 'spam' from nestly.marketplace_listings l where l.owner_id = %L returning id::text $q$, pg_temp.id('a'), pg_temp.id('b'))), true);
select is(pg_temp.dml('b', 'delete from nestly.marketplace_listings where owner_id = auth.uid()'), 'OK:1', 'fixture: B deletes its listing');
select is(pg_temp.text_of('t.r_lb'), 'B''s listing title', '[I9 §22.5] a deletion outside the deletion job keeps the copy (staff still read what was reported)');

select is(pg_temp.request('e'), 'OK:1', 'fixture: E schedules its deletion');
select is(tests.jobs_dml(format($q$ update nestly.reports set target_text = null where id = %L $q$, current_setting('t.r_ce'))), 'OK:0',
  '[I9 §22.5 rule 6] before the due date the job cannot touch the copy');
select set_config('t.r_ue', tests.fx_rp_add(pg_temp.id('a'), 'user', pg_temp.id('e'))::text, true);
select tests.fx_dl_due(pg_temp.id('e'), interval '31 days');
select is(tests.jobs_dml(format($q$ update nestly.reports set status = 'handled', closed_at = now() where id = %L $q$, current_setting('t.r_ue'))), 'ERR:42501',
  '[I9 §22.5 rule 6] the job''s new report policy opens no other change: an open report on the account itself can still only expire');
select is(tests.jobs_dml(format($q$ update nestly.reports set target_text = null where id = %L $q$, current_setting('t.r_cb'))), 'OK:0',
  '[I9 §22.5 rule 6] the job cannot empty the copy of another account''s content');
select is(tests.jobs_dml(format($q$ update nestly.reports set target_text = 'x' where id = %L $q$, current_setting('t.r_ce'))), 'ERR:42501',
  '[I9 §22.5 rule 6] the job can only empty the copy, never write one');
select is(tests.jobs_dml(format($q$ update nestly.reports set details = 'x' where id = %L $q$, current_setting('t.r_pe'))), 'ERR:42501',
  '[I9 §22.5 rule 6] nor change anything else of the report');

select is(pg_temp.run(), '1/0/0', '[I9 BR-073] E''s deletion is executed');
select is(pg_temp.text_of('t.r_pe') || ',' || pg_temp.text_of('t.r_pa') || ',' || pg_temp.text_of('t.r_cl') || ',' || pg_temp.text_of('t.r_le'), 'null,null,null,null',
  '[I9 §22.5 BR-073 AC-190] the copy of E''s post, anonymous post (its author never read), deleted comment and listing title is gone from every report');
select is(pg_temp.text_of('t.r_ce'), 'null', '[I9 §22.5 AC-190] and of E''s comment that stays as a "deleted user" row');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.reports where id in (%L, %L, %L, %L) and status = 'handled' $q$,
                    current_setting('t.r_pe'), current_setting('t.r_pa'), current_setting('t.r_ce'), current_setting('t.r_le'))), '4',
  '[I9 BR-073 AC-190] the reports themselves stay (handled, as BR-073 keeps them)');
select is(pg_temp.text_of('t.r_pb'), 'B''s post text', '[I9 §22.5 AC-190] a report on another account''s post keeps its copy');
select is(pg_temp.text_of('t.r_cb'), 'null', '[I9 §22.5 ⭐ OP-079] B''s comment, deleted with E''s post, goes with it too: nothing deleted with the account leaves a copy');

-- =====================================================================================================================
-- §22.6 (BR-073): the Auth user is removed once, by the job
-- =====================================================================================================================
select is(pg_temp.pg(format($q$ select coalesce(auth_removed_at::text, 'null') from nestly.account_deletion_events where account_id = %L and kind = 'execute' $q$, pg_temp.id('e'))),
  'null', '[I9 §22.6] after the execution the Auth user is still to be removed');
-- the 90-day purge keeps the execute row until the Auth user is removed (a failing removal is never forgotten)
select tests.fx_dl_age(pg_temp.id('e'), interval '91 days');
select is(tests.jobs_as('select nestly.purge_deleted_accounts()::text') <> '0', true, 'fixture: the 90-day purge runs for E');
select is(pg_temp.events('e'), 'execute', '[I9 §22.6 AC-191] the purge keeps E''s execute row while its Auth user is not removed (request and cancel rows went)');
select is(tests.jobs_dml(format($q$ delete from nestly.account_deletion_events where account_id = %L and kind = 'execute' $q$, pg_temp.id('e'))), 'OK:0',
  '[I9 §22.6 rule 6] nor can the job delete it directly');
select is(tests.jobs_as($q$ select count(*)::text from (select id from nestly.account_deletion_events where kind = 'execute' and auth_removed_at is null for update skip locked) s $q$),
  '1', '[I9 §22.6 rule 6] the job claims the execute row waiting for the Auth removal (FOR UPDATE SKIP LOCKED)');
select is(pg_temp.staff('adm', format($q$ update nestly.account_deletion_events set auth_removed_at = now() where account_id = %L $q$, pg_temp.id('e'))), 'ERR:42501',
  '[I9 §22.6 AC-191] nobody but the job stamps it, the Admin included');
select is(tests.jobs_dml(format($q$ update nestly.account_deletion_events set auth_removed_at = now() + interval '1 day' where account_id = %L and kind = 'execute' $q$, pg_temp.id('e'))), 'ERR:42501',
  '[I9 §22.6] never a time in the future');
select is(tests.jobs_dml(format($q$ update nestly.account_deletion_events set auth_removed_at = now() where account_id = %L and kind = 'request' $q$, pg_temp.id('s'))), 'OK:0',
  '[I9 §22.6] only an execute row');
select is(tests.jobs_dml(format($q$ update nestly.account_deletion_events set kind = 'cancel' where account_id = %L $q$, pg_temp.id('e'))), 'ERR:42501',
  '[I9 §22.6 rule 6] the job changes nothing else of the record');
select is(tests.jobs_dml(format($q$ update nestly.account_deletion_events set auth_removed_at = now() where account_id = %L and kind = 'execute' $q$, pg_temp.id('e'))), 'OK:1',
  '[I9 §22.6 AC-191] the job stamps the execute row once it removed the Auth user');
select is(tests.jobs_dml(format($q$ update nestly.account_deletion_events set auth_removed_at = now() where account_id = %L and kind = 'execute' $q$, pg_temp.id('e'))), 'OK:0',
  '[I9 §22.6 AC-191] once: a stamped row is never claimed or stamped again (one Auth call per account)');
select is(tests.jobs_as($q$ select count(*)::text from nestly.account_deletion_events where kind = 'execute' and auth_removed_at is null $q$), '0',
  '[I9 §22.6 AC-191] nothing is left for the job to remove');
select is(tests.jobs_as('select nestly.purge_deleted_accounts()::text'), '1', '[I9 §22.6 BR-084] once stamped, the next purge removes the execute row');
select is(pg_temp.events('e'), '-', '[I9 BR-073 AC-182] and nothing of E is left');

select * from finish();
rollback;
