# interface — F1.6 password-recovery, part a (server and database)

Facts only. Web (part c) is not built yet: no screen, no accessible name.

## HTTP

All JSON. All three recovery answers carry `cache-control: no-store`. A body over 16 KiB (`RECOVERY_BODY_LIMIT_BYTES`) is refused before parsing. A malformed JSON body, an unsupported content type or an oversize body: 4xx `{"error":"bad_request"}`. A `text/plain` body is parsed by Fastify as a string and then fails the route's schema: 400 with the route's own validation code (`invalid_request` on reset, `invalid_questions` on the questions routes), uncounted — the same as `/api/register` (ORCHESTRATOR, 15.10, step 2 of the handoff).

| Route | Auth | Body (strict objects, no other key) | Answers |
|---|---|---|---|
| `POST /api/recovery-questions` | Bearer, protected | `{"answers":[{"question","answer"},{"question","answer"}]}` | 201 `{"ok":true}` · 400 `{"error":"invalid_questions"}` · 409 `{"error":"already_set"}` · 403 `{"error":"forbidden"}` (database policy refused: account not active, or no account row) · 503 `{"error":"unavailable"}` (pepper missing, transient database fault) · 500 `{"error":"internal"}` (token without an email claim, other faults) · 401 from the hook |
| `PUT /api/recovery-questions` | Bearer, protected | `{"current":[2 entries],"answers":[2 entries]}` | 200 `{"ok":true}` · 400 `invalid_questions` · 401 `{"error":"invalid_recovery"}` (wrong current pair, counted) · 409 `{"error":"not_set"}` (no answers saved) · 429 `{"error":"rate_limited"}` + `retry-after` (seconds) · 403 · 503 · 500 · 401 `unauthenticated` from the hook |
| `POST /api/recovery/reset` | **public** (in `PUBLIC_ROUTES`) | `{"email","answers":[2 entries],"password"}` | 200 `{"ok":true}` · 400 `{"error":"invalid_request"}` (before any lookup, uncounted) · 401 `{"error":"invalid_recovery"}` (every failure to prove the answers, identical) · 429 `rate_limited` + `retry-after` · 503 `{"error":"unavailable"}` (pepper or Auth key/issuer missing, before database work; Auth set-password or global sign-out not confirmed; transient database fault) · 500 `internal` |
| other methods on both paths | | | 405 `{"error":"method_not_allowed"}` with `allow: POST, PUT` (questions) or `allow: POST` (reset); the hook answers 401 first when not signed in |

Entry: `{"question": "pet"|"nickname"|"street", "answer": string}`. Exactly two entries, two different ids. Answer: at most 600 UTF-16 units raw; 2 to 60 code points after normalising (`normalizeRecoveryAnswer`). Email: VAL-002 (trimmed). Password: VAL-003 (8 to 256 code points, not trimmed).

`GET /api/me`: `active` gives `{"state":"active","recoveryQuestions":"set"|"missing"}` (exactly those two keys); `unavailable` and `unregistered` give `{"state":...}` only.

Client address: `request.ip` with Fastify `trustProxy` as a function trusting the socket hop only, i.e. the last `X-Forwarded-For` entry. A test sets `x-forwarded-for` to choose the address. IPv6 is counted by its /64; `::ffff:a.b.c.d` as IPv4. A non-address counts under the single key `unknown`.

## Exports

`@nestly/shared` (packages/shared/src):
- constants: `RECOVERY_QUESTION_IDS`, `RecoveryQuestionId`, `RECOVERY_ANSWER_COUNT`, `RECOVERY_ANSWER_MIN_LENGTH`, `RECOVERY_ANSWER_MAX_LENGTH`, `RAW_ANSWER_MAX_UNITS`, `RECOVERY_SCRYPT` `{logN:15,r:8,p:1}`, `RECOVERY_LIMITS` (`handle`: shortFailures 5, shortWindowSeconds 1800, shortLockSeconds 1800, longFailures 15, longWindowSeconds 86400, longLockSeconds 86400; `ip`: shortFailures 10, shortWindowSeconds 900, shortLockSeconds 900), `RECOVERY_THROTTLE_SUBJECTS`, `RECOVERY_EVENT_KINDS` (10 kinds).
- validation: `normalizeRecoveryAnswer(raw): string`, `normalizeRecoveryEmail(raw): string`, `recoveryAnswersInput`, `recoveryStoreRequest`, `recoveryChangeRequest`, `recoveryResetRequest` (Zod; parse output has normalised answers), type `RecoveryAnswersInput`.

Server (apps/server/src):
- `recovery/pepper.ts`: `readRecoveryKeys(env?): RecoveryKeys | undefined` where `RecoveryKeys = {handle, ip, answer}: Buffer`. Reads env `RECOVERY_PEPPER` (base64 or base64url, at least 32 bytes decoded).
- `recovery/auth-admin.ts`: `isAdminConfigured(env?): boolean`, `resetPassword({userId,email,password,clientIp}, env?): Promise<'completed'|'admin_failed'|'revoke_failed'>`. Reads env `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_ISSUER` (https, or http on a loopback host). Three `fetch` calls in order: `PUT {issuer}/admin/users/{uuid}` `{password}` (headers `apikey`); after 2xx `POST {issuer}/token?grant_type=password` `{email,password}` (+ `Sb-Forwarded-For` when `clientIp`); `POST {issuer}/logout?scope=global` with `Authorization: Bearer <access_token>` (+ `Sb-Forwarded-For`). 5 s per call, 12 s total. `redirect: 'error'`.
- `recovery/hashing.ts`: `nodeScrypt`, type `ScryptFn = (secret, salt, params) => Promise<Buffer>`, `emailHandle(keys, email)`, `ipHash(keys, addressKey)`, `answerSecret`, `hashAnswer`, `sameHash`.
- `recovery/client-ip.ts`: `clientAddress(ip): {key, forAuth}`.
- `recovery/dependencies.ts`: `RecoveryDependencies {keys(): RecoveryKeys|undefined; scrypt: ScryptFn; authAdmin: {isConfigured(): boolean; resetPassword(input): Promise<outcome>}}`, `createRecoveryDependencies(overrides?)`.
- `buildApp({config?, database?, logStream?, clock?, recovery?: Partial<RecoveryDependencies>})`. `recovery` is the new seam.
- `lib/token-verifier.ts`: `TokenVerifier` now returns `{identity: {userId}, email: string|undefined}`. `request.verifiedEmail: string | null` is set by the hook (null on a public route or when the token has no email claim); only the questions store route reads it.
- `db/recovery-transaction.ts`: `assumeRecoveryRole(tx, {handle, ip})`, `assumeAuthenticatedRole(tx)`, `inRecoveryTransaction(database, subjects, work)`.
- `db/schema.ts`: `recoveryAnswers`, `recoveryThrottles`, `recoveryEvents`, and write models `recoveryAnswersInsert`, `recoveryAnswersUpdate`, `recoveryThrottlesInsert`, `recoveryThrottlesUpdate`, `recoveryEventsInsert`.
- Services: `redeemReset`, `storeRecoveryAnswers`, `changeRecoveryAnswers`, `guardedAttempt`, `canonicalPair`, `readAccountState` (now returns `{state, recoveryQuestions?}`).

## Test seams and how to drive

- Pepper: set env `RECOVERY_PEPPER` (32+ random bytes, base64) before the request, or pass `recovery: { keys: () => ... }`. Missing/short gives 503 on the three endpoints.
- Scrypt spy: `recovery: { scrypt: spy }`; each failing or verified attempt that reaches verification calls it exactly twice (the limited path calls it zero times; a store or change also hashes the new pair, two more calls, outside the transaction).
- Auth stand-in: either `recovery: { authAdmin: { isConfigured: () => true, resetPassword: async () => 'completed' | 'admin_failed' | 'revoke_failed' } }`, or a local HTTP stub with env `SUPABASE_JWT_ISSUER=http://127.0.0.1:<port>/auth/v1` and `SUPABASE_SECRET_KEY=<any>`; the stub sees the three requests above in order.
- Database: real `DATABASE_URL` as `app_server` (tests/db). Roles `authenticated`, `app_recovery` and the migration `20261015200000_recovery_questions.sql` must be applied. Database clock decides windows and locks: a test moves state with SQL on `nestly.recovery_throttles` as the owner (e.g. set `locked_until` or window starts into the past), not with an app clock.
- A request's tokens: verified ES256 token as before; for the store route the token needs an `email` claim.
- Logs (`logStream`): the request line carries `{method, url}` where `url` is the route pattern (`unmatched` for no route). Fixed error lines: `recovery request failed`, `recovery reset failed`, `recovery answers write failed`, `recovery answers change failed`, `recovery reset: the outcome row was not written`, `recovery questions: the token has no email claim`; fields `status`, `code`, `sqlstate` only.

## Database (pgTAP targets)

- Tables `nestly.recovery_answers`, `nestly.recovery_throttles`, `nestly.recovery_events`; helpers `nestly.recovery_handle()`, `nestly.recovery_ip()`; role `app_recovery` (bootstrap step 1).
- 8 policies: `recovery_answers_select_own`, `_insert_own`, `_update_own` (authenticated); `recovery_answers_select_recovery`; `recovery_throttles_select_recovery`, `_insert_recovery`, `_update_recovery`; `recovery_events_insert_recovery` (all app_recovery).
- Declaring in a test transaction: `set local role app_recovery; select set_config('nestly.recovery_handle', '<64 hex>', true), set_config('nestly.recovery_ip', '<64 hex>', true);`.
- Constraint names: `recovery_answers_pkey` (a second save, 23505), `recovery_answers_email_handle_key`, `recovery_answers_question_order_check`, `recovery_answers_salts_differ_check`, `recovery_answers_scrypt_log_n_check`, `recovery_events_kind_check`, `recovery_events_user_id_check`, `recovery_throttles_long_window_check`, `recovery_throttles_long_failures_check`.
- Down script: `supabase/rollback/20261015200000_recovery_questions.down.sql` refuses while `recovery_answers` or `recovery_events` holds a row.
