# interface — F1.5 part a (criteria 1-4)

## Route
- `GET /api/me`, protected (not in `PUBLIC_ROUTES`). Takes no id, query or body. Bearer token via the existing authentication hook.
- 200 `{"state":"active"}` | `{"state":"unavailable"}` | `{"state":"unregistered"}`; header `cache-control: no-store`. Only field: `state`.
- 401 `{"error":"unauthenticated"}` + `www-authenticate: Bearer` (hook; no database call). 503 `{"error":"unavailable"}` when verifier or database is missing (hook), or the database fault is transient. 500 `{"error":"internal"}` for a deterministic database fault or more than one own row.
- `POST|PUT|PATCH|DELETE|OPTIONS /api/me` -> 405 `{"error":"method_not_allowed"}`, `allow: GET`, after authentication (401 first without a token).
- Log on failure: one error line `account state read failed` with `{ sqlstate }` only.

## Modules
- `apps/server/src/routes/me.ts`: `registerMeRoute(app, { database: Database | undefined })`, `MeRouteDependencies`.
- `apps/server/src/services/account-state-service.ts`: `readAccountState(database, identity): Promise<AccountState>`, `type AccountState = 'active' | 'unavailable' | 'unregistered'`, `class AccountStateFault` (thrown on 2+ rows).
- `apps/server/src/repositories/account-state-repository.ts`: `readOwnStatuses(tx: IdentityTx): Promise<string[]>` (select users.status limit 2, no where).
- `apps/server/src/lib/pg-error.ts`: new export `isTransientFailure(error)` (moved from `routes/register.ts`, same logic).
- `buildApp(deps)` registers the route; same seams as before (`database`, `config`, `logStream`, `clock`).

## Test seams / driving
- Route tests: `buildApp({ config, database, logStream })` with the existing token-verifier test setup (as register route tests); db tests drive it with a real database and a token for the identity.
- Status change for criterion 4: update `nestly.users.status` as the owner/test role between calls with the same token; each call is a new identity transaction.

## Database
- Policy `nestly.users.users_select_own`: `using (id = (select auth.uid()))` (FOR SELECT TO authenticated). Migration `supabase/migrations/20261015100000_users_select_own_any_status.sql`; down `supabase/rollback/20261015100000_users_select_own_any_status.down.sql`.
- `hasAccount()` / `accountExists()` now true for a stopped account (own row visible).

## Server log: access token rejected (authentication hook)
Warn line message "access token rejected" carries fields: `reason` ("token" | "unavailable" | "unexpected"), `code` (jose error code string, may be absent). No err object, token, sub or claims. Responses unchanged (401 unauthenticated / 503 unavailable).

---

# interface — F1.5 part b (Auth module, session source, guard, logout). The login screen and completion mode are part c.

## Storage
- Key `nestly-auth` (`AUTH_STORAGE_KEY`, `services/auth/storage-key.ts`) in `localStorage`. Value: JSON `{access_token, token_type, expires_in, expires_at, refresh_token}` only (no `user`, no email). Nothing else is written to web storage, cookies or IndexedDB by our code.

## Auth module `services/auth/auth-client.ts` (the only file importing `@supabase/auth-js`)
- `createAuthPort(config?: AuthClientConfig, seams?: { keyValueStorage?: KeyValueStorage | undefined; fetch?: typeof fetch }): BrowserAuthPort`, where `BrowserAuthPort = AuthPort & AuthSessionPort`. Config default: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; a secret key or a missing value means not configured (no network call). Without `keyValueStorage` the session lives in memory. The `fetch` seam replaces the SDK's fetch (stub `/auth/v1/token` and `/auth/v1/logout`).
- `AuthPort.signUp` unchanged. `AuthSessionPort`:
  - `signIn({email,password}): Promise<{accessToken:string;failure:null}|{accessToken:null;failure:AuthFailure}>` (rejects only if the SDK throws).
  - `restore(): Promise<'none'|'session'|'refused'|'unreachable'>`: no stored value gives `none`; a value not shaped like an Auth session is removed and gives `none`; refresh refused removes storage and gives `refused`; Auth 5xx or network gives `unreachable` (storage kept).
  - `getAccessToken(): Promise<string|null>` (renews an expired token first).
  - `signOut(): Promise<boolean>`: scope local; the storage key is removed whatever Auth answers; never rejects; false when Auth could not be told.
  - `subscribe(listener: (event: 'refreshed'|'signed-out') => void): () => void`.
- Auto-refresh is the SDK's 30 s ticker, ahead of expiry. The client is built on first use (restore finding a stored value, sign-in, sign-up, getAccessToken).
- `services/auth/browser-auth-port.ts`: `browserAuthPort`, shared by the `AuthPortContext` default and `productionSessionSource`.
- `services/auth/sign-in-problem.ts`: `type SignInProblem = 'invalid_credentials'|'rate_limited'|'unavailable'|'unknown'`; `classifySignInFailure(failure: AuthFailure)`. `invalid_credentials` for codes `invalid_credentials`, `user_not_found`, `email_not_confirmed`, `user_banned`; `rate_limited` for status 429 or code `over_request_rate_limit`; `unavailable` for name `AuthRetryableFetchError` or `AuthNotConfigured`, status 0 or >= 500; else `unknown`.

## `GET /api/me` client `services/api/account-state.ts`
- `fetchAccountState(accessToken): Promise<'active'|'unavailable'|'unregistered'|'unauthenticated'|'unreachable'|'failed'>`. Request: `fetch('/api/me', {headers:{authorization:'Bearer <token>'}, cache:'no-store'})`. 401 gives `unauthenticated`; 503 or a thrown fetch gives `unreachable`; any other non-200, a non-JSON body or an unknown `state` gives `failed`.

## Session source `services/session/auth-session-source.ts`
- `createAuthSessionSource({ auth: AuthSessionPort, accountState: (token) => Promise<AccountStateOutcome>, now: () => number, events: BrowserEvents }): AuthSessionSource` (= `SessionSource & SessionEntry & SessionAccount`). Constants `RECHECK_AFTER_MS = 60000`, `RESTORE_RETRY_MS = 15000`.
- `BrowserEvents` (`platform/browser-events.ts`): `onTabVisible(listener)`, `onSessionRemovedElsewhere(listener)`, each returning a stop function. `windowBrowserEvents()` = `visibilitychange` (when visible) and window `storage` events with key `nestly-auth` (or `null`) and `newValue === null`. A test passes its own object and calls the listeners. `platform/browser-storage.ts`: `browserStorage()`.
- States: `loading`, `signed-in`, `signed-out`, `signed-in-no-account` (`SESSION_STATES`). Initial `loading`; the stored session is read once, at the first `subscribe`. `getNotice(): 'expired'|'stopped'|null`.
- Restore: `none` gives signed-out; `refused` gives signed-out and notice `expired`; `unreachable`, or `/api/me` unreachable or failed, keeps `loading` and retries every 15 s and on tab-visible; `session` asks `/api/me`: `active` gives signed-in, `unregistered` gives signed-in-no-account, `unavailable` calls `auth.signOut()` and gives signed-out with notice `stopped`, `unauthenticated` gives signed-out with notice `expired`.
- Re-check (only while signed-in or signed-in-no-account): after auth event `refreshed`; on tab-visible when `now() - lastAnswerAt > 60000`. Same mapping; `unreachable` and `failed` change nothing. Concurrent re-checks share one request. Auth event `signed-out` while a session is held gives signed-out with notice `expired`; `onSessionRemovedElsewhere` gives signed-out with no notice.
- `signInWithPassword({email,password}): Promise<SignInResult>`; one call at a time (a second joins the first). Clears the notice, calls `auth.signIn` (a rejection gives `{kind:'failed',problem:'unavailable'}`), then `accountState(token)`: `active` gives state `signed-in` and `{kind:'signed-in'}`; `unregistered` gives `signed-in-no-account` and `{kind:'unregistered'}`; `unavailable` calls `auth.signOut()`, leaves state `signed-out`, returns `{kind:'stopped'}`; any other answer calls `auth.signOut()` and returns `{kind:'failed',problem:'unavailable'}`. Wrong credentials return `{kind:'failed',problem}` and `/api/me` is not called.
- `signIn()` (SessionEntry, after registration): `signed-in`, notice cleared, no `/api/me`. `signOut()`: state `signed-out` at once, then `auth.signOut()`; notice cleared. `recheck()`, `getAccessToken()`, `clearNotice()` as in `SessionAccount`.
- `session-source.ts` exports `SessionNotice`, `SignInResult`, `SessionAccount`, `isSessionAccount`; `SessionSource.getNotice?`; `SessionStore.getNotice`. `productionSessionSource` is the real source over `browserAuthPort`, `fetchAccountState`, `Date.now`, `windowBrowserEvents()`. `memory-session-source.ts` is gone.

## Hooks and guard
- `useSession()` returns `{ state, notice, signOut }`. `useSessionAccount()` (`hooks/use-session-account.ts`) returns `SessionAccount | null` (null for a source without it, e.g. the controllable test source). `SessionProvider` supplies the entry and account contexts from the source.
- `decideAccess(state, pathname, sessionEnded = false)`: `loading` gives loading; `signed-in` as before; `signed-in-no-account` renders `/register` and redirects every other path to `/register`; signed-out (and any unknown state) renders Guest paths, else redirects to `/` or, when `sessionEnded`, to `/login`. `RouteGuard` passes `sessionEnded = notice !== null`.
- Logout: the `ProtectedLayout` menu item "התנתקות" calls `useSession().signOut()`; the guard then redirects a protected path to `/` (replace).

## Driving it in a test
- Source level: `createAuthSessionSource` with a fake `AuthSessionPort` (vi.fn members; `subscribe` keeps the listener so the test can emit `refreshed` or `signed-out`), an `accountState` stub returning the outcome, a counter for `now`, fake `BrowserEvents`; fake timers for the 15 s retry. Component level: `<App sessionSource={source} authPort={fakeSignUpPort} />` or `SessionProvider source={source}`.
- Real client: `createAuthPort(cfg, { keyValueStorage: map-backed, fetch: stub })`, fake timers for the ticker.

## Addendum (not configured, logout)
- `createAuthPort`: config is usable only when url and key are non-blank after trim, the url (trailing slashes removed) is absolute https or http on `localhost`/`127.0.0.1`, and the key is not a secret key. Otherwise `signIn`/`signUp` return failure name `AuthNotConfigured`, `restore` returns `none`, `getAccessToken` null; no request is made.
- `AuthSessionPort.signOut()` removes `nestly-auth`, waits for any running refresh, and removes it again; it resolves after both.

## Addendum (CRITIC part b fixes)
- Removed modules: `services/auth/browser-auth-port.ts`, `services/session/production-session-source.ts`. The production wiring is in `app/App.tsx` (not exported); `<App sessionSource authPort />` props unchanged and both optional. `AuthPortContext` is now always provided by `App` (the injected `authPort` or the real one); its bare default is a port that is not configured.
- `AuthEvent = 'refreshed' | 'refresh-refused' | 'signed-out'`. `refresh-refused`: this client's own refresh call was answered 4xx (not 429) and the session was removed. Source: `refresh-refused` while a session is held gives signed-out + notice `expired`; `signed-out` gives signed-out with no notice.
- `BrowserEvents` has optional `isTabVisible?(): boolean` (absent = visible). `windowBrowserEvents(storageKey: string)` (the parameter is the storage key). `platform/browser-storage.ts` exports `StorageLike`, `browserStorage()`.
- `createAuthSessionSource` deps gain optional `random?: () => number` (default `Math.random`). Exports: `RESTORE_RETRY_MS = 15000`, `RESTORE_RETRY_DELAYS_MS = [15000, 30000, 60000, 300000]`, `RESTORE_RETRY_JITTER = 0.2`. Delay = base * (1 + (random()*2 - 1) * 0.2), rounded; with `random = () => 0.5` it is exactly the base. The timer fires only if `events.isTabVisible?.() !== false`; `onTabVisible` while `loading` restores at once.
- Restore answers: `/api/me` `unreachable` (and the port's `restore()` = `unreachable`) keep `loading` and retry as above; `failed` gives signed-out, notice none, `auth.signOut` not called, stored session kept.
- `decideAccess('signed-in-no-account', path)`: render for `/register`, `/terms`, `/privacy`; else redirect `/register`.
