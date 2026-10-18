-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0b feed-groundwork: reports, the reporter-hide of a post, the cleanup order).
-- Source of expected values: .work/feed-groundwork/spec.md (c15, c16 reporter, c19 and the Afik 18.10 line), the 8 reasons of
-- docs/decisions-before-i3-i5-HE.md section 3 (codes of schema-b.md), not the migration text.
-- People: A = 10_'s a (author), B = 10_'s b (a stranger), C = 60_'s fr_c (built below), S, X = suspended, banned.
-- Everything rolls back with the transaction. A refused write is any 'ERR:<sqlstate>' or 'OK:0' with the data unchanged.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-b c15] session_user is app_server (this file must not run under another login)');

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
create function pg_temp.fn(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
create function pg_temp.sees(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.posts where id = %L', p_post))
$f$;
create function pg_temp.refused(p_res text) returns boolean language sql as $f$ select p_res like 'ERR:%' or p_res = 'OK:0' $f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'b', 'c'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
end
$f$;
create function pg_temp.setst(p_post uuid, p_status text) returns uuid language plpgsql as $f$
begin
  perform tests.fx_po_status(p_post, p_status);
  return p_post;
end
$f$;
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon)
$f$;
create function pg_temp.rp_sql(p_kind text, p_target uuid, p_reason text default 'spam', p_details text default null) returns text language sql as $f$
  select format($q$ insert into nestly.reports (target_kind, post_id, comment_id, reported_user_id, reason, details) values (%L, %L, %L, %L, %L, %L) $q$,
    p_kind, case when p_kind = 'post' then p_target end, case when p_kind = 'comment' then p_target end,
    case when p_kind = 'user' then p_target end, p_reason, p_details)
$f$;

select is(tests.fx_cm_count() + tests.fx_rx_count() + tests.fx_rp_count(), 0::bigint, '[F3.0-b fixture] no comment, like or report exists before the file starts');

-- =====================================================================================================================
-- c15 -- reports (FR-MOD-001, BR-074)
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('b', pg_temp.rp_sql('post', pg_temp.post('a'), r.code, case when r.code = 'other' then 'free text' end)), 'OK:1',
  '[F3.0-b c15] reason ' || r.code || ' is accepted on a readable post')
  from unnest(array['child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information', 'medical_misinformation', 'impersonation', 'spam', 'other']) r(code);
select is(tests.fx_rp_count(), 8::bigint, '[F3.0-b c15] eight reports, one per decided reason');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('post', pg_temp.post('a'), r.code))), '[F3.0-b c15] the reason ' || coalesce(nullif(r.code, ''), '(empty)') || ' is refused')
  from (values ('bogus'), ('SPAM'), (''), (' spam'), ('spam; drop table nestly.reports'), (null)) r(code);
select is(tests.fx_rp_count(), 8::bigint, '[F3.0-b c15] and none of them left a row');
select is(pg_temp.dml('b', pg_temp.rp_sql('post', pg_temp.post('a'), 'spam', $d$it's "text"'); drop table nestly.reports; --$d$)), 'OK:1', '[F3.0-b c15] optional text of any shape is stored as text');

-- target kinds
select pg_temp.reset();
select set_config('t.pr', pg_temp.post('a')::text, true);
select set_config('t.cr', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.pr')::uuid, 'reportable')::text, true);
select set_config('t.n0', tests.fx_rp_count()::text, true);
select is(pg_temp.dml('b', pg_temp.rp_sql('comment', current_setting('t.cr')::uuid, 'harassment')), 'OK:1', '[F3.0-b c15] a reader reports a readable comment');
select is(pg_temp.dml('b', pg_temp.rp_sql('user', pg_temp.id('c'), 'impersonation')), 'OK:1', '[F3.0-b c15] a user reports another user');
select is(pg_temp.dml('b', pg_temp.rp_sql('post', current_setting('t.pr')::uuid, 'spam')), 'OK:1', '[F3.0-b c15] and a readable post');
select is(tests.fx_rp_list(pg_temp.id('b')) ~ ('comment:open:' || current_setting('t.cr')) and tests.fx_rp_list(pg_temp.id('b')) ~ ('post:open:' || current_setting('t.pr')), true,
  '[F3.0-b c15] each is stored open with its target and the reporter');

-- refused: self, duplicate, unreadable, malformed
select set_config('t.n1', tests.fx_rp_count()::text, true);
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.rp_sql('post', current_setting('t.pr')::uuid))), '[F3.0-b c15] the author cannot report their own post');
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.rp_sql('post', pg_temp.post('a', 'everyone', true)))), '[F3.0-b c15] nor their own anonymous post');
select ok(pg_temp.refused(pg_temp.dml('c', pg_temp.rp_sql('comment', current_setting('t.cr')::uuid))), '[F3.0-b c15] nor can a commenter report their own comment');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('user', pg_temp.id('b')))), '[F3.0-b c15] a self-report of a user is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('post', current_setting('t.pr')::uuid, 'harassment'))), '[F3.0-b c15] a second report by the same user on the same post is refused, whatever the reason');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('comment', current_setting('t.cr')::uuid))), '[F3.0-b c15] likewise on a comment');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('user', pg_temp.id('c')))), '[F3.0-b c15] and on a user');
select is(pg_temp.dml('a', pg_temp.rp_sql('post', current_setting('t.pr')::uuid, 'spam')) , 'ERR:42501', '[F3.0-b c15] the refusal of a self-report is an authorization error (42501)');
select is(tests.fx_rp_count(), current_setting('t.n1')::bigint, '[F3.0-b c15] the refused ones left no row');
select is(pg_temp.dml('c', pg_temp.rp_sql('post', current_setting('t.pr')::uuid)), 'OK:1', '[F3.0-b c15 BR-074] another person''s report on the same target is accepted: the threshold counts people');
select is(pg_temp.dml('a', pg_temp.rp_sql('comment', current_setting('t.cr')::uuid)), 'OK:1', '[F3.0-b c15] and the post''s author may report a comment under it');

select set_config('t.fp', pg_temp.post('a', 'friends')::text, true);
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('post', current_setting('t.fp')::uuid))), '[F3.0-b c15] a friends-only post of a non-friend is not reportable');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('comment', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.fp')::uuid, 'hidden thread')))), '[F3.0-b c15] nor a comment under it');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('post', pg_temp.setst(pg_temp.post('a'), st.s)))), '[F3.0-b c15] a post with status ' || st.s || ' is not reportable')
  from (values ('hidden'), ('removed'), ('deleted')) st(s);
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('post', gen_random_uuid()))), '[F3.0-b c15] a post that does not exist');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rp_sql('user', gen_random_uuid()))), '[F3.0-b c15] a user that does not exist');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, comment_id, reason) values ('post', %L, %L, 'spam') $q$, pg_temp.post('a'), current_setting('t.cr')))),
  '[F3.0-b c15] two targets at once');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, comment_id, reason) values ('post', %L, 'spam') $q$, current_setting('t.cr')))),
  '[F3.0-b c15] a kind that does not match the target column');
select ok(pg_temp.refused(pg_temp.dml('b', $q$ insert into nestly.reports (target_kind, reason) values ('post', 'spam') $q$)), '[F3.0-b c15] no target at all');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('thread', %L, 'spam') $q$, pg_temp.post('a')))), '[F3.0-b c15] an unknown kind');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, reason, reporter_id) values ('post', %L, 'spam', %L) $q$, pg_temp.post('a'), pg_temp.id('c'))), 'ERR:42501', '[F3.0-b c15] a report in another user''s name is refused');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, reason, status) values ('post', %L, 'spam', 'handled') $q$, pg_temp.post('a'))), 'ERR:42501', '[F3.0-b c15] a client cannot file a report as handled');
select ok(pg_temp.refused(pg_temp.dml('s', pg_temp.rp_sql('post', pg_temp.post('a')))) and pg_temp.refused(pg_temp.dml('x', pg_temp.rp_sql('post', pg_temp.post('a')))),
  '[F3.0-b c15 rule 15] a suspended or banned user cannot report');
select ok(pg_temp.refused(tests.dml_as('anon', tests.claims(pg_temp.id('b')), pg_temp.rp_sql('post', pg_temp.post('a')))), '[F3.0-b c15 rule 3] anon cannot report');
select ok(pg_temp.refused(tests.dml_as('none', '', pg_temp.rp_sql('post', pg_temp.post('a')))), '[F3.0-b c15] a session with no identity cannot report');

-- readable by the reporter only; no update, no delete
select pg_temp.reset();
select tests.fx_rp_clear();
select set_config('t.q', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.q')::uuid, 'spam');
select tests.fx_rp_add(pg_temp.id('b'), 'user', pg_temp.id('c'), 'harassment');
select is(pg_temp.n('b', 'nestly.reports'), '2', '[F3.0-b c15] the reporter reads their reports');
select is(pg_temp.n('a', 'nestly.reports') || pg_temp.n('c', 'nestly.reports'), '00', '[F3.0-b c15] the post''s author and the reported user read none');
select is(pg_temp.n('s', 'nestly.reports'), '0', '[F3.0-b c15] nor does anyone else');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.n('b', 'nestly.reports'), '0', '[F3.0-b c15 rule 15] a suspended reporter reads none');
select tests.set_status(pg_temp.id('b'), 'active');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('b')), 'select 1 from nestly.reports'), 'ERR:42501', '[F3.0-b c15 rule 3] anon reads no reports');
select is(pg_temp.dml('b', 'update nestly.reports set reason = ''other'''), 'ERR:42501', '[F3.0-b c15] a report cannot be edited by the reporter');
select is(pg_temp.dml('b', 'update nestly.reports set status = ''handled'', closed_at = now()'), 'ERR:42501', '[F3.0-b c15] nor closed by them');
select is(pg_temp.dml('b', 'delete from nestly.reports'), 'ERR:42501', '[F3.0-b c15] nor withdrawn');
select is(pg_temp.dml('a', 'delete from nestly.reports'), 'ERR:42501', '[F3.0-b c15] nor deleted by the reported party');
select is(tests.fx_rp_count(), 2::bigint, '[F3.0-b c15] the rows are unchanged');

-- =====================================================================================================================
-- c16 -- the reporter's hide: posts only (7א; Afik 18.10)
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_feed_clear();
select set_config('t.rp', pg_temp.post('a')::text, true);
select set_config('t.ra', pg_temp.post('a', 'everyone', true)::text, true);
select set_config('t.other', pg_temp.post('a')::text, true);
select set_config('t.rc', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.other')::uuid, 'reported comment')::text, true);
select set_config('t.pc', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.rp')::uuid, 'comment on reported post')::text, true);
select is(pg_temp.sees('b', current_setting('t.rp')::uuid), '1', '[F3.0-b c16] control: before the report B reads the post');
select is(pg_temp.dml('b', pg_temp.rp_sql('post', current_setting('t.rp')::uuid)), 'OK:1', '[F3.0-b c16] B reports a post');
select is(pg_temp.sees('b', current_setting('t.rp')::uuid), '0', '[F3.0-b c16 7א] it is returned to the reporter 0 times');
select is(pg_temp.sees('a', current_setting('t.rp')::uuid) || pg_temp.sees('c', current_setting('t.rp')::uuid), '11', '[F3.0-b c16] and still to its author and to other eligible viewers');
select is(pg_temp.n('b', format('nestly.comments where post_id = %L', current_setting('t.rp'))), '0', '[F3.0-b c16 c10] the reporter reads none of its comments either (they cannot read the post)');
select is(pg_temp.n('c', format('nestly.comments where post_id = %L', current_setting('t.rp'))), '1', '[F3.0-b c16] others still do');
select is(pg_temp.n('b', format('nestly.reports where post_id = %L', current_setting('t.rp'))), '1', '[F3.0-b c16] the reporter still reads their own report');
select is(pg_temp.sees('b', current_setting('t.other')::uuid), '1', '[F3.0-b c16] other posts of the same author stay visible to the reporter');
select tests.fx_rp_set(tests.fx_rp_id(pg_temp.id('b'), current_setting('t.rp')::uuid), 'handled');
select is(pg_temp.sees('b', current_setting('t.rp')::uuid), '0', '[F3.0-b c16] a handled report keeps the post hidden from its reporter');
select is(pg_temp.dml('b', pg_temp.rp_sql('post', current_setting('t.ra')::uuid, 'child_safety')), 'OK:1', '[F3.0-b c16] B reports an anonymous post');
select is(pg_temp.sees('b', current_setting('t.ra')::uuid) || pg_temp.sees('c', current_setting('t.ra')::uuid) || pg_temp.sees('a', current_setting('t.ra')::uuid), '011',
  '[F3.0-b c16] hidden from B only; its author still reads it');

-- a reported comment or user stays visible to everyone, the reporter included (Afik 18.10)
select set_config('t.prof0', pg_temp.n('b', format('nestly.regular_profiles where user_id = %L', pg_temp.id('c'))) || pg_temp.n('b', format('nestly.users where id = %L', pg_temp.id('c'))), true);
select is(pg_temp.dml('b', pg_temp.rp_sql('comment', current_setting('t.rc')::uuid, 'harassment')), 'OK:1', '[F3.0-b c16] B reports a comment');
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.rc'))) || pg_temp.n('a', format('nestly.comments where id = %L', current_setting('t.rc')))
  || pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.rc'))), '111', '[F3.0-b c16 Afik 18.10] a reported comment stays visible to everyone, the reporter included');
select is(pg_temp.n('b', format('nestly.comments where post_id = %L', current_setting('t.other'))), '1', '[F3.0-b c16] and so does its thread');
select is(pg_temp.dml('b', pg_temp.rp_sql('user', pg_temp.id('c'), 'impersonation')), 'OK:1', '[F3.0-b c16] B reports a user');
select is(pg_temp.n('b', format('nestly.regular_profiles where user_id = %L', pg_temp.id('c'))) || pg_temp.n('b', format('nestly.users where id = %L', pg_temp.id('c'))),
  current_setting('t.prof0'), '[F3.0-b c16 Afik 18.10] reporting a user changes nothing the reporter reads about them');
select is(pg_temp.sees('b', pg_temp.post('c')), '1', '[F3.0-b c16 Afik 18.10] nor the reported user''s posts');
select is(pg_temp.n('c', format('nestly.regular_profiles where user_id = %L', pg_temp.id('c'))), '1', '[F3.0-b c16] and the reported user still reads their own profile');

-- =====================================================================================================================
-- c13 c14 -- own comment on a post the commenter reported or hid (DATA ARCHITECT G2, schema-b.md "Own-content deletion"):
-- the commenter keeps their own comment, may delete it, and cannot add to the post
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_feed_clear();
select set_config('t.gp', pg_temp.post('a')::text, true);
select set_config('t.gc', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.gp')::uuid, 'c own comment')::text, true);
select set_config('t.gb', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.gp')::uuid, 'b comment')::text, true);
select is(pg_temp.dml('c', pg_temp.rp_sql('post', current_setting('t.gp')::uuid)), 'OK:1', '[F3.0-b c16 G2] C reports the post');
select is(pg_temp.sees('c', current_setting('t.gp')::uuid), '0', '[F3.0-b c16 G2] control: C no longer reads the post');
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.gc'))), '1', '[F3.0-b c10 G2] C still reads their own comment on it');
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.gb'))), '0', '[F3.0-b c10 G2] but not another user''s comment on it');
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.gb'))), '1', '[F3.0-b c10 G2] control: others read both');
select is(pg_temp.dml('c', format($q$ insert into nestly.comments (post_id, body) values (%L, 'new') $q$, current_setting('t.gp'))), 'ERR:42501', '[F3.0-b c10 G2] C cannot add a comment to it');
select is(pg_temp.dml('c', format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, 'reply to mine') $q$, current_setting('t.gp'), current_setting('t.gc'))), 'ERR:42501', '[F3.0-b c10 G2] nor a reply, not even to their own comment');
select is(pg_temp.fn('c', format('select nestly.delete_comment(%L)::text', current_setting('t.gc'))), '1', '[F3.0-b c13 G2] C deletes their own comment');
select is(tests.fx_cm_state(current_setting('t.gc')::uuid), null, '[F3.0-b c13 G2] and the row is gone');

-- the same with a hide instead of a report
select set_config('t.hp', pg_temp.post('a')::text, true);
select set_config('t.hc', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.hp')::uuid, 'c own comment 2')::text, true);
select set_config('t.hb', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.hp')::uuid, 'b comment 2')::text, true);
select is(pg_temp.dml('c', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.hp'))), 'OK:1', '[F3.0-b c16 G2] C hides the post');
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.hc'))), '1', '[F3.0-b c10 G2] C still reads their own comment');
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.hb'))), '0', '[F3.0-b c10 G2] not another user''s');
select is(pg_temp.dml('c', format($q$ insert into nestly.comments (post_id, body) values (%L, 'new') $q$, current_setting('t.hp'))), 'ERR:42501', '[F3.0-b c10 G2] C cannot add a comment to a post they hid');
select is(pg_temp.fn('c', format('select nestly.delete_comment(%L)::text', current_setting('t.hc'))), '1', '[F3.0-b c13 G2] and deletes their own comment');
select is(tests.fx_cm_state(current_setting('t.hc')::uuid), null, '[F3.0-b c13 G2] the row is gone');

-- held variant: someone else has an open report on C's comment
select set_config('t.vp', pg_temp.post('a')::text, true);
select set_config('t.vc', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.vp')::uuid, 'c reported comment')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'comment', current_setting('t.vc')::uuid, 'harassment');
select tests.fx_rp_add(pg_temp.id('c'), 'post', current_setting('t.vp')::uuid, 'spam');
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.vc'))), '1', '[F3.0-b c14 G2] C reads their own reported comment on a post they reported');
select is(pg_temp.fn('c', format('select nestly.delete_comment(%L)::text', current_setting('t.vc'))), '1', '[F3.0-b c14 G2] delete_comment returns 1');
select ok((tests.fx_hold_state('comment', current_setting('t.vc')::uuid)) like 'status=deleted%', '[F3.0-b c14 G2] the row is held, marked deleted');
select tests.fx_hold_settle('comment', current_setting('t.vc')::uuid);
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.vc'))), '0', '[F3.0-b c14 G2] after the commit C cannot read it');

-- =====================================================================================================================
-- c19 -- the Preview cleanup order leaves nothing of a user who owns comment, like and report rows (22 tables)
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_feed_clear();
select set_config('t.apost', pg_temp.post('a')::text, true);
select set_config('t.upost', pg_temp.post('c')::text, true);
select set_config('t.uanon', pg_temp.post('c', 'everyone', true)::text, true);
select set_config('t.a_on_u', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.upost')::uuid, 'a on c')::text, true);
select set_config('t.c_cm', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.apost')::uuid, 'c on a')::text, true);
select set_config('t.c_rep', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.apost')::uuid, 'a replies to c', current_setting('t.c_cm')::uuid)::text, true);
select set_config('t.c_anon', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.uanon')::uuid, 'c on own anon')::text, true);
select set_config('t.b_cm', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.apost')::uuid, 'control by b')::text, true);
select tests.fx_rx_add(pg_temp.id('a'), current_setting('t.upost')::uuid);
select tests.fx_rx_add(pg_temp.id('b'), null, current_setting('t.c_cm')::uuid);
select tests.fx_rx_add(pg_temp.id('c'), current_setting('t.apost')::uuid);
select tests.fx_rx_add(pg_temp.id('b'), current_setting('t.apost')::uuid);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.upost')::uuid, 'spam');
select tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.c_cm')::uuid, 'spam');
select tests.fx_rp_add(pg_temp.id('c'), 'post', current_setting('t.apost')::uuid, 'spam');
select tests.fx_rp_add(pg_temp.id('a'), 'user', pg_temp.id('c'), 'harassment');
select tests.fx_rp_add(pg_temp.id('c'), 'user', pg_temp.id('b'), 'harassment');
select tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.b_cm')::uuid, 'spam');
select set_config('t.n_cm', tests.fx_cm_count()::text, true), set_config('t.n_rx', tests.fx_rx_count()::text, true), set_config('t.n_rp', tests.fx_rp_count()::text, true);
select lives_ok(format('select tests.fx_cleanup_user(%L)', pg_temp.id('c')), '[F3.0-b c19 B1] a user owning posts, comments, a like and reports (all open) is deleted without error');
select is(tests.fx_cm_count(), current_setting('t.n_cm')::bigint - 4, '[F3.0-b c19] four comments went: theirs (two), the reply to theirs, the one on their post');
select is(tests.fx_cm_state(current_setting('t.b_cm')::uuid) ~ '^status=active', true, '[F3.0-b c19] another user''s comment on a surviving post stays');
select is(tests.fx_rx_count(), current_setting('t.n_rx')::bigint - 3, '[F3.0-b c19] three likes went: theirs, on their post, on their comment');
select is(tests.fx_ro_count(), tests.fx_rx_count(), '[F3.0-b c19] with no orphan owner row');
select is(tests.fx_rp_count(), current_setting('t.n_rp')::bigint - 5, '[F3.0-b c19] five reports went: by them (two), on them, on their post, on their comment');
select is(tests.fx_rp_list(pg_temp.id('a')), format('comment:open:%s:closed=f', current_setting('t.b_cm')), '[F3.0-b c19] the unrelated report remains');
select is(tests.fx_po_state(current_setting('t.upost')::uuid) is null and tests.fx_po_state(current_setting('t.uanon')::uuid) is null, true, '[F3.0-b c19] their posts are gone');

select * from finish();

rollback;
