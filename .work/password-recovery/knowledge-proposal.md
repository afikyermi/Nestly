# Knowledge proposal — F1.6, as built after Amendment 2 (for CRITIC's re-check; promotion by ORCHESTRATOR after validation)

Source: `schema.md` "Knowledge proposal" (DATA ARCHITECT), with the two amendments CRITIC required in round 1 (`findings.md`)
and the delta of Amendment 2 (DATA ARCHITECT's recommendation (b)–(d) in `schema.md` "CRITIC findings 1-2"). Lands in
`.claude/knowledge/data-model.md` (and `data-model-tables.md`, `conventions.md`) in this PR, once validated.

## `data-model.md` → "Approved exceptions"

First sentence becomes: "A SECURITY DEFINER function (rules 10, 16, 17, 18, 19), a `TO app_jobs` policy (rule 6), a role or
credential outside rules 1–4, or a materialized view or foreign table in a schema `app_owner` owns exists only when it is
listed here."

Replace "*none yet.*" with:

```
F1.6 password recovery (FR-AUTH-003, OP-029) — the one exception Afik approved for this flow only (decisions/2026-10.md,
2026-10-13). Two parts, nothing else:
(a) Auth: read the user's current email, set the password and end every session of the same user id — with the Supabase
    secret key from env SUPABASE_SECRET_KEY, read only in apps/server/src/recovery/auth-admin.ts, whose only operation is
    resetPassword({userId, email, password, clientIp}). It makes exactly four calls, in this order, and none is exported
    alone: `GET <issuer>/admin/users/<uuid>`, of which only `email` is read and compared (normalised) with the request's
    email — different or missing ends the sequence with no further call (outcome email_mismatch; the service answers 401
    invalid_recovery and audits reset_email_mismatch); then `PUT <issuer>/admin/users/<uuid>` {password}; after a 2xx,
    one `POST <issuer>/token?grant_type=password` with the new password the request already holds; then
    `POST <issuer>/logout?scope=global` with that access token, which revokes every refresh token of the user. The token
    is discarded (never returned, logged or stored). `Sb-Forwarded-For` carries the platform-verified client IP. Called
    only by the redeem service after both answers matched under the limits and a reset_verified row was committed.
    Why: no database role may set an Auth password (auth.users is outside the product's roles, rule 1); a signed-out user
    has no token; the admin API has no revoke-by-user-id, while a reset that leaves an attacker's session alive does not
    end a takeover; and only Auth knows the account's current email, so only this read makes "a password is set only on
    the account the request's email names now" true (Amendment 2).
    Fence: credentials.static.test allows the key's name in that one file only and asserts it is there; the admin,
    token-grant and logout literals appear in that file only; never in .github/. The key itself is not scoped by Supabase
    (it carries service_role power over the whole project), so the fence is the code and the CI check, not the credential.
    Approved in .work/password-recovery/schema.md (Amendment 1; Amendment 2 adds the email read) · 2026-10-15
(b) role app_recovery — NOLOGIN, NOINHERIT, NOBYPASSRLS, owns nothing; granted only to app_server WITH INHERIT FALSE,
    SET TRUE. The signed-out redeem, and the recovery verification and audit writes, run under SET LOCAL ROLE
    app_recovery, held by RLS + FORCE. It reads recovery_answers and reads/writes recovery_throttles only for the handle
    and IP hash the transaction declares (nestly.recovery_handle(), nestly.recovery_ip()); its one write on
    recovery_answers releases the declared handle (sets email_handle and handle_claimed_at to NULL) only on a row whose
    claim is older than the one the transaction declares (nestly.recovery_claimed_at(), policy
    recovery_answers_release_recovery) — it can set no handle, touch no hash and delete no row; it appends
    recovery_events, and reads no audit and no other table.
    Why: a guest endpoint has no auth.uid(), and anon must hold nothing in nestly (rule 7, CI anon_privilege).
    Not a SECURITY DEFINER function; tests.approved_security_definer() stays empty.
    Approved in .work/password-recovery/schema.md · 2026-10-15 (DR-G1, ORCHESTRATOR; release policy: Amendment 2)
```

## Other `data-model.md` lines

- rule 2: "…and `anon` for guest endpoints; `app_recovery` for the recovery flow only, see Approved exceptions".
- rule 4: append "Exception: the recovery flow runs as `app_recovery`".
- **rule 18 (CRITIC amendment 1):** append "Exception: `nestly.recovery_events` is written by the server under
  `app_recovery`, not by a trigger, because the audited action (the Auth password reset) happens outside the database; the
  insert policy binds handle, IP hash and user id to the transaction's declared subject, while the server chooses `kind`.
  `authenticated` and `anon` have no access to it."
- bootstrap step 1: "create `app_owner`, `app_server`, `app_jobs` and `app_recovery` and their grants…" (four roles).
- `data-model-tables.md`: the three tables `recovery_answers`, `recovery_throttles`, `recovery_events`, in its template.
- `conventions.md` rows: "RLS helpers" — the three recovery helpers (`recovery_handle`, `recovery_ip`,
  `recovery_claimed_at`) are granted to `app_recovery`, not `authenticated`; "Write grants" — `recovery_answers` has the
  first column-level SELECT (`authenticated` reads user_id, email_handle, handle_claimed_at, created_at; hashes and salts
  are not readable by any request role), so "SELECT stays table-level" gains "except where a column must never be read
  back".

## `supabase/ci/rls-gate.sql` (CRITIC amendment 2)

Lines 43–44 comment becomes: "This list must equal the SECURITY DEFINER entries of .claude/knowledge/data-model.md →
'Approved exceptions' — CRITIC checks that. Today that list holds no function (F1.6's entries are an Auth call sequence
and a role, not functions)."
