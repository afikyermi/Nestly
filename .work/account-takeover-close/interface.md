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

# interface — F2.0 part (b), web, for TEST ENGINEER

**Session seam.** `mustSetPassword` is a flag beside `needsRecoveryQuestions`, not a new `SessionState` (the states stay four); the
helper state `signed-in-needs-new-password` = flag on + `signed-in`. Test source (`controllable-session-source.ts`):
`nestlyTestSession.setMustSetPassword(true)` (as TE assumed). Store/hook: `getMustSetPassword()`, `useSession().mustSetPassword`.
Real source: `GET /api/me` `state:'active'` + `mustSetPassword === true` (exactly) → `fetchAccountState` returns
`'active-must-set-password'` → flag on **and** `needsRecoveryQuestions` on (c8: the clear removed the answers). `SessionAccount.markPasswordSet()`
turns the flag off, leaves the questions hold on, no second `/api/me`.

**Guard** (`decideAccess(state, path, sessionEnded, needsQuestions, mustSetPassword)`, `apps/web/src/app/access.ts`): signed-in with the
flag → renders only `/set-new-password`, `/terms`, `/privacy` (both exist as placeholder routes, `AppRoutes.tsx`); every other path →
replace-redirect to `/set-new-password`. The flag is checked before the questions hold. Without the flag `/set-new-password` is not a
protected path: signed-in → `/feed`, Guest → `/`. `/change-password` joins `PROTECTED_PATHS`; while the questions hold is on it
redirects to `/recovery-questions` like every other protected path.

**c14 screen** `/set-new-password`, inside the shell (`ProtectedLayout`): h1 and `<title>` "קביעת סיסמה חדשה"; intro "כדי להגן על
החשבון, צריך לקבוע סיסמה חדשה. הסיסמה הקודמת בוטלה, וכל המכשירים האחרים נותקו מהחשבון."; field label "סיסמה חדשה" (PasswordInput,
`autocomplete=new-password`), toggle "הצגת הסיסמה"; submit `form button[type=submit]` "שמירת הסיסמה" (`aria-disabled` + pending while
busy; a second submit while busy sends nothing). Client check VAL-003 → field error "הסיסמה צריכה להכיל לפחות 8 תווים", nothing sent.
`POST /api/password/forced {password}`: 200 → flag off, replace-navigate to `/recovery-questions` (setup mode). Any other answer, or no
token → one `role=alert` (InlineAlert) with ERR-044 "לא הצלחנו להשלים את הפעולה כרגע. אפשר לנסות שוב מאוחר יותר", password field
empty, focus on the alert; 401/409 also re-ask `/api/me` (the guard follows the answer).

**c15 screen** `/change-password` (h1/title "החלפת סיסמה"): intro "כדי להחליף את הסיסמה, צריך קודם לענות על שתי שאלות השחזור ששמרתם.";
the PG-052 answer group (`RecoveryAnswerFields`, legend "ענו על השתיים ששמרתם עכשיו", three text inputs labelled by the question
texts, `autocomplete=off`); "סיסמה חדשה" + "הצגת הסיסמה"; submit `form button[type=submit]` "החלפת הסיסמה". Client checks: the answer
rule (count on the group, length per field) and VAL-003. `POST /api/password/change {current:[{question,answer}×2], password}`:
200 → `role=status` "הסיסמה הוחלפה. שאר המכשירים נותקו מהחשבון" in place of the intro, answers and password cleared. 401
`invalid_recovery` → ERR-042 "הפרטים שהוזנו אינם תואמים. אפשר לנסות שוב"; 429 → ERR-043 "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב
מאוחר יותר"; 503/unreachable/no token → ERR-044 (text above); other 401, 400, 409 → generic "משהו השתבש. אפשר לנסות שוב". Each in the one
`role=alert` region; the password field is emptied after every answer, the answers kept on failure. No storage, URL, query or history
state carries them (form `noValidate`, submit prevented, bodies only).

**Side menu**: four items in order — הגדרות (`/settings`) · שאלות לשחזור סיסמה (`/recovery-questions`) · **החלפת סיסמה** (link,
`/change-password`) · התנתקות (button).

**Stories**: `features/forced-password/ForcedPasswordForm` (Empty, PasswordTooShort, Failed) ·
`features/password-change/PasswordChangeForm` (Empty, FieldErrors, Changed, Mismatch, Locked, Unavailable — fetch stubbed per story) ·
`app/ProtectedLayout` (+ ChangePassword, MustSetNewPassword; DrawerOpen now shows four items).
