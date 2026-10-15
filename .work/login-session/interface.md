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
