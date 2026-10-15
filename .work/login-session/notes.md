# notes — F1.5 part a (login-session, criteria 1-4)

**Approach**  Migration + down script exactly as schema.md. `GET /api/me`: route -> service -> repository like `/api/register`. The repository does `select status from users limit 2` in the identity transaction, no where; the service maps 0 rows -> `unregistered`, one `active` -> `active`, one other value -> `unavailable`, 2+ rows -> `AccountStateFault` (500). Doc comments fixed in registration-repository.ts, registration-service.ts (also the `createRegistration` comment "an account the caller cannot see"), db/schema.ts. Route registered in `app.ts`.

**Decisions**
- `isTransient`/`isDeterministicFault` moved from `routes/register.ts` to `lib/pg-error.ts` as `isTransientFailure`, so `/api/me` and `/api/register` share one definition of "transient". Behaviour of register unchanged.
- The 405 answer on `/api/me` also carries `cache-control: no-store` (harmless, consistent). The 200/500/503-from-handler responses carry no-store; the hook's 401/503 do not (the hook is shared; unchanged).
- Unexpected non-database errors (e.g. `AccountStateFault`) -> 500 `internal`, never 503, because not connection failures.

**Deviations**  None from spec.md / schema.md.

**Deliberately not done**  No tests written or changed (TEST ENGINEER, list in schema.md). SRS, WORKPLAN, `data-model-tables.md` not edited (knowledge goes through CRITIC). No web changes (parts b, c).

**Uncertain**  Existing db-level tests that expect zero `users` rows for a stopped account will fail until TEST ENGINEER updates them; I could not run db tests here (no database), so that and the migration itself were verified by reading only. Verified by reading: `users_select_own` name, `nestly.users`, `status`, rollback line matches `20261014100000` line 81 and comment texts match before-texts.

**Preview path**  Not user-visible yet (no UI in part a). With a Bearer token: `GET /api/me` on the preview returns `{"state":"active"}` for a registered account, `{"state":"unregistered"}` for an Auth user with no row. Not testable by clicking until part b/c.

**Neighbouring**  None.

## Knowledge proposal (for CRITIC to validate; not promoted)
Target: `.claude/knowledge/data-model-tables.md`, users "Authorization" row (currently says reading is "only while status = 'active'").
Proposed text:
> Authorization: `users_select_own` (SELECT TO authenticated): an account reads its own row (`id = auth.uid()`) in every status (F1.5 DR-1 A, migration 20261015100000). Visibility of the own row does NOT mean "active": code that needs "is the caller active" uses `nestly.is_active_account()` or relies on the other tables' policies, never `exists(select from users)`. A suspended or banned account still reads zero rows of regular_profiles, journey_contexts, children and legal_consents (platform rule 15). INSERT: `users_insert_own` pins id, type and status; no UPDATE or DELETE.

## Fix: 401 log line (CRITIC finding 2)
The rejection log in authentication.ts no longer logs the error object (its jose cause can carry decoded claims); it logs only `reason` and jose `code`. Responses unchanged.

---

# notes — F1.5 part b (criteria 5-15, 21; web only)

**Approach**
- `services/auth/auth-client.ts` keeps the one auth-js import. Two ports from one object (`BrowserAuthPort`): `AuthPort` (`signUp`, unchanged, so F1.4 fakes still type-check) and new `AuthSessionPort` (`signIn`, `restore`, `getAccessToken`, `signOut`, `subscribe`). auth-js now runs with `persistSession`, `autoRefreshToken`, `storageKey 'nestly-auth'`, and a separate in-memory `userStorage`, so the persisted value is tokens only (verified: no email in it).
- `services/session/auth-session-source.ts` is the real source: `loading` until the stored session is read, then `/api/me` decides `signed-in` / `signed-in-no-account` / `signed-out`. Any doubt ends the session. Re-check at restore, after each `refreshed` event, and on tab-visible when the last answer is older than 60 s (injected `now`).
- New state `signed-in-no-account`; `decideAccess` renders only `/register` for it. Optional third argument `sessionEnded`: a signed-out Guest on a non-Guest path goes to `/login` instead of `/` when the session ended by itself (criteria 11, 13).
- Logout is the existing menu item: `signOut()` now clears the state first, then Auth (scope local) and storage; the guard sends to `/`.
- `memory-session-source.ts` removed (replaced). `productionSessionSource` is the real source; `browserAuthPort` is the single Auth port used by both registration and the source.
- Browser access (`localStorage`, `document`, `window` listeners) is in new `src/platform/` (`browser-storage.ts`, `browser-events.ts`) because the lint ban on window/document/localStorage covers hooks, services and lib.

**Decisions**
- User object kept out of web storage (`userStorage` in memory): criterion 10 says no email in storage and the SDK would otherwise write `user.email` into the one key. After a reload `session.user` is the SDK's "not available" proxy; the web only reads `access_token`.
- Registration success calls `SessionEntry.signIn()`, which now sets `signed-in` without asking `/api/me` (the account was just created, 201). Sign-up itself persists the Auth session while the source is still `signed-out`; abandoning step 2 leaves that session in storage, and the next page load finds it, asks `/api/me`, gets `unregistered` and lands in `signed-in-no-account` (completion, DR-2). That is the orphan path working as designed, but it also happens to a visitor who closed the tab on step 2.
- Auth's own `SIGNED_IN` events are not forwarded to the source: sign-in and sign-up are driven by the caller, so a half-finished registration never flips the source (it would unmount the registration form).
- Notice (`expired` or `stopped`) is memory-only, set only when a session ends by itself, cleared by the next sign-in attempt, `signIn()`, sign-out or `clearNotice()`. A user-initiated logout in this tab sets none; a logout in another tab follows through the storage event with no notice.
- Sign-in failures map to keys only (`invalid_credentials`, `rate_limited`, `unavailable`, `unknown`; `services/auth/sign-in-problem.ts`); texts belong to the login screen (part c). "Auth not configured" reads as `unavailable`.
- Restore when Auth or `/api/me` is unreachable: the state stays `loading` and is retried every 15 s (`RESTORE_RETRY_MS`) and on tab-visible. Nothing in the spec says; the alternative (signed-in without knowing the account) breaks fail-closed. The 15 s is mine.
- `/api/me` 401 at restore or re-check ends the session with `expired`.

**Deviations**  None from spec.md. Criterion 21 "the F1.4 test that pinned persistSession:false": I found no such test (grep `persistSession` in `apps/web/tests` and `e2e`: no hit); only the code comment pinned it, now changed.

**Deliberately not done**  Login screen, completion screen, texts for the sign-in problems and notices (part c). Auth settings (JWT expiry, rotation, confirm-email) are browser steps for ORCHESTRATOR (criterion 21). No test written or changed. No `online` listener.

**For part c** (what to call)
- `useSessionAccount()` returns `{ signInWithPassword(c), recheck(), getAccessToken(), clearNotice() }` or null (test-only source). `SignInResult`: `{kind:'signed-in'}` (the guard sends to `/feed`) | `{kind:'unregistered'}` (state is `signed-in-no-account`, the guard sends to `/register`) | `{kind:'stopped'}` | `{kind:'failed', problem}`.
- `useSession()` returns `{ state, notice, signOut }`. `notice` is `'expired'` ("ההתחברות פגה. אפשר להתחבר שוב") or `'stopped'` ("הכניסה לחשבון הזה אינה זמינה כרגע"); show it on `/login`; a submit clears it by itself.
- Completion mode: token from `getAccessToken()`; on 201 call `useSessionEntry().signIn()`; on 409 call `recheck()` (an `unavailable` answer ends the session with notice `stopped`, state `signed-out`; the guard allows `/register` for a Guest, so the screen must navigate to `/login` itself); on 401 call `signOut()` and navigate to `/login`.
- Keep the Hebrew texts in the login feature (like `step2-form.ts`), keyed by `SignInProblem`.

**Uncertain**
- Not exercised against a real Auth project. I drove the real auth-js client with a stub `fetch` (script outside the repo): sign-in, persisted value (tokens only), restore, expired-token refresh, refused refresh (storage cleared), 503 at refresh (session kept), corrupt value, sign-out. Cross-tab refresh with the real `navigator.locks`, the BroadcastChannel and the 30 s auto-refresh ticker are not exercised.
- A logout in tab A reaches tab B as both an auth-js `SIGNED_OUT` (BroadcastChannel) and a `storage` event; whichever comes first wins, so B may show the `expired` notice instead of none. The state is signed-out either way.
- A sign-out racing an in-flight refresh could, in principle, write the session back after storage was cleared; not handled.

**Preview path**  Not clickable end to end until part c (`/login` is still the placeholder). What can be checked now: register a new account, reload `/feed` (still signed in; before this part it signed out), menu "התנתקות" (back to Welcome, the browser Back button shows no protected screen, `nestly-auth` gone from Application > Local storage). Known not to work yet: sign-in, and completion mode (a reload on registration step 2 after sign-up lands on step 1 with email and password fields while the state is `signed-in-no-account`).

**Existing tests that now need updating (TEST ENGINEER)**
- Web unit suite: all 600 tests pass unchanged.
- `e2e/register-step2.spec.ts` (~385-420, "[F1.4 c13][Q7] ... storage ..."): asserts `localStorage` is `'{}'`; with the real Auth client and a stubbed Auth endpoint, sign-up now stores the session under `nestly-auth`. Change to criterion 10: only that key, no email, no password.
- `e2e/register-step2.spec.ts` (~659-668): the comment "nothing persists the session" and the manual reset after reload describe the old seam.
- `apps/web/tests/registration/register-step2.test.tsx:412` and `registration-flow.test.tsx:387`: pass with a fake port; the "nothing in storage" claim holds only because the port is faked.
- `source-scans.test.ts`: passes; the F1.4 c22 checks could add that `localStorage` appears in `src` only in `platform/browser-storage.ts`.
- `access-decision.test.ts`: add `signed-in-no-account` and the `sessionEnded` argument.

**Neighbouring**  None new.

## Fix: TEST ENGINEER finding (not configured) and logout vs an in-flight refresh
- `createAuthPort` now treats a blank or whitespace-only url or key, a url that is not absolute https (http only for localhost or 127.0.0.1), and a secret key as not configured. Every method then returns `AuthNotConfigured` (or `none` / null / false) with no request. A relative url could have sent the password to our own origin.
- Logout vs an in-flight refresh: auth-js clears its own state when its sign-out call succeeds; when that call fails, the port removed the storage key itself, and a refresh already running could save its new session afterwards. `signOut` now removes the key, waits for the SDK lock (`getSession`, which queues behind the running refresh), and removes the key again, so logout wins. Verified by reading the SDK, not by a timing test.
