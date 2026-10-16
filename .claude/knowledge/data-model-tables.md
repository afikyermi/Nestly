# Data model — as-built tables

**Maintained by:** DATA ARCHITECT, with `data-model.md`, of which this file is the per-table part: columns and the
per-table matrices of every built table, the write order and the RLS helper. The rules, layers, conventions and the list
of migrations stay in `data-model.md`; on any conflict, the migration in `supabase/migrations/` wins. Read it when a
task touches a built table.

---

| Column | Type · null · default | Meaning |
|---|---|---|
| `users.id` | uuid PK · default `auth.uid()` | the account id = the Supabase Auth user id (JWT sub); never set by the client |
| `users.account_type` | text · not null · no default | regular · professional · admin · moderator (SRS Role, §3, BR-016). Fixed at creation, never changes. The only source of account type (rule 14) |
| `users.status` | text · not null · no default | active · suspended · banned (FR-MOD-002, BR-024): whether the account may use the product now. A warning is not a status; suspension end dates belong to AccountEnforcement (later) |
| `users.created_at` | timestamptz · not null · `now()` | when the Nestly row was created, not the Auth sign-up |
| `regular_profiles.user_id` | uuid PK · default `auth.uid()` | the owning account, = `users.id` |
| `regular_profiles.account_type` | text · not null · default `'regular'` · CHECK = `'regular'` | with the composite FK, only a Regular account can hold a profile (BR-016, layer 2) |
| `regular_profiles.full_name` | text · not null | VAL-001: CHECK `char_length(btrim(full_name))` between 2 and 60 (SRS 2.12, decided 13.10.2026); char_length counts code points |
| `regular_profiles.gender` | text · null | VAL-006 (OP-004 closed): woman · man · other · prefer_not_to_say. NULL = not answered; prefer_not_to_say is an answer |
| `regular_profiles.created_at` | timestamptz · not null · `now()` | row creation |
| `journey_contexts.id` | uuid PK · `gen_random_uuid()` | stable handle for later references (trackers, I6) |
| `journey_contexts.user_id` | uuid · not null · `auth.uid()` | the owning Regular account (rule 12) |
| `journey_contexts.stage` | text · not null · no default | VAL-039: planning · pregnant · has_child. At most one row per stage per user; planning never together with pregnant |
| `journey_contexts.due_date` | date · null | estimated due date (§13, health-related). CHECK: only on a pregnant journey. NULL = not given. The window around today is server only (clock-dependent) |
| `journey_contexts.created_at` | timestamptz · not null · `now()` | row creation |
| `children.id` | uuid PK · `gen_random_uuid()` | the child's row id |
| `children.user_id` | uuid · not null · `auth.uid()` | the parent, the owner (rule 12) |
| `children.slot` | smallint · not null | the child's position in the parent's list, CHECK 1–10 (VAL-040). Means nothing beyond order and the limit; not data about the child |
| `children.name` | text · not null | CHECK `char_length(btrim(name))` between 1 and 60 — same counting as VAL-001 |
| `children.sex` | text · not null | VAL-006: boy · girl · unknown. Required |
| `children.birth_date` | date · not null | CHECK ≥ 1900-01-01. "Not in the future" (VAL-005) is server only (clock-dependent) |
| `children.created_at` | timestamptz · not null · `now()` | row creation |
| `legal_consents.id` | uuid PK · `gen_random_uuid()` | the acceptance event's id |
| `legal_consents.user_id` | uuid · not null · `auth.uid()` | the account that accepted — any account type (FR-PROREG-002 reuses it) |
| `legal_consents.terms_version` | text · not null | the Terms of Use version accepted, CHECK 1–64 chars. From the server's constant, never the client (AC-084) — enforced by the server; the database cannot know where a string came from |
| `legal_consents.privacy_version` | text · not null | the Privacy Policy version accepted; same check and source |
| `legal_consents.has_declared_18_plus` | boolean · not null | the 18+ declaration was made in this acceptance (BR-068). CHECK = true: a row without it cannot exist |
| `legal_consents.accepted_at` | timestamptz · not null · `now()` | when the user accepted: the database clock. Never granted; the insert policy refuses any value but `now()` |
| `recovery_answers.user_id` | uuid PK · default `auth.uid()` | the account (rules 12–13) |
| `recovery_answers.email_handle` | bytea · null · UNIQUE · CHECK 32 bytes | HMAC-SHA256(K_handle, lower(trim(email))) of the email claim of the token that made the most recent claim. A lookup key for the signed-out redeem, never an identity claim (rule 14). NULL = released: no email finds the row. Released by a newer claim or re-keyed by its owner |
| `recovery_answers.handle_claimed_at` | timestamptz · null | the `iat` (whole seconds, UTC) of the token whose email set the handle; the later claim wins. CHECK: NULL exactly when `email_handle` is NULL |
| `recovery_answers.question_1`, `question_2` | text · not null | the chosen pair: pet · nickname · street. CHECK `question_1 < question_2` — one representation per pair, never the same id twice |
| `recovery_answers.answer_hash_1`, `answer_hash_2` | bytea · not null · CHECK 32 bytes | scrypt(HMAC-SHA256(K_answer, question_id ‖ 0x00 ‖ normalised answer), salt) — binds the question id. Never readable by `authenticated` or `anon` |
| `recovery_answers.answer_salt_1`, `answer_salt_2` | bytea · not null · CHECK 16 bytes · CHECK the two differ | random salt per answer |
| `recovery_answers.scrypt_log_n` · `scrypt_r` · `scrypt_p` | smallint · not null | scrypt parameters, CHECK log_n 15–17 (N ≥ 2^15, ≤ 128 MiB per verification), r 8–16, p 1–4 |
| `recovery_answers.created_at` | timestamptz · not null · `now()` | first save. Never granted; changes are dated in `recovery_events` |
| `recovery_throttles.subject_kind` | text · not null | handle · ip. PK part 1 |
| `recovery_throttles.subject_hash` | bytea · not null · CHECK 32 bytes | the email handle (known or not) or HMAC-SHA256(K_ip, client IP; IPv6 by its /64). PK part 2. Never the email or the address |
| `recovery_throttles.short_window_started_at` | timestamptz · null | start of the short window (handle 30 min · IP 15 min). NULL = no failure counted. Windows start at the first failure after the last expired; they do not slide |
| `recovery_throttles.short_failures` | smallint · not null · 0 · CHECK ≥ 0 | failures in the short window |
| `recovery_throttles.long_window_started_at` | timestamptz · null | start of the 24-hour window. CHECK: handles only |
| `recovery_throttles.long_failures` | smallint · not null · 0 | failures in the 24-hour window. CHECK ≥ 0, and 0 for an IP |
| `recovery_throttles.locked_until` | timestamptz · null | while later than `now()`, every attempt on the subject is answered 429. A limited attempt changes no counter |
| `recovery_throttles.limited_noted_until` | timestamptz · null | the `locked_until` for which a limited event was already written: one limited event per subject per lock |
| `recovery_events.id` | uuid PK · `gen_random_uuid()` | |
| `recovery_events.kind` | text · not null | answers_saved · answers_changed · change_failed · change_limited · reset_verified · reset_completed · reset_failed · reset_limited · reset_admin_failed · reset_revoke_failed · reset_email_mismatch · handle_released · handle_rekeyed. After reset_verified exactly one of reset_completed, reset_admin_failed, reset_revoke_failed, reset_email_mismatch. Chosen by the server |
| `recovery_events.user_id` | uuid · null | the account the declared handle belongs to, forced by the insert policy. CHECK: NULL only for reset_failed and reset_limited (a handle with no account). For handle_released, the account that lost the handle |
| `recovery_events.handle_hash` | bytea · not null · CHECK 32 bytes | the declared handle. Never the email |
| `recovery_events.ip_hash` | bytea · not null · CHECK 32 bytes | the declared client address, keyed hash. Never the address |
| `recovery_events.occurred_at` | timestamptz · not null · `now()` | the database clock. Never granted |

| | `users` | `regular_profiles` |
|---|---|---|
| Purpose | SRS User (§13) — one person's Nestly account. The anchor: the only product table that references auth.users | SRS RegularProfile (§13) — a Regular parent's own FR-REG-002 fields, 1:1 with a regular account |
| Not stored | email and login details (stay in auth.users; BR-045 uniqueness is Auth's); no password or hash (NFR-SEC-001). A copy of another user's email would be denormalization → `DECISION REQUEST` | stage and due date (`journey_contexts`), children (`children`) |
| Owner | the person; `id` is `auth.uid()`, set by the database (rules 12–13) | the Regular account; `user_id` is `auth.uid()`, set by the database (rule 12) |
| Authorization | RLS + FORCE. `users_select_own` — authenticated reads its own row (`id = auth.uid()`) **in every status** (F1.5 DR-1 A, migration 20261015100000). Seeing the own row does **not** mean the account is active: code or a policy that needs "is the caller active" uses `(select nestly.is_active_account())`, never `exists (select 1 from nestly.users …)`. A suspended or banned account still reads zero rows of every other table (rule 15). `users_insert_own` (F1.4) — creates only its own row (`id = auth.uid()`), only as account_type 'regular' and status 'active' (rule 14; professional registration widens it in its own Gate 2); no status gate at insert, the row does not exist yet. Grants: USAGE on nestly and SELECT → authenticated only; INSERT on (account_type, status) only — id and created_at always default. No UPDATE or DELETE grant or policy. I2's UPDATE will be column-level, excluding account_type and status | RLS + FORCE. `regular_profiles_select_own` — authenticated reads its own row, only while `(select nestly.is_active_account())`. `regular_profiles_insert_own` (F1.4) — own row only, under the same gate, so the users row must be inserted first in the same transaction. Grants: SELECT → authenticated only; INSERT on (full_name, gender) only — user_id, account_type and created_at always default. No UPDATE or DELETE grant or policy |
| Relations | `users_id_fkey` (id) → auth.users (id) ON DELETE RESTRICT — the anchor FK above, bootstrap step 2, added by postgres. Referenced by regular_profiles through `users_id_account_type_key` UNIQUE (id, account_type), and by legal_consents (ON DELETE RESTRICT) | `regular_profiles_user_fkey` (user_id, account_type) → users (id, account_type) ON DELETE CASCADE — the profile is part of the account. Referenced by journey_contexts and children (ON DELETE CASCADE). Ids never update |
| Indexes | `users_pkey` (id) — every policy and is_active_account() look up by id. `users_id_account_type_key` — target of the subtype FK; one extra small btree per insert, accepted. None on status: no query filters by it yet | `regular_profiles_pkey` (user_id) — own-row reads, and the cascade lookup from users |
| Retention | no deleted_at. Hard delete only through the orderly deletion flow (I9, OP-028); RESTRICT blocks deleting the Auth user while this row exists, and a legal_consents row blocks deleting this one. Retention periods: §13.4 TBD | goes with its users row (cascade); OP-028 direction: deleted in full. §13.4 TBD |

| | `journey_contexts` | `children` | `legal_consents` |
|---|---|---|---|
| Purpose | SRS JourneyContext (§13, VAL-039) — one row per stage the parent ticked at registration | SRS Child (§13) — minors' data: exactly name, sex and birth date, plus mechanics | SRS LegalConsent (§13, FR-REG-004, BR-068) — one row per acceptance event holding the full set accepted; the latest row is the current consent state |
| Not stored | §13's "active status" (undecided, OP-003 / I6) and the "מחזור וביוץ" type (not in VAL-039); no link between a has_child journey and the children | nothing about a child beyond the three fields — no photo, nickname or id number; birthday visibility is its own entity, later | no per-document rows: one checkbox accepts all three together |
| Owner | the Regular account; `user_id` is `auth.uid()`, set by the database (rule 12) | the parent; same | the accepting account, any type; same |
| Authorization | RLS + FORCE. `journey_contexts_select_own`, `journey_contexts_insert_own` — own rows only, while `(select nestly.is_active_account())`. Grants: SELECT; INSERT on (stage, due_date) → authenticated only. No UPDATE or DELETE grant or policy | RLS + FORCE. `children_select_own`, `children_insert_own` — same shape. Grants: SELECT; INSERT on (slot, name, sex, birth_date) → authenticated only. No UPDATE or DELETE grant or policy | RLS + FORCE. `legal_consents_select_own`, `legal_consents_insert_own` — same shape; the insert also requires `accepted_at = now()`. Grants: SELECT; INSERT on (terms_version, privacy_version, has_declared_18_plus) → authenticated only. Append-only: no UPDATE or DELETE for any runtime role, the owner included |
| Relations | `journey_contexts_user_id_fkey` (user_id) → regular_profiles (user_id) ON DELETE CASCADE — part of the parent's account | `children_user_id_fkey` (user_id) → regular_profiles (user_id) ON DELETE CASCADE — only a Regular account holds children (BR-016) | `legal_consents_user_id_fkey` (user_id) → users (id) ON DELETE RESTRICT — whether a consent outlives the account is a legal retention question (§13.4, Afik); the deletion flow must handle consents before the account |
| Indexes | `journey_contexts_pkey` (id). `journey_contexts_user_id_stage_key` UNIQUE (user_id, stage) — one journey per stage; serves own-row reads and the cascade lookup. Partial unique `journey_contexts_user_id_planning_pregnant_key` (user_id) WHERE stage in (planning, pregnant) — VAL-039 held by the database. No separate user_id index | `children_pkey` (id). `children_user_id_slot_key` UNIQUE (user_id, slot) — with the slot CHECK, the ≤ 10 limit, concurrency-safe; serves own reads by slot and the cascade lookup | `legal_consents_pkey` (id). `legal_consents_user_id_versions_key` UNIQUE (user_id, terms_version, privacy_version) — a version pair is never recorded twice; a re-consent is a new row; serves own reads and the RESTRICT check |
| Retention | no deleted_at; goes with the profile (cascade); OP-028 direction: deleted in full. §13.4 TBD | same | no deleted_at; never changes; RESTRICT blocks deleting the account while a row exists. §13.4 TBD (legal, Afik) |

No index on stage, birth_date, due_date or accepted_at: no query filters or sorts by them across users yet. Each new
btree is written once per row, at registration — accepted.

**Write order** (rule 11), one identity transaction: users → regular_profiles → journey_contexts → children (slots 1..n
in entry order) → legal_consents. Every status gate reads the users row inserted earlier in the same transaction; any
failure rolls back the whole account. The repository inserts only through the `*Insert` write models in
`apps/server/src/db/schema.ts` ("Write grants").

Helper: `nestly.is_active_account()` — true when the caller's own account exists and is active (rule 15). SECURITY
INVOKER, caller only; checks `id = auth.uid()` and `status` itself rather than trusting the `users` policy.

| | `recovery_answers` | `recovery_throttles` | `recovery_events` |
|---|---|---|---|
| Purpose | FR-AUTH-003, AC-092 — one row per account: the chosen pair of recovery questions, the salted answer hashes and the email handle | NFR-SEC-001, AC-092 — failure counters and lock state per email handle or per IP hash, unknown handles included | FR-ADMIN-005, AC-092 — the recovery audit: one row per attempt and one outcome row after a verified reset |
| Not stored | no plaintext or normalised answer; no email (only the keyed handle); no IP | no email, no address — keyed hashes only; no per-request history | no answer, password, email, token or IP; not the count of requests during a lock |
| Owner | the account; `user_id` is `auth.uid()`, set by the database (rule 12) | none: operational state keyed by hashes | none set by a client; `user_id` is forced by the insert policy to the declared handle's account, or NULL |
| Authorization | RLS + FORCE. `recovery_answers_select_own` / `_insert_own` / `_update_own` — authenticated, own row only, while `(select nestly.is_active_account())`. `recovery_answers_select_recovery` — app_recovery reads the declared handle's row only. `recovery_answers_release_recovery` — app_recovery UPDATE only where the handle is the declared one and `handle_claimed_at < nestly.recovery_claimed_at()`; WITH CHECK both columns NULL. Grants: authenticated SELECT on (user_id, email_handle, handle_claimed_at, created_at); INSERT and UPDATE on (email_handle, handle_claimed_at, question_1, question_2, the hashes, the salts, the scrypt parameters). app_recovery SELECT; UPDATE on (email_handle, handle_claimed_at). DELETE: only `recovery_answers_delete_clear` (F2.0 D1) — authenticated, own row, while the own identity link check is pending, no status gate; table-level DELETE grant to authenticated | RLS + FORCE. `recovery_throttles_{select,insert,update}_recovery` — app_recovery, only rows of the declared handle or the declared IP hash. Grants: app_recovery SELECT; INSERT on (subject_kind, subject_hash); UPDATE on the five counter/lock columns and limited_noted_until. Nothing to authenticated. No DELETE grant or policy | RLS + FORCE. `recovery_events_insert_recovery` — app_recovery; WITH CHECK handle_hash and ip_hash are the declared ones and user_id is not distinct from the declared handle's row. Not the three F2.0 subject-bound kinds: `recovery_events_insert_subject` — app_recovery; takeover_cleared, password_set_forced, first_password_set for the declared handle and IP, user_id = `recovery_subject()` or NULL; unique `recovery_events_takeover_cleared_key` (user_id) WHERE kind = 'takeover_cleared'. Grant: INSERT on (kind, user_id, handle_hash, ip_hash). No SELECT for any role (so no RETURNING), no UPDATE or DELETE: append-only (rule 18 exception) |
| Relations | `recovery_answers_user_id_fkey` (user_id) → users (id) ON DELETE CASCADE — part of the account | none: rows exist for hashes with no account | `recovery_events_user_id_fkey` (user_id) → users (id) ON DELETE RESTRICT — the audit does not vanish as a side effect (I9, OP-028) |
| Indexes | `recovery_answers_pkey` (user_id) — own-row reads and the cascade. `recovery_answers_email_handle_key` UNIQUE — the redeem lookup, the release and the re-key, one handle per account; one extra btree write per save | `recovery_throttles_pkey` (subject_kind, subject_hash) — the only access path | `recovery_events_pkey` (id). `recovery_events_user_id_idx` (user_id) WHERE user_id IS NOT NULL — the RESTRICT check on a users delete and a per-account investigation; one btree write per attempt. None on handle_hash, ip_hash or occurred_at: nothing reads them yet |
| Retention | no deleted_at; goes with the account (cascade). §13.4 TBD | disposable once the lock and both windows have passed; the purge job waits for the first job infrastructure (debt) | append-only, every row kept until audit retention is decided (§13.4 TBD, an OP to open); RESTRICT blocks deleting the account while a row exists |

**Recovery write order** (rule 11; lock order IP, then handle, on every path). Store (`POST`), one identity transaction:
as app_recovery, declare handle, IP and claimed_at, `select … for update` with no WHERE → if a releasable holder came
back, `handle_released` first, then the release UPDATE with no WHERE and no RETURNING → as authenticated, insert the own
row → `answers_saved` as app_recovery. Re-key (`GET /api/me` in a separate transaction after the body is built; `PUT`
at its start): the same release steps, then the own-row UPDATE where the claim is NULL or older, then `handle_rekeyed`.
Attempt (`guardedAttempt`, redeem and change): IP throttle row insert-on-conflict then FOR UPDATE → if locked, the one
limited event of the lock, stop → handle row the same → read the answers row → two scrypts → on a mismatch, count on IP then
handle and append the failed event. Change on a match: own-row UPDATE as authenticated, then `answers_changed`. Redeem on a
match: `reset_verified` commits before the Auth calls; the outcome row is a second transaction. `recovery_events` has no
SELECT, so no statement uses RETURNING on it.

Helpers: `nestly.recovery_handle()`, `nestly.recovery_ip()`, `nestly.recovery_claimed_at()` — what the transaction
declared with `set_config('nestly.recovery_handle' | 'nestly.recovery_ip' | 'nestly.recovery_claimed_at', …, true)`; unset
or empty is NULL and matches no row. SECURITY INVOKER, caller-free, EXECUTE to app_recovery only.

**`nestly.identity_link_checks`** (I2 F2.0, FR-AUTH-005, S-01; migration `20261016100000`, `.work/account-takeover-close/schema.md`)

| Column | Type · null · default | Meaning |
|---|---|---|
| `user_id` | uuid PK · default `auth.uid()` | the Auth user (no FK: an Auth user with no users row has a verdict too, c9) |
| `verdict` | text · not null · CHECK unaffected / affected | decided once from the caller's Auth identities: affected = an email identity older than the google one |
| `checked_at` | timestamptz · not null · `now()` | when the verdict was written |
| `checked_session_id` | uuid · not null | the session_id claim of the oauth session that wrote it (insert policy: the caller's own) |
| `cleared_at` | timestamptz · null | the clear completed (trigger: now()). NULL on an affected row = pending |
| `clearing_session_id` | uuid · null | the session that completed the clear (trigger); NULL exactly when `cleared_at` is |
| `password_set_at` | timestamptz · null | the new password after the clear (c7 forced, or c11 with no users row); only after `cleared_at` |

Purpose: one row per Auth user, written on its first request from a Google session after F2.0; state unaffected · pending ·
must_set · done. Not stored: no password, answer, email, token or provider id. Owner: `auth.uid()` by default. Authorization:
RLS + FORCE; `identity_link_checks_select_own`, `_insert_own` (oauth session, own session id), `_update_own` — authenticated,
own row, no status gate; the trigger `identity_link_checks_transition` (SECURITY INVOKER) allows only the clear and the password
set, anything else 42501; no DELETE. Grants: authenticated SELECT; INSERT (verdict, checked_session_id); UPDATE (cleared_at,
password_set_at). Nothing to anon, app_recovery, app_jobs or PUBLIC. Relations: none (the I9 deletion flow deletes the row).
Indexes: the PK serves the guard (one initplan per statement). Retention: kept with the Auth user; §13.4 TBD.
Helpers: `jwt_session_id()`, `jwt_issued_at()`, `jwt_is_oauth()`, `session_guard()` (authenticated), `recovery_subject()`
(app_recovery) — SECURITY INVOKER, caller-free; `is_active_account()` = an active own users row and a guard of ok or must_set.
Clear write order: tx 1 insert `affected` + `delete from recovery_answers` (no WHERE, no RETURNING; policy
`recovery_answers_delete_clear`); tx 2 `select … for update nowait`, Auth cancel and sign-out of other sessions, `update … set
cleared_at where cleared_at is null returning`, `takeover_cleared` as app_recovery (unique `recovery_events_takeover_cleared_key`).

A new entity adds its columns to the first table — field, type, and its meaning, which is the part that matters — and
fills every row of the second: purpose in one line; what is not stored; owner, and how that is established;
authorization — who may read, write and delete, and where that rule is enforced; relations, with cascade behaviour;
indexes, each with the query it serves; retention — soft or hard delete, and what is retained after.
