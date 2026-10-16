-- =====================================================================================================================
-- Password recovery by security questions — I1 F1.6. Three tables under RLS and FORCE RLS, three caller-free helpers,
-- and the grants of the guest role `app_recovery` (bootstrap step 1).
--
-- Source: .work/password-recovery/schema.md (Gate 2, passed 15.10.2026, with Amendment 1, and "CRITIC findings 1-2 —
--         recommendation" = Amendment 2; decisions/2026-10.md).
-- SRS: FR-AUTH-003, AC-092, OP-029, NFR-SEC-001, FR-ADMIN-005 · platform rules 1–4, 7, 8, 11–13, 15, 18, "Approved
--      exceptions" (.claude/knowledge/data-model.md).
--
-- recovery_answers    one row per account: the chosen pair of questions, two salted scrypt hashes, the email handle (the
--                     most recent claim to an email: released or re-keyed by the rules below, NULL when released).
-- recovery_throttles  failure counters and lock state per email handle or per IP hash; rows exist for unknown handles too.
-- recovery_events     the recovery audit. Append-only; no runtime role can read it.
--
-- Who may do what (schema.md "Authorization"). No SECURITY DEFINER function: tests.approved_security_definer() stays
-- empty. The signed-out redeem and the recovery verification and audit writes run as `app_recovery`, which app_server
-- reaches only through SET LOCAL ROLE inside a transaction (WITH INHERIT FALSE, SET TRUE). It sees only the rows of the
-- handle and the IP hash its transaction declares with nestly.recovery_handle() / nestly.recovery_ip(); an unset
-- declaration reads NULL and matches nothing, so the role fails closed. `authenticated` writes only its own answers row
-- and can never read a hash or a salt back.
--
-- The handle is a lookup key that must follow the account's CURRENT Auth email. Auth lets a user change their own email,
-- so a handle can go stale or be squatted. The later claim wins, ordered by the `iat` of the token that made it
-- (handle_claimed_at): saving answers, or a signed-in re-key, releases another account's handle only when that claim is
-- older (policy recovery_answers_release_recovery: app_recovery may only NULL the one declared handle of an older claim).
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261015200000_recovery_questions.down.sql (refuses while recovery_answers or recovery_events
-- holds a row). Bootstrap step 1 must have been re-run first: it creates app_recovery.
-- =====================================================================================================================

-- 0. Precondition: the role comes from bootstrap step 1, run by postgres.
do $$
begin
  if to_regrole('app_recovery') is null then
    raise exception 'role app_recovery does not exist: re-run supabase/bootstrap/01-roles.sql as postgres before this migration';
  end if;
end
$$;

-- 1. Tables.
create table nestly.recovery_answers (
  user_id        uuid        not null default auth.uid(),
  email_handle   bytea,
  handle_claimed_at timestamptz,
  question_1     text        not null,
  question_2     text        not null,
  answer_hash_1  bytea       not null,
  answer_salt_1  bytea       not null,
  answer_hash_2  bytea       not null,
  answer_salt_2  bytea       not null,
  scrypt_log_n   smallint    not null,
  scrypt_r       smallint    not null,
  scrypt_p       smallint    not null,
  created_at     timestamptz not null default now(),
  constraint recovery_answers_pkey primary key (user_id),
  constraint recovery_answers_user_id_fkey foreign key (user_id)
    references nestly.users (id) on delete cascade,
  constraint recovery_answers_email_handle_key unique (email_handle),
  constraint recovery_answers_email_handle_check check (octet_length(email_handle) = 32),
  constraint recovery_answers_handle_claim_check check ((email_handle is null) = (handle_claimed_at is null)),
  constraint recovery_answers_question_1_check check (question_1 in ('pet', 'nickname', 'street')),
  constraint recovery_answers_question_2_check check (question_2 in ('pet', 'nickname', 'street')),
  constraint recovery_answers_question_order_check check (question_1 < question_2),
  constraint recovery_answers_answer_hash_1_check check (octet_length(answer_hash_1) = 32),
  constraint recovery_answers_answer_hash_2_check check (octet_length(answer_hash_2) = 32),
  constraint recovery_answers_answer_salt_1_check check (octet_length(answer_salt_1) = 16),
  constraint recovery_answers_answer_salt_2_check check (octet_length(answer_salt_2) = 16),
  constraint recovery_answers_salts_differ_check check (answer_salt_1 <> answer_salt_2),
  constraint recovery_answers_scrypt_log_n_check check (scrypt_log_n between 15 and 17),
  constraint recovery_answers_scrypt_r_check check (scrypt_r between 8 and 16),
  constraint recovery_answers_scrypt_p_check check (scrypt_p between 1 and 4)
);

create table nestly.recovery_throttles (
  subject_kind            text        not null,
  subject_hash            bytea       not null,
  short_window_started_at timestamptz,
  short_failures          smallint    not null default 0,
  long_window_started_at  timestamptz,
  long_failures           smallint    not null default 0,
  locked_until            timestamptz,
  limited_noted_until     timestamptz,
  constraint recovery_throttles_pkey primary key (subject_kind, subject_hash),
  constraint recovery_throttles_subject_kind_check check (subject_kind in ('handle', 'ip')),
  constraint recovery_throttles_subject_hash_check check (octet_length(subject_hash) = 32),
  constraint recovery_throttles_short_failures_check check (short_failures >= 0),
  constraint recovery_throttles_long_window_check check (long_window_started_at is null or subject_kind = 'handle'),
  constraint recovery_throttles_long_failures_check check (long_failures >= 0 and (subject_kind = 'handle' or long_failures = 0))
);

create table nestly.recovery_events (
  id          uuid        not null default gen_random_uuid(),
  kind        text        not null,
  user_id     uuid,
  handle_hash bytea       not null,
  ip_hash     bytea       not null,
  occurred_at timestamptz not null default now(),
  constraint recovery_events_pkey primary key (id),
  constraint recovery_events_user_id_fkey foreign key (user_id)
    references nestly.users (id) on delete restrict,
  constraint recovery_events_kind_check check (kind in (
    'answers_saved', 'answers_changed', 'change_failed', 'change_limited', 'reset_verified',
    'reset_completed', 'reset_failed', 'reset_limited', 'reset_admin_failed', 'reset_revoke_failed',
    'reset_email_mismatch', 'handle_released', 'handle_rekeyed')),
  constraint recovery_events_user_id_check check (user_id is not null or kind in ('reset_failed', 'reset_limited')),
  constraint recovery_events_handle_hash_check check (octet_length(handle_hash) = 32),
  constraint recovery_events_ip_hash_check check (octet_length(ip_hash) = 32)
);

-- 2. Index: serves the RESTRICT check when a users row is deleted (I9) and a per-account investigation.
create index recovery_events_user_id_idx on nestly.recovery_events (user_id) where user_id is not null;

-- 3. RLS on, and forced (platform rule 8).
alter table nestly.recovery_answers   enable row level security;
alter table nestly.recovery_answers   force  row level security;
alter table nestly.recovery_throttles enable row level security;
alter table nestly.recovery_throttles force  row level security;
alter table nestly.recovery_events    enable row level security;
alter table nestly.recovery_events    force  row level security;

-- 4. Helpers: what the transaction declared. Caller-free, SECURITY INVOKER, executable by app_recovery only. An unset or
--    empty setting is NULL, which equals nothing.
create function nestly.recovery_handle()
returns bytea
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.decode(nullif(pg_catalog.current_setting('nestly.recovery_handle', true), ''), 'hex')
$$;

create function nestly.recovery_ip()
returns bytea
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.decode(nullif(pg_catalog.current_setting('nestly.recovery_ip', true), ''), 'hex')
$$;

create function nestly.recovery_claimed_at()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('nestly.recovery_claimed_at', true), '')::pg_catalog.timestamptz
$$;

revoke execute on function nestly.recovery_handle() from public;
revoke execute on function nestly.recovery_ip()     from public;
revoke execute on function nestly.recovery_claimed_at() from public;
grant  execute on function nestly.recovery_handle() to app_recovery;
grant  execute on function nestly.recovery_ip()     to app_recovery;
grant  execute on function nestly.recovery_claimed_at() to app_recovery;

-- 5. Policies — nine.
create policy recovery_answers_select_own on nestly.recovery_answers
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy recovery_answers_insert_own on nestly.recovery_answers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy recovery_answers_update_own on nestly.recovery_answers
  for update to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()))
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy recovery_answers_select_recovery on nestly.recovery_answers
  for select to app_recovery
  using (email_handle = (select nestly.recovery_handle()));
-- The only way a handle changes hands without its owner: the declared handle, held under a claim OLDER than the declared
-- one, is set to NULL (released). The role cannot set a handle, touch a hash or delete a row. The statement that uses it
-- has no WHERE and no RETURNING (either would apply the SELECT policy to the new NULL row and fail).
create policy recovery_answers_release_recovery on nestly.recovery_answers
  for update to app_recovery
  using (email_handle = (select nestly.recovery_handle())
     and handle_claimed_at < (select nestly.recovery_claimed_at()))
  with check (email_handle is null and handle_claimed_at is null);

create policy recovery_throttles_select_recovery on nestly.recovery_throttles
  for select to app_recovery
  using ((subject_kind = 'handle' and subject_hash = (select nestly.recovery_handle()))
      or (subject_kind = 'ip'     and subject_hash = (select nestly.recovery_ip())));
create policy recovery_throttles_insert_recovery on nestly.recovery_throttles
  for insert to app_recovery
  with check ((subject_kind = 'handle' and subject_hash = (select nestly.recovery_handle()))
           or (subject_kind = 'ip'     and subject_hash = (select nestly.recovery_ip())));
create policy recovery_throttles_update_recovery on nestly.recovery_throttles
  for update to app_recovery
  using ((subject_kind = 'handle' and subject_hash = (select nestly.recovery_handle()))
      or (subject_kind = 'ip'     and subject_hash = (select nestly.recovery_ip())))
  with check ((subject_kind = 'handle' and subject_hash = (select nestly.recovery_handle()))
           or (subject_kind = 'ip'     and subject_hash = (select nestly.recovery_ip())));

-- The subquery sees at most the declared handle's answers row, through recovery_answers_select_recovery: an event is
-- attributed to the account that handle belongs to, or to nobody when it belongs to none.
create policy recovery_events_insert_recovery on nestly.recovery_events
  for insert to app_recovery
  with check (handle_hash = (select nestly.recovery_handle())
          and ip_hash = (select nestly.recovery_ip())
          and user_id is not distinct from (select ra.user_id from nestly.recovery_answers ra));

-- 6. Grants. Nothing to anon, service_role, app_jobs, app_server or PUBLIC. recovery_events has no SELECT for anyone,
--    so no statement may use RETURNING on it.
grant usage on schema nestly to app_recovery;

grant select (user_id, email_handle, handle_claimed_at, created_at) on table nestly.recovery_answers to authenticated;
grant insert (email_handle, handle_claimed_at, question_1, question_2, answer_hash_1, answer_salt_1, answer_hash_2, answer_salt_2,
              scrypt_log_n, scrypt_r, scrypt_p)
  on table nestly.recovery_answers to authenticated;
grant update (email_handle, handle_claimed_at, question_1, question_2, answer_hash_1, answer_salt_1, answer_hash_2, answer_salt_2,
              scrypt_log_n, scrypt_r, scrypt_p)
  on table nestly.recovery_answers to authenticated;

grant select on table nestly.recovery_answers to app_recovery;
grant update (email_handle, handle_claimed_at) on table nestly.recovery_answers to app_recovery;

grant select on table nestly.recovery_throttles to app_recovery;
grant insert (subject_kind, subject_hash) on table nestly.recovery_throttles to app_recovery;
grant update (short_window_started_at, short_failures, long_window_started_at, long_failures, locked_until,
              limited_noted_until)
  on table nestly.recovery_throttles to app_recovery;

grant insert (kind, user_id, handle_hash, ip_hash) on table nestly.recovery_events to app_recovery;

-- 7. Comments.
comment on table nestly.recovery_answers is
  'FR-AUTH-003, AC-092: one row per account, the two chosen recovery questions with salted scrypt hashes of the answers and the email handle. Personal data. Deleted with the account (ON DELETE CASCADE).';
comment on column nestly.recovery_answers.user_id is
  'The account. Set by the database (auth.uid()), never by the client (platform rules 12-13).';
comment on column nestly.recovery_answers.email_handle is
  'HMAC-SHA256(K_handle, lower(trim(email))) of the email claim of the token that made the most recent claim. A lookup key for the signed-out redeem, not an identity claim. NULL: released, no email finds this row. Released by a newer claim (recovery_answers_release_recovery) or re-keyed by its owner.';
comment on column nestly.recovery_answers.handle_claimed_at is
  'The iat (whole seconds, UTC) of the token whose email set email_handle. The later claim wins. NULL exactly when email_handle is NULL.';
comment on column nestly.recovery_answers.question_1 is
  'The first chosen question id: pet, nickname or street. Always sorts before question_2: one representation per pair.';
comment on column nestly.recovery_answers.question_2 is
  'The second chosen question id: pet, nickname or street. Always sorts after question_1.';
comment on column nestly.recovery_answers.answer_hash_1 is
  'scrypt(HMAC-SHA256(K_answer, question_id || 0x00 || normalised answer), salt) for question_1. Never readable by authenticated or anon; app_recovery reads it for the declared handle only.';
comment on column nestly.recovery_answers.answer_salt_1 is
  'Random 16-byte salt of answer_hash_1.';
comment on column nestly.recovery_answers.answer_hash_2 is
  'The same construction for question_2. Never readable by authenticated or anon.';
comment on column nestly.recovery_answers.answer_salt_2 is
  'Random 16-byte salt of answer_hash_2; differs from answer_salt_1.';
comment on column nestly.recovery_answers.scrypt_log_n is
  'log2 of scrypt N, 15 to 17: the database enforces N >= 2^15 and caps the memory of one verification at 128 MiB.';
comment on column nestly.recovery_answers.scrypt_r is
  'scrypt r, 8 to 16.';
comment on column nestly.recovery_answers.scrypt_p is
  'scrypt p, 1 to 4.';
comment on column nestly.recovery_answers.created_at is
  'First save. UTC. Later changes are dated in recovery_events.';

comment on table nestly.recovery_throttles is
  'NFR-SEC-001, AC-092: failure counters and lock state per email handle or per IP hash, unknown handles included. Operational state, no FK. Windows start at the first failure after the previous one expired and do not slide. Database clock.';
comment on column nestly.recovery_throttles.subject_kind is
  'handle (HMAC of the normalised email) or ip (HMAC of the client address; IPv6 by its /64).';
comment on column nestly.recovery_throttles.subject_hash is
  'The 32-byte keyed hash this row counts. Never the email or the address itself.';
comment on column nestly.recovery_throttles.short_window_started_at is
  'Start of the current short window (handle 30 min, IP 15 min). NULL: no failure is counted.';
comment on column nestly.recovery_throttles.short_failures is
  'Failures counted in the short window.';
comment on column nestly.recovery_throttles.long_window_started_at is
  'Start of the 24-hour window. Handles only.';
comment on column nestly.recovery_throttles.long_failures is
  'Failures counted in the 24-hour window. Handles only; 0 for an IP.';
comment on column nestly.recovery_throttles.locked_until is
  'While later than now(), every attempt on this subject is answered 429 with retry-after. A limited attempt changes no counter.';

comment on column nestly.recovery_throttles.limited_noted_until is
  'The locked_until value for which a limited event was already written: one limited event per subject per lock.';

comment on table nestly.recovery_events is
  'FR-ADMIN-005, AC-092: the recovery audit, one row per attempt and one outcome row after a verified reset. Append-only: no runtime role can read, update or delete it. Retention is undecided (§13.4, TBD).';
comment on column nestly.recovery_events.id is
  'Generated by the database.';
comment on column nestly.recovery_events.kind is
  'answers_saved, answers_changed, change_failed, change_limited, reset_verified, reset_completed, reset_failed, reset_limited, reset_admin_failed, reset_revoke_failed, reset_email_mismatch, handle_released or handle_rekeyed. After reset_verified exactly one of reset_completed, reset_admin_failed, reset_revoke_failed, reset_email_mismatch.';
comment on column nestly.recovery_events.user_id is
  'The account the handle belongs to, forced by the insert policy. NULL only for reset_failed and reset_limited on a handle with no account. For handle_released, the account that lost the handle. ON DELETE RESTRICT: the audit does not vanish as a side effect (I9, OP-028).';
comment on column nestly.recovery_events.handle_hash is
  'The declared email handle (keyed hash). Never the email.';
comment on column nestly.recovery_events.ip_hash is
  'The declared client address as a keyed hash. Never the address (criterion 12).';
comment on column nestly.recovery_events.occurred_at is
  'When the event was written: the database clock. Never granted.';

comment on index nestly.recovery_events_user_id_idx is
  'Serves the RESTRICT check when a users row is deleted (I9) and a per-account investigation. Rows without an account are not indexed.';
comment on constraint recovery_answers_email_handle_key on nestly.recovery_answers is
  'The redeem lookup, and one handle per account.';

comment on function nestly.recovery_handle() is
  'The email handle the current transaction declared with set_config(''nestly.recovery_handle'', hex, true). NULL when unset: matches no row. SECURITY INVOKER, executable by app_recovery only (FR-AUTH-003).';
comment on function nestly.recovery_claimed_at() is
  'The iat of the token making the current claim, declared with set_config(''nestly.recovery_claimed_at'', iso, true). NULL when unset: no handle is releasable. SECURITY INVOKER, executable by app_recovery only (FR-AUTH-003).';
comment on function nestly.recovery_ip() is
  'The IP hash the current transaction declared with set_config(''nestly.recovery_ip'', hex, true). NULL when unset: matches no row. SECURITY INVOKER, executable by app_recovery only (FR-AUTH-003).';

comment on policy recovery_answers_select_own on nestly.recovery_answers is
  'An active account reads its own row only, and only the granted columns: never a hash or a salt (DR-G2).';
comment on policy recovery_answers_insert_own on nestly.recovery_answers is
  'An active account saves its own answers once (the primary key refuses a second row).';
comment on policy recovery_answers_update_own on nestly.recovery_answers is
  'An active account replaces its own answers, and re-keys its own handle to its token''s email (the server orders claims by iat).';
comment on policy recovery_answers_release_recovery on nestly.recovery_answers is
  'app_recovery sets the declared handle to NULL when its holder''s claim is older than the declared one. Nothing else: no handle can be set, no hash touched (FR-AUTH-003).';
comment on policy recovery_answers_select_recovery on nestly.recovery_answers is
  'app_recovery reads the one row of the handle its transaction declares, and nothing else: no listing, no dump (FR-AUTH-003).';
comment on policy recovery_throttles_select_recovery on nestly.recovery_throttles is
  'app_recovery reads the throttle rows of the declared handle and the declared IP hash only.';
comment on policy recovery_throttles_insert_recovery on nestly.recovery_throttles is
  'app_recovery creates the rows of the declared handle and the declared IP hash only.';
comment on policy recovery_throttles_update_recovery on nestly.recovery_throttles is
  'app_recovery updates the counters of the declared handle and the declared IP hash only.';
comment on policy recovery_events_insert_recovery on nestly.recovery_events is
  'app_recovery appends an event for the declared handle and IP hash, attributed to the account of that handle (or to none), so a caller cannot attribute an event to another account. No SELECT: the audit cannot be read back.';
