-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0a feed-groundwork: algorithm_configurations, BR-059, FR-ALG-002).
-- Source of expected values: .work/feed-groundwork/spec.md c18 (Gate 2 + re-amend wording) and the defaults of I3-algorithm.md
-- (Configuration); column names from schema.md. Writes as the table owner go through tests.fx_cfg_exec (rolled back with the file).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-a c18] session_user is app_server (this file must not run under another login)');

create function pg_temp.cfg(p_col text) returns text language sql as $f$ select tests.fx_cfg_json() ->> p_col $f$;
create function pg_temp.valid_insert(p_version int, p_active boolean, p_over text default '') returns text language sql as $f$
  select format($q$ insert into nestly.algorithm_configurations
    (surface, version, is_active, w_fresh, half_life_hours, w_friend, w_quality, quality_cap, w_stage, scored_window_days,
     diversity_window, max_same_creator_in_window, max_anonymous_in_window, page_size, created_by, reason)
    select 'regular_feed', %s, %L, 1.0, 24, 0.5, 0.2, 20, 0, 14, 5, 2, 2, 20, 'test reviewer', 'test' $q$, p_version, p_active)
$f$;
-- the same row with one column replaced: built from the valid insert's select list
create function pg_temp.bad_insert(p_col text, p_val text) returns text language plpgsql as $f$
declare
  cols text[] := array['w_fresh','half_life_hours','w_friend','w_quality','quality_cap','w_stage','scored_window_days','diversity_window','max_same_creator_in_window','max_anonymous_in_window','page_size'];
  vals text[] := array['1.0','24','0.5','0.2','20','0','14','5','2','2','20'];
  i int := array_position(cols, p_col);
begin
  vals[i] := p_val;
  return format($q$ insert into nestly.algorithm_configurations
    (surface, version, is_active, %s, created_by, reason) values ('regular_feed', (select coalesce(max(version), 0) + 1 from nestly.algorithm_configurations), false, %s, 'test reviewer', 'test') $q$,
    array_to_string(cols, ', '), array_to_string(vals, ', '));
end
$f$;

-- ---- the seeded v1 row ---------------------------------------------------------------------------------------------------------
select is((select count(*) from tests.fx_cfg_json() j where j is not null), 1::bigint, '[F3.0-a c18] exactly one active regular_feed row exists');
select is(pg_temp.cfg('surface'), 'regular_feed', '[F3.0-a c18] surface regular_feed');
select is(pg_temp.cfg('version'), '1', '[F3.0-a c18] version 1');
select is(pg_temp.cfg('is_active'), 'true', '[F3.0-a c18] active');
select is(pg_temp.cfg('w_fresh')::numeric, 1.0, '[F3.0-a c18 I3-algorithm] wFresh 1.0');
select is(pg_temp.cfg('half_life_hours')::int, 24, '[F3.0-a c18] halfLifeHours 24');
select is(pg_temp.cfg('w_friend')::numeric, 0.5, '[F3.0-a c18] wFriend 0.5');
select is(pg_temp.cfg('w_quality')::numeric, 0.2, '[F3.0-a c18] wQuality 0.2');
select is(pg_temp.cfg('quality_cap')::int, 20, '[F3.0-a c18] qualityCap 20');
select is(pg_temp.cfg('w_stage')::numeric, 0::numeric, '[F3.0-a c18] wStage 0');
select is(pg_temp.cfg('scored_window_days')::int, 14, '[F3.0-a c18] scoredWindowDays 14');
select is(pg_temp.cfg('max_same_creator_in_window')::int || '/' || pg_temp.cfg('diversity_window')::int, '2/5', '[F3.0-a c18] at most 2 of the same creator in a window of 5');
select is(pg_temp.cfg('max_anonymous_in_window')::int, 2, '[F3.0-a c18] maxAnonymousInWindow 2');
select is(pg_temp.cfg('page_size')::int, 20, '[F3.0-a c18] pageSize 20');
select is(pg_temp.cfg('w_intent')::numeric, 0.5, '[FR-ALG-008 I7] v1 reads wIntent 0.5 (the column''s value for versions stored before it)');
select is(pg_temp.cfg('intent_half_life_hours')::int, 168, '[FR-ALG-008 I7] intentHalfLifeHours 168 (a week)');
select ok(pg_temp.cfg('created_at') is not null and btrim(pg_temp.cfg('created_by')) <> '' and btrim(pg_temp.cfg('reason')) <> '',
  '[F3.0-a c18 BR-059] createdAt, createdBy and reason are recorded');
select ok(pg_temp.cfg('created_by') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-', '[F3.0-a c18] createdBy names a reviewer, not a user id');

-- ---- append-only ---------------------------------------------------------------------------------------------------------------
select ok(tests.fx_cfg_exec($q$ update nestly.algorithm_configurations set w_fresh = 2.0 $q$) like 'ERR:%', '[F3.0-a c18] updating a weight is refused');
select ok(tests.fx_cfg_exec($q$ update nestly.algorithm_configurations set reason = 'rewritten' $q$) like 'ERR:%', '[F3.0-a c18] rewriting the reason is refused');
select ok(tests.fx_cfg_exec($q$ update nestly.algorithm_configurations set version = 7 $q$) like 'ERR:%', '[F3.0-a c18] renumbering a version is refused');
select ok(tests.fx_cfg_exec($q$ delete from nestly.algorithm_configurations $q$) like 'ERR:%', '[F3.0-a c18] deleting a row is refused');
select is(pg_temp.cfg('w_fresh')::numeric, 1.0, '[F3.0-a c18] after the attempts the row is as seeded');

select is(tests.fx_cfg_exec(pg_temp.valid_insert(2, false)), 'OK:1', '[F3.0-a c18] control: a valid inactive version 2 inserts');
select ok(tests.fx_cfg_exec(pg_temp.valid_insert(2, false)) like 'ERR:%', '[F3.0-a c18] the same version again is refused');
select ok(tests.fx_cfg_exec(pg_temp.valid_insert(3, true)) like 'ERR:%', '[F3.0-a c18] a second active row is refused');
select ok(tests.fx_cfg_exec(pg_temp.valid_insert(1, false)) like 'ERR:%', '[F3.0-a c18] version 1 cannot be written twice');
select ok(tests.fx_cfg_exec(replace(pg_temp.valid_insert(4, false), '''test reviewer''', $q$'  '$q$)) like 'ERR:%', '[F3.0-a c18 BR-059] a blank createdBy is refused');
select ok(tests.fx_cfg_exec(replace(pg_temp.valid_insert(5, false), $q$'test' $q$, $q$'' $q$)) like 'ERR:%', '[F3.0-a c18 BR-059] an empty reason is refused');
select ok(tests.fx_cfg_exec(replace(pg_temp.valid_insert(6, false), '''regular_feed''', '''other_feed''')) like 'ERR:%', '[F3.0-a c18] an unknown surface is refused');
select ok(tests.fx_cfg_exec(pg_temp.valid_insert(0, false)) like 'ERR:%', '[F3.0-a c18] version 0 is refused');
select ok(tests.fx_cfg_exec(pg_temp.valid_insert(-1, false)) like 'ERR:%', '[F3.0-a c18] a negative version is refused');

-- ---- out-of-range values (I3-algorithm ranges) ------------------------------------------------------------------------------------
select ok(tests.fx_cfg_exec(pg_temp.bad_insert(t.col, t.val)) like 'ERR:%', '[F3.0-a c18] ' || t.col || ' = ' || t.val || ' is refused')
  from (values
    ('w_stage', '3'), ('w_stage', '-0.1'), ('w_quality', '2.5'), ('w_fresh', '5.5'), ('w_fresh', '-1'), ('w_friend', '6'),
    ('page_size', '4'), ('page_size', '51'), ('page_size', '0'), ('half_life_hours', '0'), ('half_life_hours', '337'),
    ('quality_cap', '0'), ('quality_cap', '1001'), ('scored_window_days', '0'), ('scored_window_days', '91'),
    ('diversity_window', '2'), ('diversity_window', '21'),
    ('max_same_creator_in_window', '6'), ('max_same_creator_in_window', '0'), ('max_anonymous_in_window', '6'), ('max_anonymous_in_window', '0'),
    ('w_fresh', 'null'), ('page_size', 'null')
  ) t(col, val);
select is(tests.fx_cfg_exec(pg_temp.bad_insert('page_size', '5')), 'OK:1', '[F3.0-a c18] control: the lower bound pageSize 5 is accepted');
select is(tests.fx_cfg_exec(pg_temp.bad_insert('page_size', '50')), 'OK:1', '[F3.0-a c18] control: the upper bound pageSize 50 is accepted');
select is(tests.fx_cfg_exec(replace(replace(pg_temp.valid_insert(90, false), 'page_size, created_by', 'page_size, w_intent, created_by'), '20, ''test reviewer''', '20, 2.5, ''test reviewer''')), 'ERR:23514', '[FR-ALG-008] wIntent 2.5 is refused');
select is(tests.fx_cfg_exec(replace(replace(pg_temp.valid_insert(91, false), 'page_size, created_by', 'page_size, w_intent, created_by'), '20, ''test reviewer''', '20, -0.1, ''test reviewer''')), 'ERR:23514', '[FR-ALG-008] wIntent -0.1 is refused');
select is(tests.fx_cfg_exec(replace(replace(pg_temp.valid_insert(92, false), 'page_size, created_by', 'page_size, intent_half_life_hours, created_by'), '20, ''test reviewer''', '20, 721, ''test reviewer''')), 'ERR:23514', '[FR-ALG-008] intentHalfLifeHours 721 is refused');
select is(tests.fx_cfg_exec(replace(replace(pg_temp.valid_insert(93, false), 'page_size, created_by', 'page_size, intent_half_life_hours, created_by'), '20, ''test reviewer''', '20, 0, ''test reviewer''')), 'ERR:23514', '[FR-ALG-008] intentHalfLifeHours 0 is refused');
select is(tests.fx_cfg_exec(pg_temp.valid_insert(94, false)), 'OK:1', '[FR-ALG-008] control: a version that names no intent weight inserts');
select is(tests.n_as(tests.fx_id('a'), 'nestly.algorithm_configurations where version = 94 and w_intent = 0 and intent_half_life_hours = 168'), '1',
  '[FR-ALG-008] and a later version that does not state its weight has the term off (default 0)');

-- ---- who can do what -----------------------------------------------------------------------------------------------------------
select is(tests.n_as(tests.fx_id('a'), 'nestly.algorithm_configurations where is_active and surface = ''regular_feed'''), '1', '[F3.0-a c18 Gate 2] authenticated (in the app_server transaction) selects the active row');
select is(tests.n_as(tests.fx_id('a'), 'nestly.algorithm_configurations where surface = ''regular_feed'''), '5', '[F3.0-a c18 re-amend] and every version, retired or not (v1 and the four inactive versions inserted above)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), pg_temp.valid_insert(9, false)), 'ERR:42501', '[F3.0-a c18] authenticated insert: 42501');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), $q$ update nestly.algorithm_configurations set w_fresh = 2 $q$), 'ERR:42501', '[F3.0-a c18] authenticated update: 42501');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), $q$ update nestly.algorithm_configurations set is_active = false $q$), 'ERR:42501', '[F3.0-a c18] authenticated retire: 42501');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), 'delete from nestly.algorithm_configurations'), 'ERR:42501', '[F3.0-a c18] authenticated delete: 42501');
select is(tests.dml_as('none', null, 'select 1 from nestly.algorithm_configurations'), 'ERR:42501', '[F3.0-a c18 rule 2] app_server as itself cannot select');
select is(tests.dml_as('none', null, pg_temp.valid_insert(9, false)), 'ERR:42501', '[F3.0-a c18 rule 2] app_server as itself cannot insert');
select is(tests.dml_as('none', null, $q$ update nestly.algorithm_configurations set w_fresh = 2 $q$), 'ERR:42501', '[F3.0-a c18 rule 2] app_server as itself cannot update');
select is(tests.dml_as('none', null, 'delete from nestly.algorithm_configurations'), 'ERR:42501', '[F3.0-a c18 rule 2] app_server as itself cannot delete');
select is(tests.dml_as('anon', tests.claims(tests.fx_id('a')), 'select 1 from nestly.algorithm_configurations'), 'ERR:42501', '[F3.0-a c18 rule 3] anon cannot select');

select * from finish();

rollback;
