# identity-platform — I1 · F1.1

**Gate 1 passed** 13.10.2026, ORCHESTRATOR, after Afik read the spec: Q1–Q3 take their defaults as written; the
anchor's ON DELETE is Afik's at Gate 2 (`decisions/2026-10.md`, "The guard is a fence, not a fortress; F1.1 spec answers").

**Problem**  A parent cannot register, sign in or see anything yet. Nothing can tell who is asking: the server verifies
no token, no product table exists, and the database enforces nothing. Until that exists, any screen built on it could
show one parent's data to another, or keep serving a suspended account.

**Requirements**  NFR-SEC-001, NFR-SEC-002, NFR-SEC-006(4) (`06-non-functional.md:9,10,40`) · AC-078, identifier part
only (`15-acceptance.md:84`) · FR-AUTH-004, BR-015, AC-016, server side only (`05-functional/auth.md:47`,
`08-business-rules.md:21`, `15-acceptance.md:22`) · §12 Authentication: the server verifies the JWT, account type and
permissions come from the database only (`12-external-interfaces.md:7`) · §13 data access: identity in every
transaction, a role that cannot bypass RLS (`13-data.md:8–9`) · User, RegularProfile (`13-data.md:16–17`, §13.1) ·
warning, suspension and ban take effect at once (`02-system-overview.md:59`, FR-MOD-002, BR-024) · platform rules
1–16 and authorization layers 1, 2, 13 (`.claude/knowledge/data-model.md`) · carried in from WORKPLAN: 7.0, 7.1 (the
database checks), 7.3 (migrations), 7.4.

**Scope**  One Gate 1 and three parts, built and merged in this order (c's tests need b's tables, b's tests need a's CI database):
- **a: database foundation and RLS gate.** A disposable CI database built from bootstrap and migrations, pgTAP run as
  `app_server`, the structural checks, and the `migrate` workflow.
- **b: identity schema.** The product schema, with User (the anchor) and RegularProfile under RLS and FORCE RLS, their
  policies and `is_active_account()`. Also bootstrap step 2 (the anchor FK) and the Drizzle schema. Gate 2 (`schema.md`)
  covers b, plus the migration mechanics of a.
- **c: server identity.** JWT verification (`jose` + `createRemoteJWKSet`), an authentication hook that denies by
  default, the per-request identity transaction as `app_server`, and the pooled connection settings.

**Out of scope**
- **UI.** AppShell, RouteGuard and Welcome are F1.2.
- **Registration.** Step-1 fields and validation are F1.3. Account creation, consent, email verification and email
  uniqueness are F1.4.
- **Writes to User and RegularProfile.** No INSERT, UPDATE or DELETE policy for `authenticated` in F1.1. They arrive
  with the feature that writes: F1.4 creates, I2 edits.
- **Other tables.** Child, JourneyContext, PrivacyPreference and LegalConsent are F1.4.
- **Login and accounts.** Login, logout, session refresh and what a suspended user is shown are F1.5. Password recovery
  is F1.6 and the email provider F1.7. Professional accounts are I11.
- **Reading another user's profile.** The Basic Public Profile (BR-063, FR-PRIV-001) comes later. People Search, rate
  limits and Security events (NFR-SEC-006 (1)(2)(3)(5)) are not here either.
- **Setting a status.** Suspend, ban and unban as actions, AccountEnforcement, suspension end dates and audit
  (FR-MOD-002, NFR-AUDIT-001) come later. F1.1 only *reads* status; tests set it in fixtures.
- **Admin and Moderator access.** `has_permission()` and ModeratorPermission (layer 3) come later.
- **Account deletion, export and retention.** None in F1.1.
- **Other platform pieces.** `app_jobs`, pg_cron, Realtime, server-side rate limiting (C6) and log policy (C4) are not
  in F1.1.
- **Open WORKPLAN items.** Branch protection on `main` stays "not now" (7.1). The security-guidance hook (7.2) is not
  part of this.
- **A product endpoint** such as `/api/me` (Q1).

**Data touched**  This is the first schema migration, so DATA ARCHITECT and TEST ENGINEER review it.
- **A new product schema.** It is not `public`, and its name is decided at Gate 2.
- **User.** The anchor: the only product FK to `auth.users`. Per the SRS it holds an identifier, the account type
  (Role), login and contact details, and a status.
- **RegularProfile.** Linked to User. It holds the parent's own FR-REG-002 fields: the full name, and the parent's
  gender, which is optional (VAL-006).
- **Decided at Gate 2, not here.** The columns, the identifier type, how status and account type are represented, and
  the conventions, all by DATA ARCHITECT (`data-model.md` → "Schema conventions"). The same goes for which entity holds
  the stage, the children and the due date.
- **A new SECURITY DEFINER function,** `is_active_account()`. It has to be added to "Approved exceptions".
- **No password, no hash and no media** are stored.

**Risk flags**  The path is **Elevated**. Three flags apply:
- authentication and authorization
- personal data
- a schema migration, the first one, with an irreversible ownership point: after it, `app_owner` owns the schema.

There is no new external surface. The hook makes the server deny by default, and `/api/health` already exists. The
new dependencies (`jose`, `drizzle-orm`, `postgres`) were already decided.

**Acceptance criteria.** The tag in brackets goes into the test name. "platform rN" means `data-model.md` rule N, which
has no SRS ID; "not in SRS" is flagged.

*Part a: foundation and gate*
1. On every pull request and every push to `main`, a CI job `db` builds a disposable database from scratch. It runs
   bootstrap step 1, then every migration as `app_owner`, then bootstrap step 2, and then the pgTAP suite. Any failure
   turns CI red. The job uses no GitHub secret and no environment. [7.1 · NFR-QA-001/OP-018]
2. The suite asserts that `session_user = 'app_server'` before its behaviour tests, so they never run as `postgres` or
   `app_owner`. [7.1 · §13]
3. A check fails CI, naming the object, in each of these cases [7.1 · platform r1, r2, r7, r8, r9, r10]:
   - a product-schema table has RLS off, FORCE RLS off, or no policy
   - a product-schema table, view, sequence or function is not owned by `app_owner` (so none is owned by `app_server`)
   - a view is not `security_invoker = true`
   - a SECURITY DEFINER function is missing from the suite's approved list or has no fixed `search_path`. That list must
     match `data-model.md` "Approved exceptions"; CRITIC checks that.
   - `anon` holds any privilege on the product schema or its objects
   - a product table is in `public`

   The last four go beyond the literal 7.1 list.
4. Each check in 3 is shown to fire: a test creates the violating object inside a transaction, asserts the check
   reports it, and rolls back. [7.1]
5. The `migrate` workflow [decisions 2026-10-11 "Migration path", 2026-10-12 secret · 7.3]:
   - It triggers only on push to `main` and on `workflow_dispatch`, never on `pull_request` or
     `pull_request_target`.
   - The job on `db-preview` runs first. The job on `db-production` runs only from `main`, only after the preview job
     succeeds, and waits for Afik's approval.
   - It reads only `APP_OWNER_DATABASE_URL`. It rejects a URL whose user is not `app_owner.<ref>` for that environment
     or whose port is not 5432, and it never prints the URL.

   Asserted by a repository test that parses the workflow, and by tests of the URL guard with fake URLs.
6. With no pending migration, `migrate` succeeds and changes nothing. [7.3]
7. A migration whose last statement fails leaves none of its earlier objects behind. This is shown once against the
   disposable database. [7.3]

*Part b: identity schema*

8. User is the only product table with an FK to `auth.users`, and RegularProfile references User. After bootstrap step
   2, a pgTAP test asserts the anchor FK exists. [`13-data.md:16–17` · data-model "anchor"]
9. Bootstrap step 2 is a versioned file in `supabase/bootstrap/`, with a check script [data-model "bootstrap steps"]:
   - It runs as `postgres` in one transaction and refuses any other role.
   - A second run leaves the database unchanged.
10. The columns of User and RegularProfile equal the lists approved in `schema.md`. Neither table holds a password or a
    password hash. [NFR-SEC-001]
11. The identifiers of User and RegularProfile are not guessable [NFR-SEC-006(4) · AC-078]:
    - No identifier default uses a sequence, an identity or a counter.
    - The generator meets the threshold in Q2.
    - 1,000 identifiers generated in a row contain no repeat, and the differences between consecutive ones are not
      constant.
12. In an identity transaction for an active account A, a SELECT on User and on RegularProfile returns exactly A's row,
    and none of account B's. [NFR-SEC-002 · layer 1 · §13.2 "המשתמש לחשבונו"]
13. As `authenticated`, every INSERT, UPDATE and DELETE on either table is refused and changes nothing. That includes
    A's own row, and changing A's own account type or status. [NFR-SEC-002 · layer 2 · platform r14]
14. **Exit criterion, no identity** [7.1 · `13-data.md:9`]:
    - As `app_server` with no role set, a SELECT on either table fails with permission denied.
    - As `authenticated` with no claims, it returns 0 rows.
15. **Exit criterion, suspended account** [`02-system-overview.md:59` · FR-MOD-002 · BR-024 · platform r15]. For account
    A with status suspended, and separately banned:
    - A SELECT on either table returns 0 rows, A's own rows included.
    - This holds from the next statement with the same claims; no new token is needed.
    - Once the status is active again, A reads its own rows again.
16. Status and account type come from the table only. Claims that say otherwise, such as `app_metadata` /
    `user_metadata` status "active" or role "service_role", do not change the results of 12–15. [§12 · platform r14]
17. A valid identity with no User row reads nothing (fail closed). [platform r15; this boundary is not in the SRS]
18. `is_active_account()` answers only for the caller: no function that `authenticated` can execute returns another
    account's status. The function is listed in "Approved exceptions" with its `schema.md` reference. [layer 13 ·
    platform r10, r16]
19. As `anon`, a SELECT on either table and a call to `is_active_account()` fail. [FR-AUTH-004 · BR-015 · platform r4, r7]
20. CI fails when the Drizzle schema names a column that is missing from the migrated database, or that differs from it
    in type or nullability. [CLAUDE.md consequence 1; not in the SRS]

*Part c: server identity*

21. Every server route requires a verified token, except those on a public list. In F1.1 that list holds only `GET
    /api/health`. A route registered in a test, and not added to the list, is protected. [FR-AUTH-004 · BR-015 · AC-016,
    server side]
22. A protected route answers 401 when the token falls into any case below. Every one of those answers has the same
    body: one fixed error code, with no raw library text and no hint of which check failed. No database transaction is
    opened. [§12 · NFR-SEC-002 · platform r3]
    - absent, or not a Bearer token
    - malformed
    - signed by a key that is not in the configured JWKS
    - `alg` none, or HS256
    - expired, or `nbf` in the future
    - the issuer is not the configured project
    - the audience is not the configured one
    - no `sub`
23. A valid token reaches the handler: ES256, a key from the configured JWKS, the right issuer and audience, and
    unexpired. Inside its transaction, `current_user = 'authenticated'`, `auth.uid()` is the token's `sub`, and
    `auth.role()` returns `'authenticated'`. This holds whatever the token's `role` claim says: authenticated, anon,
    service_role or postgres. [§13 · platform r3]
24. Identity settings last only for the transaction [platform r3 · §13]:
    - After a request for A ends, the same pooled connection shows `current_user = 'app_server'` and empty
      `request.jwt.claims`.
    - A following request for B on that connection sees only B's rows.
25. **Exit criterion, end to end.** Through the server, a test route that reads the caller's own User row behaves as
    follows [initiative exit · platform r15]:
    - An active account gets 1 row.
    - The same token after suspension gets 0 rows.
    - Without a token, the request gets a 401 and no query runs.
26. A missing configuration fails closed [platform r1, r2]:
    - With the JWKS URL unset, or the JWKS unreachable and no key cached, protected requests are rejected (status
      ≥ 400) and no transaction opens.
    - With `DATABASE_URL` unset, `GET /api/health` still returns 200 and protected routes are rejected.
27. The database client uses one connection per instance and has prepared statements off. Nothing under `apps/`, `api/`
    or `vercel.json` names a credential other than `app_server`'s: no service_role, `app_owner` or `postgres`. [platform
    r1, r5 · 7.3]
28. Preview, for each part's PR: the branch Preview deploys and `GET /api/health` returns 200 [7.4 · 7.0]:
    - If the server imports `@nestly/shared`, the function loads it. Otherwise 7.0 is recorded "not yet exercised".

**Open questions**
- **DECISION REQUEST: the anchor's ON DELETE action.** No default: the SRS leaves retention open (§13.4,
  `13-data.md:129`). DATA ARCHITECT raises it at Gate 2. It is likely **reserved for Afik**, because in F1.4 the anchor
  becomes the parent of Child data. It blocks only bootstrap step 2 (criteria 8–9). Parts a and c, and b's migration,
  do not wait for it.
- **Retention (§13.4 TBD).** F1.1 sets no period and no archival behaviour. This is a statement, not a request.
- **VAL-001, the full-name length limit, is TBD.** F1.1 sets no length constraint. If DATA ARCHITECT wants one in the
  database, that is a DECISION REQUEST at Gate 2. Otherwise F1.3 raises it.
- **QUESTION Q1.** Does F1.1 ship a product endpoint, such as `/api/me`, to exercise the identity path on the Preview?
  → **assumed if unanswered:** no. The hook is tested through a route that the tests register (criteria 21 and 25).
  The first real route comes with F1.4 or F1.5.
- **QUESTION Q2.** What "not guessable" means in a form a test can check. → **assumed if unanswered:** there is no
  sequence, identity or counter, and each identifier carries at least 64 bits from a cryptographically secure random
  source.
- **QUESTION Q3.** When should a push to `main` start `migrate`? → **assumed if unanswered:** only when
  `supabase/migrations/**` changes; otherwise it runs by dispatch only. Without this, every push to `main` would queue a
  `db-production` approval for Afik.
- **Gate 2 items (not open in the SRS; DATA ARCHITECT proposes, the decision owner approves).**
  - the schema conventions
  - how status and account type are represented
  - the column lists
  - how `is_active_account()`, the first definer function, reads User under FORCE RLS without recursing
    (`data-model.md`, the open note under rules 16 and 17)

**Afik: secrets and production**
- **Secrets.** F1.1 needs no new secret under Q1's default. `APP_OWNER_DATABASE_URL` is already in both environments.
  `DATABASE_URL` (`app_server`, port 6543) goes into Vercel only when a deployed route touches the database: Q1 = yes, or
  else F1.4. The CI `db` job uses no secret. Any credential inside the disposable database is a throwaway value, never
  a real environment's.
- **Production.** These come after part b merges:
  1. approve the `migrate` job on `db-production`
  2. then, after the ON DELETE decision, run bootstrap step 2 and its check on nestly-prod in the SQL Editor

  Step 1 is already done on prod. Nothing in F1.1 waits on prod.

**Size estimate**  About 1,200 lines of diff, split into three parts. In each part, about half of it is tests:
- **a:** about 350 lines (the workflow, the CI job, gate checks with fixtures that make them fire).
- **b:** about 400 (the migration, the Drizzle schema, bootstrap step 2 and its check, the pgTAP behaviour tests).
- **c:** about 450. BUILDER's share is about 200, and TEST ENGINEER writes the tests (about 250). If c runs over, the
  integration tests (criteria 24–26) become part d.
