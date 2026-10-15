# schema — F1.6 password-recovery

**Gate 2: approved** by ORCHESTRATOR, 15.10.2026, with Amendment 1 (global sign-out after reset). DR-G1: `app_recovery` is part (b) of the one pre-approved exception. DR-G2: criterion 3 amended as proposed. Q-G1 default stands; the four Auth-setting conditions go to Afik's list. Knowledge proposal (Approved exceptions) → CRITIC validates before promotion.

**Author** DATA ARCHITECT, 15.10.2026. Gate 2 for `.work/password-recovery/spec.md` (approved at Gate 1; no "later").
**Verdict** Ready for Gate 2. On 15.10.2026 ORCHESTRATOR decided DR-G1 (`app_recovery` is part (b) of the exception) and DR-G2
(criterion 3 amended), and required Q2 to be designed now rather than logged as debt. That design is **Amendment 1**: it is
folded into the sections below and summarised at the end. The design uses **no SECURITY DEFINER function**, and nothing in it
bypasses RLS. The one approved exception for this flow (FR-AUTH-003, `decisions/2026-10.md` 2026-10-13, Afik) has two fenced
parts:
- (a) the Auth calls: set the password, then one global sign-out of the same user;
- (b) a guest database role, `app_recovery`, that runs under RLS + FORCE.

---

**Change**   Three new tables in `nestly`, two caller-free helper functions, one new database role. No existing table,
column, policy or grant changes.

`nestly.recovery_answers` — a user's chosen pair of questions with hashed answers, plus their email handle. One row per account.

| Column | Type · null · default | Meaning |
|---|---|---|
| `user_id` | uuid · PK · not null · default `auth.uid()` | the account. FK `recovery_answers_user_id_fkey` → `users(id)` **ON DELETE CASCADE**. Rules 12–13 |
| `email_handle` | bytea · not null · CHECK `octet_length = 32` · UNIQUE | `HMAC-SHA256(K_handle, lower(trim(email)))`, where the email is the verified token's email claim at first save. Used to find the account on redeem and for nothing else. It is a lookup key, not an identity claim, and is never updated (no change-email feature exists; the spec's Out of scope covers this) |
| `question_1`, `question_2` | text · not null · CHECK `in ('pet','nickname','street')` · CHECK `question_1 < question_2` | the chosen pair, stored in canonical order: the same id twice cannot be stored, and the pair has one representation. The value list lives once in `packages/shared` |
| `answer_hash_1`, `answer_hash_2` | bytea · not null · CHECK `octet_length = 32` | `scrypt(HMAC-SHA256(K_answer, question_id ‖ 0x00 ‖ normalised answer), salt_n)`. Binding the question id makes a correct answer typed into the wrong question fail (criterion 10) |
| `answer_salt_1`, `answer_salt_2` | bytea · not null · CHECK `octet_length = 16` · CHECK `answer_salt_1 <> answer_salt_2` | random salt per answer, from the CSPRNG |
| `scrypt_log_n` | smallint · not null · CHECK `between 15 and 17` | log2 of N. Criterion 3 (N ≥ 2^15) is enforced by the database. The upper bound caps memory per verification at 128 MiB, so a bad row cannot become a denial-of-service lever |
| `scrypt_r` | smallint · not null · CHECK `between 8 and 16` | |
| `scrypt_p` | smallint · not null · CHECK `between 1 and 4` | |
| `created_at` | timestamptz · not null · `now()` | first save. Changes are dated in `recovery_events`. Never granted |

`nestly.recovery_throttles` — failure counters and lock state for one handle or one IP hash. Rows exist for unknown handles too.

| Column | Type · null · default | Meaning |
|---|---|---|
| `subject_kind` | text · not null · CHECK `in ('handle','ip')` | PK part 1 |
| `subject_hash` | bytea · not null · CHECK `octet_length = 32` | PK part 2. Either the email handle (computed from the submitted email, known or not) or `HMAC-SHA256(K_ip, client IP)` |
| `short_window_started_at` | timestamptz · null | start of the current short window (handle 30 min · IP 15 min). NULL means no failure is counted |
| `short_failures` | smallint · not null · default 0 · CHECK `>= 0` | failures counted in that window |
| `long_window_started_at` | timestamptz · null · CHECK null unless `subject_kind = 'handle'` | start of the 24-hour window. Applies to handles only |
| `long_failures` | smallint · not null · default 0 · CHECK `>= 0`, and `= 0` unless `subject_kind = 'handle'` | |
| `locked_until` | timestamptz · null | while this is later than `now()`, every attempt on this subject gets 429 with `retry-after` |

Window semantics. All times use the database clock, and the limits are constants from `packages/shared`.
- A window starts at the first failure after the previous window has expired. It does not slide.
- Reaching the limit inside a window sets `locked_until = greatest(locked_until, now() + lock)`.
- A limited attempt is not a failure and changes no counter. A success changes no counter either.
- One statement per subject updates its row, using the DB clock and taking the limits as parameters.

`nestly.recovery_events` — the recovery audit. Append-only, and no runtime role can read it.

| Column | Type · null · default | Meaning |
|---|---|---|
| `id` | uuid · PK · `gen_random_uuid()` | |
| `kind` | text · not null · CHECK `in ('answers_saved','answers_changed','change_failed','change_limited','reset_verified','reset_completed','reset_failed','reset_limited','reset_admin_failed','reset_revoke_failed')` | the value list lives once in `packages/shared`. After `reset_verified`, the outcome is exactly one of: `reset_completed` (password set **and** every session ended), `reset_admin_failed` (password not confirmed as set), or `reset_revoke_failed` (password set, sessions not confirmed as ended) |
| `user_id` | uuid · null · FK `recovery_events_user_id_fkey` → `users(id)` **ON DELETE RESTRICT** · CHECK not null unless kind is `reset_failed` or `reset_limited` | the account, when the handle matched one. The insert policy forces the correct value (below), so a caller cannot attribute an event to the wrong account |
| `handle_hash` | bytea · not null · CHECK `octet_length = 32` | |
| `ip_hash` | bytea · not null · CHECK `octet_length = 32` | keyed hash, never the IP itself (criterion 12) |
| `occurred_at` | timestamptz · not null · `now()` | never granted |

This table never holds an answer, a normalised answer, a password, an email or a token (criterion 13).

Helpers, in the convention's shape (`language sql`, `STABLE`, SECURITY INVOKER, `set search_path = ''`, no argument,
EXECUTE revoked from PUBLIC and granted to `app_recovery` only): `nestly.recovery_handle()` and `nestly.recovery_ip()`. Each
returns `decode(nullif(pg_catalog.current_setting('nestly.recovery_handle' | 'nestly.recovery_ip', true), ''), 'hex')`. An
unset or empty setting returns NULL, which matches no row, so the role fails closed.

Role `app_recovery` (bootstrap step 1, run by `postgres`): NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB,
NOCREATEROLE, NOREPLICATION. It owns nothing and is a member of nothing. It is granted to `app_server` **WITH INHERIT FALSE,
SET TRUE**, and to nobody else.

**Why**   Spec "Data touched" and criteria 1–15:
- store the pair with hashes and the handle (DR-B);
- count failures per handle and per IP, unknown handles included (criteria 11–12);
- audit every attempt (criterion 13);
- report `set` / `missing` (criterion 6).

One row per account holding both answers makes "exactly two" a NOT NULL fact rather than a count, and lets a change replace
both answers atomically in one UPDATE.

**Authorization**   Enforced in one place: RLS + FORCE on all three tables. No SECURITY DEFINER function;
`tests.approved_security_definer()` stays empty.

| Who | `recovery_answers` | `recovery_throttles` | `recovery_events` |
|---|---|---|---|
| `authenticated` (signed-in store/change) | `recovery_answers_select_own` / `_insert_own` / `_update_own`: `user_id = (select auth.uid()) and (select nestly.is_active_account())`, in both USING and WITH CHECK. Grants: SELECT on `(user_id, email_handle, created_at)` **only**, so the user can never read back hashes or salts. INSERT on `(email_handle, question_1, question_2, answer_hash_1, answer_salt_1, answer_hash_2, answer_salt_2, scrypt_log_n, scrypt_r, scrypt_p)`. UPDATE on the same columns **minus `email_handle`**. No DELETE | nothing | nothing |
| `app_recovery` (signed-out redeem; verification and audit in the signed-in change path) | `recovery_answers_select_recovery`: `email_handle = (select nestly.recovery_handle())`. Grant: SELECT. No write | `recovery_throttles_{select,insert,update}_recovery`: `(subject_kind='handle' and subject_hash = (select nestly.recovery_handle())) or (subject_kind='ip' and subject_hash = (select nestly.recovery_ip()))`. Grants: SELECT; INSERT on `(subject_kind, subject_hash)`; UPDATE on the five counter/lock columns. No DELETE | `recovery_events_insert_recovery` WITH CHECK `handle_hash = (select nestly.recovery_handle()) and ip_hash = (select nestly.recovery_ip()) and user_id is not distinct from (select ra.user_id from nestly.recovery_answers ra)`. The subquery sees at most the declared handle's row, through the policy above. Grant: INSERT on `(kind, user_id, handle_hash, ip_hash)`. **No SELECT** (so no `RETURNING`) |
| `anon`, `app_server` (without SET ROLE), `app_jobs`, PUBLIC | nothing | nothing | nothing |

What this holds:
- A signed-out request reads exactly one answers row, and only a row it named by hash. It cannot list or dump hashes, even
  through a query with no WHERE. It cannot write answers. It can append audit but cannot read or alter it.
- The signed-in user writes only its own row and never reads hashes.
- The signed-in user never writes audit directly: `authenticated` has no INSERT on `recovery_events`, which holds rule 18
  literally.

How the server uses it (rules 3, 11). This is the server's half of the contract: BUILDER implements it and CRITIC checks it.
- **Redeem** (`POST /api/recovery/reset`):
  1. Validate; any 400 comes back before the database is touched.
  2. If the pepper or the admin key is missing, return 503 before any database work, uncounted and unaudited.
  3. Otherwise one transaction runs:
     - `set local role app_recovery`;
     - `set_config('nestly.recovery_handle', <hex>, true)`, and the same for `nestly.recovery_ip`;
     - `insert … on conflict do nothing`, then `select … for update`, on the handle row first and the IP row second. The fixed
       order rules out deadlocks, and the row lock serialises concurrent attempts, so the limits hold under concurrency.
  4. If either row is locked: insert `reset_limited`, commit, return 429.
  5. Otherwise read the answers row (zero or one). Run two scrypts, against a dummy salt when the row is missing or the pair
     does not match, and compare with `timingSafeEqual`.
     - Mismatch: update the counters, insert `reset_failed`, commit, return 401.
     - Match: insert `reset_verified` and **commit before** calling Auth.
  6. Run the Auth calls outside any transaction (below). Then a second transaction writes the outcome row.
- **Store** (`POST /api/recovery-questions`). One identity transaction:
  1. As `authenticated`, insert the row.
  2. `set local role app_recovery`, declare the handle and IP, and insert `answers_saved`.
  3. Commit.
- **Change** (`PUT`). One transaction:
  1. As `authenticated` (identity claims set), read its own `email_handle`.
  2. `set local role app_recovery`, declare the handle and IP, lock the throttle rows, and verify the current answers as in
     redeem.
     - Mismatch: counters plus `change_failed`, commit, return 401.
     - Locked: `change_limited`, commit, return 429.
  3. On a match, `set local role authenticated` and update its own row.
  4. `set local role app_recovery` and insert `answers_changed`. Commit.

  `app_server` holds both roles with SET TRUE, so switching inside one transaction is allowed, and each statement is
  checked as the role current at that moment.
- **`GET /api/me`**. Only when `state = 'active'`, and inside the existing identity transaction, run
  `select user_id from nestly.recovery_answers limit 1` as `authenticated`. One row gives `"set"`, none gives `"missing"`. It
  reads no other column and has no `where`, because RLS returns the caller's own row only. Other states keep `{state}` exactly
  as today. It needs neither secret.

**The Auth calls** (exception part a): set the password, then end every session of the same user.
- These are the only Auth calls that use the secret key anywhere in the codebase.
- All three go through plain `fetch`, so no new dependency.
- The base URL comes from the existing `SUPABASE_JWT_ISSUER`, so no new URL variable is needed.
- The user id comes from the answers row, never from the request.

The three calls:
1. `PUT <issuer>/admin/users/<uuid>` with body `{"password": <new>}`. This sets the password.
2. `POST <issuer>/token?grant_type=password` with body `{"email": <the request's email, trimmed and lower-cased>,
   "password": <new>}`. This is one sign-in as that user, using the password the request already holds.
   - It runs **only after call 1 returned 2xx**.
   - The `email` is a credential for Auth here, not a lookup: the account was already chosen by the handle, and the handle
     matched the same normalisation.
   - Only `access_token` is read from the response. The whole body, its refresh token included, is dropped at once: never
     returned, logged or stored, and not kept past call 3.
3. `POST <issuer>/logout?scope=global` with `Authorization: Bearer <that access_token>`. GoTrue deletes every session of the
   user, which revokes every refresh token: the attacker's, and the one call 2 just created.

The user then signs in fresh in the browser (F1.5). As before, the endpoint never sends the web a token.

- **Key:** the project's Supabase **secret key** (`sb_secret_…`), in env **`SUPABASE_SECRET_KEY`**, sent as `apikey`.
  - Afik alone sets it on the Vercel project, for Preview and Production. It is never set in GitHub Actions; CI uses a stub.
    The name has no `VITE_` prefix, so Vite never inlines it.
  - With the secret key, hosted Auth honours **`Sb-Forwarded-For`** (`decisions/2026-10.md` 2026-10-14 "F1.4 MATERIAL
    CHANGE 1", why). Calls 2 and 3 send the same platform-verified client IP that the IP hash uses, so Auth counts the
    owner's IP and not the server's.
- **One module:** `apps/server/src/recovery/auth-admin.ts` reads the key.
  - It exports exactly `resetPassword({ userId, email, password, clientIp })`, which returns
    `'completed' | 'admin_failed' | 'revoke_failed'`, plus `isAdminConfigured()`.
  - The three calls run in that fixed order inside that one function. None is exported on its own, and there is no generic
    request function.
  - Timeouts: 5 s per call, 12 s in total.
  - It never logs or returns the key, a token, the password, the email, or Auth's error text.
- **CI check:**
  - `apps/server/tests/credentials.static.test.ts` today flags `SUPABASE_SECRET` anywhere under `apps/`. Change it so that
    exactly that one file may name it, and assert that the file does name it, so the check cannot pass vacuously.
  - `sb_secret_` (a literal key) stays forbidden everywhere.
  - Under `apps/server/src`, the literals `/admin/`, `grant_type=password`, `/logout` and `Sb-Forwarded-For` appear in that
    file only.
  - Neither secret name appears under `.github/`.
  - The same check covers the pepper (below).
- **Feasibility in auth-js / GoTrue as deployed: it works.**
  - The repository's auth-js 2.117.3 (`node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js`) calls the same
    endpoints: `admin.updateUserById` is `PUT /admin/users/{id}`, `admin.signOut(jwt, scope)` is `POST /logout?scope=…`
    with the user's own JWT, and the password grant is `/token`.
  - The admin API has no revoke-by-user-id. What was missing before this amendment was only a user JWT, and call 2 supplies
    it.
  - Conditions it relies on. Each one fails safe to `revoke_failed` (below), so none can silently skip the revocation:
    1. no CAPTCHA on Auth sign-in; if Afik turns it on, call 2 fails;
    2. email confirmation stays off, as today;
    3. Auth accepts a password up to VAL-003's limit (Q-G1, and the finding there);
    4. for a future Google-only account (the Google sign-in feature), BUILDER verifies on preview that a password grant
       succeeds after an admin set-password; until then that path is untested.
- **Residual, stated once:** access tokens already issued, the attacker's included, are JWTs that our server checks only by
  signature and expiry. They stay valid **until they expire** (the project's JWT expiry; Supabase default 1 h), but no refresh
  can follow. The only lever is a shorter JWT expiry, which is an Auth setting on Afik's dashboard and outside this schema.
- **Auth password policy:** Auth's own password settings must not be stricter than VAL-003. If Auth still rejects call 1 with
  a 4xx, the outcome is `admin_failed`. → Q-G1, now with a finding.

**The pepper.** Env **`RECOVERY_PEPPER`**: at least 32 random bytes, base64, entered by Afik.
- It is read only in `apps/server/src/recovery/pepper.ts`.
- That module derives three sub-keys with HKDF-SHA256 (`K_handle`, `K_ip`, `K_answer`, each with a distinct `info` string),
  so one secret serves three purposes with no overlap between them.
- A value shorter than 32 bytes counts as missing, which gives 503 on the three recovery endpoints only.
- All hashing runs on the server. scrypt with N=2^15 and r=8 needs 32 MiB, so `maxmem` must be raised above Node's 32 MiB
  default.
- The same CI check asserts the name appears in that one file only.

**IP hash input** (for BUILDER and CRITIC).
- Use only the client address the platform sets: Vercel's forwarded header, read through Fastify `trustProxy` configured for
  Vercel. Never the leftmost, client-supplied `X-Forwarded-For`.
- Hash IPv6 by its **/64** prefix. Otherwise one host has 2^64 addresses and the per-IP limit means nothing.
- The same value goes to Auth as `Sb-Forwarded-For`.

**Consistency between Auth and the counters/audit (two systems).** Two invariants:
1. **A password is never set without a committed `reset_verified` row**, because that row is committed before call 1.
2. **The user is told "success" only when Auth confirmed both the new password and the global sign-out.**

Auth's own audit log is the record of what actually happened at Auth.

| Failure point | State | Response |
|---|---|---|
| validation | nothing touched | 400, uncounted |
| pepper or admin key missing | nothing touched | 503, uncounted, unaudited |
| transaction 1 fails before commit (DB error, timeout, crash) | full rollback: no counter, no audit, no Auth call | 503 (transient) / 500 |
| mismatch committed | counters and `reset_failed` | 401 |
| locked | `reset_limited`, counters unchanged | 429 + `retry-after` |
| call 1: non-2xx, timeout or dropped connection | `reset_admin_failed`, written in transaction 2. On a definite non-2xx the password is unchanged. On a timeout the outcome is unknown, so the kind means "no success was confirmed". Answers and counters are unchanged, so a retry works | 503 `unavailable` (criterion 15) |
| call 1 ok, then call 2 or 3 fails (non-2xx including Auth's 429, timeout, or no `access_token`) | `reset_revoke_failed`, written in transaction 2. **The password is changed; other sessions may still be live** | **503 `unavailable`**, retry (below) |
| calls 1–3 ok | `reset_completed`, written in transaction 2 | 200 `{"ok":true}` |
| transaction 2 fails (any kind) | the audit ends at `reset_verified`. The server logs one fixed line with no ids. The response still follows the Auth outcome, so a completed reset answers 200: the security state is right and only the record is short | as above |
| process killed after commit | `reset_verified` with no outcome row; the user saw an error and retries | — |

**Why `revoke_failed` answers 503 and not success (fail-safe).**
- The reset exists to end a takeover. If the owner reads "the password was changed" while the attacker's refresh token still
  works, the owner believes the account is safe when it is not. That is the worse failure, because nobody sees it. A 503 tells
  the owner the operation did not complete.
- A retry is idempotent and converges. With the same answers and any new password, it runs calls 1, 2 and 3 again, and the
  new call 3 also revokes the session left over from the failed run's call 2.
- Answers and counters are untouched (a correct attempt is not a failure), so the retry cannot lock the owner out.
- The accepted cost: after `revoke_failed` the password *has* changed, so an owner who gives up must sign in with the new
  password. They typed it moments ago, and the generic text does not say otherwise.

**Spec consequence** (ORCHESTRATOR records it as a spec change):
- Criterion 15 covers call 1 only ("the password is unchanged").
- Add a criterion: "if the password is set but the global sign-out fails, the response is 503 `unavailable`, the audit shows
  `reset_revoke_failed`, the new password works, and a retry with the answers succeeds and ends every session."
- Criterion 9 gains: "after a reset, a refresh token issued before it is refused." It is tested in integration against the
  Auth stub, plus the real-Auth check on preview.

**Rate-limit interplay.**
- Call 2 is a sign-in, so it counts against hosted Auth's per-IP sign-in limit (sign-ins and sign-ups together; see the
  project's rate-limit page). Call 1 counts against no user-facing limit, and call 3 is a logout.
- With `Sb-Forwarded-For` honoured, the IP Auth counts is the owner's. Call 2 runs only after verified answers, so per IP it
  happens at most as often as a successful reset. Our own limits (5 per handle per 30 minutes, 10 failures per IP per 15
  minutes) are far tighter than Auth's. Auth's limit is reached only by an owner who also signs in heavily from the same IP.
- If the header were not honoured, every reset would share the **server's** bucket. A burst of successful resets across
  users could then hit Auth's 429 at call 2. The result is `revoke_failed`, 503 and a retry later: safe, but degraded.
- BUILDER's preview check asserts that the header is honoured: Auth's log shows the client IP, not Vercel's.
- Call 2 also writes an ordinary sign-in to Auth's log, which is expected.

No DB transaction is ever held open across an HTTP call. Transaction 1 is held during the two scrypt computations
(~0.1–0.2 s). That is accepted: redeem is rare, and those row locks are exactly what keeps the limits safe under concurrency.

Criterion 13 reads as follows. Every attempt writes one row, in the transaction that also writes its counters. A verified
attempt then adds exactly one outcome row. Test assertions:
- success: `reset_verified` + `reset_completed`;
- admin failure: `reset_verified` + `reset_admin_failed`;
- revoke failure: `reset_verified` + `reset_revoke_failed`.

**Migration**   One file, in part a (the store and change paths already need all three tables and the role):
`supabase/migrations/<ts after 20261015100000>_recovery_questions.sql`. It runs as `app_owner`, in one transaction with its
history row, following the conventions.
0. Precondition: `raise exception` when `to_regrole('app_recovery') is null`, so the migration stops with a clear message if
   bootstrap was not re-run.
1. Create the three tables with every constraint above.
2. Create the index on `recovery_events (user_id) where user_id is not null`.
3. Enable and FORCE RLS on all three.
4. Create the two helpers; `revoke execute … from public`; `grant execute … to app_recovery`.
5. Create the eight policies.
6. Grants: `grant usage on schema nestly to app_recovery`, then the table and column grants above. Nothing to anon,
   service_role, app_jobs or PUBLIC.
7. COMMENT on every table, column, policy, helper and index, with SRS ids (FR-AUTH-003, AC-092, NFR-SEC-001, FR-ADMIN-005).

**Before it, bootstrap step 1** (`supabase/bootstrap/01-roles.sql`, run by `postgres`):
- create `app_recovery` as above;
- `grant app_recovery to app_server with inherit false, set true`;
- update the drift guards: `app_server` may be a member of `{authenticated, anon, app_recovery}`, `app_recovery` of nothing,
  and only `app_server` may hold `app_recovery`;
- update the expected rows in `01-roles-check.sql`.

Where it runs:
- CI picks the change up automatically: `ci.yml:363` runs the script.
- On nestly-preview, the re-run comes before the migration.
- On **nestly-prod, Afik runs it**, before approving the `db-production` migration.

Drizzle: the three tables go in `schema.ts`, with a `customType` for bytea. The write models `recoveryAnswersInsert`,
`recoveryAnswersUpdate`, `recoveryThrottlesInsert`, `recoveryThrottlesUpdate` and `recoveryEventsInsert` name exactly the
granted columns. The drift check covers the rest.

**Rollback**   `supabase/rollback/<ts>_recovery_questions.down.sql`:
- It **refuses while `recovery_answers` or `recovery_events` holds a row**: dropping either destroys personal data and audit,
  which is irreversible and reserved for Afik.
- Otherwise it drops the policies, helpers, index and tables. `recovery_throttles` is operational state and may be dropped
  with them.
- The CI fingerprint round trip (up, down, up) must pass.
- Afterwards, `postgres` runs `revoke app_recovery from app_server; drop role app_recovery;` and the bootstrap edit is
  reverted. On prod that is Afik.
- Code goes first: revert the F1.6 server code, then run the down script.

F1.1's down script will also fail while these tables reference `users` (dependent FKs), which is fail-safe. Its header should
name the new order: F1.6 down, then F1.4, then F1.1.

**Backfill**   None. Existing accounts have no row, read as `missing`, and are held on the questions screen (DR-C). No live
data is rewritten.

**Indexes**
- `recovery_answers_pkey (user_id)`: own-row reads (`/api/me`, change) and the cascade from `users`.
- `recovery_answers_email_handle_key` UNIQUE: the redeem lookup and handle uniqueness. One extra btree write per save or
  change, which is negligible.
- `recovery_throttles_pkey (subject_kind, subject_hash)`: the only access path.
- `recovery_events_pkey (id)`.
- `recovery_events_user_id_idx (user_id) WHERE user_id IS NOT NULL`: serves the RESTRICT check when a `users` row is deleted
  (I9; without it, every user deletion scans the audit), and a future per-account investigation. Accepted cost: one btree
  write per attempt.
- Deliberately none on `handle_hash`, `ip_hash`, `occurred_at` or `locked_until`: nothing reads them at runtime. The admin
  audit view (FR-ADMIN-005) and the retention purge will add their own indexes along with their queries.

No existing query changes shape.

**Integrity**
- `recovery_answers` → `users` CASCADE: the answers are part of the account and die with it. No orphans.
- `recovery_events` → `users` RESTRICT: the audit must not disappear as a side effect. As with `legal_consents`, the I9
  deletion flow (OP-028) decides what happens to it first.
- Events for unknown handles have `user_id` NULL by design.
- `recovery_throttles` has no FK: it is keyed by hashes, including hashes of emails that have no account (criterion 11). Its
  rows are rate-limit state, not orphans.
- Append-only: no UPDATE or DELETE on events for any runtime role.
- A second POST for the same user hits `recovery_answers_pkey` (23505), which the server maps to 409.
- A collision on `email_handle` is impossible while Auth keeps email unique and the anchor is RESTRICT. If it happens it maps
  to 500, never to a message.

**Retention**
- **Answers** live with the account (cascade).
- **Audit retention is undecided.** §13.4 is TBD, and this needs a new OP in Appendix B in the DR3 `/srs-update` batch. It must
  not be filled now; the table keeps every row until it is decided.
- **Throttle rows** are rate-limit state, and the mechanics are my decision. A row is disposable once `locked_until` and both
  windows have passed, or 24 h after its last failure. `app_jobs` is NOLOGIN and no job exists, so → `debt.md`: a purge job,
  built with the first job infrastructure.
- **Growth:** the limits bound it per IP, but not across a botnet. At 100× this is still megabytes, not a near-term problem.
  Watch it against the Free plan's 500 MB, together with the events table.

**Blast radius**
- New readers and writers: the three recovery routes and `GET /api/me`.
- `users` deletion (I9): now also cascades `recovery_answers` and is RESTRICTed by `recovery_events`.
- `token-verifier.ts`: must expose the email claim to the store route only (for lookup, never for authorization: rule 14,
  spec DR-B). `Identity` stays user-id-only for everything else.
- Bootstrap, the roles check, and the knowledge files.

Existing tests that change:
- `supabase/tests/10_identity_structure.sql`: four global assertions are scoped to the five F1.1/F1.4 tables:
  - "INSERT policies are exactly the five";
  - "no UPDATE, DELETE or ALL policy in nestly";
  - "every policy is TO authenticated only";
  - "authenticated holds no UPDATE … on any table in nestly".

  The recovery tables get their own exact assertions in a new file, `30_recovery_*.sql`.
- `supabase/tests/20_registration_structure.sql`: "the policies are exactly ten" and "every policy is TO authenticated only",
  scoped the same way.
- `supabase/bootstrap/01-roles.sql` and `01-roles-check.sql`: expected memberships.
- `apps/server/tests/credentials.static.test.ts`: the `SUPABASE_SECRET` allowance in exactly one file, plus the new name and
  literal assertions.
- `apps/server/tests/db/me.db.test.ts`: "every body is exactly `{state}`" becomes `{state, recoveryQuestions}` for `active`;
  the other two states keep `{state}`.
- The drift test picks up `schema.ts` automatically.

Unchanged: `tests.approved_security_definer()` (stays empty), F1.4's contract and tests, and `00_session_is_app_server.sql`,
which gains assertions but loses none.

**Reversible?**   **Yes, structurally**: only new objects, no backfill, and a down script plus a role drop. **Once live rows
exist, rolling back means destroying recovery answers and audit**, which is irreversible: the down script refuses, and doing it
is Afik's. The password changes and sign-outs it causes in Auth are user actions, not migration effects.

---

## Knowledge proposal — `.claude/knowledge/data-model.md` "Approved exceptions"

DATA ARCHITECT proposes; **CRITIC validates**. It lands in the same unit of work as the migration.

Widen the section's first sentence to: "A SECURITY DEFINER function (rules 10, 16, 17, 18, 19), a `TO app_jobs` policy (rule
6), a role or credential outside rules 1–4, or a materialized view or foreign table…". Replace "*none yet.*" with:

```
F1.6 password recovery (FR-AUTH-003, OP-029) — the one exception Afik approved for this flow only (decisions/2026-10.md,
2026-10-13). Two parts, nothing else:
(a) Auth: set the password and end every session of the same user id — with the Supabase secret key from env
    SUPABASE_SECRET_KEY, read only in apps/server/src/recovery/auth-admin.ts, whose only operation is
    resetPassword({userId, email, password, clientIp}). It makes exactly three calls, in this order, and none is exported
    alone: `PUT <issuer>/admin/users/<uuid>` {password}; after a 2xx, one `POST <issuer>/token?grant_type=password` with
    the new password the request already holds; then `POST <issuer>/logout?scope=global` with that access token, which
    revokes every refresh token of the user. The token is discarded (never returned, logged or stored).
    `Sb-Forwarded-For` carries the platform-verified client IP. Called only by the redeem service after both answers
    matched under the limits and a reset_verified row was committed.
    Why: no database role may set an Auth password (auth.users is outside the product's roles, rule 1); a signed-out user
    has no token; and the admin API has no revoke-by-user-id, while a reset that leaves an attacker's session alive does
    not end a takeover.
    Fence: credentials.static.test allows the key's name in that one file only and asserts it is there; the admin,
    token-grant and logout literals appear in that file only; never in .github/. The key itself is not scoped by Supabase
    (it carries service_role power over the whole project), so the fence is the code and the CI check, not the credential.
    Approved in .work/password-recovery/schema.md (with Amendment 1) · 2026-10-15
(b) role app_recovery — NOLOGIN, NOINHERIT, NOBYPASSRLS, owns nothing; granted only to app_server WITH INHERIT FALSE,
    SET TRUE. The signed-out redeem, and the recovery verification and audit writes, run under SET LOCAL ROLE
    app_recovery, held by RLS + FORCE. It reads recovery_answers and reads/writes recovery_throttles only for the handle
    and IP hash the transaction declares (nestly.recovery_handle(), nestly.recovery_ip()), appends recovery_events, and
    reads no audit and no other table.
    Why: a guest endpoint has no auth.uid(), and anon must hold nothing in nestly (rule 7, CI anon_privilege).
    Not a SECURITY DEFINER function; tests.approved_security_definer() stays empty.
    Approved in .work/password-recovery/schema.md · 2026-10-15 (DR-G1, ORCHESTRATOR)
```

Also update:
- rule 2: "…and `anon` for guest endpoints; `app_recovery` for the recovery flow only, see Approved exceptions";
- rule 4: append "Exception: the recovery flow runs as `app_recovery`";
- bootstrap step 1: four roles;
- `data-model-tables.md`: the three tables, in its template;
- the conventions row "RLS helpers": the two recovery helpers are granted to `app_recovery`, not `authenticated`;
- the "SELECT stays table-level" row: `recovery_answers` has the first column-level SELECT, so hashes cannot be read back.

---

## Open

**Decided 15.10.2026 by ORCHESTRATOR** (to be recorded in `decisions.md`):
- **DR-G1:** `app_recovery` approved as part (b) of the one pre-approved exception.
- **DR-G2:** criterion 3 amended to "`authenticated` and `anon` cannot read the hash or salt columns, not even their own;
  `app_recovery` reads them only for the one handle its transaction declares (pgTAP)".
- **Q2:** designed now (Amendment 1), not debt.

**Q-G1 — Auth's password policy against VAL-003** (BUILDER verifies on preview; default stated).
- I cannot read Auth's dashboard settings from the repository: there is no `supabase/config.toml`, and the hosted settings are
  not in code. What has to match VAL-003:
  - minimum 8 (ORCHESTRATOR confirmed it on both projects since 14.10);
  - "Password requirements" set to *no required characters*;
  - leaked-password protection *off*, because VAL-003 forbids blocking leaked passwords;
  - no CAPTCHA on sign-in (Amendment 1, condition 1).
- **FINDING (likely conflict, verify).** GoTrue hashes passwords with bcrypt, which uses at most **72 bytes**. As I recall,
  recent GoTrue versions **reject** a longer password with a 422 instead of truncating it. VAL-003 allows 256 characters, and
  a Hebrew letter is 2 bytes in UTF-8.
  - So a long or mostly-Hebrew password may be refused by Auth: here as `admin_failed`, a 503 every time for that password,
    and in F1.4's sign-up in the browser.
  - **Default if unanswered:** BUILDER tests on preview with a 73-byte password (for example 37 Hebrew letters). If Auth
    refuses it, it is a VAL-003 / SRS question for ORCHESTRATOR: lower the technical maximum, or accept the error. F1.6
    cannot absorb it, and it touches F1.4 too.

**For Afik (already reserved; ORCHESTRATOR to widen the WORKPLAN items):**
1. **The two secrets.** He enters `SUPABASE_SECRET_KEY` and `RECOVERY_PEPPER` on Vercel, for Preview and Production. He
   should know what he is entering: the secret key is project-wide, with service_role power. Only the code fence limits it to
   these three calls, so a leak of the server's environment is a leak of the whole project. That is the accepted price of the
   approved exception, stated here so it is not discovered later.
2. **Bootstrap step 1 re-run on nestly-prod**, before the prod migration.
3. **Privacy policy (legal).** Besides the answers, it should list the email handle, the IP hash and the recovery audit:
   pseudonymous personal data, kept for a period that is still TBD.
4. **His Auth dashboard.** Keep CAPTCHA off for sign-in: turning it on would make every reset end as `revoke_failed` and a
   503 (safe, but broken). Optionally, shorten the JWT expiry to narrow the access-token residual.

**Debt to record:**
- the throttle purge job;
- audit retention, once its OP exists.

Q2 is no longer debt.

---

## Amendment 1 — 15.10.2026 (ORCHESTRATOR: Q2 is designed now, not debt)

Changed against the first version:
- **The Auth calls:** set-password, then one password grant, then a global logout, all inside one exported function.
- **Event kinds:** two new ones, `reset_completed` and `reset_revoke_failed`. `user_id` is now required for every kind except
  `reset_failed` and `reset_limited`.
- **The consistency table:** a revoke failure answers 503 and is retried; a success needs both Auth confirmations.
- **Rate-limit interplay:** `Sb-Forwarded-For` is sent with the secret key, so Auth counts the owner's IP.
- **The exception text:** part (a) now covers set-password plus one global sign-out of the same user id.
- **The CI check:** the token-grant and logout literals are fenced to the one module.
- **Spec consequences:** criterion 15 is split, and criterion 9 gains an assertion.
- **Q-G1:** the 72-byte finding.

No table, policy, grant, index or migration step changed, except the CHECK on `recovery_events.kind` and `user_id`.

Done — Gate 2 schema with Amendment 1 · Artifact — `.work/password-recovery/schema.md` · Next owner — ORCHESTRATOR (Gate 2;
record DR-G1, DR-G2, Amendment 1 and the spec change to criteria 9, 13 and 15)

---

## Deviation review — F1.1 down script refusal (DATA ARCHITECT, 15.10.2026)

**Verdict: Confirmed.** My Rollback section was wrong: F1.1's down script ends with `drop schema nestly cascade`, which
drops the recovery tables (and any answers and audit rows) without a check. The dependent FKs do not stop a CASCADE. The
sentence "F1.1's down script will also fail while these tables reference `users` (dependent FKs)" is withdrawn. BUILDER's
refusal makes it true, for a different reason.

1. **Guard correct.** `to_regclass('nestly.recovery_answers') is not null` → raise. It runs inside the `begin`, after the
   `app_owner` check and before `no force row level security` and every drop, so a refusal aborts the whole transaction
   with nothing changed. The header order line (F1.6, then F1.4, then F1.1) is right.
   *Low, optional:* the `legal_consents` check runs first, so with everything applied the message says "run F1.4 first",
   which is the opposite of the header. Following it does no harm: F1.4's down touches no recovery object and succeeds,
   then F1.1 refuses again and names F1.6. The order still settles with no data loss. Moving the recovery check above the
   `legal_consents` check would make the message match the header. Not required.
2. **Editing an applied migration's down script is acceptable.** `supabase/rollback/` is outside `supabase/migrations`,
   so the CLI never reads it and `schema_migrations` records nothing about it. CI's "fingerprint" is a catalog fingerprint
   of the database (`supabase/ci/catalog-fingerprint.sql`), not a file hash, and the up → down → up round trip runs only
   the **newest** migration's down script (`ci.yml` "Migrations as app_owner"). No file-hash or drift check covers rollback
   files. Consequence: CI never runs this guard. It is verified only by reading it, which is acceptable for a
   raise-only block copied from the existing `legal_consents` pattern.
3. **One check is enough.** All three tables are created in one migration transaction, and the F1.6 down script drops them
   in one transaction, so a state where `recovery_answers` is missing but `recovery_throttles` or `recovery_events` remains
   cannot come from the scripts. It could only come from manual DDL, which is out of the model. No guard for the other two
   tables is needed.

**Recovery down script (`supabase/rollback/20261015200000_recovery_questions.down.sql`) matches the Rollback section.**
- It refuses while `recovery_answers` or `recovery_events` holds a row. Before counting, it lifts FORCE on those two
  tables inside the transaction, so the count is real; a refusal rolls the lift back.
- `recovery_throttles` is dropped without a count, as decided.
- It drops all 8 policies, the index, the 3 tables and the 2 helpers (their grants and comments go with them), and revokes
  USAGE on `nestly` from `app_recovery`.
- It deletes history row `20261015200000`.
- Its header names the role drop by `postgres`, the revert of the bootstrap edit, and "code first".
- Checked against the migration: nothing the migration creates is left behind. The explicit policy and index drops are
  redundant with `drop table`, but harmless. The CI round trip confirms the result.

---

## CRITIC findings 1-2 — recommendation (DATA ARCHITECT, 15.10.2026)

Both are schema changes. **No migration is live**: 20261015200000 waits on bootstrap step 1 and is applied to neither preview
nor prod. So both are edits to that one migration file and its companions (down script, `schema.ts`, pgTAP, drift). No
backfill, no new migration. Reversibility is unchanged (end of this section).

### Finding 1 — stale or squatted email handle

**The invariant the design was missing.** "Auth keeps email unique" makes the handle unique only while every row's handle is
the hash of its user's **current** Auth email. A self-service email change breaks that silently: `PUT /auth/v1/user`, with
Confirm email off, is applied by GoTrue at once, checking only that the new address is free. Neither case is a takeover,
because the row's `user_id` picks the account whose password is set, never the request. Both are availability and
correctness faults. Under DR-C the squat is a cheap, targeted lockout.

**(a) Prevent or detect at Auth: not available without email; one option, reserved.**
- No Auth setting blocks a self-service email change. "Secure email change" and confirmation work only with an email
  provider.
- No Auth hook fires on a user update. The hooks are access-token, send-email/SMS, MFA/password-attempt and
  before-user-created. Send-email does not fire while Confirm email is off.
- The only real block is a `BEFORE UPDATE OF email` trigger on `auth.users` that raises. It is the strongest option and
  **not recommended now**:
  - it needs `postgres` (bootstrap, not a migration);
  - it is DDL in Supabase's managed schema, outside platform rule 1;
  - it turns every self-service change into a 500, and may break a future Google sign-in if GoTrue syncs the provider
    email.

  If wanted, it is hardening only and reserved for Afik (Auth schema, security model). The design below does not rely on
  it.
- Detection without any Auth call is possible: the token's email claim arrives on every signed-in request. (c) and (d) use
  it.

**(b) Current Auth email at redeem: recommended, required.** It is the only layer that makes "a password is set only on the
account the request's email names *now*" true. It turns the legitimate-change case from "password set, then
`revoke_failed`" into a clean refusal.

The new call:
- `resetPassword` in `auth-admin.ts` gets a **call 0** before call 1: `GET <issuer>/admin/users/<uuid>`.
- It uses the same key, the user id from the row, and the same `Sb-Forwarded-For`.
- Read only `email`, normalise it with the shared normaliser the handle uses, and compare it with the request's normalised
  email:
  - equal → calls 1-3 as now;
  - different or missing → **no further call**, and return `'email_mismatch'`;
  - non-2xx or timeout → `'admin_failed'`, with the password unchanged.

Outcome `email_mismatch`:
- Transaction 2 writes the new kind **`reset_email_mismatch`**.
- The response is **401 `{"error":"invalid_recovery"}`**, the same body as a mismatch.
- No counter changes, since transaction 1 has already committed.
- Only someone who knew the answers can tell this branch apart by timing, which is acceptable.

Cost and fence:
- Budget: 4 calls at 5 s each; keep the 12 s total. BUILDER confirms the function's `maxDuration` exceeds it.
- Fence: `/admin/users/` is already a fenced literal. No new literal.
- Authority: same key, same module, same user id, read-only, and it only narrows when a password is set.
  - I read it as within exception part (a), which ORCHESTRATOR widened at Gate 2 (Amendment 1, the precedent).
  - If ORCHESTRATOR holds that any growth of the exception's scope is a security-model change, it is Afik's.
  - Either way, the knowledge text for (a) becomes "four calls: read the user's email, set the password, ...".
- Worth it: yes. One call on a rare path removes the worst outcome: a password changed on an account the caller cannot sign
  in to with that email.

**(c) Release a stale handle on store: recommended, required (the squat case).** The caller's verified token says "at
`iat`, I held E", and Auth uniqueness means **the later claim wins**. A token stays valid for up to an hour after an email
change, so "the caller wins" alone would let a stale token take a handle back (ping-pong). Ordering by `iat` stops that.

Schema, `recovery_answers`:
- `email_handle` becomes **nullable**. NULL means "released: no email finds this row". UNIQUE allows many NULLs, and redeem
  never matches NULL.
- New column **`handle_claimed_at`** timestamptz null, set to `to_timestamp(iat)` of the token whose email set the handle.
  - UTC, at second precision (JWT `iat` is whole seconds).
  - CHECK `(email_handle is null) = (handle_claimed_at is null)`.
- New helper **`nestly.recovery_claimed_at()`**, in the same shape as the other two:
  - it reads `nestly.recovery_claimed_at` and returns timestamptz;
  - unset gives NULL, which fails closed;
  - EXECUTE is granted to `app_recovery` only.
- New policy **`recovery_answers_release_recovery`**, FOR UPDATE TO app_recovery:
  - USING `email_handle = (select nestly.recovery_handle()) and handle_claimed_at < (select
    nestly.recovery_claimed_at())`;
  - WITH CHECK `email_handle is null and handle_claimed_at is null`.
- Grant `app_recovery` UPDATE on `(email_handle, handle_claimed_at)`.
  - That role can only **release** the one declared handle, and only when the holder's claim is older. It cannot set a
    handle, touch hashes or delete.
  - This is the single enforcement point for "who may take a handle": RLS, not code, and no SECURITY DEFINER.
- `authenticated`:
  - INSERT grant gains `handle_claimed_at`;
  - UPDATE grant gains `email_handle, handle_claimed_at` (own row only, through the existing `_update_own`);
  - SELECT grant gains `handle_claimed_at`.

  Hashes and salts stay unreadable. It could already write any `email_handle` on INSERT; computing the HMAC is the server's
  job in both cases.
- New event kinds, each with `user_id` not null:
  - **`handle_released`**: user_id = the account that lost the handle;
  - **`handle_rekeyed`**: user_id = the caller.

Store (`POST`), one identity transaction, in this order:
1. `set local role app_recovery`; declare handle = H(token email), the IP, and claimed_at = the token's `iat`.
2. Run `select user_id from nestly.recovery_answers for update` with no `where`. FOR UPDATE applies UPDATE USING too, so RLS
   returns the declared row exactly when a release is allowed.
3. If a row came back:
   - Insert `handle_released` with that user_id **first**: the event policy binds user_id to the declared handle's row.
   - Then run `update nestly.recovery_answers set email_handle = null, handle_claimed_at = null` with **no `where` and no
     `returning`**. Either one would make Postgres check the new NULL row against the SELECT policy and fail.
   - pgTAP asserts that this exact statement works.
4. `set local role authenticated`; insert the own row with handle and `handle_claimed_at`.
5. `answers_saved` as `app_recovery`, as today.

Errors:
- 23505 on `recovery_answers_pkey` stays 409 `already_set`.
- 23505 on `recovery_answers_email_handle_key` now means only "the holder's claim is not older than mine", i.e. a stale
  caller token. It returns **503 `unavailable`**, never 500, and logs one fixed line.
- A token refresh gives a newer `iat`, so a legitimate caller succeeds within the hour.

**(d) Re-key on `GET /api/me`: recommended (the legitimate email change).** Without it, a user who changed email keeps a
handle that no longer finds them, and nothing ever prompts them.

When it runs:
- After `/api/me` has built its response, `active` only, compare H(token email) with the own row's handle.
- It needs the pepper. If the pepper is missing, skip the check: this is liveness, not authorization.
- Re-key when the row exists, its handle differs or is NULL, and `handle_claimed_at` is NULL or older than the token's
  `iat`.

How it runs, in a **separate** transaction:
1. Steps 1-3 of store.
2. As `authenticated`: `update ... set email_handle = H, handle_claimed_at = iat where handle_claimed_at is null or
   handle_claimed_at < $iat` on the own row.
3. `handle_rekeyed` as `app_recovery`.

Failure handling:
- Any failure is logged as one fixed line and ignored: a 23505 (the holder is newer), or a deadlock between two accounts
  swapping emails (Postgres aborts one).
- **The `/api/me` response never depends on it.**
- The answer hashes do not bind the email, so they stay valid.

Related changes:
- `PUT` (change): if the own handle is NULL or stale, run the same re-key at the start of its transaction, then
  `guardedAttempt` on the current handle. If the re-key cannot happen, return 503 `unavailable`.
- `token-verifier.ts` exposes the email claim **and `iat`** to the store, change and `/api/me` paths. They are used for
  lookup and ordering only, never for authorization (rule 14). This widens "the store route only" in Blast radius.

**Both cases after (b)-(d).**
- **Squat:**
  - The victim's first save releases the attacker's row. The victim saves (201) and is not held.
  - The attacker's stale token cannot take the handle back (older `iat`): the attacker's re-key and POST fail.
  - Redeem by the victim's email finds the victim's row.
- **Legitimate change:**
  - The next `/api/me` with a token carrying the new email re-keys, so recovery by the new email works.
  - Recovery by the old email finds one of three things: nothing; the new holder's row; or, if the user has not opened the
    app since the change, their own stale row. In that last case (b) refuses with 401 before any password is set.
  - Residual, stated once: a user who changes email through the raw API and forgets the password **before** opening the
    app again cannot recover by either email. It needs a raw API call the product does not offer. Accepted.

**Spec wording (ORCHESTRATOR records it as a spec change):**
- New 🔴 **21:** "If another account holds the handle of the caller's token email under an older claim, saving answers
  releases it and succeeds (201); a redeem with that email then reaches the caller's account; the audit shows
  `handle_released` for the other account. A caller whose token is older than the holder's claim gets 503 `unavailable` and
  nothing changes."
- New 🔴 **22:** "If the account's current Auth email is not the request's email, a verified reset sets no password and
  makes no sign-in or sign-out call: 401 `invalid_recovery`, audit `reset_verified` + `reset_email_mismatch`."
- New 🔴 **23:** "When the token's email differs from the stored handle and the token is newer, `/api/me` re-keys the handle
  (audit `handle_rekeyed`) and a redeem by the new email succeeds; the `/api/me` body is the same whether the re-key
  succeeds, fails or is skipped."
- Criterion 13's outcome list gains `reset_email_mismatch` (wording below).

### Finding 2 — rate-limited requests grow the database

**Lock order: IP first, then handle, on every path.** Redeem and change both go through `guardedAttempt`, and nothing else
takes a throttle lock, so one global order stays deadlock-free. Taking the IP lock first also serialises every attempt from
one IP, which makes the IP limit exact.

Order inside `guardedAttempt`:
1. `set local role app_recovery`; declare the subjects, as today.
2. Insert the IP row `on conflict do nothing`, then `for update` it.
3. Read the declared answers row. It is a read only, and it is needed even when the IP is locked: the event policy binds
   `user_id` to that row's user, so a `limited` event with the wrong user_id fails.
4. **IP locked:**
   - create and lock no handle row;
   - write the limited event at most once per lock (below);
   - return 429 with the IP's `retry-after`.

   If the handle is still locked when that ends, the next attempt gets a second 429, which criterion 12 allows.
5. Otherwise insert and lock the handle row. If it is locked, do the same as step 4, using the handle's marker.
6. Otherwise continue as today: two scrypts, then on a mismatch `recordFailure` on the IP first, then the handle.

Known and unknown handles behave identically on every branch: the IP-locked branch creates no handle row for either.
Criterion 11 holds.

**One limited event per subject per lock.**
- Schema: `recovery_throttles` gets **`limited_noted_until`** timestamptz null, UTC.
  - It holds the `locked_until` value for which a limited event has already been written.
  - It is added to `app_recovery`'s UPDATE grant. No index.
- In the locked branch, `lockThrottle` also returns `noted = (limited_noted_until is not distinct from locked_until)`.
  - Not noted: set `limited_noted_until = locked_until` on that subject and insert the one `*_limited` event.
  - Noted: write nothing.
- `locked_until` cannot move during a lock, because a locked attempt never counts a failure. So there is exactly one event per
  lock window.
- What is lost: the count of requests during a lock. Nothing reads it, and the failures that count are still each audited.

**Resulting bound.**
- A locked IP costs **zero writes per request** after the first.
- Per IP, each window-plus-lock cycle writes at most:
  - as many handle rows as the IP's short limit;
  - the same number of `*_failed` events;
  - one `*_limited` event.
- Growth is now proportional to distinct IPs (/64 for IPv6) and to time, not to request volume.
- What makes it finite is still the throttle purge job (debt) and audit retention (an OP to open).
- Correct the Retention "Growth" bullet to say this.

**Criterion 13, exact wording I recommend:**
> 13. 🔴 Every attempt that is not rate-limited (failed reset, verified reset, failed change, answers saved, answers changed)
> writes exactly one audit row, in the same transaction as its counters; a verified reset then adds exactly one outcome row
> (completed, admin failure, revoke failure, email mismatch). A rate-limited attempt writes at most one audit row per locked
> subject per lock: the first limited attempt in a lock writes one `reset_limited` / `change_limited` row; later attempts in
> the same lock write no row in any table, and while the IP is locked no throttle row is created for the submitted email.
> Each row holds kind, user id when known, handle hash, IP hash and time; `authenticated` and `anon` have no access; no
> answer, password or email is in it.

Test assertion: "N ≥ 2 attempts with N distinct unknown emails from one locked IP add exactly one `reset_limited` row and
zero `recovery_throttles` rows."

### Schema delta, migration, rollback

Changes to migration 20261015200000, by step:
- **Step 1:**
  - `recovery_answers.email_handle` becomes nullable;
  - `handle_claimed_at` is added, with its paired-null CHECK;
  - `recovery_throttles.limited_noted_until` is added;
  - the `kind` CHECK gains `handle_released`, `handle_rekeyed` and `reset_email_mismatch`. `user_id` is not null for all
    three.
- **Step 4:** the third helper.
- **Step 5:** the release policy (nine policies in all).
- **Step 6:** the grant changes above.
- **Step 7:** comments on everything new.

Elsewhere:
- **Down script:** drops the new policy and helper along with the rest.
- **pgTAP (`30_recovery_structure.sql`):** the counts change (nine policies, three helpers, the new grants). It also asserts
  that the release statement works, and that it is refused when the holder is newer and when WITH CHECK meets a non-NULL
  value.
- **Drift:** the drift test picks up `schema.ts`.
- **Indexes:** none new. The release and the re-key use `recovery_answers_email_handle_key` and the primary key, and the
  marker uses the throttle primary key.

**Reserved points.**
- None of the required parts touches one: this is a pre-merge revision of a migration that has not been applied.
- The field-meaning change, from "never updated" to "the most recent claim, released or re-keyed by the rules above", is
  ORCHESTRATOR's to decide (my decision-rights table): no live data carries the old meaning.
- (b) is ORCHESTRATOR's by the Amendment 1 precedent, with the caveat stated in (b).
- Only the optional `auth.users` trigger in (a) is reserved for Afik.

**Reversible?** Yes, unchanged. The down script still refuses while `recovery_answers` or `recovery_events` holds data.

Done — recommendations for CRITIC findings 1-2 · Artifact — `.work/password-recovery/schema.md` (this section) · Next
owner — ORCHESTRATOR (decide; record; amend criterion 13 and add 21-23)
