# Gateway publishable key for the caller-token Auth calls

**Problem**        Two server calls to Auth act with the caller's own access token (read own identities, global sign-out), yet send the project secret key (service_role power) as `apikey`. A leak or misuse of those calls exposes more than they need. Afik decided least privilege (`decisions/2026-10.md`, 2026-10-17 "I2 reserved items", F2.0 gateway key).
**Requirements**   AR-1 (admin set-password stays, secret key). Decision above. No new product behaviour; no FR/AC changes. Every criterion below traces to the decision, not to an SRS ID (SRS trace in `result.md`: none).
**Scope**          In `apps/server/src/recovery/auth-admin.ts` only: `readSignInIdentities` (`GET /user`, caller's token) and the global sign-out (`POST /logout?scope=global`, bearer = the user's token) send `SUPABASE_PUBLISHABLE_KEY` as `apikey`. New server env var `SUPABASE_PUBLISHABLE_KEY` (same value as `VITE_SUPABASE_PUBLISHABLE_KEY`), read in that module only. Tests and `.env` example/docs line for the variable.
**Out of scope**   Admin calls (`GET/PUT /admin/users/{id}`; `setUserPassword`, `cancelPassword`, reset call 0 and 1) keep the secret key. `/token?grant_type=password` (reset call 2) is not changed (see Open questions). No new endpoint, no schema change, no change to flow outcomes, audit rows or copy. No rotation of keys. Adding the Vercel variable (Afik, reserved: secrets).
**Data touched**   none (no table, field or media).
**Risk flags**     authentication (Auth credentials on server calls) -> Elevated.

**Note on the request:** the sign-out is not an F2.0 call. F2.0 makes no sign-out (an admin password set ends all sessions, Gate 2 A6). The only `/logout` is call 3 of `resetPassword` (F1.6 recovery reset), with the token from call 2. The criteria cover that call. `readSignInIdentities` is the F2.0 call (caller: `identity-link-service.ts` via `recovery/dependencies.ts`). `password-service.ts` and the other F2.0 flows call only admin sets, so their key does not change.

**Acceptance criteria** (server unit tests with a fake Auth on loopback, as `password-auth-calls.test.ts`)
1. 🔴 `readSignInIdentities` with both keys set: the fake Auth sees `GET /user` with `apikey` = the publishable value and `authorization: Bearer <caller token>`; `apikey` is not the secret value.
2. 🔴 `resetPassword` happy path: the fake Auth sees `POST /logout?scope=global` with `apikey` = the publishable value and the bearer from the sign-in response; outcome `completed`.
3. 🔴 Over all calls of one `resetPassword` run, the `apikey` of `GET`/`PUT /admin/users/{id}` equals the secret value, and the secret value appears on no `/user` and no `/logout` request (headers or body).
4. 🔴 `setUserPassword` and `cancelPassword` send `apikey` = the secret value on `PUT /admin/users/{id}` (unchanged), and never the publishable value.
5. 🔴 `readSignInIdentities` with `SUPABASE_PUBLISHABLE_KEY` unset, empty or whitespace, and the secret key set: returns `{ kind: 'failed' }` and the fake Auth receives zero requests (no fallback to the secret key).
6. 🔴 `resetPassword` with the publishable key unset/empty and the rest valid: returns `admin_failed` and the fake Auth receives zero requests (so a password is never set without the means to end the sessions; same answer as today's secret-key-missing case).
7. 🔴 `isAdminConfigured` is false when the publishable key is unset/empty, true only when secret key, publishable key and a safe issuer are all set; callers that gate on it give today's "Auth unreachable" answer. `setUserPassword`/`cancelPassword` need only the secret key and issuer (unchanged).
8. 🔴 No log line, thrown message, audit row or returned value contains either key value, in success and in every failure path above (test with a sentinel key values and a captured logger/outcome).
9. 🟡 `tests/credentials.static.test.ts` passes: `SUPABASE_PUBLISHABLE_KEY` is named only in `auth-admin.ts` under `apps/server/src` (or the scan is extended in the same change to allow exactly that), `SUPABASE_SECRET_KEY` is still named there only, and no literal key is present.
10. 🟡 `npm run typecheck`, lint and the server test suite are green; no `any`, no cast added.
11. 🎨 Preview E2E for S-01 (identity read and clear) and for password change (c10) pass on the deployed preview with `SUPABASE_PUBLISHABLE_KEY` set there; the recovery reset flow's sign-out still ends the session (old refresh token rejected).

**Open questions**
- Should reset call 2 (`/token?grant_type=password`, sign-in with the user's new password) also use the publishable key? Afik's decision names only the identities read and the sign-out. -> **assumed if unanswered:** unchanged, secret key stays (out of scope). Not a default on an open SRS item; flagged for Afik as a follow-up (it is the same least-privilege logic).
- Merge dependency: `SUPABASE_PUBLISHABLE_KEY` must exist in Vercel **Preview and Production** before merge. WORKPLAN-HE.md item 0 already lists it. Without it, criteria 5-7 make S-01 detection and recovery reset fail closed (they do not fall back), so merging early breaks those flows. -> **assumed if unanswered:** the part is built but not merged until Afik confirms the variable (Afik enters secrets/env himself; no agent reads or asks for the value).

**Size estimate**  ~120 lines of diff (about 25 in `auth-admin.ts`, rest tests). Under 400, no split.

## Gate 1 — ORCHESTRATOR, 17.10.2026

Approved, 11 criteria, one part, Elevated (authentication); CRITIC on opus. The Question takes its default: reset call 2
(`/token?grant_type=password`) keeps the secret key — out of scope; FYI to Afik in the I2 close report as a possible follow-up
on the same least-privilege line. **Merge waits for Afik's `SUPABASE_PUBLISHABLE_KEY` in Vercel Preview and Production**
(WORKPLAN "ממתין לך"); built after F2.3a on the branch.
