# Data model — as-built tables

## Table index

Read only affected tables and the dependencies named below, plus the shared platform rules via
[data-model Read map](data-model.md#read-map). Search headings and read bounded ranges; this index
does not instruct loading every link. Column sections and rule matrices are both part of a table contract.

| Tables | Columns / rules and dependencies |
|---|---|
| users, regular_profiles | Columns: users / regular_profiles; Rules: users and regular_profiles; identity link checks for session gate |
| journey_contexts, children, legal_consents | Their Columns sections; Rules: journeys, children and consents; Registration and journey writes (profile lock) |
| recovery_answers, recovery_throttles, recovery_events | Their Columns sections; Rules: recovery; Identity link checks for takeover |
| identity_link_checks | Identity link checks; Rules: recovery; users/session guard |
| friendships, regular_names | Friendships and regular names; users/regular_profiles FKs; Cross-user profile read |
| security_limits, profile_open_counts, security_events | Profile open limits and security events; Cross-user profile read |
| notifications, notification_preferences, friend_content_notification_preferences, people_search_counts | Notifications and People Search; Profile open limits and security events (the limit pattern); Friendships and regular names |
| profile_view consumers | Cross-user profile read plus the affected input/output table sections above |
| staff_roles, moderator_permissions, audit_log, report_reasons, user_enforcements | Safety and admin core |

| tracker_events, cycle_entries, status_guides | Trackers, cycle and status guides (I6); children for the child FK |
| media_assets, profile_photos, stories, media_training_samples, media_training_events | Media and Stories (I5); posts and post_authors (attach), friendships (Story audience), Safety and admin core (CONTENT_MODERATE, audit) |
| Schema changes | Migration and rollback map; New entity template; affected consumer/cleanup order |


**Maintained by:** DATA ARCHITECT, with `data-model.md`, of which this file is the per-table part: columns and the
per-table matrices of every built table, the write order, the RLS helpers and the list of migrations with their down scripts.
The rules, layers, conventions and approved exceptions stay in `data-model.md`; on any conflict, the migration in
`supabase/migrations/` wins. Use the index when a task touches a built table; migrations prove the as-built, the SRS defines required behaviour.

---

## Migration and rollback map

**Migrations.** Built by `supabase/migrations/20261014100000_identity_schema.sql` (I1 F1.1 part b) and bootstrap step 2, `20261014200000_registration_account.sql`
(F1.4; `.work/register-account-create/`), `20261015200000_recovery_questions.sql` (F1.6; `.work/password-recovery/`), `20261016100000_identity_link_checks.sql`
(I2 F2.0; `.work/account-takeover-close/`; the guard is in `is_active_account()`), `20261017100000_regular_profiles_update_own.sql` (F2.1; `.work/profile-view-edit/`),
`20261017120000_profile_privacy.sql` (F2.3a; `.work/profile-privacy/`), `20261017110000_children_update_own.sql`, `20261017140000_journey_due_date_update.sql`,
`20261017141000_journeys_children_delete_own.sql` (F2.2a, b1, b2; `.work/journeys-children/`), `20261017150000_profile_view.sql` (F2.3b; `.work/profile-privacy/`;
no table change), `20261017160000_friendships.sql` (F2.4a; `.work/friends/`), and `20261017170000_profile_open_limit.sql` (F2.4c1; `.work/friends/`). Down scripts in `supabase/rollback/`,
in order: F2.4c1's refuses while `security_events` holds a row (lifts FORCE RLS on it inside its own transaction), restores F2.3b's `profile_view` text
verbatim, drops its two policies on `friendships` / `regular_names` and its three tables, and deletes only its own history row; F2.4a's refuses while
`friendships` holds a row (lifts FORCE RLS on it inside its own transaction; `regular_names` is derived and dropped with it); F2.3a's refuses while
any profile holds a non-default privacy setting (it lifts FORCE RLS inside its own transaction so the check sees every row); F2.0's while `identity_link_checks` or an
F2.0 event holds a row; F1.6's while `recovery_answers` or `recovery_events` holds a row; F1.4's while any of its three tables holds a row; F1.1's while `nestly.legal_consents`
exists (safe only while `users` is empty); F2.1's, F2.2's and F2.3b's touch no row (F2.3b's drops `profile_view`, its four policies and two helpers; F2.3a's
settings stay). Writes: per column (`data-model.md` "Write grants") — F1.4's create path is INSERT only; UPDATE on `recovery_answers`, `recovery_throttles` (F1.6),
`identity_link_checks` (F2.0, by trigger), `friendships` (F2.4a, a party's row, by trigger), `profile_open_counts` (F2.4c1, only inside `profile_view`, own row), and, own row while active, `regular_profiles` (F2.1, F2.3a), `children` (F2.2a), `journey_contexts` (F2.2b: due_date, pregnant only);
DELETE: `recovery_answers_delete_clear` (F2.0 D1) and own `children` and `journey_contexts`, hard (F2.2b). After registration, every write that adds or deletes a child or journey first locks the
own `regular_profiles` row FOR NO KEY UPDATE. No DELETE on `friendships` or `regular_names` for any runtime role; `security_events` is INSERT only, inside `profile_view`. All fourteen tables are in `nestly`.

## Columns: users

| Column | Type · null · default | Meaning |
|---|---|---|
| `users.id` | uuid PK · default `auth.uid()` | the account id = the Supabase Auth user id (JWT sub); never set by the client |
| `users.account_type` | text · not null · no default | regular · professional · admin · moderator (SRS Role, §3, BR-016). Fixed at creation, never changes. The only source of account type (rule 14) |
| `users.status` | text · not null · no default | active · suspended · banned (FR-MOD-002, BR-024): whether the account may use the product now. A warning is not a status; suspension end dates belong to AccountEnforcement (later) |
| `users.created_at` | timestamptz · not null · `now()` | when the Nestly row was created, not the Auth sign-up |

## Columns: regular_profiles

| Column | Type · null · default | Meaning |
|---|---|---|
| `regular_profiles.user_id` | uuid PK · default `auth.uid()` | the owning account, = `users.id` |
| `regular_profiles.account_type` | text · not null · default `'regular'` · CHECK = `'regular'` | with the composite FK, only a Regular account can hold a profile (BR-016, layer 2) |
| `regular_profiles.full_name` | text · not null | VAL-001: CHECK `char_length(btrim(full_name))` between 2 and 60 (SRS 2.12, decided 13.10.2026); char_length counts code points |
| `regular_profiles.gender` | text · null | VAL-006 (OP-004 closed): woman · man · other · prefer_not_to_say. NULL = not answered; prefer_not_to_say is an answer |
| `regular_profiles.profile_visibility` | text · not null · default `'open'` · CHECK open / restricted | FR-PRIV-001, §1.4: whether a non-Friend sees the full profile or only the Basic Public Profile. Never hides the account from People Search (VAL-027). Default Afik's (I2 questionnaire 1). F2.3a |
| `regular_profiles.is_empty_journey_sentence_shown` | boolean · not null · default true | §1.4, OP-021: whether the Journey Summary sentence for no children and no pregnancy is shown. F2.3a |
| `regular_profiles.is_child_birthday_shared` | boolean · not null · default true | SRS ChildBirthdayVisibility (§13, BR-037): one switch per parent; a child's birthday in notifications to Friends. Stored only; nothing reads it before I7. F2.3a |
| `regular_profiles.created_at` | timestamptz · not null · `now()` | row creation |

## Columns: journey_contexts

| Column | Type · null · default | Meaning |
|---|---|---|
| `journey_contexts.id` | uuid PK · `gen_random_uuid()` | stable handle for later references (trackers, I6) |
| `journey_contexts.user_id` | uuid · not null · `auth.uid()` | the owning Regular account (rule 12) |
| `journey_contexts.stage` | text · not null · no default | VAL-039: planning · pregnant · has_child. At most one row per stage per user; planning never together with pregnant |
| `journey_contexts.due_date` | date · null | estimated due date (§13, health-related). CHECK: only on a pregnant journey. NULL = not given; the owner may set or clear it later (F2.2b). The −30..+300-day window around today is server only (VAL-044, clock-dependent) |
| `journey_contexts.created_at` | timestamptz · not null · `now()` | row creation |

## Columns: children

| Column | Type · null · default | Meaning |
|---|---|---|
| `children.id` | uuid PK · `gen_random_uuid()` | the child's row id |
| `children.user_id` | uuid · not null · `auth.uid()` | the parent, the owner (rule 12) |
| `children.slot` | smallint · not null | one of the parent's ten seats, CHECK 1–10 (VAL-040); with `children_user_id_slot_key` it holds the limit. A freed seat is reused by the next add (lowest free). **Not the display order** — that is `created_at`, then `slot` (F2.2b). Not data about the child |
| `children.name` | text · not null | CHECK `char_length(btrim(name))` between 1 and 60 — same counting as VAL-001 |
| `children.sex` | text · not null | VAL-006: boy · girl · unknown. Required |
| `children.birth_date` | date · not null | CHECK ≥ 1900-01-01. "Not in the future" (VAL-005) is server only (clock-dependent) |
| `children.created_at` | timestamptz · not null · `now()` | row creation |

## Columns: legal_consents

| Column | Type · null · default | Meaning |
|---|---|---|
| `legal_consents.id` | uuid PK · `gen_random_uuid()` | the acceptance event's id |
| `legal_consents.user_id` | uuid · not null · `auth.uid()` | the account that accepted — any account type (FR-PROREG-002 reuses it) |
| `legal_consents.terms_version` | text · not null | the Terms of Use version accepted, CHECK 1–64 chars. From the server's constant, never the client (AC-084) — enforced by the server; the database cannot know where a string came from |
| `legal_consents.privacy_version` | text · not null | the Privacy Policy version accepted; same check and source |
| `legal_consents.has_declared_18_plus` | boolean · not null | the 18+ declaration was made in this acceptance (BR-068). CHECK = true: a row without it cannot exist |
| `legal_consents.accepted_at` | timestamptz · not null · `now()` | when the user accepted: the database clock. Never granted; the insert policy refuses any value but `now()` |

## Columns: recovery_answers

| Column | Type · null · default | Meaning |
|---|---|---|
| `recovery_answers.user_id` | uuid PK · default `auth.uid()` | the account (rules 12–13) |
| `recovery_answers.email_handle` | bytea · null · UNIQUE · CHECK 32 bytes | HMAC-SHA256(K_handle, lower(trim(email))) of the email claim of the token that made the most recent claim. A lookup key for the signed-out redeem, never an identity claim (rule 14). NULL = released: no email finds the row. Released by a newer claim or re-keyed by its owner |
| `recovery_answers.handle_claimed_at` | timestamptz · null | the `iat` (whole seconds, UTC) of the token whose email set the handle; the later claim wins. CHECK: NULL exactly when `email_handle` is NULL |
| `recovery_answers.question_1`, `question_2` | text · not null | the chosen pair: pet · nickname · street. CHECK `question_1 < question_2` — one representation per pair, never the same id twice |
| `recovery_answers.answer_hash_1`, `answer_hash_2` | bytea · not null · CHECK 32 bytes | scrypt(HMAC-SHA256(K_answer, question_id ‖ 0x00 ‖ normalised answer), salt) — binds the question id. Never readable by `authenticated` or `anon` |
| `recovery_answers.answer_salt_1`, `answer_salt_2` | bytea · not null · CHECK 16 bytes · CHECK the two differ | random salt per answer |
| `recovery_answers.scrypt_log_n` · `scrypt_r` · `scrypt_p` | smallint · not null | scrypt parameters, CHECK log_n 15–17 (N ≥ 2^15, ≤ 128 MiB per verification), r 8–16, p 1–4 |
| `recovery_answers.created_at` | timestamptz · not null · `now()` | first save. Never granted; changes are dated in `recovery_events` |

## Columns: recovery_throttles

| Column | Type · null · default | Meaning |
|---|---|---|
| `recovery_throttles.subject_kind` | text · not null | handle · ip. PK part 1 |
| `recovery_throttles.subject_hash` | bytea · not null · CHECK 32 bytes | the email handle (known or not) or HMAC-SHA256(K_ip, client IP; IPv6 by its /64). PK part 2. Never the email or the address |
| `recovery_throttles.short_window_started_at` | timestamptz · null | start of the short window (handle 30 min · IP 15 min). NULL = no failure counted. Windows start at the first failure after the last expired; they do not slide |
| `recovery_throttles.short_failures` | smallint · not null · 0 · CHECK ≥ 0 | failures in the short window |
| `recovery_throttles.long_window_started_at` | timestamptz · null | start of the 24-hour window. CHECK: handles only |
| `recovery_throttles.long_failures` | smallint · not null · 0 | failures in the 24-hour window. CHECK ≥ 0, and 0 for an IP |
| `recovery_throttles.locked_until` | timestamptz · null | while later than `now()`, every attempt on the subject is answered 429. A limited attempt changes no counter |
| `recovery_throttles.limited_noted_until` | timestamptz · null | the `locked_until` for which a limited event was already written: one limited event per subject per lock |

## Columns: recovery_events

| Column | Type · null · default | Meaning |
|---|---|---|
| `recovery_events.id` | uuid PK · `gen_random_uuid()` | |
| `recovery_events.kind` | text · not null | answers_saved · answers_changed · change_failed · change_limited · reset_verified · reset_completed · reset_failed · reset_limited · reset_admin_failed · reset_revoke_failed · reset_email_mismatch · handle_released · handle_rekeyed. After reset_verified exactly one of reset_completed, reset_admin_failed, reset_revoke_failed, reset_email_mismatch. Chosen by the server |
| `recovery_events.user_id` | uuid · null | the account the declared handle belongs to, forced by the insert policy. CHECK: NULL only for reset_failed and reset_limited (a handle with no account). For handle_released, the account that lost the handle |
| `recovery_events.handle_hash` | bytea · not null · CHECK 32 bytes | the declared handle. Never the email |
| `recovery_events.ip_hash` | bytea · not null · CHECK 32 bytes | the declared client address, keyed hash. Never the address |
| `recovery_events.occurred_at` | timestamptz · not null · `now()` | the database clock. Never granted |

## Rules: users and regular_profiles

| | `users` | `regular_profiles` |
|---|---|---|
| Purpose | SRS User (§13) — one person's Nestly account. The anchor: the only product table that references auth.users | SRS RegularProfile (§13) — a Regular parent's own FR-REG-002 fields, 1:1 with a regular account |
| Not stored | email and login details (stay in auth.users; BR-045 uniqueness is Auth's); no password or hash (NFR-SEC-001). A copy of another user's email would be denormalization → `DECISION REQUEST` | stage and due date (`journey_contexts`), children (`children`) |
| Owner | the person; `id` is `auth.uid()`, set by the database (rules 12–13) | the Regular account; `user_id` is `auth.uid()`, set by the database (rule 12) |
| Authorization | RLS + FORCE. `users_select_own` — authenticated reads its own row (`id = auth.uid()`) **in every status** (F1.5 DR-1 A, migration 20261015100000). Seeing the own row does **not** mean the account is active: code or a policy that needs "is the caller active" uses `(select nestly.is_active_account())`, never `exists (select 1 from nestly.users …)`. A suspended or banned account still reads zero rows of every other table (rule 15). `users_insert_own` (F1.4) — creates only its own row (`id = auth.uid()`), only as account_type 'regular' and status 'active' (rule 14; professional registration widens it in its own Gate 2); no status gate at insert, the row does not exist yet. Grants: USAGE on nestly and SELECT → authenticated only; INSERT on (account_type, status) only — id and created_at always default. No UPDATE or DELETE grant or policy. I2's UPDATE will be column-level, excluding account_type and status. `users_select_profile_view` (F2.3b) — see "Cross-user read" below | RLS + FORCE. `regular_profiles_select_own` — authenticated reads its own row, only while `(select nestly.is_active_account())`. `regular_profiles_insert_own` (F1.4) — own row only, under the same gate, so the users row must be inserted first in the same transaction. `regular_profiles_update_own` (F2.1, migration 20261017100000) — the owner edits its own row, USING and WITH CHECK `user_id = auth.uid()` and the same gate; the server updates with no WHERE through `regularProfilesUpdate`. Grants: SELECT → authenticated only; INSERT on (full_name, gender) only — user_id, account_type, created_at and the three privacy settings always default; UPDATE on (full_name, gender) and (F2.3a, migration 20261017120000, same policy, through `regularProfilesPrivacyUpdate`) on (profile_visibility, is_empty_journey_sentence_shown, is_child_birthday_shared), so an UPDATE of user_id, account_type or created_at is 42501. The UPDATE grant and policy also permit the own-row `FOR NO KEY UPDATE` lock of the journeys writes (F2.2b, below). No DELETE grant or policy. `regular_profiles_select_profile_view` (F2.3b) — see "Cross-user read" below |
| Relations | `users_id_fkey` (id) → auth.users (id) ON DELETE RESTRICT — the anchor FK above, bootstrap step 2, added by postgres. Referenced by regular_profiles through `users_id_account_type_key` UNIQUE (id, account_type), by legal_consents (ON DELETE RESTRICT), and by friendships' two status copies through `users_id_status_key` UNIQUE (id, status), ON UPDATE CASCADE (F2.4a): a status change by any path rewrites the copies in the same statement | `regular_profiles_user_fkey` (user_id, account_type) → users (id, account_type) ON DELETE CASCADE — the profile is part of the account. Referenced by journey_contexts and children (ON DELETE CASCADE), friendships (requester_id, addressee_id; ON DELETE CASCADE) and regular_names through `regular_profiles_user_id_full_name_key` UNIQUE (user_id, full_name), ON UPDATE / DELETE CASCADE (F2.4a): a name edit rewrites regular_names. Trigger `regular_profiles_name_insert` (AFTER INSERT) writes the regular_names row. Ids never update |
| Indexes | `users_pkey` (id) — every policy and is_active_account() look up by id. `users_id_account_type_key` — target of the subtype FK; one extra small btree per insert, accepted. `users_id_status_key` (F2.4a) — target of the status copies; one more btree write per insert and per status change. None on status alone: no query filters by it yet | `regular_profiles_pkey` (user_id) — own-row reads, the journeys-write lock, and the cascade lookup from users. `regular_profiles_user_id_full_name_key` (F2.4a) — target of regular_names' FK; one more btree write per insert and per name edit |
| Retention | no deleted_at. Hard delete only through the orderly deletion flow (I9, OP-028); RESTRICT blocks deleting the Auth user while this row exists, and a legal_consents row blocks deleting this one. Retention periods: §13.4 TBD | goes with its users row (cascade); OP-028 direction: deleted in full. §13.4 TBD |

**Privacy settings (F2.3a, `.work/profile-privacy/schema.md`).** Three columns on the 1:1 profile, not a table: already Regular-only
and behind the own-row policies. **The constant-backfill pattern:** `ADD COLUMN … NOT NULL DEFAULT <constant>` is catalog-only
(fast default): every existing row, in any status, reads the default at once, no row is written, FORCE RLS never meets it.
Registration names neither column and holds no INSERT grant on them, so a new account always gets the defaults. **Guarded
rollback:** the down script lifts FORCE RLS inside its own transaction, refuses while any row holds a non-default setting (a
re-apply would silently reopen a Restricted profile), then restores FORCE; after the first real choice the way back is a forward fix.
The cross-user read that honours them is `profile_view` (F2.3b, below).

## Rules: journeys, children and consents

| | `journey_contexts` | `children` | `legal_consents` |
|---|---|---|---|
| Purpose | SRS JourneyContext (§13, VAL-039) — one row per stage the parent is in, ticked at registration or added later by the owner (F2.2b); an ended stage is deleted, not marked | SRS Child (§13) — minors' data: exactly name, sex and birth date, plus mechanics | SRS LegalConsent (§13, FR-REG-004, BR-068) — one row per acceptance event holding the full set accepted; the latest row is the current consent state |
| Not stored | §13's "active status" (undecided, OP-003 / I6) and the "מחזור וביוץ" type (not in VAL-039); no link between a has_child journey and the children; no end date or reason for an ended stage (DR-1 A, DR-2r) | nothing about a child beyond the three fields — no photo, nickname or id number; birthday visibility is its own entity, later | no per-document rows: one checkbox accepts all three together |
| Owner | the Regular account; `user_id` is `auth.uid()`, set by the database (rule 12) | the parent; same | the accepting account, any type; same |
| Authorization | RLS + FORCE. `journey_contexts_select_own`, `journey_contexts_insert_own` — own rows only, while `(select nestly.is_active_account())`. `journey_contexts_update_own` (F2.2b1, migration 20261017140000) — USING and WITH CHECK own row, **`stage = 'pregnant'`** and the gate: a planning or has_child id matches 0 rows (404), never the due-date CHECK's 23514; the server updates by `where id` through `journeyContextsUpdate`. `journey_contexts_delete_own` (F2.2b2, migration 20261017141000) — own row and the gate, **no stage**: which route deletes which stage is the server's targeting (`where … stage =`), not permission. Grants: SELECT; INSERT on (stage, due_date); UPDATE on (due_date) only, so stage never changes (DR-5 A: a stage changes by add or end); table DELETE → authenticated only. `journey_contexts_select_profile_view` (F2.3b) — see "Cross-user read" below | RLS + FORCE. `children_select_own`, `children_insert_own` — same shape. `children_update_own` (F2.2a, migration 20261017110000) — USING and WITH CHECK `user_id = auth.uid()` and the same gate; the server targets by `where id = …` through `childrenUpdate` and RLS decides (0 rows → not the caller's, or not active). Grants: SELECT; INSERT on (slot, name, sex, birth_date); UPDATE on (name, sex, birth_date) → authenticated only, so an UPDATE of id, user_id, slot or created_at is 42501; the UPDATE grant also permits `SELECT … FOR UPDATE` on own active rows (accepted). The CHECKs fire on UPDATE as on INSERT. `children_delete_own` (F2.2b2, migration 20261017141000) — own row and the gate; table DELETE → authenticated. `children_select_profile_view` (F2.3b) — see "Cross-user read" below | RLS + FORCE. `legal_consents_select_own`, `legal_consents_insert_own` — same shape; the insert also requires `accepted_at = now()`. Grants: SELECT; INSERT on (terms_version, privacy_version, has_declared_18_plus) → authenticated only. Append-only: no UPDATE or DELETE for any runtime role, the owner included |
| Relations | `journey_contexts_user_id_fkey` (user_id) → regular_profiles (user_id) ON DELETE CASCADE — part of the parent's account | `children_user_id_fkey` (user_id) → regular_profiles (user_id) ON DELETE CASCADE — only a Regular account holds children (BR-016) | `legal_consents_user_id_fkey` (user_id) → users (id) ON DELETE RESTRICT — whether a consent outlives the account is a legal retention question (§13.4, Afik); the deletion flow must handle consents before the account |
| Indexes | `journey_contexts_pkey` (id). `journey_contexts_user_id_stage_key` UNIQUE (user_id, stage) — one journey per stage; serves own-row reads and the cascade lookup. Partial unique `journey_contexts_user_id_planning_pregnant_key` (user_id) WHERE stage in (planning, pregnant) — VAL-039 held by the database. No separate user_id index | `children_pkey` (id). `children_user_id_slot_key` UNIQUE (user_id, slot) — with the slot CHECK, the ≤ 10 limit, concurrency-safe; serves "any child left" (prefix), the slot read and the cascade lookup. The own UPDATE and DELETE use `children_pkey`. The display sort (created_at, slot) runs on ≤ 10 rows in memory: no index, by decision | `legal_consents_pkey` (id). `legal_consents_user_id_versions_key` UNIQUE (user_id, terms_version, privacy_version) — a version pair is never recorded twice; a re-consent is a new row; serves own reads and the RESTRICT check |
| Retention | no deleted_at; **hard delete** by the owner (end a stage, DR-1 A) — gone from the live database at commit, no application log line, column or row records it (platform technical logs are short-lived and covered by the Privacy Policy, Afik 17.10, OP-036 closed); goes with the profile (cascade); OP-028 direction: deleted in full. Platform backups may keep a deleted row for their window (§13.4 TBD, Privacy Policy, legal) | same: hard delete by the owner (remove a child, DR-1 A); a freed seat is reused | no deleted_at; never changes; RESTRICT blocks deleting the account while a row exists. §13.4 TBD (legal, Afik) |

No index on stage, birth_date, due_date or accepted_at: no query filters or sorts by them across users yet. Each new
btree is written once per row, at registration — accepted.

## Registration and journey writes

**Write order** (rule 11), one identity transaction: users → regular_profiles (its trigger → regular_names, F2.4a) → journey_contexts → children (slots 1..n
in entry order) → legal_consents. Every status gate reads the users row inserted earlier in the same transaction; any
failure rolls back the whole account. The repository inserts only through the `*Insert` write models in
`apps/server/src/db/schema.ts` ("Write grants").

**Add a child after registration** (F2.2a, `journeys-repository.ts` / `journeys-service.ts`), one identity transaction at
**READ COMMITTED** — the Drizzle default; never raise it: the retry depends on each statement seeing commits made after the
transaction began. Per round, at most 10: (1) read own slots, take the **lowest** of 1..10 not taken, none → `children_too_many`
(409, rollback); (2) insert the has_child journey `on conflict do nothing`, every add — idempotent, keeps has_child ⇔ ≥ 1 child
(DR-4 A); (3) insert the child into that slot `on conflict do nothing … returning`: 0 rows = a concurrent add committed that slot
(the insert waited on `children_user_id_slot_key`) → next round; 1 row → commit. Both ON CONFLICT clauses are untargeted (the
write models hold no user_id; stays valid if a unique key becomes partial). No advisory lock. Any throw rolls back (2) too.
Since F2.2b the rounds run after the profile-row lock below.

**The profile-row lock (F2.2b; `.work/journeys-children/schema.md` "has_child ⇔ ≥ 1").** Every route that inserts or deletes a
child or a journey — add child, remove child, add pregnancy, end pregnancy, birth — runs, right after the account gate and before
any other statement, `select user_id from regular_profiles for no key update` (`lockOwnProfile`), exactly 1 row else a fault.
**Why:** has_child ⇔ ≥ 1 child is a server rule (DR-4 A; the database does not refuse a has_child delete with children left). At
READ COMMITTED two removals of the last two children each still see the other's uncommitted child and both keep has_child; an
add racing a remove-last loses has_child. The profile row always exists (parent of both tables), is RLS-confined to the caller,
needs no new grant, and `NO KEY UPDATE` does not block the `KEY SHARE` of FK checks. The second writer waits, then sees the first
one's commit. One lock order (profile first) → no deadlock. Cost: that user's concurrent profile UPDATE waits milliseconds. Rejected:
locking the has_child row (absent on the first add), a constraint trigger, the advisory lock, SERIALIZABLE. Not locked: the
child and due-date edits (no row count changes) and registration (the profile row is its own, uncommitted, invisible to others).
**Writes (F2.2b, one identity transaction each; no `where` names a user):** remove child — delete by id (0 → 404), then no child
left → delete has_child. End pregnancy — delete where id and `stage = 'pregnant'` (0 → 404). Birth — that delete (0 → 404), then the
add rounds; ten children → rollback, 409, pregnancy kept. Add pregnancy — with the confirmation, delete planning first; insert
pregnant `on conflict do nothing` (the two unique keys hold one); 0 rows → rollback, 409. Due date — update by id, no lock.
**Read order:** children `order by created_at, slot` (slot breaks registration's one-`now()` tie; a reused seat shows last);
journeys in `JOURNEY_STAGES` order in the server.

## Cross-user profile read

**Cross-user read — `nestly.profile_view(text)`** (F2.3b, migration `20261017150000`, `.work/profile-privacy/schema.md`; the approved
exception in `data-model.md`, DR-G1). Four SELECT policies, all `TO app_owner`, USING `<owner column> = (select nestly.profile_view_target())`:
`users_select_profile_view` (id), `regular_profiles_select_profile_view`, `children_select_profile_view`, `journey_contexts_select_profile_view`
(user_id). They open only the rows of the uuid `profile_view` sets in the transaction-local GUC `nestly.profile_view_target` and clears after
its one query; no runtime role is a member of `app_owner` (rule 1), so a GUC a caller sets opens nothing. Inside the definer the caller's own
`TO authenticated` policies still apply (`app_owner` inherits `authenticated`); the function's query names the target, so they add nothing.
What leaves: full_name, children_count, is_pregnant, shows_empty_journey_sentence; gender and child_ages only when the target is Open (`s.is_full`,
widened by F2.4c1 to the caller's Friends, DR-2 A); no column of `children` or `journey_contexts` beyond the count, the ages and the presence of a pregnant journey.
Helpers, SECURITY INVOKER, `set search_path = ''`, EXECUTE revoked from PUBLIC and granted to no role (only `app_owner` runs them):
`profile_view_target()` — the GUC as a uuid, NULL when unset, empty or not a uuid; `child_age_months(date, timestamptz)` — completed calendar
months from a birth date to the date of an instant in Asia/Jerusalem, floored at 0 (DR-3, DR-6 A); `profile_view` passes `pg_catalog.now()`.
No table, column, index or grant on a table changed; no backfill. Indexes: each policy and the function's lookups use the existing PK or
`(user_id, …)` unique keys. Rollback: the down script drops the function, the four policies and the two helpers, touching no row. **F2.4c1** (migration `20261017170000`, Afik DR-L)
recreates the function with the open count first and four trailing columns (relationship, friends, mutual_friends, outcome), and adds seven more
`TO app_owner` policies under the same gate: below, and one SELECT each on `friendships`, `regular_names` (table above).

Helper: `nestly.is_active_account()` — true when the caller's own account exists and is active (rule 15). SECURITY
INVOKER, caller only; checks `id = auth.uid()` and `status` itself rather than trusting the `users` policy.

## Rules: recovery

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

## Identity link checks

**`nestly.identity_link_checks`** (I2 F2.0, FR-AUTH-005, S-01; migration `20261016100000`, `.work/account-takeover-close/schema.md`)

| Column | Type · null · default | Meaning |
|---|---|---|
| `user_id` | uuid PK · default `auth.uid()` | the Auth user (no FK: an Auth user with no users row has a verdict too, c9) |
| `verdict` | text · not null · CHECK unaffected / affected | decided once from the caller's Auth identities: affected = an email identity older than the google one |
| `checked_at` | timestamptz · not null · `now()` | when the verdict was written |
| `checked_session_id` | uuid · not null | the session_id claim of the oauth session that wrote it (insert policy: the caller's own) |
| `cleared_at` | timestamptz · null | the clear completed (trigger: clock_timestamp() at the UPDATE, after the other sessions were signed out; Gate 2 A1). NULL on an affected row = pending |
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

## Friendships and regular names

**`nestly.friendships`, `nestly.regular_names`** (I2 F2.4a, FR-REL-001, VAL-017, BR-029, AC-034, PG-036; migration `20261017160000`,
`.work/friends/schema.md`, Gate 2 DR-6 A, DR-7 A, DR-B)

| Column | Type · null · default | Meaning |
|---|---|---|
| `friendships.id` | uuid PK · `gen_random_uuid()` | the row: one Friend Request and the Friendship it becomes (§13) |
| `friendships.requester_id` | uuid · not null · `auth.uid()` | who sent it (rule 12); never granted |
| `friendships.addressee_id` | uuid · not null | who received it; the only column a client INSERTs. CHECK ≠ requester_id |
| `friendships.status` | text · not null · `'pending'` · CHECK pending / accepted / declined / removed | §13. Moves only through the trigger. **Never returned by an API** (DR-3 A: a decline is silent to the requester; RLS cannot hide a column) |
| `friendships.requester_status`, `addressee_status` | text · not null · `'active'` | copies of each party's `users.status` under composite FKs ON UPDATE CASCADE — a deliberate denormalization (Gate 2): RLS shows a row only while the other party's copy is active (DR-5 A) without reading the other party's users row. The FK proves equality; never granted, never written by code |
| `friendships.requested_at` | timestamptz · not null · `now()` | sent; a silent re-send after a withdrawn decline refreshes it (trigger). The list sort |
| `friendships.responded_at` | timestamptz · null | accepted or declined (trigger). CHECK NULL exactly while pending |
| `friendships.cancelled_at` | timestamptz · null | the requester withdrew it (DR-4 A: cancel is no status). CHECK only on pending or declined |
| `friendships.removed_at` | timestamptz · null | either party ended the Friendship (trigger). CHECK NULL exactly unless removed |
| `friendships.created_at` | timestamptz · not null · `now()` | immutable |
| `regular_names.user_id` | uuid PK · `auth.uid()` | the profile's owner |
| `regular_names.full_name` | text · not null | equal to `regular_profiles.full_name` by the composite FK (ON UPDATE CASCADE); no CHECK of its own (the profile's VAL-001 holds) |

| | `friendships` | `regular_names` |
|---|---|---|
| Purpose | §13 Friendship / Friend Request between two Regular accounts | DR-6 A: the one column of a profile the other party of a live pair may read (PG-036), without a definer and without the profile row |
| Not stored | no request message; no history row per move (the clocks are the history); no block | nothing but the name |
| Owner | both parties; the requester by `default auth.uid()` + WITH CHECK | the profile owner; written by the insert trigger, kept equal by the FK |
| Authorization | RLS + FORCE. `friendships_select_party` — a party reads the row while active and the other party's copy is 'active'. `friendships_insert_requester` — requester = caller, active, pending, not cancelled, both copies 'active'; the FKs (run as owner) prove the addressee an active Regular account (23503 otherwise). `friendships_update_party` — USING and WITH CHECK = the select rule. **`friendships_transition`** (BEFORE UPDATE, SECURITY INVOKER) is the one place that sees OLD and NEW: immutable id, party ids, created_at; a pure status-copy cascade passes; else exactly addressee pending→accepted / declined · addressee declined→pending (DR-7 A) · requester withdraws pending / declined · requester un-withdraws own declined (silent re-send) · either party accepted→removed; it stamps the clock; anything else 42501. `friendships_select_profile_view` (F2.4c1) — TO app_owner, accepted rows with both copies 'active' that involve the declared target (`profile_view`'s Friends list). Grants: SELECT; INSERT (addressee_id); UPDATE (status, cancelled_at) → authenticated. No DELETE | RLS + FORCE. `regular_names_select_party` — active caller reads its own row and the other party's of a row it sent (pending, declined, accepted) or received (pending, accepted), never a withdrawn one; the counterparty-active rule is inherited from friendships' RLS. `regular_names_select_post_reader` (F3.2, Afik 6ב) — active caller reads the name of the author of any named post it can read through `posts_select_viewer` (EXISTS on posts; anonymous posts have author_id NULL, so never a name). `regular_names_select_comment_reader` (F3.4 N1, Afik Q7 B; `20261019300000_commenter_names.sql`) — active caller reads the name of a user who wrote a comment or reply it can read through `comments_select_viewer` (EXISTS on comments; the "המחבר" comment has author_id NULL, so never a name; probes `comments_author_id_idx`). `regular_names_insert_own` — own row, active. Trigger function `regular_names_insert()` SECURITY INVOKER, runs as the registering caller. `regular_names_select_profile_view` (F2.4c1) — TO app_owner, the names of the declared target's accepted Friends, both copies 'active' (correlated EXISTS on friendships). Grants: SELECT; INSERT (user_id, full_name) — see "Write grants" exception. No UPDATE (the cascade writes it) or DELETE |
| Relations | requester_id, addressee_id → regular_profiles (user_id) ON DELETE CASCADE (Regular only, BR-029); (requester_id, requester_status), (addressee_id, addressee_status) → users (id, status) ON UPDATE CASCADE ON DELETE CASCADE. The cascade fires the trigger, which lets it through | (user_id, full_name) → regular_profiles (user_id, full_name) ON UPDATE CASCADE ON DELETE CASCADE |
| Indexes | `friendships_pair_live_key` UNIQUE (least, greatest) WHERE accepted or (pending and not cancelled) — one live row per unordered pair (VAL-017, c3, c4); `friendships_requester_id_addressee_id_key` UNIQUE (requester_id, addressee_id) WHERE declined or open pending — a decline blocks A→B, not B→A (DR-3 A); the server's untargeted `on conflict do nothing` covers both. `friendships_requester_id_idx`, `friendships_addressee_id_idx` — the policies, the lists, the names EXISTS, both cascades. The list sort on requested_at runs on the caller's rows in memory: no index, by decision | `regular_names_pkey` (user_id) — the policy EXISTS joins on it, the cascades |
| Retention | no DELETE and no deleted_at: every row, removed and withdrawn included, is kept (§13.4 TBD, I9); goes with either profile (cascade) | derived; goes with the profile |

**Server writes** (`friends-repository.ts`, one identity transaction each, keyed by the other person's id, ≤ 1 row by the partial unique
indexes): send — reopen B's declined A→B (DR-7) → insert `on conflict do nothing` → read the pair → lift own withdrawn decline; accept,
decline, cancel, remove — one UPDATE each, 0 rows → read the pair (404 vs 409). Lists: live rows (accepted, or pending / declined not
withdrawn), `requested_at desc, id desc`; names: every `regular_names` row the caller may read. `status` never leaves the service.
**Backfill (DR-B):** `regular_names` was filled from `regular_profiles` in the migration transaction with FORCE lifted on the source and
restored before any other statement (`data-model.md` "Backfills"). **Preview cleanup:** both tables deleted before `regular_profiles`,
friendships by either party; F2.4c1 adds `profile_open_counts`, then `security_events`, after `regular_profiles` and before `identity_link_checks`;
`security_limits` is listed, never written (14 tables; `.work/friends/schema.md` "Preview cleanup").

## Profile open limits and security events

**`nestly.security_limits`, `nestly.profile_open_counts`, `nestly.security_events`** (I2 F2.4c1, NFR-SEC-006 (1)(5), BR-025, AC-078, ERR-032;
migration `20261017170000`, `.work/friends/schema.md` F2.4c1, Gate 2 + Afik DR-L)

| Column | Type · null · default | Meaning |
|---|---|---|
| `security_limits.limit_key` | text PK · CHECK in ('profile_open') | which limit (Configuration, NFR-SEC-006) |
| `security_limits.max_count` | integer · not null · CHECK 1–10000 | N: opens allowed in the window; seeded 100 (Afik DR-T) |
| `security_limits.window_seconds` | integer · not null · CHECK 1–604800 | W: the rolling window (DR-W A); seeded 3600 |
| `security_limits.updated_at` | timestamptz · not null · `now()` | when the row was last set |
| `profile_open_counts.user_id` | uuid PK → users (id) | the account that opened (`auth.uid()` of the call) |
| `profile_open_counts.opened_at` | timestamptz[] · not null · `'{}'` · CHECK cardinality ≤ 10000 | instants of counted opens inside the window, DB clock; older ones pruned at the next open |
| `profile_open_counts.is_refusal_recorded` | boolean · not null · false | the current refusal stretch already wrote its event; cleared by the next counted open |
| `security_events.id` | uuid PK · `gen_random_uuid()` | |
| `security_events.kind` | text · not null · CHECK in ('profile_open_limit') | what happened; extended by a migration |
| `security_events.user_id` | uuid · not null → users (id) | the refused account. No target, name or profile data |
| `security_events.occurred_at` | timestamptz · not null · `now()` | DB clock |

| | `security_limits` | `profile_open_counts` | `security_events` |
|---|---|---|---|
| Purpose | the stored threshold and window of a limit (DR-C A: data, never a code constant) | per-account rolling window of profile opens (c20) | NFR-SEC-006 (5): one row for the first refusal of a stretch (c21) |
| Owner | none: configuration | the account, keyed by `auth.uid()` inside `profile_view` | none set by a client; `user_id = auth.uid()` forced by the policy |
| Authorization | RLS + FORCE. `security_limits_select_profile_view` — TO app_owner, the profile_open row while a target is declared. No write policy: a change is a migration lifting FORCE in its transaction (DR-B pattern) until I4's Admin screen | RLS + FORCE. `profile_open_counts_{select,insert,update}_profile_view` — TO app_owner, `user_id = auth.uid()` and a declared target (the upsert needs all three) | RLS + FORCE. `security_events_insert_profile_view` — TO app_owner, own account, kind profile_open_limit, declared target. No SELECT (so no RETURNING), UPDATE or DELETE policy |
| Grants | none to `authenticated`, `anon` or PUBLIC on any of the three (`revoke all`; every verb 42501, c21–c22). Reached only through `profile_view` | same | same |
| Relations | none | user_id → users ON DELETE CASCADE (working state) | user_id → users ON DELETE **RESTRICT**, as `recovery_events`; the cleanup tool alone deletes a test user's rows (Afik DR-L) |
| Indexes | pk | pk: the upsert's row lock serializes one account (120 concurrent → ≤ 100 shown); others never wait; one HOT update per open | `security_events_user_id_idx` — the RESTRICT check, I4's per-account read; ≤ 1 insert per refusal stretch |
| Retention | one row, never deleted (deleting it fails every open closed, NS001) | disposable; every window restarts on rollback | append-only, kept until I9 sets retention (§13.4 TBD) |

**Open semantics** (one `profile_view` call): active caller → declare target → read N, W (absent or invalid → NS001, rollback, no count, no event) →
upsert own row (lock) → prune instants older than W → ≥ N: first refusal of the stretch inserts the event, sets the flag, returns `limited`, not counted
(the server COMMITs) → else append `now()`, clear the flag, read the target (unavailable = 0 rows, already counted). The F2.4a send runs the same call first (c24).
**Lists:** unbounded (no pagination: spec "Out of scope"); per Friend of the target, about six index probes (pk, the two party indexes) for the name policy's
EXISTS and `is_mutual`. Accepted for the MVP; revisit when an account nears ~1,000 accepted Friends.

## Feed tables (I3 F3.0)

Built by `20261018100000_feed_posts.sql` (F3.0a: posts, post_authors, post_hides, algorithm_configurations + v1 seed) and `20261018200000_feed_interactions.sql`
(F3.0b: comments, reactions, reaction_owners, reports; held deletion, `delete_post`, `delete_comment`, `purge_held_content`); contracts and every column, policy and
grant: `.work/feed-groundwork/schema.md`, `schema-b.md`. Rules in short: eligibility only in `posts_select_viewer` (viewer and author active, status, audience/
friendship, anonymous never via friendship, own hides and reported posts excluded); anonymous author only in `post_authors` (owner-only, rule 20); denormalised
`author_status`, `liker_status`, `parent_status` kept by composite FKs ON UPDATE CASCADE; no policy reads its own table (row checks in invoker triggers);
column-level SELECT (no `select *` for the app); deletion via the two functions — immediate, or held ≤ 90 days while a report is open, purged by `app_jobs`.
Down scripts refuse while their tables hold a row. Cleanup order per user: reports, reactions, post_hides, comments, posts.
F3.3a (`20261019100000_comment_body_cap.sql`): `comments_body_length_check` ≤ 1000 code points (replies included); seven column comments now state
the real grants (readable under the named RLS policy, no INSERT/UPDATE grant; six never emitted in a response); two cap texts updated (posts.body 2,000, comments.body 1–1,000). F3.3b2: likedByMe only via `likes-repository`.
I3 rest PR-A (`20261019200000_feed_i3_rest.sql`; `.work/i3-rest-schema/schema.md`): no table, policy or grant. **Share** (`posts_insert_prepare`, replaced):
a caller without a readable own `regular_profiles` row → 42501 first; then every refusal of the original (unknown/unreadable, friends-only, anonymous, a share,
not active, **own post**, FR-FEED-006) → `NS002`. **Hide** (`post_hides_insert_guard`, replaced): caller gate 42501; post neither readable nor already
hidden by the hider → `NS004` (unknown uuid included: no 23503 oracle); own post → `NS003`; a repeat hide reaches the PK (`on conflict do nothing` → 0).
**Share immutable**: `posts_update_share_guard` (new, BEFORE UPDATE OF audience, body, stage_tag WHEN old.is_share) → `NS005` on any change; status and
the author_status cascade unaffected. **Report text**: `reports_details_length_check` ≤ 1000 code points. SQLSTATE class `NS` is the project's own
(`NS001` profile_view); the server maps by code (`lib/pg-error.ts`). Down: restores the two functions verbatim from F3.0a, drops the guard and the CHECK; data-free, no refuse guard.
I3 PR-A3 (`20261019400000_professional_posting.sql`; `.work/professional-posting/schema.md`, Afik 19.10 DR-1..3): **Professionals post, comment
and like.** RLS helper `caller_account_type()` (new; language sql, STABLE, SECURITY INVOKER, `search_path ''`, EXECUTE authenticated only): the
caller's own `users.account_type` while active, else NULL; caller-only through `users_select_own` (rule 16), no exception. Dropped:
`posts_author_id_fkey`, `comments_author_id_fkey`, `reaction_owners_user_id_fkey` (→ regular_profiles); the status FKs → users stay and still prove
the author and cascade a users delete (a regular_profiles delete alone no longer cascades feed rows; nothing deletes a profile apart from its user).
`posts_insert_author` adds: caller `regular`, or `professional` and not anonymous, `audience = 'everyone'`, `stage_tag` NULL; `posts_update_author`
WITH CHECK adds the same terms without the anonymous one (USING unchanged); `comments_insert_commenter` and `reactions_insert_reader` add: caller
`regular` or `professional`. Admin, Moderator and stopped accounts → 42501; a Professional's anonymous, friends or tagged post → 42501 (RLS runs
before `posts_audience_check`). Unchanged: `post_authors` and its FK → regular_profiles (anonymous posts Regular-only), every SELECT policy (a
Professional reads as a Regular non-friend; friendships are Regular-only), the share/hide guards (a Professional share or hide stays 42501),
`regular_names` (a Professional has no row: no name). No `followers` audience yet (I11, with Follow). Down: refuses while a posts (named), comments
or reaction_owners row has an author/liker without a regular_profiles row (FORCE lifted for the check, put back); else restores the policies, FKs and
comments verbatim and drops the helper.

## Safety and admin core (I4)

Built by `20261020300000_safety_admin_core.sql` (down script in `supabase/rollback/`; the Super Admin is created by
`supabase/bootstrap/03-super-admin.sql`, run by Afik). Two approved SECURITY DEFINER functions (`audit_trigger()`, `reveal_post_author(uuid)`; see data-model.md); no policy for app_jobs.

| Table | Columns and meaning | Authorization |
|---|---|---|
| `staff_roles` | user_id PK, account_type (admin or moderator), account_status; a mirror of `users` by composite FKs, filled by the trigger `users_staff_mirror`, so a policy on `users` can ask "is the caller staff" without reading `users` | RLS + FORCE; SELECT own active row only; one Admin (unique partial index, BR-021); nobody writes |
| `moderator_permissions` | (user_id, permission_key) PK; the 14 assignable keys (CHECK; Admin-only keys cannot be stored); granted_by | SELECT own; the Admin (written out, not `has_permission`, which reads this table) selects, inserts, deletes; audited by trigger with Before/After |
| `audit_log` | id, actor_id (default auth.uid()), actor_role, permission_key, action, target_kind, target_id, result, reason, before_state, after_state, occurred_at | SELECT Admin or AUDIT_LOG_VIEW; nobody holds INSERT, UPDATE or DELETE (only `audit_trigger()` and `reveal_post_author()` append, as app_owner); triggers refuse UPDATE, DELETE and TRUNCATE |
| `report_reasons` | key PK, label, priority 1-4, sort_order, is_active, is_core; seeded with the eight reasons; `reports.reason` references it | SELECT any active account; INSERT/UPDATE COMMUNITY_CONFIG; `report_reasons_guard` keeps child_safety at priority 1 and core reasons active, audits Before/After |
| `user_enforcements` | user_id, actor_id, kind (warning, suspension, reinstate, ban, unban), reason, duration_hours, suspended_until, report_id, is_child_safety, suggested_kind/hours, is_step_skipped | SELECT USER_VIEW and own; INSERT by key per kind (USER_WARN, USER_SUSPEND, USER_BAN), never on oneself, a Moderator never on staff; BEFORE trigger computes the ladder (last 12 months) and the suspension end; AFTER trigger changes `users.status`; `audit_trigger()` appends the audit entry; `status_before` kept; a child-safety ban needs a child_safety report |

Other changes: `users.suspended_until`; `users_status_guard` (a staff status change needs its enforcement row from the same transaction and the key
for that change; an account may end its own expired suspension); `reports` gains target_text (copy of the reported text), resolution, handled_by,
handler_note and `reports_handle_guard`; staff read policies on reports, posts and comments that have a report; content moderation
(`posts_update_staff`, `comments_update_staff`, `content_hold` replaced, `content_moderation_audit`); the author's delete over hidden or removed
content (`nestly.own_delete` setting named by `delete_post`/`delete_comment` and the four `*_own_moderated` policies); `reveal_post_author(uuid)`
(the audited reveal, rule 19, invoker, opened by the settings `nestly.reveal_post`/`nestly.reveal_user`). Cleanup order: user_enforcements,
moderator_permissions, staff_roles before security_events; `audit_log` and `report_reasons` are never deleted.

Deviations, stated plainly: (a) `users_select_staff` and `regular_names_select_staff` open only in a transaction that set `nestly.staff_view` = on, because every other service
reads "the caller's own users row" with no WHERE and an Admin's ordinary request must keep seeing one row; (b) `nestly.own_delete` is a caller-settable setting that lets an author
read, delete or hold their OWN hidden or removed post or comment (`*_own_moderated`): it widens only the author's view of their own row and allows only the delete the author already
owns, so it is not a definer; (c) `reports.target_text`, `handled_by` and `resolution` are readable by the reporter of that report (column grants cannot differ by policy); the API never
returns them. The definer functions: `audit_trigger()` appends every Audit entry (the Actor is auth.uid() with its staff role and a valid session); `reveal_post_author(uuid)` names the
post and author in transaction-local settings that open one row each to the owner role (`*_select_reveal` TO app_owner).

## Media and Stories (I5)

Built by `20261021500000_media_stories.sql` (down script in `supabase/rollback/`, refuses while any of the five tables holds a row). A rejected image's file is removed at once (after its training copy; `is_file_removed`, `media_assets_update_jobs_file`); its row stays 30 days for the uploader's message. Image files are
never in the database: private Supabase Storage buckets `media` (file name = `media_assets.id`) and `media-training` (file name =
`media_training_samples.id`), reached only by the server's storage module (data-model.md, approved exceptions, I5). No new SECURITY DEFINER.

| Table | Columns and meaning | Authorization |
|---|---|---|
| `media_assets` | id, owner_id (auth.uid(), never granted), owner_status (composite FK), kind post/profile/story, status pending/passed/queued/approved/rejected/suspected, mime jpeg/png/webp, width/height ≤ 2048, byte_size, post_id + position 0–3 (unique pair: ≤ 4 per post; FK SET NULL (post_id, position)), is_child, queue_reason blocked/unsure/error, scores, check_attempts, checked_at, decided_by (SET NULL), decided_at, purge_after (suspected + 90 days) | Owner reads own (a Story image 25 h); others only passed/approved through a readable post, profile photo or Story; CONTENT_MODERATE reads queued and decided; INSERT Regular/Professional, pending and unattached; owner attaches to own post once; staff decide a queued one (`media_assets_update_guard` sets who/when, suspected ⇒ is_child); owner deletes own (not suspected); app_jobs reads all, moves pending → passed/queued, purges per BR-077 |
| `profile_photos` | user_id PK (auth.uid()), user_status, media_id (unique, own profile image), media_status (composite FK copy), updated_at | Owner reads own in any state; others when passed/approved; INSERT/UPDATE/DELETE own (Regular/Professional); a replaced image row is deleted by `profile_photos_replaced` |
| `stories` | id, author_id (Regular), author_status, media_id (unique, own story image from the last hour), media_status, caption ≤ 500 (product limit VAL-042), audience everyone/friends, created_at, expires_at = created_at + 24 h | Unexpired only; author at once, others after the image passed, by audience; INSERT Regular, ≤ 10 per 24 h under a per-author advisory lock (`stories_prepare`, NS021 = ERR-040); no UPDATE or client DELETE (the image's delete takes it) |
| `media_training_samples` | id, source_media_id (unique, no FK), label blocked/allowed, source blocked/unsure/reported, is_child (metadata), mime, decided_at (null for reported), created_at, expires_at (set by the job; default 6 months, ≤ 24) | No client policy (no manual viewing); INSERT app_jobs only: a blocked or unsure image staff approved or rejected (children included) or a passed image whose post was removed after a report (`posts_select_jobs_removed`), never suspected; DELETE app_jobs at expiry |
| `media_training_events` | id, sample_id, action added/expired, source, label, occurred_at | Written by the invoker trigger `media_training_samples_log` (as app_jobs); SELECT Admin / AUDIT_LOG_VIEW; no UPDATE or DELETE for anyone |

Audit: `media_assets_decision_audit` (AFTER UPDATE OF status, queued → approved/rejected/suspected) → `audit_trigger()` branch `media_<status>`, key
CONTENT_MODERATE, After = status, kind, isChild, queueReason, trainingSet. Cleanup order per user: stories, profile_photos, media_assets before
post_hides; `media_training_samples` and `media_training_events` name no user and are never written by the cleanup.

## Trackers, cycle and status guides (I6)

Migration `20261020100000_trackers_cycle_guides.sql`, down script `supabase/rollback/20261020100000_trackers_cycle_guides.down.sql` (destroys the data of the three tables).
No SECURITY DEFINER, no function; `tests.approved_security_definer()` unchanged. All three tables: RLS + FORCE, policies TO authenticated only, nothing to anon.

| | tracker_events | cycle_entries | status_guides |
|---|---|---|---|
| Purpose | FR-TRACK-001/002: one event of a child's tracker (breastfeeding, bottle, sleep, diaper, medicine, growth, vaccine, bath) | FR-TRACK-001: a cycle start date and the user's average length; the ovulation window is computed from the latest entry, never stored | FR-HOME-004, FR-ADMIN-012, BR-070: system content per stage (planning; pregnancy by weeks 1..42; parenting by child age in months 0..216) |
| Columns | id, user_id (default auth.uid()), child_id, kind, occurred_at, ended_at, amount_ml, choice, name, dosage, weight_kg, height_cm, head_cm, note, created_at | id, user_id, start_date, cycle_length_days (15..60), created_at | id, stage_kind, range_from, range_to, title, body, source, source_checked_on, status (draft, published, hidden), published_at, created_at |
| Not stored | no photo, no sharing, no free-form extra fields (OP-008) | no symptoms, no relations (OP-008) | no per-user state; no read counters |
| Authorization | owner only, active account: `tracker_events_select_own`, `_insert_own` (also Regular and a child the caller can read), `_update_own`, `_delete_own`. INSERT per column (no id, user_id, created_at); UPDATE per column without kind and child_id. Nobody else reads: Admin, Moderator and Professional included (layer 9, BR-053) | owner only, same shape: `cycle_entries_select_own`, `_insert_own`, `_update_own`, `_delete_own` | `status_guides_select_published` (status = 'published', active account); from `20261021100000_status_guides_admin.sql`: `status_guides_select_admin`, `_insert_admin` (a draft only), `_update_admin`, all `caller_staff_role() = 'admin'` (FR-ADMIN-012 is Admin only; no Permission Key covers guides, so a Moderator with every key is refused). INSERT per content column, UPDATE per content column and status; no DELETE (a guide is hidden). `status_guides_prepare` stamps `published_at`; `audit_trigger()` (replaced with one more branch, still the one definer) appends created, edited, published, hidden and unpublished with Before/After (never the text) |
| Constraints | `tracker_events_fields_check`: the fields each kind needs and no others; end not before start for breastfeeding and sleep (AC-023) | unique (user_id, start_date) | published needs `source_checked_on` and `published_at` (BR-070); planning has no range |
| Relations | user_id -> regular_profiles (cascade); child_id -> children (cascade: a removed child takes its events) | user_id -> regular_profiles (cascade) | none |
| Indexes | (user_id, kind, occurred_at desc): the page's history and period; (child_id): the cascade | (user_id, start_date desc): history and latest | partial (stage_kind, range_from) where published: the home lookup |
| Retention | hard delete by the owner | hard delete by the owner | the nine seed rows are drafts awaiting approval; `hidden` keeps the row |

Preview cleanup: the user's tracker_events and cycle_entries are deleted before `children`; `status_guides` is content and is never written by the cleanup.

## Notifications and People Search

**`nestly.notifications`, `nestly.notification_preferences`, `nestly.friend_content_notification_preferences`, `nestly.people_search_counts`, `nestly.search_intents`** (FR-NOTIF-001/002/003,
FR-SEARCH-001, FR-ALG-008, BR-035/038/061/063, VAL-037, AC-040/041/042/074/078; migration `20261020400000`; Afik 18.10.2026: 60 searches per hour; 90-day retention)

| Column | Type · null · default | Meaning |
|---|---|---|
| `notifications.id` | uuid PK · `gen_random_uuid()` | |
| `notifications.recipient_id` | uuid · not null → users ON DELETE CASCADE | who is notified; the only reader |
| `notifications.type` | text · not null · CHECK format `^[a-z][a-z_]{0,39}$` | friend_request, friend_accepted, post_comment, comment_reply, post_shared, friend_post. The list lives in `packages/shared`: a new event (groups, Marketplace, Professional follow, birthdays) needs a definer and a constant, no schema change |
| `notifications.actor_id` | uuid · null → users ON DELETE CASCADE | who did it; NULL for the anonymous post author's own comment or the system |
| `notifications.target_kind`, `target_id` | text (format CHECK) · uuid · not null | the deep link: `post` + post id, or `user` + user id; authorized again when opened |
| `notifications.subject_id` | uuid · not null | the source row (comment, share, friendship, post); UNIQUE (recipient_id, type, subject_id) makes one event notify once |
| `notifications.is_critical` | boolean · not null · false | Security/critical: preferences are ignored (BR-038); nothing sets it yet |
| `notifications.created_at`, `read_at` | timestamptz · now() · null | `read_at` is set once by `notifications_read_guard` on any update (client value ignored, a read cannot be undone) |
| `notification_preferences.user_id`, `category` | uuid (`auth.uid()`) · text (format CHECK) | PK. Categories: friends, comments, shares, friend_posts, birthdays (later groups, security). No row = on |
| `notification_preferences.is_in_app_enabled`, `is_push_enabled` | boolean · true · false | In-App flag; Push flag stored for the Mobile stage, never sent on Web. CHECK: the `security` category cannot be off |
| `friend_content_notification_preferences.user_id`, `friend_id`, `is_enabled` | uuid · uuid · boolean true | PK (user, friend): "tell me when this Friend posts". Insert needs an accepted Friendship; off by default (no row) |
| `people_search_counts.user_id`, `searched_at`, `is_refusal_recorded` | uuid PK · timestamptz[] · boolean | as `profile_open_counts`: the instants inside the window |
| `search_intents.user_id`, `topic`, `created_at` | uuid (`auth.uid()`) · text (format CHECK) · timestamptz | Intent Signal (Afik 20.10.2026): the topic or category the fixed rules detected for a search - never the typed text. Owner reads and inserts (Regular/Professional); no update, no client delete; deleted after 30 days by `purge_search_intents()` (EXECUTE app_jobs only, `search_intents_{select,delete}_jobs` policies); the schedule is the retention job's. Not readable by Admin through the product |
| `security_limits` | | gains the `people_search` row (seeded 60 / 3600 s); `security_events.kind` gains `people_search_limit` |

| | `notifications` | preferences (both) | `people_search_counts` |
|---|---|---|---|
| Authorization | RLS + FORCE. `notifications_select_recipient`, `notifications_update_recipient` (TO authenticated, active caller, own rows; UPDATE granted on `read_at` only). No client INSERT or DELETE. `notifications_insert_notify`, `notifications_select_notify` TO app_owner while a notification definer has declared its scope (SELECT is needed by the insert's `on conflict do nothing`) | own rows; Regular or Professional (`caller_account_type()`); `user_id` never granted; friend-content insert needs an accepted Friendship. `*_select_notify` TO app_owner for the definers | no grant to any runtime role; three TO app_owner policies for `search_people`, own row, while it has declared its scope |
| Written by | the four definers (`notify_friendship`, `notify_comment`, `notify_post` triggers; helper `notify_deliver`) | the owner | `search_people` |
| Not stored | message text, post or comment content, the liker, anything about search or consumption (AC-042) | | the query |
| Indexes | `notifications_recipient_created_idx` (the list), `notifications_recipient_unread_idx` (the bell), `notifications_actor_id_idx` (cascade) | PKs | pk |
| Retention | 90 days (Afik 15א): created_at is kept; the purge is a later job | with the account | disposable |

**People Search** is `search_people(query, limit, offset)`: query two to 100 characters (else nothing, not counted), counted per call in a rolling window (N, W from
`security_limits`; absent or invalid raises `NS001`), the call over the limit returns one row `outcome = 'limited'` and records one `people_search_limit` event per stretch.
Rows: id and full name of other active Regular accounts, ranked exact name, name prefix, a word prefix, anywhere; then name and id; at most 50 per call, offset up to 200.
Posts are searched by the server through the caller's own RLS (`posts_select_viewer`), so hides, audience, Friends-only and later blocks and Private Groups apply with no search code.
**Cleanup order:** the three notification tables after `journey_contexts`, `search_intents` and `people_search_counts` after `profile_open_counts`.

## New entity template

A new entity adds its columns to the first table — field, type, and its meaning, which is the part that matters — and
fills every row of the second: purpose in one line; what is not stored; owner, and how that is established;
authorization — who may read, write and delete, and where that rule is enforced; relations, with cascade behaviour;
indexes, each with the query it serves; retention — soft or hard delete, and what is retained after.
