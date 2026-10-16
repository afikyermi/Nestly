# interface — F2.0 part (a), for TEST ENGINEER

Routes are protected (no token → 401 `{error:'unauthenticated'}` + `www-authenticate: Bearer`). All answers carry
`cache-control: no-store`. Bodies are strict (`packages/shared/src/validation/recovery.ts`): an unknown key (e.g. `userId`) is 400.
The body is judged before any database work; pepper or Auth key missing → 503 `{error:'unavailable'}` before any step.
Any other method on these paths → 405 `allow: POST`.

| Route | Body | Answers |
|---|---|---|
| `POST /api/password/forced` (c7) | `{ password }` VAL-003 | 200 `{ok:true}` · 400 `{error:'invalid_password'}` · 409 `{error:'not_required'}` (not the clearing session in must_set, not active, already set) · 503 (Auth did not confirm, row lock busy) · 401 stale token · 500 token without email claim |
| `POST /api/password/change` (c10) | `{ current: [{question, answer}×2], password }` | 200 `{ok:true}` · 400 `{error:'invalid_request'}` · 401 `{error:'invalid_recovery'}` (ERR-042: wrong answer, other pair) · 409 `{error:'not_set'}` (no saved answers) · 429 `{error:'rate_limited'}` + `retry-after` (ERR-043) · 503 (ERR-044: set or sign-out not confirmed) · 401 stale |
| `POST /api/password/first` (c11) | `{ password }` VAL-003 | 200 `{ok:true}` · 400 `{error:'invalid_password'}` · 403 `{error:'forbidden'}` (caller has a `nestly.users` row) · 503 · 500 token without email claim |

`GET /api/me` (c7): `state: 'active'` now always carries `mustSetPassword: boolean` — `true` only for the session that completed
a takeover clear and has not set its password (guard `must_set`); `false` otherwise. `unavailable` / `unregistered` stay `{state}` alone.

**Session guard** (`nestly.session_guard()`, read in the statement that sets the claims of every identity transaction):
`ok`/`must_set` proceed · `pending` → 503 on every protected route, every session · `stale` (another session's token with
`iat` ≤ `cleared_at`, or no iat) → 401 on every protected route · `unchecked` (oauth token, no row) → detection first.
Claims passed to the database: `{sub, role:'authenticated', session_id?, iat?, amr?: [{method}]}` (DR-S1); a malformed
`session_id` (not a uuid) or `amr` entry is dropped by the server.

**Gate for oauth tokens** (`amr` contains `oauth`; `apps/server/src/plugins/authentication.ts`, `services/identity-link-service.ts`),
before the route: no row → `readIdentities` (caller's token) → `affected` iff earliest `email` identity `created_at` < earliest
`google` → tx 1 (insert `affected` + delete own answers) → tx 2 (`for update nowait`; `cancelPassword`; `signOutOthers`;
mark cleared; `takeover_cleared`, user_id NULL when no users row) → the request runs with guard `must_set`. Any failure →
503, state stays pending; the next request from a Google session resumes tx 2. A concurrent other Google session of the same
account ends `stale` (401). `unaffected` is written once; a later sign-in calls nothing.

**Audit kinds** (`recovery_events`): `takeover_cleared` (one per user, unique index), `password_set_forced` (c7),
`first_password_set` (c11, user_id NULL), `password_change_failed` / `password_change_limited` (c10 attempt, same throttle rows as
the question change: handle 5/30 min + 15/24 h, IP 10/15 min), `password_changed`, `password_change_auth_failed` (set or sign-out
not confirmed). Handle = HMAC of the token email (c7, c11, clear) or the account's own answers handle (c10).

**Test seams** — `buildApp({ database, logStream, recovery })`; `recovery.authAccount` replaces the F2.0 Auth calls
(`apps/server/src/recovery/dependencies.ts`, `AuthAccountPort`):
`isConfigured(): boolean` · `readIdentities({accessToken, clientIp}) → {kind:'ok', identities:[{provider, createdAt: Date}]} | {kind:'failed'}` ·
`cancelPassword({userId}) → 'set'|'failed'` · `setPassword({userId, password}) → 'set'|'failed'` ·
`signOutOthers({accessToken, clientIp}) → 'done'|'failed'`. The default reads `SUPABASE_SECRET_KEY` + issuer (auth-admin.ts):
`GET <issuer>/user`, `PUT <issuer>/admin/users/<sub>` (`same_password` → set), `POST <issuer>/logout?scope=others`.
`recovery.authAdmin` (F1.6 reset) is unchanged. Tokens: the fixtures' `token({ extra: { session_id, amr: [{method:'oauth'}] } })`.

**Logs** (fixed messages, never body/token/email/id): `identity link check failed` `{step, sqlstate}` (step: `identities read`,
`takeover clear cancel`, `takeover clear sign_out`, `identity link check`) · `forced password set failed` / `first password set
failed` / `password change failed` `{sqlstate}` · `password change: the outcome row was not written`.

**Web (c13, c16)**: `AuthClient.setPassword` and `SessionAccount.setPassword` are gone; PG-005 Google completion calls
`setFirstPassword(token, password)` (`apps/web/src/services/api/password.ts`) → `POST /api/password/first`; anything but 200 →
password cleared + generic text, no register call (as before).
