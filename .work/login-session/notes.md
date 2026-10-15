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
