-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0b feed-groundwork: held deletion and the purge routine).
-- Source of expected values: .work/feed-groundwork/spec.md (c14 and the "Still with Afik" default: at release an open report becomes
-- `expired`, its target NULL), function names from schema-b.md, not the migration text. The purge runs as app_jobs through the CI-only
-- fixtures tests.fx_jobs_on/off (membership granted and revoked inside the test transaction; app_server never keeps it).
-- People: A = 10_'s a (author), B = 10_'s b, C = 60_'s fr_c (built below).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-b c14] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'c' then tests.fx_fr_id('fr_c') end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.fn(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
create function pg_temp.refused(p_res text) returns boolean language sql as $f$ select p_res like 'ERR:%' or p_res = 'OK:0' $f$;
create function pg_temp.post(p_author text, p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), 'everyone', p_anon)
$f$;
create function pg_temp.del_post(p_who text, p_post uuid) returns text language plpgsql as $f$
declare v text;
begin
  v := pg_temp.fn(p_who, format('select nestly.delete_post(%L)::text', p_post));
  perform tests.fx_hold_settle('post', p_post);
  return v;
end
$f$;
create function pg_temp.del_cm(p_who text, p_cm uuid) returns text language plpgsql as $f$
declare v text;
begin
  v := pg_temp.fn(p_who, format('select nestly.delete_comment(%L)::text', p_cm));
  perform tests.fx_hold_settle('comment', p_cm);
  return v;
end
$f$;
-- how many readers among a, b, c read the post / the comment: '000' ...
create function pg_temp.seen_post(p_post uuid) returns text language sql as $f$
  select pg_temp.n('a', format('nestly.posts where id = %L', p_post)) || pg_temp.n('b', format('nestly.posts where id = %L', p_post))
      || pg_temp.n('c', format('nestly.posts where id = %L', p_post))
$f$;
create function pg_temp.seen_cm(p_cm uuid) returns text language sql as $f$
  select pg_temp.n('a', format('nestly.comments where id = %L', p_cm)) || pg_temp.n('b', format('nestly.comments where id = %L', p_cm))
      || pg_temp.n('c', format('nestly.comments where id = %L', p_cm))
$f$;
create function pg_temp.purge() returns text language sql as $f$ select tests.jobs_as('select nestly.purge_held_content()::text') $f$;
create function pg_temp.hours(p_state text) returns bigint language sql as $f$ select nullif(substring(p_state from 'hours=(\d+)'), '')::bigint $f$;

-- =====================================================================================================================
-- c14 -- a post with an open report
-- =====================================================================================================================
select set_config('t.hp', pg_temp.post('a')::text, true);
select set_config('t.hc', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.hp')::uuid, 'under held')::text, true);
select tests.fx_rx_add(pg_temp.id('c'), current_setting('t.hp')::uuid);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.hp')::uuid, 'harassment');
select set_config('t.hr', tests.fx_rp_id(pg_temp.id('b'), current_setting('t.hp')::uuid)::text, true);
select is(pg_temp.seen_post(current_setting('t.hp')::uuid), '101', '[F3.0-b c14] control: the reported post is read by its author and by C (not by its reporter)');
select is(pg_temp.del_post('b', current_setting('t.hp')::uuid), '0', '[F3.0-b c14] a non-author holds nothing');
select is(pg_temp.del_post('a', current_setting('t.hp')::uuid), '1', '[F3.0-b c14 3א] the author deletes a post that has an open report: one row handled');
select ok((tests.fx_hold_state('post', current_setting('t.hp')::uuid)) like 'status=deleted hours=%', '[F3.0-b c14] the row is kept, marked deleted, with a release time');
select ok(pg_temp.hours(tests.fx_hold_state('post', current_setting('t.hp')::uuid)) between 0 and 2160, '[F3.0-b c14] the release time is at most 90 days (2160 hours) after the delete');
select is(pg_temp.seen_post(current_setting('t.hp')::uuid), '000', '[F3.0-b c14] it is hidden from every viewer, its author included');
select is(pg_temp.n('b', format('nestly.comments where post_id = %L', current_setting('t.hp'))), '0', '[F3.0-b c14] its comments are unreadable to others (a commenter''s own comment is G2: file 75)');
select is(pg_temp.n('c', format('nestly.reactions where post_id = %L', current_setting('t.hp'))), '0', '[F3.0-b c14] and its likes count 0');
select is(pg_temp.n('b', format('nestly.reports where id = %L', current_setting('t.hr'))), '1', '[F3.0-b c14] the report is still the reporter''s to read');
select is(pg_temp.n('a', 'nestly.reports'), '0', '[F3.0-b c14] and not the author''s');
select is(pg_temp.del_post('a', current_setting('t.hp')::uuid), '0', '[F3.0-b c14] deleting again changes 0 rows');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set status = 'active' where id = %L $q$, current_setting('t.hp')))), '[F3.0-b c14] the author cannot bring a held post back');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set body = 'revived' where id = %L $q$, current_setting('t.hp')))), '[F3.0-b c14] nor edit it');
select ok((tests.fx_hold_state('post', current_setting('t.hp')::uuid)) like 'status=deleted%', '[F3.0-b c14] and it is still held');

-- the 90-day bound is a constraint, not a habit
select is(tests.fx_hold_exec(format($q$ update nestly.posts set held_until = held_at + interval '2161 hours' where id = %L $q$, current_setting('t.hp'))), 'ERR:23514',
  '[F3.0-b c14] a release time later than 90 days after the delete is refused');
select is(tests.fx_hold_exec(format($q$ update nestly.posts set held_until = null where id = %L $q$, current_setting('t.hp'))), 'ERR:23514', '[F3.0-b c14] and a deleted row without one');
select is(tests.fx_hold_exec(format($q$ update nestly.posts set held_until = held_at + interval '2160 hours' where id = %L $q$, current_setting('t.hp'))), 'OK:1',
  '[F3.0-b c14] exactly 90 days is allowed');

-- callable by the jobs role only
select is(tests.fx_jobs_member(), false, '[F3.0-b c14 rule 6] app_server is not a member of app_jobs');
select is(tests.as_role('none', '', 'select nestly.purge_held_content()::text'), 'ERR:42501', '[F3.0-b c14] the server login cannot run the purge');
select is(pg_temp.fn('a', 'select nestly.purge_held_content()::text'), 'ERR:42501', '[F3.0-b c14] nor an authenticated user');
select is(tests.as_role('anon', '', 'select nestly.purge_held_content()::text'), 'ERR:42501', '[F3.0-b c14] nor anon');
select is(tests.fx_jobs_member(), false, '[F3.0-b c14 rule 6] and the refusals did not hand out the role');

-- the jobs role reaches held rows and nothing else
select is(tests.jobs_as(format('select count(*)::text from nestly.posts where id = %L', current_setting('t.hp'))), '1', '[F3.0-b c14] the jobs role reads a held post');
select is(tests.jobs_as($q$ select count(*)::text from nestly.posts where status = 'active' $q$), '0', '[F3.0-b c14] and no active one');
select is(tests.jobs_as($q$ select count(*)::text from nestly.reports where status <> 'open' $q$), '0', '[F3.0-b c14] and no closed report');
select is(tests.jobs_dml($q$ update nestly.posts set body = 'x' $q$), 'ERR:42501', '[F3.0-b c14] the jobs role updates no post');
select is(tests.jobs_as($q$ select count(*)::text from nestly.users $q$), '0', '[F3.0-b c14 · I9] and reads no user but the accounts scheduled for deletion (users_select_jobs, file 110): none here');
select is(tests.jobs_as($q$ select count(*)::text from nestly.users u join nestly.regular_profiles p on p.user_id = u.id $q$), 'ERR:42501', '[F3.0-b c14] and no profile');

-- not before: open report, release not reached
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] the purge runs for the jobs role');
select ok((tests.fx_hold_state('post', current_setting('t.hp')::uuid)) like 'status=deleted%', '[F3.0-b c14] with the report open and the time not reached the row stays');
select is(tests.fx_rp_list(pg_temp.id('b')), format('post:open:%s:closed=f', current_setting('t.hp')), '[F3.0-b c14] and the report stays open on it');
select is(tests.fx_cm_state(current_setting('t.hc')::uuid) is not null, true, '[F3.0-b c14] and what hangs on it');

-- after the time: gone, nothing remains, the report is expired with no target
select tests.fx_hold_shift('post', current_setting('t.hp')::uuid, interval '91 days');
select set_config('t.x0', tests.fx_rx_count()::text, true), set_config('t.m0', tests.fx_cm_count()::text, true);
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] the purge runs after the release time');
select is(tests.fx_hold_state('post', current_setting('t.hp')::uuid), 'none', '[F3.0-b c14] the row is gone');
select is(tests.fx_cm_state(current_setting('t.hc')::uuid), null, '[F3.0-b c14] and its comment');
select is(tests.fx_rx_count(), current_setting('t.x0')::bigint - 1, '[F3.0-b c14] and its like');
select is(tests.fx_ro_count(), tests.fx_rx_count(), '[F3.0-b c14] with no orphan owner row');
select is(tests.fx_rp_list(pg_temp.id('b')), 'post:expired:null:closed=t', '[F3.0-b c14 Afik default] the open report became expired, closed, with no target');
select is(pg_temp.n('b', 'nestly.reports'), '1', '[F3.0-b c14] and its reporter still reads it');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] a second purge');
select is(tests.fx_rp_list(pg_temp.id('b')), 'post:expired:null:closed=t', '[F3.0-b c14] changes nothing');

-- handled before the release: purged at once
select set_config('t.h2', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.h2')::uuid, 'spam');
select pg_temp.del_post('a', current_setting('t.h2')::uuid);
select tests.fx_rp_set(tests.fx_rp_id(pg_temp.id('b'), current_setting('t.h2')::uuid), 'handled');
select ok((tests.fx_hold_state('post', current_setting('t.h2')::uuid)) like 'status=deleted%', '[F3.0-b c14] control: held while the report is handled but the row is not purged yet');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select is(tests.fx_hold_state('post', current_setting('t.h2')::uuid), 'none', '[F3.0-b c14] a handled report releases the row before the time passes');
select ok(tests.fx_rp_list(pg_temp.id('b')) ~ 'post:handled:null:closed=t', '[F3.0-b c14] and the report keeps its handled status');

-- a closed report does not hold a deletion at all
select set_config('t.h3', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('c'), 'post', current_setting('t.h3')::uuid, 'spam');
select tests.fx_rp_set(tests.fx_rp_id(pg_temp.id('c'), current_setting('t.h3')::uuid), 'handled');
select is(pg_temp.del_post('a', current_setting('t.h3')::uuid), '1', '[F3.0-b c13 c14] delete with only a handled report');
select is(tests.fx_hold_state('post', current_setting('t.h3')::uuid), 'none', '[F3.0-b c13] removes the row at once');

-- a bare DELETE of reported content fails closed
select set_config('t.h4', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.h4')::uuid, 'spam');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.h4')))), '[F3.0-b c14] a plain DELETE of a reported post is refused');
select ok((tests.fx_hold_state('post', current_setting('t.h4')::uuid)) like 'status=active%', '[F3.0-b c14] and the post is untouched');

-- active content with an open report is never purged
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select ok((tests.fx_hold_state('post', current_setting('t.h4')::uuid)) like 'status=active%', '[F3.0-b c14] the purge leaves active content alone');
select is(pg_temp.n('b', 'nestly.reports where status = ''open'''), '1', '[F3.0-b c14] and its open report');

-- the real author of an anonymous post: held, then nothing remains, separation row included
select set_config('t.ha', pg_temp.post('a', true)::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.ha')::uuid, 'child_safety');
select is(pg_temp.del_post('a', current_setting('t.ha')::uuid), '1', '[F3.0-b c14] the real author holds their reported anonymous post');
select is(tests.fx_pa_author(current_setting('t.ha')::uuid), pg_temp.id('a'), '[F3.0-b c14] the separation row is kept while it is held');
select tests.fx_hold_shift('post', current_setting('t.ha')::uuid, interval '91 days');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select is(tests.fx_hold_state('post', current_setting('t.ha')::uuid) || coalesce(tests.fx_pa_author(current_setting('t.ha')::uuid)::text, '-'), 'none-', '[F3.0-b c14 rule 20] nothing remains, not even the separation row');

-- a report on a comment of a held post expires with it
select set_config('t.h5', pg_temp.post('a')::text, true);
select set_config('t.h5c', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.h5')::uuid, 'reported inside')::text, true);
select tests.fx_rp_add(pg_temp.id('c'), 'post', current_setting('t.h5')::uuid, 'spam');
select tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.h5c')::uuid, 'spam');
select pg_temp.del_post('a', current_setting('t.h5')::uuid);
select tests.fx_hold_shift('post', current_setting('t.h5')::uuid, interval '91 days');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select is(tests.fx_hold_state('post', current_setting('t.h5')::uuid), 'none', '[F3.0-b c14] the held post is gone');
select ok(tests.fx_rp_list(pg_temp.id('a')) ~ 'comment:expired:null:closed=t' and tests.fx_rp_list(pg_temp.id('c')) ~ 'post:expired:null:closed=t',
  '[F3.0-b c14] and an open report on its comment expired too');

-- =====================================================================================================================
-- c14 -- a comment with an open report
-- =====================================================================================================================
select set_config('t.q', pg_temp.post('a')::text, true);
select set_config('t.k', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.q')::uuid, 'held comment')::text, true);
select tests.fx_rx_add(pg_temp.id('a'), null, current_setting('t.k')::uuid);
select tests.fx_rp_add(pg_temp.id('c'), 'comment', current_setting('t.k')::uuid, 'harassment');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ delete from nestly.comments where id = %L $q$, current_setting('t.k')))), '[F3.0-b c14] a plain DELETE of a reported comment is refused');
select is(pg_temp.seen_cm(current_setting('t.k')::uuid), '111', '[F3.0-b c14 Afik 18.10] control: a reported comment stays visible to everyone');
select is(pg_temp.del_cm('a', current_setting('t.k')::uuid), '0', '[F3.0-b c14] the post''s author cannot delete another''s comment');
select is(pg_temp.del_cm('b', current_setting('t.k')::uuid), '1', '[F3.0-b c14 3א] its author deletes it: held');
select ok(pg_temp.hours(tests.fx_hold_state('comment', current_setting('t.k')::uuid)) between 0 and 2160, '[F3.0-b c14] with a release time of at most 90 days');
select is(pg_temp.seen_cm(current_setting('t.k')::uuid), '000', '[F3.0-b c14] hidden from every viewer, its author included');
select is(pg_temp.n('a', format('nestly.reactions where comment_id = %L', current_setting('t.k'))), '0', '[F3.0-b c14] its likes count 0');
select is(pg_temp.n('c', format('nestly.reports where comment_id = %L', current_setting('t.k'))), '1', '[F3.0-b c14] the reporter still reads the report');
select is(tests.fx_hold_exec(format($q$ update nestly.comments set held_until = held_at + interval '2161 hours' where id = %L $q$, current_setting('t.k'))), 'ERR:23514', '[F3.0-b c14] later than 90 days is refused for comments too');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select ok((tests.fx_hold_state('comment', current_setting('t.k')::uuid)) like 'status=deleted%', '[F3.0-b c14] not before: the held comment stays');
select tests.fx_hold_shift('comment', current_setting('t.k')::uuid, interval '91 days');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select is(tests.fx_hold_state('comment', current_setting('t.k')::uuid), 'none', '[F3.0-b c14] after the time the comment is gone');
select ok(tests.fx_rp_list(pg_temp.id('c')) ~ 'comment:expired:null:closed=t','[F3.0-b c14 Afik default] its report expired');
select is(tests.fx_ro_count(), tests.fx_rx_count(), '[F3.0-b c14] and no like of it remains');

select set_config('t.k2', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.q')::uuid, 'second held')::text, true);
select tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.k2')::uuid, 'spam');
select pg_temp.del_cm('b', current_setting('t.k2')::uuid);
select tests.fx_rp_set(tests.fx_rp_id(pg_temp.id('a'), current_setting('t.k2')::uuid), 'handled');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14] purge');
select is(tests.fx_hold_state('comment', current_setting('t.k2')::uuid), 'none', '[F3.0-b c14] a handled report releases a held comment before the time');
select ok(tests.fx_rp_list(pg_temp.id('a')) ~ 'comment:handled:null:closed=t','[F3.0-b c14] and keeps its handled status');

-- =====================================================================================================================
-- c13 c14 b-1 (CRITIC finding 1) -- a reply with an open report holds its parent comment; the replies of a held comment
-- Post by A. K = top-level comment by C (no report of its own). R = reply to K by B, with X's open report (X = C here: a reporter
-- other than R's author and than the post's author). Readers: A = post author, B = R's author, C = third reader.
-- =====================================================================================================================
select set_config('t.bp', pg_temp.post('a')::text, true);
select set_config('t.bk', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.bp')::uuid, 'top-level K')::text, true);
select set_config('t.br', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.bp')::uuid, 'reply R', current_setting('t.bk')::uuid)::text, true);
select tests.fx_rx_add(pg_temp.id('a'), null, current_setting('t.br')::uuid);
select set_config('t.brr', tests.fx_rp_add(pg_temp.id('c'), 'comment', current_setting('t.br')::uuid, 'harassment')::text, true);
select is(pg_temp.seen_cm(current_setting('t.br')::uuid), '111', '[F3.0-b c14 b-1] control: before K is deleted R is read by everyone');
select is(pg_temp.n('c', format('nestly.reactions where comment_id = %L', current_setting('t.br'))), '1', '[F3.0-b c14 b-1] control: and its like counts');
select is(pg_temp.del_cm('c', current_setting('t.bk')::uuid), '1', '[F3.0-b c13 c14 b-1] K''s author deletes K: one row handled (K is held because of the open report on R)');
select ok((tests.fx_hold_state('comment', current_setting('t.bk')::uuid)) like 'status=deleted hours=%', '[F3.0-b c14 b-1] K is kept, marked deleted, with a release time');
select ok(pg_temp.hours(tests.fx_hold_state('comment', current_setting('t.bk')::uuid)) between 0 and 2160, '[F3.0-b c14 b-1] of at most 90 days');
select is(pg_temp.n('c', format('nestly.comments where id = %L', current_setting('t.br'))), '0', '[F3.0-b c14 b-1] R is unreadable to a third reader');
select is(pg_temp.n('a', format('nestly.comments where id = %L', current_setting('t.br'))), '0', '[F3.0-b c14 b-1] and to the post''s author');
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.br'))), '1', '[F3.0-b c14 b-1 G2] R''s own author still reads it');
select is(pg_temp.n('a', format('nestly.reactions where comment_id = %L', current_setting('t.br'))), '0', '[F3.0-b c14 b-1] R''s like does not count for the post''s author');
select is(pg_temp.n('c', format('nestly.reactions where comment_id = %L', current_setting('t.br'))), '0', '[F3.0-b c14 b-1] nor for a third reader');
select is(pg_temp.n('a', format('nestly.comments where post_id = %L', current_setting('t.bp'))), '0', '[F3.0-b c14 b-1] the thread of K shows neither K nor R');
select ok(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, 'reply under held') $q$, current_setting('t.bp'), current_setting('t.bk'))) in ('ERR:42501', 'ERR:23503'),
  '[F3.0-b c10 c14 b-1] a new reply under the held K is refused (42501 or 23503)');
select is(tests.fx_cm_id(current_setting('t.bp')::uuid, 'reply under held'), null, '[F3.0-b c14 b-1] and no such reply row exists');
select is(pg_temp.dml('b', format($q$ select parent_status from nestly.comments where id = %L $q$, current_setting('t.br'))), 'ERR:42501', '[F3.0-b b-1] parent_status is not selectable');
select is(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, parent_status, body) values (%L, 'deleted', 'forged') $q$, current_setting('t.bp'))), 'ERR:42501', '[F3.0-b b-1] and not insertable');
select is(pg_temp.dml('b', format($q$ update nestly.comments set parent_status = 'active' where id = %L $q$, current_setting('t.br'))), 'ERR:42501', '[F3.0-b b-1] nor updatable');
-- not before the release time
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14 b-1] purge before the release time');
select ok(tests.fx_cm_state(current_setting('t.bk')::uuid) is not null and tests.fx_cm_state(current_setting('t.br')::uuid) is not null, '[F3.0-b c14 b-1] K and R are both kept');
select is(pg_temp.n('c', format('nestly.reports where id = %L and status = ''open'' and comment_id = %L and closed_at is null', current_setting('t.brr'), current_setting('t.br'))), '1', '[F3.0-b c14 b-1] and the report stays open on R');
-- after the release time
select tests.fx_hold_shift('comment', current_setting('t.bk')::uuid, interval '91 days');
select ok(pg_temp.purge() !~ '^ERR', '[F3.0-b c14 b-1] purge after K''s release time');
select is(pg_temp.n('c', format('nestly.reports where id = %L and status = ''expired'' and closed_at is not null and comment_id is null and post_id is null and reported_user_id is null', current_setting('t.brr'))), '1', '[F3.0-b c14 b-1 Afik default] the report on R became expired, closed, with no target');
select is(tests.fx_cm_state(current_setting('t.bk')::uuid), null, '[F3.0-b c14 b-1] K is gone');
select is(tests.fx_cm_state(current_setting('t.br')::uuid), null, '[F3.0-b c13 c14 b-1] and R with it');
select is(tests.fx_ro_count(), tests.fx_rx_count(), '[F3.0-b c14 b-1] with no orphan like owner');
select is(pg_temp.n('c', format('nestly.reports where id = %L', current_setting('t.brr'))), '1', '[F3.0-b c14 b-1] and the reporter still reads the expired report');

-- R''s own author can still delete R while K is held
select set_config('t.bp2', pg_temp.post('a')::text, true);
select set_config('t.bk2', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.bp2')::uuid, 'top-level K2')::text, true);
select set_config('t.br2', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.bp2')::uuid, 'reply R2', current_setting('t.bk2')::uuid)::text, true);
select tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.br2')::uuid, 'spam');
select pg_temp.del_cm('c', current_setting('t.bk2')::uuid);
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.br2'))), '1', '[F3.0-b c13 c14 b-1] control: R2''s author reads R2 under the held K2');
select is(pg_temp.del_cm('b', current_setting('t.br2')::uuid), '1', '[F3.0-b c13 b-1] R2''s author deletes R2 under the held K2: one row handled');
select ok((tests.fx_hold_state('comment', current_setting('t.br2')::uuid)) like 'status=deleted%', '[F3.0-b c14 b-1] R2 is held in its own right (it has an open report)');
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.br2'))), '0', '[F3.0-b c14 b-1] and after the commit nobody reads it');

select * from finish();

rollback;
