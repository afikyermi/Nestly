-- pgTAP, run by pg_prove as app_server (CI `db` job, F1.6 part a/b: password recovery, FR-AUTH-003).
-- Behaviour of the recovery policies and constraints, seen from each role: spec criteria 3 (no runtime role reads hashes
-- except app_recovery for the one handle it declares), 5 (own rows only, RLS), 8 (one handle per account, a handle is
-- never rewritten), 11/12 (throttle rows for any handle, only the declared ones), 13 (append-only audit, forced attribution).
-- Amendment 2 adds: the claim time of a handle and its release by a newer claim (21), the owner's re-key (23), the marker
-- of the limited event (13), three event kinds.
-- Source of expected values: .work/password-recovery/spec.md (+ Amendments 1 and 2), schema.md and interface.md "Database", not the
-- migration text. Structure (grants, catalog) is in file 30. Everything here rolls back with the transaction.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.
--
-- Accounts: a, b regular and active (b is "another user"); p professional and active, with no answers (a third account for
-- insert-only checks); s suspended; x banned; c has no users row; f1 is an Auth user with no users row.
-- Declared subjects: handle 'aa..' belongs to a, 'bb..' to b; IP hashes 'cc..' and 'dd..'.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.6-a c3] session_user is app_server (this file must not run under another login)');

-- ---- helpers (temp schema, gone with the session) ----------------------------------------------------------------------------
create function pg_temp.ins(
  h text default 'aa', q1 text default 'nickname', q2 text default 'pet', uid text default null,
  hl int default 32, h1 int default 32, s1 int default 16, h2 int default 32, s2 int default 16, salt2 text default '22',
  n int default 15, r int default 8, p int default 1, ca text default '2026-10-15 10:00:00+00'
) returns text language sql as $f$
  select format(
    'insert into nestly.recovery_answers (%s email_handle, handle_claimed_at, question_1, question_2, answer_hash_1, answer_salt_1, answer_hash_2, answer_salt_2, scrypt_log_n, scrypt_r, scrypt_p) '
    || 'values (%s decode(repeat(%L, %s), ''hex''), %L::timestamptz, %L, %L, decode(repeat(''11'', %s), ''hex''), decode(repeat(''21'', %s), ''hex''), '
    || 'decode(repeat(''12'', %s), ''hex''), decode(repeat(%L, %s), ''hex''), %s, %s, %s)',
    case when uid is null then '' else 'user_id,' end,
    case when uid is null then '' else format('%L::uuid,', uid) end,
    h, hl, ca, q1, q2, h1, s1, h2, salt2, s2, n, r, p)
$f$;

-- Declares the handle and the IP hash for the rest of this transaction (what the server does after SET LOCAL ROLE).
create function pg_temp.decl(h text, i text) returns text language sql as $f$
  select set_config('nestly.recovery_handle', h, true) || '/' || set_config('nestly.recovery_ip', i, true)
$f$;

-- The same, plus the claim time (iat) of the caller's token: what a release is ordered by (criterion 21).
create function pg_temp.decl_ca(h text, i text, ca text) returns text language sql as $f$
  select pg_temp.decl(h, i) || '@' || set_config('nestly.recovery_claimed_at', ca, true)
$f$;

-- an events insert under whatever is declared
create function pg_temp.ev(kind text, uid text, h text, i text) returns text language sql as $f$
  select format('insert into nestly.recovery_events (kind, user_id, handle_hash, ip_hash) values (%L, %L, decode(%L, ''hex''), decode(%L, ''hex''))',
                kind, uid, h, i)
$f$;

-- ---- fixtures are really there ---------------------------------------------------------------------------------------------
select is(tests.fx_user(tests.fx_id('a')), 'regular/active', '[F1.6 fixture] a is regular and active');
select is(tests.fx_user(tests.fx_id('b')), 'regular/active', '[F1.6 fixture] b is regular and active');
select is(tests.fx_user(tests.fx_id('p')), 'professional/active', '[F1.6 fixture] p is professional and active');
select is(tests.fx_user(tests.fx_id('s')), 'regular/suspended', '[F1.6 fixture] s is suspended');
select is(tests.fx_user(tests.fx_id('x')), 'regular/banned', '[F1.6 fixture] x is banned');

-- =====================================================================================================================
-- Criteria 1, 5 — the signed-in write is the caller's own row, active accounts only
-- =====================================================================================================================
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), pg_temp.ins('aa')), 'OK:1',
  '[F1.6-a c1] an active account saves its own answers (user_id and created_at come from the database)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('b')), pg_temp.ins('bb', 'pet', 'street')), 'OK:1',
  '[F1.6-a c1] a second active account saves its own pair (any two different ids, stored in canonical order)');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('s')), pg_temp.ins('a5'), false), 'ERR:42501',
  '[F1.6-a c1 BR-024] a suspended account cannot save answers (the policy requires an active account)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('x')), pg_temp.ins('a6'), false), 'ERR:42501',
  '[F1.6-a c1 BR-024] a banned account cannot save answers');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('c')), pg_temp.ins('a7'), false), 'ERR:42501',
  '[F1.6-a c1 platform r15] an identity with no users row cannot save answers');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), pg_temp.ins('a8'), false), 'ERR:42501',
  '[F1.6-a c1] an Auth user that never registered cannot save answers');
select is(tests.dml_as('anon', '', pg_temp.ins('a9'), false), 'ERR:42501',
  '[F1.6-a c1 c5] anon cannot save answers');
select is(tests.dml_as('anon', tests.claims(tests.fx_id('a'), '{"role":"anon"}'::jsonb), pg_temp.ins('a9'), false), 'ERR:42501',
  '[F1.6-a c1 c5] anon carrying an active account''s sub cannot save answers');
select is(tests.dml_as('none', '', pg_temp.ins('a9'), false), 'ERR:42501',
  '[F1.6-a c1 c5] app_server without SET ROLE cannot reach the table');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ab'), false), 'OK:1',
  '[F1.6-a c1] the control: a third active account can save (the refusals above are about the caller, not the statement)');

-- naming another user
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')),
    pg_temp.ins('ac', uid => 'a0000000-0000-4000-8000-0000000000a1'), false), 'ERR:42501%',
  '[F1.6-a c5] a body naming another user: user_id is not an insertable column, so the statement is refused');

-- a second save, handle collisions
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')), pg_temp.ins('ad'), false), '%recovery_answers_pkey%',
  '[F1.6-a c4] a second save by the same account hits recovery_answers_pkey (23505; the server maps it to 409)');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('aa'), false), 'ERR:23505:%recovery_answers_email_handle_key%',
  '[F1.6-a c8] a second account with an existing handle collides on recovery_answers_email_handle_key (one handle per account)');

-- constraints (as p, which has no row; keep = false so each statement stands alone)
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', 'pet', 'nickname'), false), 'ERR:23514:%question_order_check%',
  '[F1.6-a c1 c2] the pair must be in canonical order: (pet, nickname) is refused');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', 'pet', 'pet'), false), 'ERR:23514:%',
  '[F1.6-a c2] the same question twice cannot be stored');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', 'pet', 'school'), false), 'ERR:23514:%',
  '[F1.6-a c2] an unknown question id cannot be stored');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', 'school', 'street'), false), 'ERR:23514:%',
  '[F1.6-a c2] an unknown first question id cannot be stored');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', null, 'street'), false), 'ERR:23502',
  '[F1.6-a c2] a NULL question is refused (not_null_violation)');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', salt2 => '21'), false), 'ERR:23514:%salts_differ_check%',
  '[F1.6-a c3] two answers cannot share a salt');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', h1 => 31), false), 'ERR:23514',
  '[F1.6-a c3] a hash that is not 32 bytes is refused (31)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', h2 => 33), false), 'ERR:23514',
  '[F1.6-a c3] a hash that is not 32 bytes is refused (33)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', s1 => 15), false), 'ERR:23514',
  '[F1.6-a c3] a salt that is not 16 bytes is refused (15)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', s2 => 17, salt2 => '23'), false), 'ERR:23514',
  '[F1.6-a c3] a salt that is not 16 bytes is refused (17)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', hl => 31), false), 'ERR:23514',
  '[F1.6-a c8] a handle that is not 32 bytes is refused (31)');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', n => 14), false), 'ERR:23514:%scrypt_log_n_check%',
  '[F1.6-a c3] scrypt N below 2^15 is refused by the database (log N 14)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', n => 18), false), 'ERR:23514',
  '[F1.6-a c3] scrypt N above 2^17 is refused (a bad row cannot become a memory lever)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', r => 7), false), 'ERR:23514', '[F1.6-a c3] scrypt r below 8 is refused');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', r => 17), false), 'ERR:23514', '[F1.6-a c3] scrypt r above 16 is refused');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', p => 0), false), 'ERR:23514', '[F1.6-a c3] scrypt p below 1 is refused');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', p => 5), false), 'ERR:23514', '[F1.6-a c3] scrypt p above 4 is refused');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', n => 17, r => 16, p => 4), false), 'OK:1',
  '[F1.6-a c3] the maximum parameters (17, 16, 4) are accepted');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', n => 15, r => 8, p => 1), false), 'OK:1',
  '[F1.6-a c3] the minimum parameters (15, 8, 1) are accepted');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins(h => null), false), 'ERR:23514:%handle_claim_check%',
  '[F1.6-a c21] a claim time without a handle is refused: the two are NULL together');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ae', ca => null), false), 'ERR:23514:%handle_claim_check%',
  '[F1.6-a c21] a handle without a claim time is refused: a claim is always ordered');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins(h => null, ca => null), false), 'OK:1',
  '[F1.6-a c21] a row with neither handle nor claim (released) is valid');

-- =====================================================================================================================
-- Criteria 3, 5 — what authenticated can read: its own row, never a hash
-- =====================================================================================================================
select is(tests.n_as(tests.fx_id('a'), 'nestly.recovery_answers'), '1', '[F1.6-a c5 c6] a reads exactly its own answers row');
select is(tests.n_as(tests.fx_id('b'), 'nestly.recovery_answers'), '1', '[F1.6-a c5] b reads exactly its own answers row');
select is(tests.n_as(tests.fx_id('c'), 'nestly.recovery_answers'), '0', '[F1.6-a c5] an identity with no users row reads 0 rows');
select is(tests.n_as(tests.fx_id('s'), 'nestly.recovery_answers'), '0', '[F1.6-a c5] a suspended account with no row reads 0 rows');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from nestly.recovery_answers where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$),
  '0', '[F1.6-a c5] a asking for b''s answers row by id gets 0 rows');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from nestly.recovery_answers where email_handle = decode(repeat('bb', 32), 'hex') $q$),
  '0', '[F1.6-a c5 c8] a asking for b''s handle gets 0 rows');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select user_id::text from nestly.recovery_answers $q$),
  'a0000000-0000-4000-8000-0000000000a1', '[F1.6-a c5] the row a reads is a''s');

select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select answer_hash_1::text from nestly.recovery_answers $q$),
  'ERR:42501', '[F1.6-a c3 DR-G2] authenticated cannot read its own first hash');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select answer_hash_2::text from nestly.recovery_answers $q$),
  'ERR:42501', '[F1.6-a c3 DR-G2] authenticated cannot read its own second hash');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select answer_salt_1::text from nestly.recovery_answers $q$),
  'ERR:42501', '[F1.6-a c3 DR-G2] authenticated cannot read its own first salt');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select answer_salt_2::text from nestly.recovery_answers $q$),
  'ERR:42501', '[F1.6-a c3 DR-G2] authenticated cannot read its own second salt');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select count(*)::text from (select * from nestly.recovery_answers) t $q$),
  'ERR:42501', '[F1.6-a c3 DR-G2] select * is refused (it would include the hash columns)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select to_jsonb(t)::text from nestly.recovery_answers t $q$),
  'ERR:42501', '[F1.6-a c3 DR-G2] reading the whole row as one value is refused too');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select question_1 from nestly.recovery_answers $q$),
  'ERR:42501', '[F1.6-a c3] authenticated cannot read the chosen questions either (only user_id, email_handle, created_at)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('af') || ' returning answer_hash_1::text'),
  'ERR:42501', '[F1.6-a c3] RETURNING a hash from an insert is refused');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from nestly.recovery_answers where answer_hash_1 = decode(repeat('11', 32), 'hex') $q$),
  'ERR:42501', '[F1.6-a c3] a hash cannot be used as a filter either (no oracle on the hash through a WHERE clause)');

-- the helpers and the other two tables are closed to authenticated and anon
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.recovery_handle()::text'), 'ERR:42501',
  '[F1.6-a c3] authenticated cannot call recovery_handle()');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.recovery_ip()::text'), 'ERR:42501',
  '[F1.6-a c3] authenticated cannot call recovery_ip()');
select is(tests.as_role('anon', '', 'select nestly.recovery_handle()::text'), 'ERR:42501', '[F1.6-a c3] anon cannot call recovery_handle()');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select count(*)::text from nestly.recovery_throttles'), 'ERR:42501',
  '[F1.6-b c12] authenticated cannot read the throttles');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select count(*)::text from nestly.recovery_events'), 'ERR:42501',
  '[F1.6-b c13] authenticated cannot read the audit');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.recovery_answers'), 'ERR:42501', '[F1.6-a c3 c5] anon cannot read answers');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.recovery_throttles'), 'ERR:42501', '[F1.6-b c12] anon cannot read the throttles');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.recovery_events'), 'ERR:42501', '[F1.6-b c13] anon cannot read the audit');
select is(tests.as_role('none', '', 'select count(*)::text from nestly.recovery_answers'), 'ERR:42501',
  '[F1.6-a c3] app_server without SET ROLE cannot read answers');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), pg_temp.ev('answers_saved', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c13 platform r18] authenticated cannot write the audit, not even about itself');
select is(tests.dml_as('anon', '', pg_temp.ev('reset_failed', null, repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c13] anon cannot write the audit');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('aa', 32), 'hex')) $q$, false),
  'ERR:42501', '[F1.6-b c12] authenticated cannot write the throttles');

-- declaring a handle as authenticated opens nothing
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-a c5] aa/cc declared');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    $q$ select count(*)::text from nestly.recovery_answers where user_id = 'a0000000-0000-4000-8000-0000000000a1' $q$),
  '0', '[F1.6-a c5] with a''s handle declared in the session, b still cannot read a''s row (the declaration only means something to app_recovery)');

-- =====================================================================================================================
-- Criterion 4 — updating own answers
-- =====================================================================================================================
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set answer_hash_1 = decode(repeat('33', 32), 'hex'), answer_salt_1 = decode(repeat('41', 16), 'hex'),
          answer_hash_2 = decode(repeat('34', 32), 'hex'), answer_salt_2 = decode(repeat('42', 16), 'hex'), question_1 = 'nickname', question_2 = 'street' $q$, false),
  'OK:1', '[F1.6-a c4] a replaces both answers and the pair of its own row (one statement, no WHERE: RLS narrows it to the caller)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set answer_hash_1 = decode(repeat('33', 32), 'hex') where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$, false),
  'OK:0', '[F1.6-a c5] a cannot update b''s row (0 rows, not an error that reveals it exists)');
-- criterion 23: the owner may re-key its own handle (the server orders claims by iat), always together with the claim time
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = decode(repeat('ee', 32), 'hex'), handle_claimed_at = '2026-10-15 12:00:00+00' $q$, false),
  'OK:1', '[F1.6-a c23] a re-keys its own handle together with its claim time');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = decode(repeat('ee', 32), 'hex'), handle_claimed_at = null $q$, false),
  'ERR:23514:%handle_claim_check%', '[F1.6-a c23] a handle is never held without a claim time: the pairing is refused (the order of claims is the server''s)');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = null $q$, false),
  'ERR:23514:%handle_claim_check%', '[F1.6-a c23] a handle cannot be emptied while the claim time stays');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = null, handle_claimed_at = null $q$, false),
  'OK:1', '[F1.6-a c21] an owner may give up its own handle (both NULL)');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = decode(repeat('ee', 32), 'hex') $q$, false),
  'ERR:23514:%handle_claim_check%', '[F1.6-a c23] on a released row, a handle alone is refused: it needs a claim time');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = decode(repeat('bb', 32), 'hex'), handle_claimed_at = '2026-10-15 12:00:00+00' $q$, false),
  'ERR:23505:%email_handle_key%', '[F1.6-a c8 c21] a cannot take b''s handle by update: the handle is unique (the server releases first, or answers 503)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set email_handle = null, handle_claimed_at = null where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$, false),
  'OK:0', '[F1.6-a c5 c21] a cannot release or re-key b''s row (0 rows)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$, false),
  'ERR:42501', '[F1.6-a c5] a row cannot be handed to another user (no UPDATE privilege on user_id)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set created_at = now() $q$, false),
  'ERR:42501', '[F1.6-b c13] created_at is never granted');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set question_1 = 'street', question_2 = 'nickname' $q$, false), 'ERR:23514:%',
  '[F1.6-a c2] an update cannot break the canonical order of the pair');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set scrypt_log_n = 14 $q$, false), 'ERR:23514:%',
  '[F1.6-a c3] an update cannot lower the scrypt cost below N = 2^15');
select alike(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set answer_salt_1 = answer_salt_2 $q$, false), 'ERR:42501%',
  '[F1.6-a c3] an update cannot read a salt to copy it (the salt is not selectable)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set answer_salt_1 = decode(repeat('42', 16), 'hex'), answer_salt_2 = decode(repeat('42', 16), 'hex') $q$, false),
  'ERR:23514', '[F1.6-a c3] an update cannot make the two salts equal');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), $q$ delete from nestly.recovery_answers $q$, false), 'ERR:42501',
  '[F1.6-a c4] nobody deletes answers through authenticated');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ delete from nestly.recovery_answers where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$, false), 'ERR:42501',
  '[F1.6-a c5] and certainly not another user''s');

-- a stopped account sees and changes nothing through authenticated
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.6 fixture] a is suspended');
select is(tests.n_as(tests.fx_id('a'), 'nestly.recovery_answers'), '0', '[F1.6-a c5 c6 BR-024] a suspended account reads 0 answers rows (the server reports no recoveryQuestions for it)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.recovery_answers set scrypt_r = 8 $q$, false), 'OK:0',
  '[F1.6-a c4 BR-024] a suspended account cannot change its answers (0 rows)');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.6 fixture] a is active again');
select is(tests.n_as(tests.fx_id('a'), 'nestly.recovery_answers'), '1', '[F1.6-a c6] active again: a reads its own row again');

-- =====================================================================================================================
-- Criterion 3 — app_recovery reads the hashes of the ONE handle it declares
-- =====================================================================================================================
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-a c3] declare handle aa, ip cc');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), '1',
  '[F1.6-a c3] with aa declared app_recovery sees exactly one answers row, with no WHERE at all (it cannot dump the table)');
select is(tests.as_role('app_recovery', '', 'select user_id::text from nestly.recovery_answers'), 'a0000000-0000-4000-8000-0000000000a1',
  '[F1.6-a c3] and that row is a''s');
select ok(
  tests.as_role('app_recovery', '', $q$ select encode(answer_hash_1, 'hex') || encode(answer_salt_1, 'hex') from nestly.recovery_answers $q$) ~ '^[0-9a-f]{96}$',
  '[F1.6-b c3 c10] app_recovery reads the hash and salt of the declared handle (it must, to verify)');
select is(tests.as_role('app_recovery', '', $q$ select count(*)::text from nestly.recovery_answers where email_handle = decode(repeat('bb', 32), 'hex') $q$), '0',
  '[F1.6-a c3] asking for b''s handle while aa is declared returns nothing');
select is(tests.as_role('app_recovery', '', $q$ select count(*)::text from nestly.recovery_answers where true or user_id is not null $q$), '1',
  '[F1.6-a c3] an always-true filter still returns one row');

select is(pg_temp.decl(repeat('bb', 32), repeat('cc', 32)), repeat('bb', 32) || '/' || repeat('cc', 32), '[F1.6-a c3] declare handle bb');
select is(tests.as_role('app_recovery', '', 'select user_id::text from nestly.recovery_answers'), 'b0000000-0000-4000-8000-0000000000b2',
  '[F1.6-a c3] with bb declared, the one row is b''s');

select is(pg_temp.decl(repeat('ee', 32), repeat('cc', 32)), repeat('ee', 32) || '/' || repeat('cc', 32), '[F1.6-b c11] declare a handle nobody has');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), '0',
  '[F1.6-b c10 c11] an unknown handle reads 0 rows, not an error');

select is(pg_temp.decl('', ''), '/', '[F1.6-a c3] declare nothing (empty)');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), '0',
  '[F1.6-a c3] with no declaration app_recovery reads 0 rows (it fails closed)');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_throttles'), '0',
  '[F1.6-b c12] with no declaration app_recovery reads 0 throttle rows');

select is(pg_temp.decl(repeat('ab', 31), repeat('cc', 32)), repeat('ab', 31) || '/' || repeat('cc', 32), '[F1.6 hostile] declare a 31-byte handle');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), '0', '[F1.6 hostile] a handle of the wrong length matches nothing');
select is(pg_temp.decl('not-hex', repeat('cc', 32)), 'not-hex/' || repeat('cc', 32), '[F1.6 hostile] declare a handle that is not hex');
select alike(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), 'ERR:%',
  '[F1.6 hostile] a handle that is not hex is an error, never a match');
select is(pg_temp.decl('aa'' or ''1''=''1', repeat('cc', 32)), 'aa'' or ''1''=''1/' || repeat('cc', 32), '[F1.6 hostile] declare an injection-shaped handle');
select alike(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), 'ERR:%',
  '[F1.6 hostile] an injection-shaped handle is an error, never a match');

-- a stopped account can still be recovered (criterion 9: it then sees the stopped text at sign-in)
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.6 fixture] a is suspended');
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-b c9] declare handle aa');
select is(tests.as_role('app_recovery', '', 'select user_id::text from nestly.recovery_answers'), 'a0000000-0000-4000-8000-0000000000a1',
  '[F1.6-b c9] a stopped account''s answers are still readable by app_recovery: it can reset its password');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.6 fixture] a is active again');

-- app_recovery writes no answers and reaches nothing else
select is(tests.dml_as('app_recovery', '', pg_temp.ins('a1'), false), 'ERR:42501', '[F1.6-a c3] app_recovery cannot insert answers');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_answers set scrypt_r = 9', false), 'ERR:42501', '[F1.6-a c3] app_recovery cannot update answers');
select is(tests.dml_as('app_recovery', '', 'delete from nestly.recovery_answers', false), 'ERR:42501', '[F1.6-a c3] app_recovery cannot delete answers');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.users'), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot read users');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.regular_profiles'), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot read regular_profiles');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.children'), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot read children');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.legal_consents'), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot read legal_consents');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.journey_contexts'), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot read journey_contexts');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_events'), 'ERR:42501', '[F1.6-b c13] app_recovery cannot read the audit');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from auth.users'), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot read auth.users');
select is(tests.dml_as('app_recovery', '', 'update auth.users set encrypted_password = null', false), 'ERR:42501', '[F1.6 DR-G1] app_recovery cannot change a password in Auth: only the admin module can');

-- =====================================================================================================================
-- Criteria 10-12 — throttles: any handle, only the declared subjects
-- =====================================================================================================================
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-b c12] declare aa / cc');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('aa', 32), 'hex')) $q$),
  'OK:1', '[F1.6-b c12] app_recovery creates the counter row of the declared handle');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('ip', decode(repeat('cc', 32), 'hex')) $q$),
  'OK:1', '[F1.6-b c12] and of the declared IP hash');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('aa', 32), 'hex')) on conflict do nothing $q$),
  'OK:0', '[F1.6-b c12] the server''s "insert … on conflict do nothing" is a no-op when the row exists');
select alike(tests.dml_as_msg('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('aa', 32), 'hex')) $q$, false),
  'ERR:23505:%', '[F1.6-b c12] a plain duplicate is a unique violation');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('bb', 32), 'hex')) $q$, false),
  'ERR:42501', '[F1.6-b c12] app_recovery cannot create a counter row for a handle it did not declare');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('ip', decode(repeat('dd', 32), 'hex')) $q$, false),
  'ERR:42501', '[F1.6-b c12] nor for an IP hash it did not declare');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('cc', 32), 'hex')) $q$, false),
  'ERR:42501', '[F1.6-b c12] the IP hash cannot be filed as a handle (the kind is part of the match)');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('ip', decode(repeat('aa', 32), 'hex')) $q$, false),
  'ERR:42501', '[F1.6-b c12] nor the handle as an IP hash');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('other', decode(repeat('aa', 32), 'hex')) $q$, false),
  'ERR:42501', '[F1.6-b c12] a third kind is refused');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash, short_failures) values ('ip', decode(repeat('cc', 32), 'hex'), 99) $q$, false),
  'ERR:42501', '[F1.6-b c12] counters cannot be set at insert (only kind and hash are insertable)');

select is(pg_temp.decl(repeat('bb', 32), repeat('dd', 32)), repeat('bb', 32) || '/' || repeat('dd', 32), '[F1.6-b c12] declare bb / dd');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('bb', 32), 'hex')), ('ip', decode(repeat('dd', 32), 'hex')) $q$),
  'OK:2', '[F1.6-b c12] the second subject pair gets its rows');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_throttles'), '2',
  '[F1.6-b c12] with bb / dd declared, app_recovery sees two throttle rows: its own handle and IP, none of aa / cc');

select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-b c12] declare aa / cc again');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_throttles'), '2', '[F1.6-b c12] two rows again: the declared handle and IP only');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_throttles set short_failures = short_failures + 1', false), 'OK:2',
  '[F1.6-b c12] an unfiltered counter update reaches the two declared rows and no others');
select is(tests.dml_as('app_recovery', '',
    $q$ update nestly.recovery_throttles set short_failures = 3, short_window_started_at = now() where subject_kind = 'handle' $q$),
  'OK:1', '[F1.6-b c12] the handle counter is updated (short window, failures)');
select is(tests.dml_as('app_recovery', '',
    $q$ update nestly.recovery_throttles set long_failures = 15, long_window_started_at = now(), locked_until = now() + interval '24 hours' where subject_kind = 'handle' $q$),
  'OK:1', '[F1.6-b c12] the handle''s long counter and lock are updated');
select is(tests.dml_as('app_recovery', '',
    $q$ update nestly.recovery_throttles set locked_until = now() + interval '15 minutes', short_failures = 10 where subject_kind = 'ip' $q$),
  'OK:1', '[F1.6-b c12] the IP row is locked');
select is(tests.dml_as('app_recovery', '',
    $q$ update nestly.recovery_throttles set limited_noted_until = locked_until where subject_kind = 'ip' $q$),
  'OK:1', '[F1.6-b c13] app_recovery marks the lock for which a limited event was written (one event per subject per lock)');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash, limited_noted_until) values ('ip', decode(repeat('cc', 32), 'hex'), now()) on conflict do nothing $q$, false),
  'ERR:42501', '[F1.6-b c13] the marker is not insertable: a new row never starts out as "already noted"');

select is(pg_temp.decl(repeat('bb', 32), repeat('dd', 32)), repeat('bb', 32) || '/' || repeat('dd', 32), '[F1.6-b c12] declare bb / dd');
select is(tests.as_role('app_recovery', '', $q$ select string_agg(short_failures::text || ':' || coalesce(locked_until::text, '-'), ',' order by subject_kind) from nestly.recovery_throttles $q$),
  '0:-,0:-', '[F1.6-b c12] the first pair''s updates did not touch bb / dd');

select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-b c12] declare aa / cc');
select is(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_throttles set subject_kind = 'ip' $q$, false), 'ERR:42501',
  '[F1.6-b c12] the kind of a row cannot be changed');
select is(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_throttles set subject_hash = decode(repeat('dd', 32), 'hex') $q$, false), 'ERR:42501',
  '[F1.6-b c12] a row cannot be re-pointed at another subject');
select alike(tests.dml_as_msg('app_recovery', '', $q$ update nestly.recovery_throttles set long_window_started_at = now() where subject_kind = 'ip' $q$, false),
  'ERR:23514:%long_window_check%', '[F1.6-b c12] an IP row has no 24-hour window');
select alike(tests.dml_as_msg('app_recovery', '', $q$ update nestly.recovery_throttles set long_failures = 1 where subject_kind = 'ip' $q$, false),
  'ERR:23514:%long_failures_check%', '[F1.6-b c12] an IP row has no 24-hour failure count');
select is(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_throttles set short_failures = -1 where subject_kind = 'handle' $q$, false), 'ERR:23514',
  '[F1.6-b c12] a failure count cannot be negative');
select is(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_throttles set long_failures = -1 where subject_kind = 'handle' $q$, false), 'ERR:23514',
  '[F1.6-b c12] the long failure count cannot be negative either');
select is(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_throttles set short_failures = 40000 where subject_kind = 'handle' $q$, false), 'ERR:22003',
  '[F1.6-b c12] a count past smallint is refused, never wrapped');
select is(tests.dml_as('app_recovery', '', 'delete from nestly.recovery_throttles', false), 'ERR:42501', '[F1.6-b c12] throttle rows are never deleted by the request path');
select is(tests.dml_as('app_recovery', '', 'truncate nestly.recovery_throttles', false), 'ERR:42501', '[F1.6-b c12] nor truncated');

select is(pg_temp.decl(repeat('ee', 32), repeat('ff', 32)), repeat('ee', 32) || '/' || repeat('ff', 32), '[F1.6-b c11] declare a pair nobody has filed');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_throttles'), '0',
  '[F1.6-b c11] a subject with no row reads 0 rows');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_throttles (subject_kind, subject_hash) values ('handle', decode(repeat('ee', 32), 'hex')), ('ip', decode(repeat('ff', 32), 'hex')) $q$),
  'OK:2', '[F1.6-b c11] an unknown handle gets a counter row exactly as a known one does (nothing in the database tells them apart)');

-- =====================================================================================================================
-- Criterion 13 — the audit: append-only, attribution forced by the database
-- =====================================================================================================================
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-b c13] declare aa / cc');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_verified', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c13] app_recovery appends reset_verified for the declared handle, IP and its own user');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_failed', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c13] a failed attempt on a known handle carries the user id');
select is(
  tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_events (kind, user_id, handle_hash, ip_hash)
        select k, 'a0000000-0000-4000-8000-0000000000a1'::uuid, decode(repeat('aa', 32), 'hex'), decode(repeat('cc', 32), 'hex')
          from unnest(array['answers_saved', 'answers_changed', 'change_failed', 'change_limited', 'reset_verified',
                            'reset_completed', 'reset_failed', 'reset_limited', 'reset_admin_failed', 'reset_revoke_failed',
                            'reset_email_mismatch', 'handle_released', 'handle_rekeyed']) as k $q$, false),
  'OK:13', '[F1.6-b c13 c21 c22 c23] all thirteen event kinds are accepted, including reset_email_mismatch, handle_released and handle_rekeyed');
select alike(tests.dml_as_msg('app_recovery', '', pg_temp.ev('handle_released', null, repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:%', '[F1.6-b c21 c13] a release is attributed to the account that lost the handle: with no account for the handle it is not written as an anonymous event');
select alike(tests.dml_as_msg('app_recovery', '', pg_temp.ev('reset_bogus', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:23514:%recovery_events_kind_check%', '[F1.6-b c13] an unknown kind is refused');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('Reset_Verified', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:23514', '[F1.6-b c13] the kind is case-sensitive');

select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_verified', 'b0000000-0000-4000-8000-0000000000b2', repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c13] an event cannot be attributed to another account than the declared handle''s');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_failed', null, repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c13] a known handle''s event cannot hide its user (user_id must equal the answers row''s)');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_failed', 'a0000000-0000-4000-8000-0000000000a1', repeat('bb', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c13] the handle hash must be the declared one');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_failed', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('dd', 32)), false),
  'ERR:42501', '[F1.6-b c13] the IP hash must be the declared one');

select is(pg_temp.decl(repeat('ee', 32), repeat('cc', 32)), repeat('ee', 32) || '/' || repeat('cc', 32), '[F1.6-b c11 c13] declare an unknown handle');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_failed', null, repeat('ee', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c11 c13] a failed attempt on an unknown handle is audited with no user');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_limited', null, repeat('ee', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c12 c13] a limited attempt on an unknown handle is audited with no user');
select alike(tests.dml_as_msg('app_recovery', '', pg_temp.ev('reset_verified', null, repeat('ee', 32), repeat('cc', 32)), false),
  'ERR:23514:%recovery_events_user_id_check%', '[F1.6-b c13] reset_verified without a user is refused: a verified reset always knows its account');
select alike(tests.dml_as_msg('app_recovery', '', pg_temp.ev('reset_completed', null, repeat('ee', 32), repeat('cc', 32)), false),
  'ERR:23514:%recovery_events_user_id_check%', '[F1.6-b c13 Amendment 1] reset_completed without a user is refused');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_failed', 'a0000000-0000-4000-8000-0000000000a1', repeat('ee', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c11 c13] an unknown handle cannot be attributed to a real account');

select is(pg_temp.decl(repeat('ab', 31), repeat('cc', 32)), repeat('ab', 31) || '/' || repeat('cc', 32), '[F1.6-b c13] declare a 31-byte handle');
select is(tests.dml_as('app_recovery', '',
    $q$ insert into nestly.recovery_events (kind, user_id, handle_hash, ip_hash) values ('reset_failed', null, decode(repeat('ab', 31), 'hex'), decode(repeat('cc', 32), 'hex')) $q$, false),
  'ERR:23514', '[F1.6-b c13] a handle hash that is not 32 bytes is refused even when it matches the declaration');

select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F1.6-b c13] declare aa / cc');
select is(tests.as_role('app_recovery', '', pg_temp.ev('reset_verified', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)) || ' returning id::text'),
  'ERR:42501', '[F1.6-b c13] RETURNING from the audit is refused: app_recovery cannot read it, not even what it just wrote');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_events set kind = kind', false), 'ERR:42501', '[F1.6-b c13] the audit cannot be updated');
select is(tests.dml_as('app_recovery', '', 'delete from nestly.recovery_events', false), 'ERR:42501', '[F1.6-b c13] the audit cannot be deleted from');
select is(tests.dml_as('app_recovery', '', 'truncate nestly.recovery_events', false), 'ERR:42501', '[F1.6-b c13] the audit cannot be truncated');

-- a stopped account's recovery is still audited
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F1.6 fixture] a is banned');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('reset_completed', 'a0000000-0000-4000-8000-0000000000a1', repeat('aa', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c9 c13] a banned account''s reset is audited like any other (the stopped text is shown at sign-in, F1.5)');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.6 fixture] a is active again');

-- the store path: authenticated writes the row, then app_recovery writes answers_saved in the same transaction
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), pg_temp.ins('ba'), true), 'OK:1',
  '[F1.6-b c13 c1] p saves its answers (the first half of the store transaction)');
select is(pg_temp.decl(repeat('ba', 32), repeat('cc', 32)), repeat('ba', 32) || '/' || repeat('cc', 32), '[F1.6-b c13] declare p''s new handle');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('answers_saved', 'd0000000-0000-4000-8000-0000000000d4', repeat('ba', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c13] and answers_saved is accepted right after, in the same transaction, because the new row is visible under the declared handle');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('answers_saved', 'a0000000-0000-4000-8000-0000000000a1', repeat('ba', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c13] and cannot name a different account');

-- =====================================================================================================================
-- Criterion 21 — releasing a handle held under an OLDER claim (app_recovery, the one declared handle, only to NULL)
-- p holds handle 'ba' under the claim 2026-10-15 10:00:00+00 (saved above and kept).
-- =====================================================================================================================
select is(tests.dml_as('app_recovery', '', pg_temp.ev('handle_released', 'd0000000-0000-4000-8000-0000000000d4', repeat('ba', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c21 c13] the release is audited for the account that holds the handle, before the handle is taken from it');
select is(pg_temp.decl_ca(repeat('ba', 32), repeat('cc', 32), '2026-10-15 10:00:00+00'), repeat('ba', 32) || '/' || repeat('cc', 32) || '@2026-10-15 10:00:00+00',
  '[F1.6-a c21] declare p''s handle with a claim EQUAL to the holder''s');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_answers set email_handle = null, handle_claimed_at = null', false), 'OK:0',
  '[F1.6-a c21] an equal claim releases nothing (the later claim wins; a tie goes to the holder)');
select is(pg_temp.decl_ca(repeat('ba', 32), repeat('cc', 32), '2026-10-15 09:59:59+00'), repeat('ba', 32) || '/' || repeat('cc', 32) || '@2026-10-15 09:59:59+00',
  '[F1.6-a c21] declare p''s handle with a claim one second OLDER');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_answers set email_handle = null, handle_claimed_at = null', false), 'OK:0',
  '[F1.6-a c21] an older claim releases nothing');
select is(pg_temp.decl_ca(repeat('ba', 32), repeat('cc', 32), ''), repeat('ba', 32) || '/' || repeat('cc', 32) || '@',
  '[F1.6-a c21] declare p''s handle with no claim time at all');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_answers set email_handle = null, handle_claimed_at = null', false), 'OK:0',
  '[F1.6-a c21] no declared claim time releases nothing (fails closed)');
select is(pg_temp.decl_ca(repeat('ee', 32), repeat('cc', 32), '2030-01-01 00:00:00+00'), repeat('ee', 32) || '/' || repeat('cc', 32) || '@2030-01-01 00:00:00+00',
  '[F1.6-a c21] declare a handle nobody holds with a very late claim');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_answers set email_handle = null, handle_claimed_at = null', false), 'OK:0',
  '[F1.6-a c21] a handle that is not the declared one is never released, however late the claim');
select is(pg_temp.decl_ca(repeat('ba', 32), repeat('cc', 32), '2026-10-15 10:00:01+00'), repeat('ba', 32) || '/' || repeat('cc', 32) || '@2026-10-15 10:00:01+00',
  '[F1.6-a c21] declare p''s handle with a claim one second NEWER');
select is(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_answers set email_handle = decode(repeat('ff', 32), 'hex'), handle_claimed_at = '2026-10-15 10:00:01+00' $q$, false),
  'ERR:42501', '[F1.6-a c21] app_recovery cannot SET a handle, even in the middle of a valid release (only NULL is allowed)');
select alike(tests.dml_as('app_recovery', '', $q$ update nestly.recovery_answers set email_handle = null $q$, false), 'ERR:%',
  '[F1.6-a c21] and cannot null the handle alone (the claim time goes with it)');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_answers set email_handle = null, handle_claimed_at = null'), 'OK:1',
  '[F1.6-a c21] a NEWER claim on the declared handle releases it: exactly one row, the holder''s');
select is(tests.fx_recovery_answers_json(tests.fx_id('p'))::jsonb ->> 'email_handle', null,
  '[F1.6-a c21] the holder keeps its row and its answers, with no handle: no email finds it any more');
select is(tests.fx_recovery_answers_json(tests.fx_id('p'))::jsonb ->> 'handle_claimed_at', null,
  '[F1.6-a c21] and no claim time');
select isnt(tests.fx_recovery_answers_json(tests.fx_id('b')), '-', '[F1.6-a c21] another account''s row is untouched');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.recovery_answers'), '0',
  '[F1.6-a c21] the released handle finds no row for a redeem');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')),
    $q$ update nestly.recovery_answers set email_handle = decode(repeat('ba', 32), 'hex'), handle_claimed_at = '2026-10-15 11:00:00+00' $q$),
  'OK:1', '[F1.6-a c21 c23] the former holder can take a handle again later with a newer claim of its own');

-- criterion 23: a re-key is audited under the NEW handle, and attributed to the owner of the row
select is(pg_temp.decl(repeat('ba', 32), repeat('cc', 32)), repeat('ba', 32) || '/' || repeat('cc', 32), '[F1.6-a c23] declare p''s re-keyed handle');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('handle_rekeyed', 'd0000000-0000-4000-8000-0000000000d4', repeat('ba', 32), repeat('cc', 32)), false),
  'OK:1', '[F1.6-b c23 c13] handle_rekeyed is accepted for the owner of the row that holds the new handle');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('handle_rekeyed', 'a0000000-0000-4000-8000-0000000000a1', repeat('ba', 32), repeat('cc', 32)), false),
  'ERR:42501', '[F1.6-b c23 c13] and cannot be attributed to another account');

select * from finish();

rollback;
