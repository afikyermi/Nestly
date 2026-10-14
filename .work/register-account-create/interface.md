# interface — register-account-create, part a (database)

Schema `nestly`. Runtime role `authenticated` (via `SET LOCAL ROLE`); suite session `app_server`.

## Tables and columns (name:type:nullability:default)
- `journey_contexts`: id uuid nn gen_random_uuid(); user_id uuid nn auth.uid(); stage text nn; due_date date null; created_at timestamptz nn now()
- `children`: id uuid nn gen_random_uuid(); user_id uuid nn auth.uid(); slot smallint nn; name text nn; sex text nn; birth_date date nn; created_at timestamptz nn now()
- `legal_consents`: id uuid nn gen_random_uuid(); user_id uuid nn auth.uid(); terms_version text nn; privacy_version text nn; has_declared_18_plus boolean nn; accepted_at timestamptz nn now()
- Drizzle exports (apps/server/src/db/schema.ts): `journeyContexts`, `children`, `legalConsents` (no accepted_at). Types for the drift test: uuid, text, `date`, `smallint`, `boolean`, `timestamp with time zone`.

## Constraints and indexes
- journey_contexts: journey_contexts_pkey; journey_contexts_user_id_fkey -> regular_profiles(user_id) CASCADE; journey_contexts_stage_check; journey_contexts_due_date_check; journey_contexts_user_id_stage_key UNIQUE(user_id, stage); partial unique index journey_contexts_user_id_planning_pregnant_key ON (user_id) WHERE stage in ('planning','pregnant')
- children: children_pkey; children_user_id_fkey -> regular_profiles(user_id) CASCADE; children_slot_check; children_name_check; children_sex_check; children_birth_date_check; children_user_id_slot_key UNIQUE(user_id, slot)
- legal_consents: legal_consents_pkey; legal_consents_user_id_fkey -> users(id) RESTRICT; legal_consents_terms_version_check; legal_consents_privacy_version_check; legal_consents_has_declared_18_plus_check; legal_consents_user_id_versions_key UNIQUE(user_id, terms_version, privacy_version)

## Policies (all TO authenticated; command)
- users: users_select_own (select, F1.1), users_insert_own (insert)
- regular_profiles: regular_profiles_select_own (select, F1.1), regular_profiles_insert_own (insert)
- journey_contexts: journey_contexts_select_own (select), journey_contexts_insert_own (insert)
- children: children_select_own (select), children_insert_own (insert)
- legal_consents: legal_consents_select_own (select), legal_consents_insert_own (insert)
- All five tables: RLS enabled and forced.

## Grants
- authenticated: SELECT (table-level) on users, regular_profiles (F1.1), journey_contexts, children, legal_consents. No table-level INSERT on any nestly table. INSERT per column (Amendment 1), exactly 13 columns:
  - users: account_type, status
  - regular_profiles: full_name, gender
  - journey_contexts: stage, due_date
  - children: slot, name, sex, birth_date
  - legal_consents: terms_version, privacy_version, has_declared_18_plus
  - Never granted (default always applies): users.id, users.created_at; regular_profiles.user_id, account_type, created_at; id, user_id, created_at on the three new tables; legal_consents.accepted_at.
  - Column-level ACL (attacl) exists only for those 13 columns, INSERT to authenticated only.
- No UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on any nestly table to any role.
- Drizzle write models (apps/server/src/db/schema.ts), insert targets naming exactly the granted columns: `usersInsert` (accountType, status), `regularProfilesInsert` (fullName, gender), `journeyContextsInsert` (stage, dueDate), `childrenInsert` (slot, name, sex, birthDate), `legalConsentsInsert` (termsVersion, privacyVersion, hasDeclared18Plus). Read-side objects unchanged. Inserting through a read-side object names ungranted columns and fails 42501.
- Privilege refusal vs policy refusal (both SQLSTATE 42501): privilege (a statement names an ungranted column, checked before any row or constraint) raises `permission denied for table <table>`; policy WITH CHECK raises `new row violates row-level security policy for table <table>`. A client-sent id never reaches 23505 (no unique-index oracle); the only 23505 on users_pkey is the caller's own id.
- No trigger, view or SECURITY DEFINER function added. No new function in `nestly`.

## Fixtures (file supabase/tests/setup/20_registration_fixtures.sql, once placed; draft at .work/register-account-create/20_registration_fixtures.sql.draft)
- Rows: a = journeys pregnant (due_date 2027-03-01) + has_child, children slots 1 and 2, 1 consent; b = journey planning, child slot 1, 1 consent. Others (c, p, s, x, f1..f5): none.
- Consent fixture versions: 'fixture-terms-1' / 'fixture-privacy-1'.
- `tests.fx_state()` (replaces the F1.1 one, same signature): md5 over the five nestly tables, unfiltered by RLS.
- `tests.fx_counts(id uuid)` -> text 'users/profiles/journeys/children/consents'.
- Existing helpers unchanged: `tests.fx_id(name)`, `tests.claims(sub)`, `tests.dml_as(role, claims, sql, keep)` -> 'OK:<rows>' / 'ERR:<sqlstate>', `tests.as_role`, `tests.n_as`, `tests.set_status`, `tests.fx_insert_user`, `tests.fx_insert_profile`.
- Multi-statement write as a user: `tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), 'do $$ ... $$')`.

## Error codes raised by the database
23505 unique violation (users_pkey, *_key, partial index); 23514 check violation; 23503 foreign key violation; 42501 RLS WITH CHECK or privilege.

## Migration and rollback
- supabase/migrations/20261014200000_registration_account.sql; supabase/rollback/20261014200000_registration_account.down.sql (runs as app_owner; raises if any of the three tables holds a row); F1.1 down script raises if `nestly.legal_consents` exists.

---

# interface — part b, first slice (shared schemas, repository, service). Route, Auth client and web: not built yet (impact-1.md)

## packages/shared (exported from `@nestly/shared`)
- Constants: `RAW_NAME_MAX_UNITS` 600 · `RAW_EMAIL_MAX_UNITS` 512 · `RAW_PASSWORD_MAX_UNITS` 1024 · `RAW_TOKEN_MAX_UNITS` 32 · `EMAIL_MIN_LENGTH` 3 · `EMAIL_MAX_LENGTH` 254 · `PASSWORD_MIN_LENGTH` 8 · `PASSWORD_MAX_LENGTH` 256 · `CONSENT_TERMS_VERSION` · `CONSENT_PRIVACY_VERSION` (both `'placeholder-0'`, <= 64 chars).
- `registrationStep1Input` (Zod): now `z.strictObject` at every level (top, `dueDate`, each child, each child's `birthDate`). Unknown key -> issue code `unrecognized_keys`. Raw bounds run before the transform; a bound failure aborts the transform (only the bound issues are reported). Bound issues carry a `REGISTRATION_ERROR_CODES` message: `fullName` > 600 units -> `full_name_length`; child `name` > 600 -> `child_name_length`; `stages` > 3 items or an item > 32 -> `stage_invalid`; `children` > 10 -> `children_too_many` (also when `has_child` is not ticked); `parentGender` > 32 -> `parent_gender_invalid`; `sex` > 32 -> `child_sex_invalid`; `dueDate` parts > 32 -> `due_date_invalid`; `birthDate` parts > 32 -> `birth_date_invalid`.
- `createRegistrationStep1Schema(today: string)`: unchanged signature; `today` is "YYYY-MM-DD". For Q4 the server passes its UTC date plus one day (test: the day after the server date passes, two days after fails).
- `registrationCredentialsInput` (strict object `{ email: string; password: string }`): output email trimmed (`String.trim`); password untouched. Issue messages (codes in `CREDENTIALS_ERROR_CODES`): `email_required` (empty after trim), `email_invalid` (outside 3-254 code points, whitespace inside, not exactly one `@`, empty local part, domain without a dot, domain starting/ending with a dot, raw > 512 units), `password_length` (< 8 or > 256 code points, raw > 1024 units, empty). Types `RegistrationCredentialsInput`, `RegistrationCredentials`.
- `registrationConsentInput` = `z.literal(true)`, issue message `consent_required` for anything else (`false`, `"true"`, `undefined`).
- The request body is NOT composed in shared yet (its shape depends on who calls Auth).

## apps/server
- `src/lib/pg-error.ts`: `readDatabaseFault(error: unknown): { code: string; constraint: string | undefined } | undefined` — first `postgres.PostgresError` in the `cause` chain (depth 5).
- `src/repositories/registration-repository.ts`:
  - `accountExists(tx: IdentityTx): Promise<boolean>` — `select id from nestly.users limit 1` under RLS (own row, active only).
  - `insertRegularAccount(tx: IdentityTx, account: NewRegularAccount): Promise<void>` — statements in order: `usersInsert` (regular, active) -> `regularProfilesInsert` -> `journeyContextsInsert` (one multi-row statement) -> `childrenInsert` (one multi-row statement, slots 1..n in input order; skipped for 0 children) -> `legalConsentsInsert` (declaration true). Throws the driver error on any failure; it does not catch.
  - `NewRegularAccount = { fullName: string; parentGender: ParentGender | null; journeys: { stage; dueDate: string | null }[]; children: RegistrationChild[]; consent: { termsVersion: string; privacyVersion: string } }`. Takes versions as parameters, so a repository test can force the last insert to fail with `termsVersion: ''` (check `legal_consents_terms_version_check`, 23514) and assert zero rows in all five tables.
- `src/services/registration-service.ts`:
  - `hasAccount(database: Database, identity: Identity): Promise<boolean>` — identity transaction around `accountExists`.
  - `createRegistration(database: Database, identity: Identity, step1: RegistrationStep1): Promise<RegistrationOutcome>`, `RegistrationOutcome = { kind: 'created' } | { kind: 'already_registered' }`. Versions come from the shared constants. `already_registered` iff the failure is SQLSTATE 23505 with constraint `users_pkey`; every other failure is rethrown (rolled back, no rows). No Auth call anywhere in these two layers. The journey's `dueDate` is `step1.dueDate` for `pregnant`, else null.
- How a test drives them against the CI database: build `Database` with `createDatabase(<app_server URL>)` as `apps/server/tests/db/identity.db.test.ts` does; the identity is `{ userId }` of an `auth.users` row created by the test fixtures (a `nestly.users` row must not exist yet); read counts as the owner/postgres connection, which bypasses RLS, per table `users`, `regular_profiles`, `journey_contexts`, `children`, `legal_consents`.

---

# interface — part b, route (Revision 2: the web calls Auth; the server only verifies the session and writes rows)

## Route `POST /api/register` (apps/server/src/routes/register.ts, registered in buildApp)
- Protected: the authentication hook (`onRequest`) runs first. No/malformed/bad token -> 401 `{error:'unauthenticated'}` with `www-authenticate: Bearer`, before the body is read or parsed. Verifier/database/config missing or JWKS unreachable -> 503 `{error:'unavailable'}`.
- Request: `Authorization: Bearer <access token>`, `content-type: application/json`, body (strict at every level):
  `{ stages: string[]; fullName: string; parentGender?: string; dueDate: {day,month,year: string}; children: {name: string; sex: string; birthDate: {day,month,year: string}}[]; consent: true }` — the shape of `RegistrationRequestInput` in `@nestly/shared`. Any other key (email, password, consent version, parent birth date) -> 400.
- Body limit: 102400 bytes (`REGISTER_BODY_LIMIT_BYTES`), enforced by Fastify from Content-Length and while streaming -> 413 `{error:'bad_request'}` before parsing.
- Other methods (GET, PUT, PATCH, DELETE, OPTIONS) -> 405 `{error:'method_not_allowed'}` with `allow: POST`; these are protected too (no token -> 401 first). HEAD follows GET (405).
- Responses (all JSON, fixed codes, no library text):
  - 201 `{status:'created'}` — no session, no ids.
  - 400 `{error:'invalid_request'}` — body failed the schema (including consent not literal `true`, unknown key, raw bound, an F1.3 rule with the server clock); also unparseable JSON -> 400 `{error:'bad_request'}`.
  - 401 `{error:'unauthenticated'}`; 409 `{error:'already_registered'}` (own users row visible, or 23505 on `users_pkey` from the write); 413 `{error:'bad_request'}`.
  - 500 `{error:'internal'}` — any failure that is not transient: a deterministic database fault (SQLSTATE class 23 or 42501, e.g. a failing consent insert; transaction rolled back, zero rows in all five tables) or an error that is neither a database fault nor a connection/driver error.
  - 503 `{error:'profile_write_failed'}` — a transient failure in any transaction of the request, `hasAccount` included: a connection error (error `code` starting CONNECTION_, CONNECT_TIMEOUT, ECONN*, ETIMEDOUT, EPIPE, ENOTFOUND, EAI_AGAIN, ENETUNREACH, EHOSTUNREACH anywhere in the cause chain) or a database fault outside class 23/42501 (e.g. 40001, 57014, 53xxx, 08xxx). Transaction rolled back.
- Order inside the handler: parse body (400) -> `hasAccount` (409) -> `createRegistration` (201 / 409 / 5xx). No Auth call anywhere on the server; the server does not read SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.
- Logs of this route: status, SQLSTATE and constraint name only; never the error object, body, token, names or dates.

## Shared (added)
- `registrationRequestInput` (strict) and `createRegistrationRequestSchema(today: string)` -> output `RegistrationStep1` (the consent key is consumed). Issue messages as in the step-1 section above; `consent` not `true` -> message `consent_required` at path `['consent']`.

## Seams
- `buildApp({ config?, database?, logStream?, clock? })`: `clock: () => Date` is the server's clock; `today` for the schema is `clock()` UTC date + 1 day (Q4). Default `() => new Date()`. A fixed clock tests criterion 3: with clock at D, a child birth date of D+1 passes, D+2 fails with `birth_date_future`.
- Token verification and database are the existing seams of F1.1 (`config.auth` JWKS, `database`); the route adds none.

## How a test drives it
- Build the app as `apps/server/tests/db/identity.db.test.ts` does (real `app_server` database in CI, test JWKS and signed tokens from `tests/helpers/identity-*.ts`), `app.inject({ method:'POST', url:'/api/register', headers:{authorization:'Bearer …'}, payload })`. The token's `sub` must be an existing `auth.users` id whose `nestly.users` row does not exist (fixture user without a profile).
- 409 after a first 201 with the same token; row counts per table read on the owner connection; 500 path: a test can make the write fail by forcing a deterministic database fault (e.g. a body that passes Zod but the fixture makes a table refuse), 503 path: close/break the database connection.
- Log assertions: pass `logStream`; no line contains the body's names/dates, the token or the SQL parameters.

## Module resolution of @nestly/shared (deploy fix)
- Exports map: `types`/`source`/`default` -> src/index.ts, `node` -> dist/index.js (built by root `postinstall`). Vite (web, server vitest, root vitest server project) uses conditions `['source', ...defaultClientConditions]` / `['source', ...defaultServerConditions]`, so tests read shared source. A plain `node` process (e.g. the drift test's `node --import tsx`) reads dist.

---

# interface — part c (web: registration step 2, Auth client, session hand-off)

## Routes (apps/web/src/app/paths.ts)
- `/register` step 1, then step 2 as a second history entry on the same URL with state `{ registrationStep: 2 }` (F1.3). Step 2 shows only while the parsed step 1 is in memory; a reload lands on an empty step 1.
- New Guest placeholder routes (heading = title, text "המסך הזה ייפתח בקרוב."): `/terms` "תנאי השימוש", `/privacy` "מדיניות הפרטיות", `/recovery` "שחזור סיסמה". `GUEST_PATHS` is now `/`, `/login`, `/register`, `/auth/google`, `/recovery`, `/terms`, `/privacy`.
- On success the session source reports `signed-in`; the guard replaces `/register` with `/feed`; focus moves to `main` of `/feed` (FocusOnNavigation). Document title: step 2 "פרטי התחברות · Nestly"; `/feed` "פיד · Nestly".

## Step 2 roles and accessible names (inside `main`)
- heading level 1 "פרטי התחברות"; text "שלב 2 מתוך 2"; text "עוד רגע מסיימים."
- button "חזרה" (icon, top; the only one). Returns to step 1 with its values; on returning to step 2 the email is kept and the password is empty.
- textbox "אימייל" (`type=email`, `dir=ltr`, autocomplete `email`).
- password field labelled "סיסמה" (`type=password`, autocomplete `new-password`, `dir=ltr`), hint "לפחות 8 תווים" linked by `aria-describedby`; button "הצגת הסיסמה" (`aria-pressed`) toggles visibility.
- checkbox named "אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה"; its label holds links "תנאי השימוש" (`/terms`) and "מדיניות הפרטיות" (`/privacy`), both `target=_blank`, `rel="noopener noreferrer"`.
- submit button "יצירת חשבון" (size lg, block). While requests run: `aria-disabled=true`, `aria-busy=true`, a loader, and an sr-only `role=status` text "יוצרים את החשבון".
- Field errors (`role=alert`, linked by `aria-describedby`, the field `aria-invalid=true`), after the first submit only and live afterwards: "יש למלא כתובת אימייל" · "כתובת האימייל אינה תקינה" · "הסיסמה צריכה להכיל לפחות 8 תווים" · consent "יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך". Focus goes to the first `[aria-invalid=true]` in DOM order (email, password, checkbox). An unticked box or an invalid field sends no Auth call and no route call.
- Form-level message in an `InlineAlert` (`role=alert`), one at a time:
  - taken (Auth says the email exists; route 409 or 401): "לא ניתן להשלים את ההרשמה עם הפרטים האלה. אפשר להתחבר או לשחזר סיסמה" + links "התחברות" (`/login`) and "שחזור סיסמה" (`/recovery`). When it comes from Auth the route is called 0 times.
  - retry (Auth network failure or rejected promise; route 503 or unreachable): "השמירה לא הצליחה. אפשר לנסות שוב" + button "ניסיון חוזר".
  - rate limited (Auth status 429, or code `over_request_rate_limit` / `over_email_send_rate_limit`): "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות".
  - generic (unknown Auth failure; route 500, 400, 413 or other): "משהו השתבש. אפשר לנסות שוב", no retry control.
  - weak password from Auth (code `weak_password` or name `AuthWeakPasswordError`): the password field error "הסיסמה צריכה להכיל לפחות 8 תווים" until the password changes; focus on the password.
- Retry (the button, or "יצירת חשבון" again): if a token is held, no sign-up and the route is called with the same token and an equal body; otherwise sign-up is called again.

## Auth client seam (apps/web/src/services/auth/auth-client.ts, the only file importing `@supabase/auth-js`)
- `interface AuthPort { signUp(credentials: { email: string; password: string }): Promise<SignUpResponse> }`
- `type SignUpResponse = { accessToken: string; failure: null } | { accessToken: null; failure: AuthFailure }`; `interface AuthFailure { status: number | undefined; code: string | undefined; name: string | undefined }`. The mapping reads only these three fields (`classifySignUpFailure` in `features/registration/step2-form.ts`). A rejected `signUp` promise = network failure.
- `createAuthPort(config?: { url; publishableKey })`: default config from `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; either missing gives `failure.name 'AuthNotConfigured'` (generic text). The SDK client is created at the first sign-up with `persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`, header `apikey`, base `<url>/auth/v1`.
- Injection: `<AuthPortContext value={port}>` (`hooks/use-auth-port.ts`) around a screen, or `<App authPort={port} />`. The context default is the real port.

## Session seam (apps/web/src/services/session)
- `SessionEntry { signIn(): void }` and `isSessionEntry(source)` in `session-source.ts`. `SessionProvider` exposes the source's entry through `SessionEntryContext` (`hooks/use-session-entry.ts`, `useSessionEntry(): SessionEntry | null`). Registration calls `signIn()` after the route answers 201.
- `createMemorySessionSource()` (starts `signed-out`; `signIn()` gives `signed-in`; `signOut()` gives `signed-out`); `productionSessionSource` is one instance of it. `ControllableSessionSource` (e2e build) also has `signIn()`.
- To drive step 2 in a test: render `<RegistrationFlow today="YYYY-MM-DD" />` (or `RegisterStepTwo` with props `step1`, `email`, `onEmailChange`, `onBack`) inside a router, wrapped in `AuthPortContext` and `SessionEntryContext`; stub `globalThis.fetch` for `POST /api/register`.

## Route call (apps/web/src/services/api/register-account.ts)
- `registerAccount(accessToken, step1): Promise<'created' | 'already_registered' | 'unauthenticated' | 'unavailable' | 'failed'>`: `fetch('/api/register', { method:'POST', headers:{ authorization:'Bearer <token>', 'content-type':'application/json' }, body })`. 201 created, 409 already_registered, 401 unauthenticated, 503 or a thrown fetch unavailable, anything else failed. Only the status is read.
- `toRegisterBody(step1)`: `{ stages, fullName, parentGender? (omitted when null), dueDate: {day,month,year} (empty strings when null), children: [{name, sex, birthDate:{day,month,year}}], consent: true }`; the date parts come from the ISO date, with leading zeros ("01"). No email, no password.
- A test reading the network log sees one call to the Auth URL (`<VITE_SUPABASE_URL>/auth/v1/signup`, body with email and password) and one to `/api/register`.

## Env names (build time)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. No other variable, no secret key.
