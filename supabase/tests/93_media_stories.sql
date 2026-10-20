-- pgTAP, run by pg_prove as app_server (CI `db` job, I5: images, reviews, profile photos, Stories, the approval queue and the training set).
-- Expected values come from the SRS (FR-FEED-002, FR-FEED-008, FR-PROFILE-001, FR-REL-002, NFR-MEDIA-001, BR-077, VAL-041, VAL-042, ERR-040,
-- ERR-041, AC-021, AC-102..105, M6) and Afik's image policy of 20.10.2026 (decisions-in-force.md §2, §7), not from the migration text.
-- People: A, B = Regulars (10_), P = a Professional, S = suspended; D = 60_'s fr_d (Admin); M1 = 90_'s sf_m1 (Moderator, no key);
-- M3 = sf_m3 (CONTENT_MODERATE); M2 = sf_m2 (CONTENT_MODERATE + REPORTS_VIEW). The job role app_media_jobs is reached through
-- tests.media_dml / media_as (93_ fixtures). Clocks are moved back with the 93_ fixtures. Everything rolls back.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F5.1-a c0] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p') when 's' then tests.fx_id('s')
    when 'd' then tests.fx_fr_id('fr_d') when 'm1' then tests.fx_sf_id('sf_m1') when 'm2' then tests.fx_sf_id('sf_m2') when 'm3' then tests.fx_sf_id('sf_m3')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
create function pg_temp.up(p_who text, p_kind text, p_w int default 800) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values (%L, 'image/webp', %s, 600, 120000) returning id::text $q$, p_kind, p_w))
$f$;
create function pg_temp.job(p_sql text) returns text language sql as $f$ select tests.media_dml(p_sql) $f$;
create function pg_temp.jobq(p_sql text) returns text language sql as $f$ select tests.media_as(p_sql) $f$;
-- catalog lookups by name (app_server has no USAGE on schema nestly, so no regclass cast)
create function pg_temp.toid(p_t text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = p_t
$f$;
create function pg_temp.colpriv(p_role text, p_t text, p_col text, p_priv text) returns boolean language sql as $f$
  select has_column_privilege(p_role, pg_temp.toid(p_t), (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = pg_temp.toid(p_t) and a.attname = p_col), p_priv)
$f$;
create function pg_temp.tabpriv(p_role text, p_t text, p_priv text) returns boolean language sql as $f$
  select has_table_privilege(p_role, pg_temp.toid(p_t), p_priv)
$f$;
create function pg_temp.anycol(p_role text, p_t text, p_priv text) returns boolean language sql as $f$
  select has_any_column_privilege(p_role, pg_temp.toid(p_t), p_priv)
$f$;
create temp table img (k text primary key, v text);
grant all on img to public;
create function pg_temp.i(p_k text) returns text language sql as $f$ select v from img where k = p_k $f$;
create function pg_temp.m(p_k text) returns text language sql as $f$ select format('nestly.media_assets where id = %L', pg_temp.i(p_k)) $f$;
-- the check: passed, or queued with its reason first
create function pg_temp.pass(p_k text) returns text language sql as $f$
  select pg_temp.job(format('update nestly.media_assets set status = ''passed'' where id = %L', pg_temp.i(p_k)))
$f$;
create function pg_temp.queue(p_k text, p_reason text) returns text language sql as $f$
  select pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, scores) values (%L, %L, '{"FEMALE_BREAST_EXPOSED":0.7}') $q$, pg_temp.i(p_k), p_reason))
      || '/' || pg_temp.job(format('update nestly.media_assets set status = ''queued'' where id = %L', pg_temp.i(p_k)))
$f$;
create function pg_temp.decide(p_who text, p_k text, p_status text) returns text language sql as $f$
  select pg_temp.dml(p_who, format('update nestly.media_assets set status = %L where id = %L', p_status, pg_temp.i(p_k)))
$f$;
create function pg_temp.sample(p_k text, p_label text, p_source text, p_child boolean default false) returns text language sql as $f$
  select pg_temp.job(format($q$ insert into nestly.media_training_samples (source_media_id, label, source, is_child, mime, decided_at)
    select id, %L, %L, %L, mime, case when %L = 'reported' then null else decided_at end from nestly.media_assets where id = %L $q$,
    p_label, p_source, p_child, p_source, pg_temp.i(p_k)))
$f$;
create function pg_temp.sample_id(p_k text) returns uuid language sql as $f$
  select tests.media_as(format('select id::text from nestly.media_training_samples where source_media_id = %L', pg_temp.i(p_k)))::uuid
$f$;
create function pg_temp.with_reason(p_who text, p_stmt text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ with s as (select set_config('nestly.audit_reason', 'because', true)) %s $q$, p_stmt))
$f$;
-- a report on a post is handled as a moderator does it: the post removed (stated reason), then the report closed with action taken
create function pg_temp.remove_post(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.with_reason(p_who, format('update nestly.posts t set status = ''removed'' from s where t.id = %L', p_post))
      || '/' || pg_temp.dml(p_who, format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where post_id = %L and status = 'open' $q$, p_post))
$f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['CONTENT_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m2'), array['CONTENT_MODERATE', 'REPORTS_VIEW']);

-- ---- c1: grants and structure --------------------------------------------------------------------------------------------------
select is(pg_temp.colpriv('authenticated', 'media_assets', 'owner_id', 'SELECT'), false,
  '[F5.1-a c1 AC-075] owner_id is not readable by a client: an anonymous post''s image names no one');
select is(pg_temp.colpriv('authenticated', 'media_assets', 'is_held', 'SELECT'), false, '[F5.1-a c1 M6] whether an image is held as a suspicion is not readable by a client');
select is(pg_temp.colpriv('authenticated', 'media_assets', 'decided_at', 'SELECT'), false, '[F5.1-a c1 M6] nor when it was decided');
select is(pg_temp.colpriv('authenticated', 'media_assets', 'status', 'INSERT'), false, '[F5.1-a c1 AC-105] an upload cannot choose its status');
select is(pg_temp.colpriv('authenticated', 'media_assets', 'check_attempts', 'SELECT'), false, '[F5.1-a c1] the check counters are not readable');
select is(pg_temp.tabpriv('authenticated', 'media_training_samples', 'INSERT'), false, '[F5.1-a c1 Afik 20.10] no client adds a training sample');
select is(pg_temp.anycol('authenticated', 'media_training_samples', 'SELECT'), false, '[F5.1-a c1 Afik 20.10] no client reads the training set: no manual viewing');
select is(pg_temp.tabpriv('authenticated', 'media_training_samples', 'DELETE'), false, '[F5.1-a c1 Afik 20.10] no client deletes one');
select is(pg_temp.anycol('authenticated', 'media_training_candidates', 'SELECT'), false, '[F5.1-a c1] no client reads the candidates');
select is(pg_temp.tabpriv('anon', 'media_assets', 'SELECT'), false, '[F5.1-a c1 rule 7] anon reaches no image row');
select is(pg_temp.colpriv('app_media_jobs', 'media_training_samples', 'expires_at', 'INSERT'), false,
  '[F5.1-a c1 Afik 20.10] the job cannot choose a sample''s expiry: it is exactly 6 months');
select is(pg_temp.colpriv('app_media_jobs', 'media_training_samples', 'created_at', 'INSERT'), false, '[F5.1-a c1] nor its copy time');
select is(pg_temp.colpriv('app_media_jobs', 'media_assets', 'decided_at', 'UPDATE'), false, '[F5.1-a c1] the job never writes a decision');
select is(pg_temp.colpriv('app_media_jobs', 'media_reviews', 'is_child', 'INSERT'), false, '[F5.1-a c1] nor the child mark');
select is(pg_temp.tabpriv('app_media_jobs', 'media_training_events', 'DELETE'), false, '[F5.1-a c1 Afik 20.10] nor deletes the access record');
select is(pg_temp.tabpriv('app_media_jobs', 'posts', 'SELECT') or pg_temp.tabpriv('app_media_jobs', 'reports', 'SELECT')
          or pg_temp.tabpriv('app_media_jobs', 'users', 'SELECT'), false, '[F5.1-a c1 rule 6] the job reads no post, report or account');
select is((select string_agg(r.rolname, ',') from pg_roles r where r.rolname = 'app_media_jobs' and r.rolcanlogin and not r.rolbypassrls and not r.rolsuper), 'app_media_jobs',
  '[F5.1-a c1 rule 1] app_media_jobs logs in, without BYPASSRLS');
select is(tests.fx_media_member(), false, '[F5.1-a c1 rule 6] app_server is not a member of app_media_jobs outside the fixture calls');
select is((select confdeltype::text from pg_constraint where conname = 'media_assets_owner_fkey'), 'n',
  '[F5.1-a c1 M6 Afik 20.10] deleting an account does not delete its images: a held image stays its 90 days (owner_id SET NULL)');
select is((select string_agg(conname, ',' order by conname) from pg_constraint where conname in ('stories_media_owner_fkey', 'profile_photos_media_owner_fkey')),
  'profile_photos_media_owner_fkey,stories_media_owner_fkey', '[F5.1-a c1] a Story and a profile photo use the author''s own image (checked by the database)');

-- ---- c2: uploads (FR-FEED-002, VAL-041, AC-105) --------------------------------------------------------------------------------
insert into img values ('a1', pg_temp.up('a', 'post'));
select ok(pg_temp.i('a1') ~ '^[0-9a-f-]{36}$', '[F5.1-a c2 FR-FEED-002] a Regular uploads a post image');
select is(pg_temp.n('a', pg_temp.m('a1') || ' and status = ''pending'''), '1', '[F5.1-a c2 AC-105] it starts pending, and the uploader reads it');
select is(pg_temp.n('b', pg_temp.m('a1')), '0', '[F5.1-a c2 AC-105] no one else reads a pending image');
select is(pg_temp.n('d', pg_temp.m('a1')), '0', '[F5.1-a c2 AC-105] not even the Admin, before the check');
select is(pg_temp.dml('a', format('select owner_id from %s', pg_temp.m('a1'))), 'ERR:42501', '[F5.1-a c2] the uploader too cannot select owner_id');
select ok(pg_temp.up('p', 'post') ~ '^[0-9a-f-]{36}$', '[F5.1-a c2 FR-PROFILE-001] a Professional uploads too');
select is(pg_temp.up('d', 'post'), 'ERR:42501', '[F5.1-a c2 BR-016] an Admin account uploads nothing');
select is(pg_temp.up('m3', 'post'), 'ERR:42501', '[F5.1-a c2 BR-016] nor a Moderator');
select is(pg_temp.up('s', 'post'), 'ERR:42501', '[F5.1-a c2 rule 15] nor a suspended account');
select is(pg_temp.up('a', 'post', 2049), 'ERR:23514', '[F5.1-a c2 VAL-041 AC-104] wider than 2,048 pixels is refused');
select is(pg_temp.dml('a', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/gif', 10, 10, 10) $$), 'ERR:23514',
  '[F5.1-a c2 VAL-041] a format other than JPEG, PNG or WebP is refused');
select is(pg_temp.dml('a', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 10, 10, 5242881) $$), 'ERR:23514',
  '[F5.1-a c2 NFR-MEDIA-001] a stored file above 5 MB is refused');
select is(pg_temp.dml('a', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('video', 'image/webp', 10, 10, 10) $$), 'ERR:23514',
  '[F5.1-a c2 NFR-MEDIA-001] images only');

-- ---- c3: attaching to a post (FR-FEED-002, VAL-041) ----------------------------------------------------------------------------
create temp table po (k text primary key, v uuid);
grant all on po to public;
insert into po values ('a_ev', tests.fx_po_add(pg_temp.id('a'))), ('a_fr', tests.fx_po_add(pg_temp.id('a'), 'friends')),
  ('a_anon', tests.fx_po_add(pg_temp.id('a'), 'everyone', true)), ('b_ev', tests.fx_po_add(pg_temp.id('b'))),
  ('a_rep', tests.fx_po_add(pg_temp.id('a'))), ('a_cs', tests.fx_po_add(pg_temp.id('a'))), ('a_rej', tests.fx_po_add(pg_temp.id('a')));
create function pg_temp.attach(p_who text, p_k text, p_post text, p_pos int) returns text language sql as $f$
  select pg_temp.dml(p_who, format('update nestly.media_assets set post_id = %L, position = %s where id = %L', (select v from po where k = p_post), p_pos, pg_temp.i(p_k)))
$f$;
select is(pg_temp.attach('a', 'a1', 'a_ev', 0), 'OK:1', '[F5.1-a c3 FR-FEED-002 AC-021] the uploader attaches the image to their post');
insert into img values ('a2', pg_temp.up('a', 'post'));
select is(pg_temp.attach('a', 'a2', 'b_ev', 1), 'ERR:42501', '[F5.1-a c3 FR-FEED-002] never to someone else''s post');
select is(pg_temp.attach('a', 'a2', 'a_ev', 0), 'ERR:23505', '[F5.1-a c3 VAL-041] one image per position');
select is(pg_temp.attach('a', 'a2', 'a_ev', 4), 'ERR:23514', '[F5.1-a c3 VAL-041] positions 0 to 3: at most 4 images in a post');
select is(pg_temp.attach('b', 'a2', 'b_ev', 1), 'OK:0', '[F5.1-a c3 FR-FEED-002] another user cannot take my image');
select is(pg_temp.decide('a', 'a2', 'passed'), 'ERR:42501', '[F5.1-a c3 AC-105] the uploader cannot mark their image as checked');

-- ---- c4: the background check (app_media_jobs, rule 6) ---------------------------------------------------------------------------
select is(pg_temp.pass('a1'), 'OK:1', '[F5.1-a c4 AC-105] the job records a passed check');
select is(pg_temp.n('b', pg_temp.m('a1')), '1', '[F5.1-a c4 AC-105 FR-FEED-002] after the check, a reader of the post reads its image');
select is(pg_temp.job(format('update nestly.media_assets set status = ''queued'' where id = %L', pg_temp.i('a1'))), 'OK:0', '[F5.1-a c4 AC-105] the job moves only a pending image');
select is(pg_temp.job(format('update nestly.media_assets set status = ''queued'' where id = %L', pg_temp.i('a2'))), 'ERR:23514',
  '[F5.1-a c4] the job queues an image only after writing why (its review)');
select is(pg_temp.job(format('update nestly.media_assets set status = ''approved'' where id = %L', pg_temp.i('a2'))), 'ERR:42501', '[F5.1-a c4 Afik 20.10] the job never decides as staff do');
select is(pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, is_child) values (%L, 'blocked', true) $q$, pg_temp.i('a2'))), 'ERR:42501',
  '[F5.1-a c4 Afik 20.10] nor marks a child');
select is(pg_temp.job(format('update nestly.media_assets set check_attempts = check_attempts + 1 where id = %L', pg_temp.i('a2'))), 'OK:1',
  '[F5.1-a c4 AC-105] a failed check is counted and the image stays pending');
select is(pg_temp.n('b', pg_temp.m('a2')), '0', '[F5.1-a c4 AC-105] while the check fails, the image stays hidden');
insert into img values ('a3', pg_temp.up('a', 'post')), ('a4', pg_temp.up('a', 'post'));
select is(pg_temp.attach('a', 'a3', 'a_fr', 0), 'OK:1', '[F5.1-a c4] control');
select is(pg_temp.attach('a', 'a4', 'a_anon', 0), 'OK:1', '[F5.1-a c4 FR-FEED-005] the real author attaches an image to their anonymous post');
select is(pg_temp.pass('a3') || pg_temp.pass('a4'), 'OK:1OK:1', '[F5.1-a c4] control');
select is(pg_temp.n('b', pg_temp.m('a3')), '0', '[F5.1-a c4 OP-033] the image of a Friends-only post is not readable by a non-Friend');
select is(pg_temp.n('b', pg_temp.m('a4')), '1', '[F5.1-a c4 FR-FEED-005] the image of an anonymous post is readable ...');
select is(pg_temp.dml('b', format('select owner_id from %s', pg_temp.m('a4'))), 'ERR:42501', '[F5.1-a c4 AC-075] ... and names no author');

-- ---- c5: the approval queue (Afik 20.10, CONTENT_MODERATE) --------------------------------------------------------------------
insert into img values ('q1', pg_temp.up('a', 'post')), ('q2', pg_temp.up('a', 'post')), ('q3', pg_temp.up('a', 'post')), ('q4', pg_temp.up('b', 'post')),
  ('q5', pg_temp.up('a', 'post'));
select is(pg_temp.queue('q1', 'blocked') || ',' || pg_temp.queue('q2', 'blocked') || ',' || pg_temp.queue('q3', 'blocked'), 'OK:1/OK:1,OK:1/OK:1,OK:1/OK:1',
  '[F5.1-a c5 Afik 20.10] a blocked image goes to the queue with its reason, not deleted');
select is(pg_temp.queue('q4', 'unsure'), 'OK:1/OK:1', '[F5.1-a c5 Afik 20.10] so does an image the model is unsure about');
select is(pg_temp.queue('q5', 'error'), 'OK:1/OK:1', '[F5.1-a c5 AC-105] and one whose check kept failing (fail closed)');
select is(pg_temp.n('a', pg_temp.m('q1') || ' and status = ''queued'''), '1', '[F5.1-a c5 Afik 20.10] the uploader still sees it ("ממתין לבדיקה")');
select is(pg_temp.n('b', pg_temp.m('q1')), '0', '[F5.1-a c5 Afik 20.10] nobody else does');
select is(pg_temp.n('m1', 'nestly.media_assets where status = ''queued'''), '0', '[F5.1-a c5 §3.2] a Moderator without CONTENT_MODERATE sees no queue');
select is(pg_temp.n('m3', 'nestly.media_assets where status = ''queued'''), '5', '[F5.1-a c5 §3.2 Afik 20.10] a Moderator with CONTENT_MODERATE sees the queue');
select is(pg_temp.n('d', 'nestly.media_assets where status = ''queued'''), '5', '[F5.1-a c5 §3.1] the Admin sees the queue');
select is(pg_temp.n('m3', 'nestly.media_reviews'), '5', '[F5.1-a c5] with each image''s reason and scores');
select is(pg_temp.n('a', 'nestly.media_reviews'), '0', '[F5.1-a c5 M6] the uploader never reads a review');
select is(pg_temp.n('m1', 'nestly.media_reviews'), '0', '[F5.1-a c5] nor a Moderator without the key');
select is(pg_temp.n('m3', 'nestly.media_assets where status = ''pending'''), '0', '[F5.1-a c5] the queue is not a window onto unchecked images');
select is(pg_temp.decide('m1', 'q1', 'approved'), 'OK:0', '[F5.1-a c5 §3.2] a Moderator without the key decides nothing');
select is(pg_temp.decide('b', 'q1', 'approved'), 'OK:0', '[F5.1-a c5 §3.2] nor a user');
select is(pg_temp.decide('m3', 'a1', 'approved'), 'OK:0', '[F5.1-a c5] without REPORTS_VIEW, only a queued image is decided');
select is(pg_temp.dml('m3', format('update nestly.media_reviews set is_child = true where media_id = %L', pg_temp.i('q1'))), 'OK:1',
  '[F5.1-a c5 Afik 20.10] staff mark "a child is in the image"');
select is(pg_temp.decide('m3', 'q1', 'approved'), 'OK:1', '[F5.1-a c5 Afik 20.10] and approve');
select is(tests.fx_sf_audit('media_approved'), 1::bigint, '[F5.1-a c5 BR-026] the decision is in the Audit Log');
select is((select after_state->>'heldAsSuspected' from tests.fx_audit_rows() where action = 'media_approved'), 'false', '[F5.1-a c5] recorded as not held');
select is(pg_temp.decide('d', 'q2', 'rejected'), 'OK:1', '[F5.1-a c5 Afik 20.10] the Admin rejects');
select is(pg_temp.n('a', pg_temp.m('q2') || ' and status = ''rejected'''), '1', '[F5.1-a c5 ERR-041] the uploader learns it was rejected');
select is(pg_temp.decide('m3', 'q2', 'approved'), 'OK:0', '[F5.1-a c5] a decision is final');
select is(pg_temp.attach('a', 'q2', 'a_ev', 1), 'ERR:42501', '[F5.1-a c5] a rejected image is never attached');
select tests.fx_link_put(pg_temp.id('d'), 'affected', '22222222-2222-4222-8222-222222222222'::uuid, timestamptz '2026-10-16 10:00:00+00', '22222222-2222-4222-8222-222222222222'::uuid);
select is(pg_temp.dml('d', format('update nestly.media_assets set status = ''approved'' where id = %L', pg_temp.i('q4')), false), 'OK:0', '[F5.1-a c5 BR-026] an Admin whose session is stale decides nothing');
select tests.fx_link_put(pg_temp.id('d'), 'unaffected', '22222222-2222-4222-8222-222222222222'::uuid);
select tests.set_status(pg_temp.id('m3'), 'suspended');
select is(pg_temp.decide('m3', 'q4', 'approved'), 'OK:0', '[F5.1-a c5 rule 15] a suspended Moderator decides nothing');
select tests.set_status(pg_temp.id('m3'), 'active');

-- ---- c6: a suspicion of child abuse reads to the uploader exactly as a rejection (M6, Afik 20.10) ---------------------------------
select is(pg_temp.dml('m3', format('update nestly.media_reviews set is_suspected = true where media_id = %L', pg_temp.i('q3'))), 'OK:1',
  '[F5.1-a c6 M6] staff mark a suspicion on a queued image');
select is(pg_temp.decide('m3', 'q3', 'approved'), 'ERR:23514', '[F5.1-a c6 M6] a suspected image is never approved');
select is(pg_temp.decide('m3', 'q3', 'rejected'), 'OK:1', '[F5.1-a c6 M6] it is rejected');
select is(tests.fx_media_held(pg_temp.i('q3')::uuid), true, '[F5.1-a c6 M6] and held (kept 90 days)');
select is(tests.fx_media_held(pg_temp.i('q2')::uuid), false, '[F5.1-a c6] an ordinary rejection is not held');
select is(pg_temp.q('a', format('select row(kind, status, mime, width, height, byte_size, post_id, position)::text from %s', pg_temp.m('q3'))),
          pg_temp.q('a', format('select row(kind, status, mime, width, height, byte_size, post_id, position)::text from %s', pg_temp.m('q2'))),
  '[F5.1-a c6 C1] everything the uploader can read of a suspected image equals a rejected one');
select is(pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', pg_temp.i('q3')), false) || '/' ||
          pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', pg_temp.i('q2')), false), 'OK:0/OK:0',
  '[F5.1-a c6 C1 M6] the uploader deletes neither: the attempt reads the same, and the held image stays');
select is(pg_temp.dml('a', format('select is_held from %s', pg_temp.m('q3'))), 'ERR:42501', '[F5.1-a c6 C1] nor can they ask whether it is held');
select is(pg_temp.dml('m3', format('update nestly.media_reviews set is_suspected = false where media_id = %L', pg_temp.i('q3'))) || '/' || tests.media_as(format('select is_suspected::text from nestly.media_reviews where media_id = %L', pg_temp.i('q3'))), 'OK:0/true',
  '[F5.1-a c6 M6] a suspicion is never withdrawn');
select is(tests.fx_sf_audit('media_suspected'), 1::bigint, '[F5.1-a c6 M6 BR-026] the suspicion is in the Audit Log');
select is((select after_state->>'heldAsSuspected' from tests.fx_audit_rows() where action = 'media_rejected' and target_id = pg_temp.i('q3')::uuid), 'true',
  '[F5.1-a c6 M6] and the rejection is recorded as held');
select is(pg_temp.q('m3', format('select (purge_after - suspected_at)::text from nestly.media_reviews where media_id = %L', pg_temp.i('q3'))), '90 days',
  '[F5.1-a c6 M6] kept exactly 90 days from the suspicion');

-- ---- c7: rejecting or suspecting an image that had passed (REPORTS_VIEW, after a report) -------------------------------------------
insert into img values ('r1', pg_temp.up('a', 'post')), ('r2', pg_temp.up('a', 'post')), ('r3', pg_temp.up('a', 'post'));
select is(pg_temp.attach('a', 'r1', 'a_rej', 0) || pg_temp.attach('a', 'r2', 'a_rej', 1) || pg_temp.pass('r1') || pg_temp.pass('r2') || pg_temp.attach('a', 'r3', 'a_rej', 2) || pg_temp.pass('r3'),
  'OK:1OK:1OK:1OK:1OK:1OK:1', '[F5.1-a c7] control');
select is(pg_temp.decide('m2', 'r1', 'rejected'), 'ERR:42501', '[F5.1-a c7] a checked image is not rejected without a report or a suspicion');
select ok(tests.fx_rp_add(pg_temp.id('b'), 'post', (select v from po where k = 'a_rej')) is not null, '[F5.1-a c7] control: B reports the post');
select is(pg_temp.decide('m3', 'r1', 'rejected'), 'OK:0', '[F5.1-a c7 §3.2] without REPORTS_VIEW, staff cannot reject a checked image');
select is(pg_temp.decide('m2', 'r1', 'rejected'), 'OK:1', '[F5.1-a c7 C1] after a report, staff reject the image that had passed');
select is(pg_temp.n('a', pg_temp.m('r1') || ' and status = ''rejected'''), '1', '[F5.1-a c7 ERR-041] the uploader sees an ordinary rejection');
select is(pg_temp.n('b', pg_temp.m('r1')), '0', '[F5.1-a c7] and nobody else sees the image any more');
select is(pg_temp.dml('m3', format('insert into nestly.media_reviews (media_id, is_suspected) values (%L, true)', pg_temp.i('r3'))), 'ERR:42501',
  '[F5.1-a c7 C2] a suspicion on a checked image needs REPORTS_VIEW too');
select is(pg_temp.dml('m2', format('insert into nestly.media_reviews (media_id, is_suspected) values (%L, true)', pg_temp.i('r3'))), 'OK:1',
  '[F5.1-a c7 C2 M6] CONTENT_MODERATE with REPORTS_VIEW marks a suspicion on a checked image');
select is(pg_temp.decide('m2', 'r3', 'rejected'), 'OK:1', '[F5.1-a c7 C2 M6] and rejects it, held');
select is(tests.fx_media_held(pg_temp.i('r3')::uuid), true, '[F5.1-a c7 M6] held');
select is(pg_temp.q('a', format('select row(kind, status, mime, width, height, byte_size)::text from %s', pg_temp.m('r3'))),
          pg_temp.q('a', format('select row(kind, status, mime, width, height, byte_size)::text from %s', pg_temp.m('r1'))),
  '[F5.1-a c7 C1] a checked image turned suspected reads to the uploader as one rejected after a report');
select is(tests.fx_sf_audit('media_suspected'), 2::bigint, '[F5.1-a c7 M6] audited');

-- ---- c8: the training set, model branch (Afik 20.10.2026: blocked and unsure images, children included, with the decision) ---------
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('q2'))), 'OK:0',
  '[F5.1-a c8 Afik 20.10] a rejected blocked image keeps its file until its training copy exists');
select is(pg_temp.sample('q2', 'blocked', 'blocked'), 'OK:1', '[F5.1-a c8 Afik 20.10] the job adds a rejected blocked image to the training set');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('q2'))), 'OK:1',
  '[F5.1-a c8 Afik 20.10] then the rejected image''s file is removed at once');
select is(pg_temp.n('a', pg_temp.m('q2') || ' and status = ''rejected'''), '1', '[F5.1-a c8 ERR-041] the uploader still learns it was rejected (the row stays, without a file)');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = false where id = %L', pg_temp.i('q2'))), 'OK:0', '[F5.1-a c8] a removed file is never put back');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('a2'))), 'ERR:42501', '[F5.1-a c8] only a rejected image''s file is marked removed');
select is(pg_temp.sample('q1', 'allowed', 'blocked', false), 'ERR:42501', '[F5.1-a c8] the child mark is copied as it is (not dropped)');
select is(pg_temp.sample('q1', 'allowed', 'blocked', true), 'OK:1',
  '[F5.1-a c8 Afik 20.10] an approved image marked "a child is in the image" enters the training set too (the mark kept as metadata)');
select is(pg_temp.sample('q1', 'allowed', 'blocked', true), 'ERR:23505', '[F5.1-a c8] once per image');
select is(pg_temp.sample('q3', 'blocked', 'blocked'), 'ERR:42501', '[F5.1-a c8 M6] never a suspected image');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('q3'))), 'OK:0',
  '[F5.1-a c8 M6] and a held image''s file is not removed early');
select is(pg_temp.sample('a1', 'allowed', 'blocked'), 'ERR:42501', '[F5.1-a c8] never an image the model passed and no one removed');
select is(pg_temp.sample('q4', 'blocked', 'unsure'), 'ERR:42501', '[F5.1-a c8] never an image staff have not decided yet');
select is(pg_temp.decide('d', 'q5', 'rejected'), 'OK:1', '[F5.1-a c8] control: an image queued because the check failed, rejected');
select is(pg_temp.sample('q5', 'blocked', 'blocked'), 'ERR:42501', '[F5.1-a c8] is not a model sample (the model gave no verdict)');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('q5'))), 'OK:1', '[F5.1-a c8] its file goes at once');
select is(pg_temp.dml('d', 'select count(*) from nestly.media_training_samples'), 'ERR:42501', '[F5.1-a c8 Afik 20.10] no manual viewing: not even the Admin reads the training set');
select is(pg_temp.dml('m2', 'select count(*) from nestly.media_training_samples'), 'ERR:42501', '[F5.1-a c8 Afik 20.10] nor a Moderator');

-- ---- c9: the training set, reported branch (images removed after a handled report that is not a child-safety report) -------------
insert into img values ('rp1', pg_temp.up('a', 'post')), ('cs1', pg_temp.up('a', 'post'));
select is(pg_temp.attach('a', 'rp1', 'a_rep', 0) || pg_temp.pass('rp1') || pg_temp.attach('a', 'cs1', 'a_cs', 0) || pg_temp.pass('cs1'), 'OK:1OK:1OK:1OK:1', '[F5.1-a c9] control');
select is(pg_temp.sample('rp1', 'blocked', 'reported'), 'ERR:42501', '[F5.1-a c9 C2] a passed image is no sample before its post is removed after a report');
select is(pg_temp.dml('m2', format('insert into nestly.media_training_candidates (media_id) values (%L)', pg_temp.i('rp1'))), 'ERR:42501',
  '[F5.1-a c9 C2] nor can staff make it a candidate without a handled report');
select ok(tests.fx_rp_add(pg_temp.id('b'), 'post', (select v from po where k = 'a_rep'), 'sexual_violent_hateful') is not null, '[F5.1-a c9] control: B reports the post');
select ok(tests.fx_rp_add(pg_temp.id('b'), 'post', (select v from po where k = 'a_cs'), 'child_safety') is not null, '[F5.1-a c9] control: B reports another as child safety');
select is(pg_temp.remove_post('m2', (select v from po where k = 'a_rep')), 'OK:1/OK:1', '[F5.1-a c9] the moderator removes the post and closes the report');
select is(pg_temp.remove_post('m2', (select v from po where k = 'a_cs')), 'OK:1/OK:1', '[F5.1-a c9] and the child-safety one');
select is(pg_temp.jobq(format('select count(*)::text from nestly.media_training_candidates where media_id = %L', pg_temp.i('rp1'))), '1',
  '[F5.1-a c9 Afik 20.10] the passed image of a post removed after a report is a training candidate (a model miss)');
select is(pg_temp.jobq(format('select count(*)::text from nestly.media_training_candidates where media_id = %L', pg_temp.i('cs1'))), '0',
  '[F5.1-a c9 C2 Afik 20.10] never after a child-safety report');
select is(pg_temp.dml('m2', format('insert into nestly.media_training_candidates (media_id) values (%L)', pg_temp.i('cs1'))), 'ERR:42501',
  '[F5.1-a c9 C2] nor by hand');
select is(pg_temp.sample('rp1', 'blocked', 'reported'), 'OK:1', '[F5.1-a c9 Afik 20.10] the job adds the candidate to the training set (label blocked)');
select is(pg_temp.sample('cs1', 'blocked', 'reported'), 'ERR:42501', '[F5.1-a c9 C2] not the child-safety one');
select is(pg_temp.sample('a3', 'blocked', 'reported'), 'ERR:42501', '[F5.1-a c9] not the image of a post that was not removed');
select is(pg_temp.dml('m2', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where post_id = %L and status = 'open' $q$, (select v from po where k = 'a_rej'))),
  'OK:1', '[F5.1-a c9] the report on the post whose image was rejected is closed with action taken');
select is(pg_temp.jobq(format('select string_agg(media_id::text, '','') from nestly.media_training_candidates where media_id in (%L, %L, %L)', pg_temp.i('r1'), pg_temp.i('r2'), pg_temp.i('r3'))),
  pg_temp.i('r1'), '[F5.1-a c9 Afik 20.10] the image rejected after the report is a candidate; the post''s still visible image and the suspected one are not');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('r1'))), 'OK:0',
  '[F5.1-a c9] a candidate''s file stays until its training copy exists');
select is(pg_temp.sample('r1', 'blocked', 'reported'), 'OK:1', '[F5.1-a c9] the job copies it');
select is(pg_temp.job(format('update nestly.media_assets set is_file_removed = true where id = %L', pg_temp.i('r1'))), 'OK:1', '[F5.1-a c9] then removes the file');

-- a sample whose image becomes suspected leaves the training set (C2, Afik 20.10: removed if already there)
select is(pg_temp.job(format('delete from nestly.media_training_samples where source_media_id = %L', pg_temp.i('q1'))), 'OK:0', '[F5.1-a c9] control: a live sample stays');
select is(pg_temp.dml('m2', format('update nestly.media_reviews set is_suspected = true where media_id = %L', pg_temp.i('q1'))), 'OK:1',
  '[F5.1-a c9 C2 M6] staff mark a suspicion on an approved image already in the training set');
select is(pg_temp.sample('q1', 'allowed', 'blocked', true), 'ERR:42501', '[F5.1-a c9 C2] a suspected image is never copied again');
create temp table smp (k text primary key, v uuid);
grant all on smp to public;
insert into smp values ('q1', pg_temp.sample_id('q1'));
select is(pg_temp.job(format('delete from nestly.media_training_samples where source_media_id = %L', pg_temp.i('q1'))), 'OK:1',
  '[F5.1-a c9 C2 M6] the job deletes the sample of an image that became suspected');
select is(pg_temp.n('d', format('nestly.media_training_events where sample_id = %L and action = ''removed''', (select v from smp where k = 'q1'))), '1',
  '[F5.1-a c9 Afik 20.10] recorded as removed in the access record');

-- ---- c10: retention (exactly 6 months) and the access record ----------------------------------------------------------------------
select is(pg_temp.jobq('select count(*)::text from nestly.media_training_samples where expires_at <> created_at + interval ''6 months'''), '0',
  '[F5.1-a c10 Afik 20.10] every sample expires exactly 6 months after it was copied');
select is(pg_temp.job(format($q$ insert into nestly.media_training_samples (source_media_id, label, source, is_child, mime, decided_at, expires_at)
  select id, 'blocked', 'blocked', false, mime, decided_at, now() + interval '2 years' from nestly.media_assets where id = %L $q$, pg_temp.i('q2'))), 'ERR:42501',
  '[F5.1-a c10 H2] the job cannot keep one longer');
select is(pg_temp.job('delete from nestly.media_training_samples'), 'OK:0', '[F5.1-a c10] the job deletes no sample before its 6 months');
insert into smp values ('q2', pg_temp.sample_id('q2'));
select tests.fx_sample_age((select v from smp where k = 'q2'), interval '6 months 1 day');
select is(pg_temp.job('delete from nestly.media_training_samples'), 'OK:1', '[F5.1-a c10 Afik 20.10] after 6 months it is deleted');
select is(pg_temp.n('d', format('nestly.media_training_events where sample_id = %L and action = ''expired''', (select v from smp where k = 'q2'))), '1',
  '[F5.1-a c10 Afik 20.10] recorded as expired');
select is(pg_temp.n('d', 'nestly.media_training_events where action = ''added'''), '4', '[F5.1-a c10 Afik 20.10] every addition is in the access record, which the Admin reads');
select is(pg_temp.n('m2', 'nestly.media_training_events'), '0', '[F5.1-a c10 §3.2] a Moderator without AUDIT_LOG_VIEW reads no access record');
insert into smp values ('rp1', pg_temp.sample_id('rp1'));
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, purpose, source, label) values (%L, 'accessed', 'training', 'reported', 'blocked') $q$,
  (select v from smp where k = 'rp1'))), 'OK:1', '[F5.1-a c10 H3] the job records each read of a sample, with its purpose');
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, source, label) values (%L, 'accessed', 'reported', 'blocked') $q$,
  (select v from smp where k = 'rp1'))), 'ERR:23514', '[F5.1-a c10 H3] a read always states its purpose');
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, purpose, source, label) values (%L, 'accessed', 'review', 'reported', 'blocked') $q$,
  (select v from smp where k = 'rp1'))), 'ERR:23514', '[F5.1-a c10 H3 Afik 20.10] and the only purpose is training');
select is(pg_temp.job($q$ insert into nestly.media_training_events (sample_id, action, purpose, source, label) values (gen_random_uuid(), 'accessed', 'training', 'reported', 'blocked') $q$),
  'ERR:42501', '[F5.1-a c10 H3] an event names a real sample');
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, purpose, source, label) values (%L, 'accessed', 'training', 'blocked', 'allowed') $q$,
  (select v from smp where k = 'rp1'))), 'ERR:42501', '[F5.1-a c10 H3] with its real source and label');
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, source, label) values (%L, 'removed', 'reported', 'blocked') $q$,
  (select v from smp where k = 'rp1'))), 'ERR:42501', '[F5.1-a c10 H3] the job cannot record a live sample as removed');
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, source, label) values (%L, 'added', 'reported', 'blocked') $q$,
  (select v from smp where k = 'rp1'))), 'ERR:23505', '[F5.1-a c10 H3] nor add a second "added"');
select is(pg_temp.job(format($q$ insert into nestly.media_training_events (sample_id, action, source, label) values (%L, 'removed', 'blocked', 'blocked') $q$,
  (select v from smp where k = 'q2'))), 'ERR:23505', '[F5.1-a c10 H3] nor end a sample twice');
select is(pg_temp.dml('d', 'delete from nestly.media_training_events'), 'ERR:42501', '[F5.1-a c10 Afik 20.10] nobody deletes the access record');
select is(pg_temp.job('update nestly.media_training_events set purpose = null'), 'ERR:42501', '[F5.1-a c10] nor changes it');

-- ---- c11: profile photos (FR-PROFILE-001, BR-077) -------------------------------------------------------------------------------
insert into img values ('pa1', pg_temp.up('a', 'profile')), ('pa2', pg_temp.up('a', 'profile')), ('pa3', pg_temp.up('a', 'profile')), ('pb1', pg_temp.up('b', 'profile')),
  ('pp1', pg_temp.up('p', 'profile'));
select is(pg_temp.dml('a', format('insert into nestly.profile_photos (media_id) values (%L)', pg_temp.i('pb1'))), 'ERR:42501', '[F5.1-a c11 FR-PROFILE-001] never with someone else''s image');
select is(pg_temp.dml('a', format('insert into nestly.profile_photos (media_id) values (%L)', pg_temp.i('a2'))), 'ERR:42501', '[F5.1-a c11 VAL-041] only a profile image');
select is(pg_temp.dml('a', format('insert into nestly.profile_photos (media_id) values (%L)', pg_temp.i('pa1'))), 'OK:1', '[F5.1-a c11 FR-PROFILE-001] a Regular sets a profile photo');
select is(pg_temp.dml('p', format('insert into nestly.profile_photos (media_id) values (%L)', pg_temp.i('pp1'))), 'OK:1', '[F5.1-a c11 FR-PROFILE-001] so does a Professional');
select is(pg_temp.n('a', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '1', '[F5.1-a c11 AC-105] the owner sees their photo at once');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '0', '[F5.1-a c11 AC-105] others only after the check');
select is(pg_temp.pass('pa1'), 'OK:1', '[F5.1-a c11] control');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L and media_status = ''passed''', pg_temp.id('a'))), '1', '[F5.1-a c11 FR-PROFILE-001] after the check everyone active sees it');
select is(pg_temp.n('b', pg_temp.m('pa1')), '1', '[F5.1-a c11 FR-PROFILE-001] and its image');
select is(pg_temp.dml('a', format('update nestly.profile_photos set media_id = %L', pg_temp.i('pa2'))), 'OK:1', '[F5.1-a c11 FR-PROFILE-001] the owner replaces it');
select is(tests.fx_media_rows(pg_temp.i('pa1')::uuid), 0::bigint, '[F5.1-a c11 BR-077] the replaced image is deleted at once');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '0', '[F5.1-a c11 AC-105] the new photo waits for its own check');
select is(pg_temp.queue('pa2', 'unsure'), 'OK:1/OK:1', '[F5.1-a c11] control: the new photo is queued');
select is(pg_temp.dml('a', format('update nestly.profile_photos set media_id = %L', pg_temp.i('pa3'))), 'OK:1', '[F5.1-a c11] the owner replaces a queued photo');
select is(tests.fx_media_rows(pg_temp.i('pa2')::uuid), 1::bigint, '[F5.1-a c11 C3] a queued image is not deleted by the replacement: staff still decide it');
select is(pg_temp.dml('b', format('update nestly.profile_photos set media_id = %L where user_id = %L', pg_temp.i('pb1'), pg_temp.id('a'))), 'OK:0', '[F5.1-a c11 FR-PROFILE-001] nobody changes another''s photo');
select is(pg_temp.dml('d', format('insert into nestly.profile_photos (media_id) values (%L)', pg_temp.i('pb1'))), 'ERR:42501', '[F5.1-a c11 BR-016] a staff account has no profile photo');

-- ---- c12: Stories (FR-FEED-008, VAL-042, AC-102, AC-103) -----------------------------------------------------------------------
insert into img values ('s1', pg_temp.up('a', 'story')), ('s2', pg_temp.up('a', 'story')), ('sp', pg_temp.up('p', 'story')), ('sb', pg_temp.up('b', 'story'));
create temp table st (k text primary key, v text);
grant all on st to public;
insert into st values ('s1', pg_temp.q('a', format($q$ insert into nestly.stories (media_id, caption, audience) values (%L, 'בוקר טוב', 'everyone') returning id::text $q$, pg_temp.i('s1'))));
select ok((select v from st where k = 's1') ~ '^[0-9a-f-]{36}$', '[F5.1-a c12 FR-FEED-008] a Regular publishes a Story');
select is(pg_temp.n('a', format('nestly.stories where id = %L and expires_at = created_at + interval ''24 hours''', (select v from st where k = 's1'))), '1',
  '[F5.1-a c12 AC-102] it expires 24 hours after it is published');
select is(pg_temp.n('b', format('nestly.stories where id = %L', (select v from st where k = 's1'))), '0', '[F5.1-a c12 AC-102] the audience only after the check');
select is(pg_temp.pass('s1'), 'OK:1', '[F5.1-a c12] control');
select is(pg_temp.n('b', format('nestly.stories where id = %L', (select v from st where k = 's1'))), '1', '[F5.1-a c12 AC-102 OP-033] then everyone, for audience "everyone"');
select is(pg_temp.n('b', pg_temp.m('s1')), '1', '[F5.1-a c12 AC-102] and its image');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, caption, audience) values (%L, %L, 'everyone') $q$, pg_temp.i('s2'), repeat('א', 201))), 'ERR:23514',
  '[F5.1-a c12 VAL-042 M6 Afik 20.10] Story text is at most 200 characters');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, caption, audience) values (%L, %L, 'everyone') $q$, pg_temp.i('s2'), repeat('א', 200)), false), 'OK:1',
  '[F5.1-a c12 VAL-042] 200 is accepted');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'friends') $q$, pg_temp.i('s1'))), 'ERR:23505', '[F5.1-a c12 VAL-041] one Story per image');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'friends') $q$, pg_temp.i('pa3'))), 'ERR:42501', '[F5.1-a c12 VAL-041] only a Story image');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'everyone') $q$, pg_temp.i('sb'))), 'ERR:42501', '[F5.1-a c12 FR-FEED-008] never someone else''s image');
select is(pg_temp.dml('a', $q$ insert into nestly.stories (audience) values ('everyone') $q$), 'ERR:42501', '[F5.1-a c12 FR-FEED-008] never without an image');
select is(pg_temp.dml('p', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'everyone') $q$, pg_temp.i('sp'))), 'ERR:42501', '[F5.1-a c12 FR-FEED-008] Stories are for Regular accounts');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'followers') $q$, pg_temp.i('s2'))), 'ERR:23514', '[F5.1-a c12 OP-033] audience everyone or friends');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'friends') $q$, pg_temp.i('s2'))), 'OK:1', '[F5.1-a c12 OP-033] a Friends-only Story');
select is(pg_temp.pass('s2'), 'OK:1', '[F5.1-a c12] control');
select is(pg_temp.n('b', 'nestly.stories where audience = ''friends'''), '0', '[F5.1-a c12 OP-033] a non-Friend does not see a Friends-only Story');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.n('b', 'nestly.stories where audience = ''friends'''), '1', '[F5.1-a c12 OP-033] a Friend does');
select is(pg_temp.dml('a', 'update nestly.stories set audience = ''everyone'''), 'ERR:42501', '[F5.1-a c12 FR-FEED-008] a Story is not edited');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('s1'))), 'OK:0', '[F5.1-a c12 AC-102] the job does not delete a live Story''s image');

-- AC-103: the eleventh Story in 24 hours is refused by the database, whatever sent it; deleting an image does not free a place
create function pg_temp.story_n(p_count int) returns text language plpgsql as $f$
declare
  v text := 'OK';
  m text;
begin
  for i in 1..p_count loop
    m := pg_temp.up('a', 'story');
    insert into img values ('sn:' || m, m);
    v := pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'everyone') $q$, m));
    exit when v <> 'OK:1';
  end loop;
  return v;
end
$f$;
select is(pg_temp.story_n(8), 'OK:1', '[F5.1-a c12 VAL-042] the third to the tenth Story are accepted');
select is(pg_temp.story_n(1), 'ERR:NS021', '[F5.1-a c12 AC-103 ERR-040] the eleventh Story in 24 hours is refused');
select is(pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', (select min(v) from img where k like 'sn:%'))), 'OK:1', '[F5.1-a c12] the author deletes a Story''s image');
select is(pg_temp.n('a', format('nestly.stories where author_id = %L and media_id is null', pg_temp.id('a'))), '1', '[F5.1-a c12] the Story stays, without an image, until it expires');
select is(pg_temp.story_n(1), 'ERR:NS021', '[F5.1-a c12 AC-103] so it still counts: still no eleventh Story');

-- ---- c13: the purge (BR-077, M6, rule 6), with moved clocks -----------------------------------------------------------------------
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('a2'))), 'OK:0', '[F5.1-a c13 BR-077] an unattached post image younger than a day stays');
select tests.fx_media_age(pg_temp.i('a2')::uuid, interval '25 hours');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('a2'))), 'OK:1', '[F5.1-a c13 BR-077] after a day it is deleted');
insert into img values ('uq', pg_temp.up('a', 'post')), ('sq', pg_temp.up('a', 'story'));
select is(pg_temp.queue('uq', 'blocked') || ',' || pg_temp.queue('sq', 'unsure'), 'OK:1/OK:1,OK:1/OK:1', '[F5.1-a c13] control: an unattached and a Story image, queued');
select tests.fx_media_age(pg_temp.i('uq')::uuid, interval '3 days');
select tests.fx_media_age(pg_temp.i('sq')::uuid, interval '3 days');
select tests.fx_media_age(pg_temp.i('pa2')::uuid, interval '3 days');
select is(pg_temp.job(format('delete from nestly.media_assets where id in (%L, %L, %L)', pg_temp.i('uq'), pg_temp.i('sq'), pg_temp.i('pa2'))), 'OK:0',
  '[F5.1-a c13 C3] a queued image is never purged early: not unattached, not a Story''s, not a replaced profile photo''s');
select is(pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', pg_temp.i('uq'))), 'OK:0', '[F5.1-a c13 C3] nor deleted by the uploader while queued');
select tests.fx_media_age(pg_temp.i('q3')::uuid, interval '60 days');
select is(pg_temp.job(format('delete from nestly.media_assets where id in (%L, %L)', pg_temp.i('q3'), pg_temp.i('r3'))), 'OK:0',
  '[F5.1-a c13 C3 M6] a held image is kept its 90 days, however old the upload');
select tests.fx_media_suspicion_age(pg_temp.i('q3')::uuid, interval '91 days');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('q3'))), 'OK:1', '[F5.1-a c13 M6] after 90 days it is deleted');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('q2'))), 'OK:0', '[F5.1-a c13 BR-077] a rejected image''s row stays 30 days (the uploader sees why)');
select tests.fx_media_age(pg_temp.i('q2')::uuid, interval '31 days');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('q2'))), 'OK:1', '[F5.1-a c13 BR-077] then it goes');
select is(pg_temp.decide('d', 'q4', 'rejected'), 'OK:1', '[F5.1-a c13] control: an unsure image rejected, not yet copied');
select tests.fx_media_age(pg_temp.i('q4')::uuid, interval '31 days');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('q4'))), 'OK:0', '[F5.1-a c13] a rejected image whose training copy is still due is not purged');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('pa3'))), 'OK:0', '[F5.1-a c13 BR-077] a current profile photo stays');
select is(pg_temp.jobq(format('select count(*)::text from nestly.media_assets where id = %L', pg_temp.i('r3'))), '1', '[F5.1-a c13 rule 6] the job reads every image row');
select is(pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', pg_temp.i('a3'))), 'OK:1', '[F5.1-a c13 FR-FEED-002] the uploader removes their own image');
select is(pg_temp.dml('b', format('delete from nestly.media_assets where id = %L', pg_temp.i('a4'))), 'OK:0', '[F5.1-a c13 FR-FEED-002] nobody removes another''s');
select tests.fx_story_age((select v from st where k = 's1')::uuid, interval '25 hours');
select tests.fx_media_age(pg_temp.i('s1')::uuid, interval '26 hours');
select is(pg_temp.n('b', format('nestly.stories where id = %L', (select v from st where k = 's1'))), '0', '[F5.1-a c13 AC-102] an expired Story is hidden');
select is(pg_temp.job('delete from nestly.stories where expires_at <= now()'), 'OK:1', '[F5.1-a c13 AC-102] the job deletes it');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', pg_temp.i('s1'))), 'OK:1', '[F5.1-a c13 BR-077] and then its image');

-- ---- c14: blocking hides Stories and the profile photo (FR-REL-002) ----------------------------------------------------------------
select is(pg_temp.pass('pa3') || pg_temp.pass('pb1') || pg_temp.dml('b', format('insert into nestly.profile_photos (media_id) values (%L)', pg_temp.i('pb1'))), 'OK:1OK:1OK:1', '[F5.1-a c14] control');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))) || '/' || pg_temp.n('b', format('nestly.stories where author_id = %L', pg_temp.id('a'))),
  '1/1', '[F5.1-a c14] control: B sees A''s photo and Friends-only Story');
select is(pg_temp.dml('b', format('insert into nestly.user_blocks (blocked_id) values (%L)', pg_temp.id('a'))), 'OK:1', '[F5.1-a c14 FR-REL-002] B blocks A');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '0', '[F5.1-a c14 FR-REL-002 H4] B no longer sees A''s profile photo');
select is(pg_temp.n('b', format('nestly.stories where author_id = %L', pg_temp.id('a'))), '0', '[F5.1-a c14 FR-REL-002 H4] nor A''s Stories');
select is(pg_temp.n('b', pg_temp.m('pa3')), '0', '[F5.1-a c14 FR-REL-002] nor the image through them');
select is(pg_temp.n('a', format('nestly.profile_photos where user_id = %L', pg_temp.id('b'))), '0', '[F5.1-a c14 FR-REL-002] in both directions');
select is(pg_temp.n('d', format('nestly.profile_photos where user_id = %L', pg_temp.id('b'))), '1', '[F5.1-a c14] others still see it');
select is(pg_temp.n('a', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '1', '[F5.1-a c14] the owner still sees their own');

select * from finish();
rollback;
