-- pgTAP, run by pg_prove as app_server (CI `db` job, I5: images, profile photos, Stories, the approval queue and the training set).
-- Expected values come from the SRS (FR-FEED-002, FR-FEED-008, FR-PROFILE-001, NFR-MEDIA-001, BR-077, VAL-041, VAL-042, ERR-040, AC-021,
-- AC-102..105) and Afik's image policy of 20.10.2026 (decisions-in-force.md §2, §7), not from the migration text.
-- People: A, B = Regulars (10_), P = a Professional, S = suspended; D = 60_'s fr_d (Admin); M1 = 90_'s sf_m1 (Moderator, no key);
-- M3 = sf_m3 (Moderator with CONTENT_MODERATE). The job role is reached through tests.jobs_dml / jobs_as (71_). Everything rolls back.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[I5 fixture] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p') when 's' then tests.fx_id('s')
    when 'd' then tests.fx_fr_id('fr_d') when 'm1' then tests.fx_sf_id('sf_m1') when 'm3' then tests.fx_sf_id('sf_m3')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
-- one upload as `who`: returns the new image id (or 'ERR:...')
create function pg_temp.up(p_who text, p_kind text, p_w int default 800) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values (%L, 'image/webp', %s, 600, 120000) returning id::text $q$, p_kind, p_w))
$f$;
create function pg_temp.m(p_id text) returns text language sql as $f$ select format('nestly.media_assets where id = %L', p_id) $f$;
create function pg_temp.job(p_sql text) returns text language sql as $f$ select tests.jobs_dml(p_sql) $f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['CONTENT_MODERATE']);

-- ---- grants: what a client can never read or write ---------------------------------------------------------------------------
select is(has_column_privilege('authenticated', 'nestly.media_assets', 'owner_id', 'SELECT'), false,
  '[I5 AC-075] owner_id is not readable by a client: an anonymous post''s image names no one');
select is(has_column_privilege('authenticated', 'nestly.media_assets', 'status', 'INSERT'), false, '[AC-105] an upload cannot choose its status');
select is(has_column_privilege('authenticated', 'nestly.media_assets', 'check_attempts', 'SELECT'), false, '[I5] the check counters are not readable');
select is(has_table_privilege('authenticated', 'nestly.media_training_samples', 'INSERT'), false, '[Afik 20.10] no client adds a training sample');
select is(has_table_privilege('authenticated', 'nestly.media_training_samples', 'DELETE'), false, '[Afik 20.10] no client deletes one');
select is(has_table_privilege('anon', 'nestly.media_assets', 'SELECT'), false, '[rule 7] anon reaches no image row');

-- ---- uploads (FR-FEED-002, VAL-041, AC-105) --------------------------------------------------------------------------------
create temp table img (k text primary key, v text);
grant all on img to public;
insert into img values ('a1', pg_temp.up('a', 'post'));
select ok((select v from img where k = 'a1') ~ '^[0-9a-f-]{36}$', '[FR-FEED-002] a Regular uploads a post image');
select is(pg_temp.n('a', pg_temp.m((select v from img where k = 'a1')) || ' and status = ''pending'''), '1', '[AC-105] it starts pending, and the uploader reads it');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'a1'))), '0', '[AC-105] no one else reads a pending image');
select is(pg_temp.n('d', pg_temp.m((select v from img where k = 'a1'))), '0', '[AC-105] not even the Admin, before the check');
select is(pg_temp.dml('a', format('select owner_id from %s', pg_temp.m((select v from img where k = 'a1')))), 'ERR:42501', '[I5] the uploader too cannot select owner_id');
select ok(pg_temp.up('p', 'post') ~ '^[0-9a-f-]{36}$', '[FR-PROFILE-001 AC-130] a Professional uploads too');
select is(pg_temp.up('d', 'post'), 'ERR:42501', '[BR-016] an Admin account uploads nothing');
select is(pg_temp.up('m3', 'post'), 'ERR:42501', '[BR-016] nor a Moderator');
select is(pg_temp.up('s', 'post'), 'ERR:42501', '[rule 15] nor a suspended account');
select is(pg_temp.up('a', 'post', 2049), 'ERR:23514', '[VAL-041 AC-104] wider than 2,048 pixels is refused');
select is(pg_temp.dml('a', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/gif', 10, 10, 10) $$), 'ERR:23514',
  '[VAL-041] a format other than JPEG, PNG or WebP is refused');
select is(pg_temp.dml('a', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('video', 'image/webp', 10, 10, 10) $$), 'ERR:23514',
  '[NFR-MEDIA-001] images only in the MVP');

-- ---- attaching to a post (FR-FEED-002, VAL-041) --------------------------------------------------------------------------------
create temp table po (k text primary key, v uuid);
grant all on po to public;
insert into po values ('a_ev', tests.fx_po_add(pg_temp.id('a'))), ('a_fr', tests.fx_po_add(pg_temp.id('a'), 'friends')),
  ('a_anon', tests.fx_po_add(pg_temp.id('a'), 'everyone', true)), ('b_ev', tests.fx_po_add(pg_temp.id('b')));
select is(pg_temp.dml('a', format('update nestly.media_assets set post_id = %L, position = 0 where id = %L', (select v from po where k = 'a_ev'), (select v from img where k = 'a1'))),
  'OK:1', '[FR-FEED-002 AC-021] the uploader attaches the image to their post');
insert into img values ('a2', pg_temp.up('a', 'post'));
select is(pg_temp.dml('a', format('update nestly.media_assets set post_id = %L, position = 1 where id = %L', (select v from po where k = 'b_ev'), (select v from img where k = 'a2'))),
  'ERR:42501', '[FR-FEED-002] never to someone else''s post');
select is(pg_temp.dml('a', format('update nestly.media_assets set post_id = %L, position = 0 where id = %L', (select v from po where k = 'a_ev'), (select v from img where k = 'a2'))),
  'ERR:23505', '[VAL-041] one image per position');
select is(pg_temp.dml('a', format('update nestly.media_assets set post_id = %L, position = 4 where id = %L', (select v from po where k = 'a_ev'), (select v from img where k = 'a2'))),
  'ERR:23514', '[VAL-041] positions 0 to 3: at most 4 images in a post');
select is(pg_temp.dml('b', format('update nestly.media_assets set post_id = %L, position = 1 where id = %L', (select v from po where k = 'b_ev'), (select v from img where k = 'a2'))),
  'OK:0', '[FR-FEED-002] another user cannot take my image');
select is(pg_temp.dml('a', format('update nestly.media_assets set status = ''passed'' where id = %L', (select v from img where k = 'a1'))), 'ERR:42501',
  '[AC-105] the uploader cannot mark their image as checked');

-- ---- the background check (app_jobs, rule 6) ----------------------------------------------------------------------------------
select is(pg_temp.job(format('update nestly.media_assets set status = ''passed'', scores = ''{"FEMALE_BREAST_EXPOSED":0.01}'' where id = %L', (select v from img where k = 'a1'))),
  'OK:1', '[AC-105] the job records a passed check');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'a1'))), '1', '[AC-105 FR-FEED-002] after the check, a reader of the post reads its image');
select is(pg_temp.job(format('update nestly.media_assets set status = ''queued'', queue_reason = ''blocked'' where id = %L', (select v from img where k = 'a1'))),
  'OK:0', '[AC-105] the job moves only a pending image');
select is(pg_temp.job(format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'a2'))),
  'ERR:42501', '[Afik 20.10] the job never decides as staff do');
select is(pg_temp.job(format('update nestly.media_assets set is_child = true where id = %L', (select v from img where k = 'a2'))),
  'ERR:42501', '[Afik 20.10] nor marks a child');
select is(pg_temp.job(format('update nestly.media_assets set check_attempts = check_attempts + 1 where id = %L', (select v from img where k = 'a2'))),
  'OK:1', '[AC-105] a failed check is counted and the image stays pending');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'a2'))), '0', '[AC-105] while the check fails, the image stays hidden');

-- friends-only and anonymous posts
insert into img values ('a3', pg_temp.up('a', 'post')), ('a4', pg_temp.up('a', 'post'));
select is(pg_temp.dml('a', format('update nestly.media_assets set post_id = %L, position = 0 where id = %L', (select v from po where k = 'a_fr'), (select v from img where k = 'a3'))), 'OK:1', '[I5] control');
select is(pg_temp.dml('a', format('update nestly.media_assets set post_id = %L, position = 0 where id = %L', (select v from po where k = 'a_anon'), (select v from img where k = 'a4'))), 'OK:1',
  '[FR-FEED-005] the real author attaches an image to their anonymous post');
select is(pg_temp.job(format('update nestly.media_assets set status = ''passed'' where id in (%L, %L)', (select v from img where k = 'a3'), (select v from img where k = 'a4'))), 'OK:2', '[I5] control');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'a3'))), '0', '[OP-033] the image of a Friends-only post is not readable by a non-Friend');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'a4'))), '1', '[FR-FEED-005] the image of an anonymous post is readable ...');
select is(pg_temp.dml('b', format('select owner_id from %s', pg_temp.m((select v from img where k = 'a4')))), 'ERR:42501', '[AC-075] ... and names no author');

-- ---- the approval queue (Afik 20.10, CONTENT_MODERATE) --------------------------------------------------------------------
insert into img values ('q1', pg_temp.up('a', 'post')), ('q2', pg_temp.up('a', 'post')), ('q3', pg_temp.up('a', 'post')), ('q4', pg_temp.up('b', 'post'));
select is(pg_temp.job(format('update nestly.media_assets set status = ''queued'', queue_reason = ''blocked'' where id in (%L, %L, %L)',
  (select v from img where k = 'q1'), (select v from img where k = 'q2'), (select v from img where k = 'q3'))), 'OK:3', '[Afik 20.10] a blocked image goes to the queue, not deleted');
select is(pg_temp.job(format('update nestly.media_assets set status = ''queued'', queue_reason = ''unsure'' where id = %L', (select v from img where k = 'q4'))), 'OK:1',
  '[Afik 20.10] so does an image the model is unsure about');
select is(pg_temp.n('a', pg_temp.m((select v from img where k = 'q1'))), '1', '[Afik 20.10] the uploader still sees it ("ממתין לבדיקה")');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'q1'))), '0', '[Afik 20.10] nobody else does');
select is(pg_temp.n('m1', 'nestly.media_assets where status = ''queued'''), '0', '[§3.2] a Moderator without CONTENT_MODERATE sees no queue');
select is(pg_temp.n('m3', 'nestly.media_assets where status = ''queued'''), '4', '[§3.2] a Moderator with CONTENT_MODERATE sees the queue');
select is(pg_temp.n('d', 'nestly.media_assets where status = ''queued'''), '4', '[§3.1] the Admin sees the queue');
select is(pg_temp.n('m3', 'nestly.media_assets where status = ''passed'''), '0', '[I5] the queue is not a window onto every image');
select is(pg_temp.dml('m1', format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'q1'))), 'OK:0', '[§3.2] a Moderator without the key decides nothing');
select is(pg_temp.dml('b', format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'q1'))), 'OK:0', '[§3.2] nor a user');
select is(pg_temp.dml('m3', format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'a1'))), 'OK:0', '[I5] only a queued image is decided');
select is(pg_temp.dml('m3', format('update nestly.media_assets set status = ''approved'', is_child = true where id = %L', (select v from img where k = 'q1'))), 'OK:1',
  '[Afik 20.10] staff approve, marking "a child is in the image"');
select is(pg_temp.n('m3', pg_temp.m((select v from img where k = 'q1')) || ' and decided_at is not null and is_child'), '1', '[Afik 20.10] the decision and the mark are kept');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'q1'))), '0', '[Afik 20.10] approved but not attached to a post: still nobody else');
select is(tests.fx_sf_audit('media_approved'), 1::bigint, '[BR-026] the decision is in the Audit Log');
select is((select (after_state->>'trainingSet') || ':' || (after_state->>'isChild') from tests.fx_audit_rows() where action = 'media_approved'), 'false:true',
  '[Afik 20.10] an image marked with a child is recorded as never entering the training set');
select is(pg_temp.dml('d', format('update nestly.media_assets set status = ''rejected'' where id = %L', (select v from img where k = 'q2'))), 'OK:1', '[Afik 20.10] the Admin rejects');
select is(pg_temp.n('a', pg_temp.m((select v from img where k = 'q2')) || ' and status = ''rejected'''), '1', '[ERR-041] the uploader learns it was rejected');
select is((select after_state->>'trainingSet' from tests.fx_audit_rows() where action = 'media_rejected'), 'true', '[Afik 20.10] a rejected blocked image may enter the training set');
select is(pg_temp.dml('d', format('update nestly.media_assets set status = ''suspected'' where id = %L', (select v from img where k = 'q3'))), 'OK:1', '[M6] the Admin marks suspected abuse');
select is(pg_temp.n('d', pg_temp.m((select v from img where k = 'q3')) || ' and is_child and decided_at is not null'), '1', '[M6] a suspected image is always marked with a child');
select is(pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', (select v from img where k = 'q3'))), 'OK:0', '[M6] the uploader cannot delete a suspected image');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', (select v from img where k = 'q3'))), 'OK:0', '[M6] the job keeps it for 90 days');
select is(pg_temp.dml('m3', format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'q2'))), 'OK:0', '[I5] a decision is final here');

-- a stale or suspended staff session decides nothing (rule 15, BR-026)
select tests.fx_link_put(pg_temp.id('d'), 'affected', '22222222-2222-4222-8222-222222222222'::uuid, timestamptz '2026-10-16 10:00:00+00', '22222222-2222-4222-8222-222222222222'::uuid);
select is(pg_temp.dml('d', format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'q4')), false), 'OK:0', '[BR-026] an Admin whose session is stale decides nothing');
select is(pg_temp.n('d', 'nestly.media_assets where status = ''queued'''), '0', '[BR-026] nor sees the queue');
select tests.fx_link_put(pg_temp.id('d'), 'unaffected', '22222222-2222-4222-8222-222222222222'::uuid);
select tests.set_status(pg_temp.id('m3'), 'suspended');
select is(pg_temp.dml('m3', format('update nestly.media_assets set status = ''approved'' where id = %L', (select v from img where k = 'q4'))), 'OK:0', '[rule 15] a suspended Moderator decides nothing');
select tests.set_status(pg_temp.id('m3'), 'active');

-- ---- the training set (Afik 20.10: blocked images + the decision; never a child, never suspected) ----------------------------
select is(pg_temp.job(format($q$ insert into nestly.media_training_samples (source_media_id, label, queue_reason, mime, decided_at)
  select id, 'blocked', 'blocked', mime, decided_at from nestly.media_assets where id = %L $q$, (select v from img where k = 'q2'))), 'OK:1',
  '[Afik 20.10] the job adds a rejected blocked image to the training set');
select is(pg_temp.job(format($q$ insert into nestly.media_training_samples (source_media_id, label, queue_reason, mime, decided_at)
  select id, 'allowed', 'blocked', mime, decided_at from nestly.media_assets where id = %L $q$, (select v from img where k = 'q1'))), 'ERR:42501',
  '[Afik 20.10] never an image marked "a child is in the image", even approved');
select is(pg_temp.job(format($q$ insert into nestly.media_training_samples (source_media_id, label, queue_reason, mime, decided_at)
  select id, 'blocked', 'blocked', mime, decided_at from nestly.media_assets where id = %L $q$, (select v from img where k = 'q3'))), 'ERR:42501',
  '[Afik 20.10 M6] never a suspected image');
select is(pg_temp.job(format($q$ insert into nestly.media_training_samples (source_media_id, label, queue_reason, mime, decided_at)
  select id, 'allowed', 'blocked', mime, decided_at from nestly.media_assets where id = %L $q$, (select v from img where k = 'a1'))), 'ERR:42501',
  '[Afik 20.10] never an image the model passed (no decision)');
select is(pg_temp.job('delete from nestly.media_training_samples'), 'OK:0', '[Afik 20.10] the job deletes only expired samples');
select is(pg_temp.n('d', 'nestly.media_training_samples'), '1', '[Afik 20.10] the Admin reads the training set''s index');
select is(pg_temp.n('m3', 'nestly.media_training_samples'), '0', '[§3.2 ALGORITHM_AI_CONFIG] a Moderator with CONTENT_MODERATE does not');
select is(pg_temp.n('a', 'nestly.media_training_samples'), '0', '[Afik 20.10] nor any user');
select is(pg_temp.dml('d', $$ delete from nestly.media_training_samples $$), 'ERR:42501', '[Afik 20.10] the Admin deletes nothing by hand (expiry only)');

-- ---- profile photos (FR-PROFILE-001, BR-077) -----------------------------------------------------------------------------------
insert into img values ('pa1', pg_temp.up('a', 'profile')), ('pa2', pg_temp.up('a', 'profile')), ('pb1', pg_temp.up('b', 'profile')), ('pp1', pg_temp.up('p', 'profile'));
select is(pg_temp.dml('a', format('insert into nestly.profile_photos (media_id) values (%L)', (select v from img where k = 'pb1'))), 'ERR:42501', '[FR-PROFILE-001] never with someone else''s image');
select is(pg_temp.dml('a', format('insert into nestly.profile_photos (media_id) values (%L)', (select v from img where k = 'a2'))), 'ERR:42501', '[VAL-041] only a profile image');
select is(pg_temp.dml('a', format('insert into nestly.profile_photos (media_id) values (%L)', (select v from img where k = 'pa1'))), 'OK:1', '[FR-PROFILE-001] a Regular sets a profile photo');
select is(pg_temp.dml('p', format('insert into nestly.profile_photos (media_id) values (%L)', (select v from img where k = 'pp1'))), 'OK:1', '[FR-PROFILE-001] so does a Professional');
select is(pg_temp.n('a', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '1', '[AC-105] the owner sees their photo at once');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '0', '[AC-105] others only after the check');
select is(pg_temp.job(format('update nestly.media_assets set status = ''passed'' where id = %L', (select v from img where k = 'pa1'))), 'OK:1', '[I5] control');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L and media_status = ''passed''', pg_temp.id('a'))), '1', '[FR-PROFILE-001] after the check everyone active sees it');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 'pa1'))), '1', '[FR-PROFILE-001] and its image');
select is(pg_temp.dml('a', format('update nestly.profile_photos set media_id = %L', (select v from img where k = 'pa2'))), 'OK:1', '[FR-PROFILE-001] the owner replaces it');
select is(pg_temp.n('a', pg_temp.m((select v from img where k = 'pa1'))), '0', '[BR-077] the replaced image is deleted at once');
select is(pg_temp.n('b', format('nestly.profile_photos where user_id = %L', pg_temp.id('a'))), '0', '[AC-105] the new photo waits for its own check');
select is(pg_temp.dml('b', format('update nestly.profile_photos set media_id = %L where user_id = %L', (select v from img where k = 'pb1'), pg_temp.id('a'))), 'OK:0', '[FR-PROFILE-001] nobody changes another''s photo');
select is(pg_temp.dml('d', format('insert into nestly.profile_photos (media_id) values (%L)', (select v from img where k = 'pb1'))), 'ERR:42501', '[BR-016] a staff account has no profile photo');

-- ---- Stories (FR-FEED-008, VAL-042, AC-102, AC-103) -------------------------------------------------------------------------
insert into img values ('s1', pg_temp.up('a', 'story')), ('s2', pg_temp.up('a', 'story')), ('sp', pg_temp.up('p', 'story'));
create temp table st (k text primary key, v text);
grant all on st to public;
insert into st values ('s1', tests.as_role('authenticated', tests.claims(pg_temp.id('a')),
  format($q$ insert into nestly.stories (media_id, caption, audience) values (%L, 'בוקר טוב', 'everyone') returning id::text $q$, (select v from img where k = 's1'))));
select ok((select v from st where k = 's1') ~ '^[0-9a-f-]{36}$', '[FR-FEED-008] a Regular publishes a Story');
select is(pg_temp.n('a', format('nestly.stories where id = %L and expires_at = created_at + interval ''24 hours''', (select v from st where k = 's1'))), '1',
  '[AC-102] it expires 24 hours after it is published (the policy hides it from then on)');
select is(pg_temp.n('a', format('nestly.stories where id = %L', (select v from st where k = 's1'))), '1', '[AC-102] the author sees it at once');
select is(pg_temp.n('b', format('nestly.stories where id = %L', (select v from st where k = 's1'))), '0', '[AC-102] the audience only after the check');
select is(pg_temp.job(format('update nestly.media_assets set status = ''passed'' where id = %L', (select v from img where k = 's1'))), 'OK:1', '[I5] control');
select is(pg_temp.n('b', format('nestly.stories where id = %L', (select v from st where k = 's1'))), '1', '[AC-102 OP-033] then everyone, for audience "everyone"');
select is(pg_temp.n('b', pg_temp.m((select v from img where k = 's1'))), '1', '[AC-102] and its image');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'friends') $q$, (select v from img where k = 's1'))), 'ERR:23505', '[VAL-041] one Story per image');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'friends') $q$, (select v from img where k = 'pa2'))), 'ERR:42501', '[VAL-041] only a Story image');
select is(pg_temp.dml('b', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'everyone') $q$, (select v from img where k = 's2'))), 'ERR:42501', '[FR-FEED-008] never someone else''s image');
select is(pg_temp.dml('p', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'everyone') $q$, (select v from img where k = 'sp'))), 'ERR:42501', '[FR-FEED-008 Actor] Stories are for Regular accounts');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'followers') $q$, (select v from img where k = 's2'))), 'ERR:23514', '[OP-033] audience everyone or friends');
select is(pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'friends') $q$, (select v from img where k = 's2'))), 'OK:1', '[OP-033] a Friends-only Story');
select is(pg_temp.job(format('update nestly.media_assets set status = ''passed'' where id = %L', (select v from img where k = 's2'))), 'OK:1', '[I5] control');
select is(pg_temp.n('b', 'nestly.stories where audience = ''friends'''), '0', '[OP-033] a non-Friend does not see a Friends-only Story');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.n('b', 'nestly.stories where audience = ''friends'''), '1', '[OP-033] a Friend does');
select is(pg_temp.dml('a', 'update nestly.stories set audience = ''everyone'''), 'ERR:42501', '[FR-FEED-008] a Story is not edited');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', (select v from img where k = 's1'))), 'OK:0', '[AC-102] the job does not delete a live Story');

-- AC-103: the eleventh Story in 24 hours is refused by the database, whatever sent it
create function pg_temp.story_n(p_count int) returns text language plpgsql as $f$
declare
  v text := 'OK';
  m text;
begin
  for i in 1..p_count loop
    m := pg_temp.up('a', 'story');
    v := pg_temp.dml('a', format($q$ insert into nestly.stories (media_id, audience) values (%L, 'everyone') $q$, m));
    exit when v <> 'OK:1';
  end loop;
  return v;
end
$f$;
select is(pg_temp.story_n(8), 'OK:1', '[VAL-042] the third to the tenth Story are accepted');
select is(pg_temp.story_n(1), 'ERR:NS021', '[AC-103 ERR-040] the eleventh Story in 24 hours is refused');
select is(pg_temp.n('a', format('nestly.stories where author_id = %L', pg_temp.id('a'))), '10', '[AC-103] exactly ten exist');

-- ---- the purge (BR-077, rule 6) ------------------------------------------------------------------------------------------------
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', (select v from img where k = 'a2'))), 'OK:0', '[BR-077] an unattached post image younger than a day stays');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', (select v from img where k = 'q2'))), 'OK:0', '[BR-077] a rejected image stays 30 days');
select is(pg_temp.job(format('delete from nestly.media_assets where id = %L', (select v from img where k = 'pa2'))), 'OK:0', '[BR-077] a current profile photo stays');
select is(tests.jobs_as(format('select count(*)::text from nestly.media_assets where id = %L', (select v from img where k = 'q3'))), '1', '[rule 6] the job reads every image row');
select is(pg_temp.dml('a', format('delete from nestly.media_assets where id = %L', (select v from img where k = 'a2'))), 'OK:1', '[FR-FEED-002] the uploader removes their own image');
select is(pg_temp.dml('b', format('delete from nestly.media_assets where id = %L', (select v from img where k = 'a3'))), 'OK:0', '[FR-FEED-002] nobody removes another''s');

select * from finish();
rollback;
