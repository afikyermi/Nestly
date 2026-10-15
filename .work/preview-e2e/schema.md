# schema — E: Preview E2E test-user cleanup (nestly-preview only)

**Change** None: no migration, no nestly object, grant or policy. A CI cleanup step deletes rows as `postgres` on
nestly-preview (`xmihorrkegrdlbhpktny`). One one-time admin action, the preview marker (step 0), needs DR-E1.
**Why** Intake: each run creates a user, walks F1.6 and deletes the user, pass or fail. A sweep removes leftovers.

**Reserved email pattern** `nestly-e2e-<run_id>-<run_attempt>-<16 lowercase hex>@gmail.com`, matched anchored:
`^nestly-e2e-[0-9]{1,20}-[0-9]{1,3}-[0-9a-f]{16}@gmail\.com$`.
- No real person can hit it: Gmail usernames allow only letters, digits and periods, so `-` means no real account.
- It passes VAL-002, and gmail.com has MX (`example.com`, `.invalid`, `.test` may be refused). Confirm-email off: no mail.
- QUESTION (default as above): the first sign-up proves Auth accepts it; a 400 `email_address_invalid` stops the run.

**Tables holding a test user's rows after F1.6** (app_owner owns `nestly` and `supabase_migrations`; the latter has none)
| table | key | FK, ON DELETE |
|---|---|---|
| auth.users | id | — |
| nestly.users (anchor) | id | → auth.users **RESTRICT** (bootstrap 2) |
| nestly.regular_profiles | user_id | → users(id, account_type) CASCADE |
| nestly.journey_contexts · children | user_id | → regular_profiles CASCADE |
| nestly.legal_consents | user_id | → users **RESTRICT** |
| nestly.recovery_answers | user_id, email_handle | → users CASCADE |
| nestly.recovery_events (audit) | user_id | → users **RESTRICT** |
| nestly.recovery_throttles | ('handle', HMAC(email)) = recovery_answers.email_handle | none |
- On the Auth side, identities, sessions (and their refresh_tokens), mfa_* and one_time_tokens cascade from auth.users.
  `audit_log_entries` has no FK and keeps the test email. Accepted: it is preview test data.
- No trigger exists on any nestly table (pgTAP 20_registration_structure), so none blocks deletion.
- Order, leaf first; explicit deletes give counts: throttles(handle) → recovery_events → legal_consents → recovery_answers →
  children → journey_contexts → regular_profiles → users → auth.users.

**Authorization**
- **What reaches the rows.** `postgres` inherits app_owner (INHERIT TRUE), so it holds the owner's DELETE. FORCE RLS
  still binds it unless it has BYPASSRLS. Supabase's postgres normally has it; preflight checks. No DELETE policy exists,
  so without BYPASSRLS every delete would remove 0 rows silently.
- **`SET LOCAL row_security = off`: required.** It bypasses nothing; a statement RLS would filter raises 42501 instead.
  A missing BYPASSRLS fails closed.
- **`session_replication_role = replica`: not acceptable.** It turns off FK triggers: the RESTRICT anchor and cascades
  are skipped, leaving orphans. Also no `DISABLE`/`NO FORCE ROW LEVEL SECURITY`, and no DDL.
- **If there is no BYPASSRLS, MATERIAL CHANGE.** Cleanup would need a DELETE policy or a definer function, which is a
  migration. Stop; do not design around it.
- **recovery_events is deleted.** Append-only is grants-only and does not bind postgres. RESTRICT blocks the users delete
  while events exist, and `user_id` cannot be NULLed (recovery_events_user_id_check). This is test tooling, for pattern
  users on preview only. It is not a retention decision (§13.4 stays TBD) and never a template for real accounts (I9).
- **Left in place.** Throttles of kind `ip`, and events with NULL user_id: their HMACs cannot be computed without the
  pepper, which never goes to CI. They hold no email. IP rows expire in 15 minutes; keep wrong attempts per run under 10.

**Auth user: SQL `DELETE FROM auth.users` as postgres, in the same transaction.** Not the Admin API.
- **Atomic.** Product rows and the Auth user go together or not at all; RESTRICT is checked in-transaction, so there is
  no partial state to retry.
- **One credential fewer.** `PREVIEW_SUPABASE_SECRET_KEY` must not appear in the workflow: its name matches
  `/SUPABASE_SECRET/` under `.github/` and fails `apps/server/tests/credentials.static.test.ts:204-212`, F1.6's fence.
  Recommend Afik remove it from `preview-e2e`.
- **Cost.** This depends on Supabase's internal auth schema. Preflight checks `has_table_privilege('auth.users','DELETE')`;
  false means stop. An Admin-API fallback is then a recorded decision, including the fence change.

**Migration** (the job's steps; there is no migration)
0. Once, on preview, by postgres: `comment on role app_owner is 'nestly-env:preview:xmihorrkegrdlbhpktny';` (DR-E1).
1. Before connecting, check the URL the way `tools/migrate-url-guard.mjs` does: host `*.pooler.supabase.com`, port 5432,
   user exactly `postgres.xmihorrkegrdlbhpktny`. The pooler routes by that tenant.
2. Preflight inside the connection. Any false → exit non-zero, delete nothing:
```sql
select current_user = 'postgres'
   and (select rolbypassrls from pg_roles where rolname = current_user)
   and shobj_description('app_owner'::regrole, 'pg_authid') = 'nestly-env:preview:xmihorrkegrdlbhpktny'
   and has_table_privilege('auth.users', 'DELETE')
   and (select array_agg(c.relname::text order by 1) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'nestly' and c.relkind in ('r','p'))
     = array['children','journey_contexts','legal_consents','recovery_answers','recovery_events',
             'recovery_throttles','regular_profiles','users'];  -- unknown table → stop; re-review this file
```
3. Victims come from the database, never from ids passed in. Own run: `email ~ <pattern> and email like
   'nestly-e2e-'||$run_id||'-'||$attempt||'-%'`. Sweep: `email ~ <pattern> and created_at < now() - interval '3 hours'`
   (longer than the job timeout: a concurrent run's users are never touched). Cap: 10 per run in total; more candidates
   → delete nothing and fail loudly.
4. One transaction per victim (illustrative):
```sql
begin;
set local row_security = off; set local lock_timeout = '5s'; set local statement_timeout = '30s';
select id from auth.users where id = $1 and email ~ $pattern for update;  -- 0 rows → commit: already gone (idempotent)
delete from nestly.recovery_throttles t using nestly.recovery_answers a
 where a.user_id = $1 and t.subject_kind = 'handle' and t.subject_hash = a.email_handle;
delete from nestly.recovery_events where user_id = $1;   delete from nestly.legal_consents where user_id = $1;
delete from nestly.recovery_answers where user_id = $1;  delete from nestly.children where user_id = $1;
delete from nestly.journey_contexts where user_id = $1;  delete from nestly.regular_profiles where user_id = $1;
delete from nestly.users where id = $1;
delete from auth.users where id = $1 and email ~ $pattern;  -- must be exactly 1, else rollback
commit;
```
   Log the per-table counts and the user id. Log the email only as its run tag.

**Rollback** None: deleting test data is one-way, and Afik asked for it (intake). Guards: marker, URL check, pattern, cap, age.
**Backfill** None. **Indexes** None added: each delete uses an existing index with `user_id` leading (PKs; the children,
journey and consent unique keys; recovery_events_user_id_idx; the throttles PK). The auth.users email regex is a
sequential scan on a preview-sized table.
**Integrity** Leaf-first deletes and an in-transaction RESTRICT check, so no orphans. A user with no nestly row deletes cleanly.
**Blast radius** nestly-preview only; F1.6 runtime paths and grants are untouched. Production fails the marker and URL check.
**Reversible?** No. Covered by Afik's instruction (intake); production is out of scope.
**DR-E1 (ORCHESTRATOR; not reserved, preview only).** Approve: (a) `postgres`@nestly-preview in CI, as a data-model
"Approved exceptions" entry (a credential outside rules 1–4 must be listed); (b) the step-0 role comment (anything else
needing postgres is a DECISION REQUEST); (c) deleting test users' `recovery_events`. Rejected alternative to (b): no
in-connection check, because the URL proves nothing inside the session.

**Gate 2 (ORCHESTRATOR, 16.10.2026): not passed. DR-E1 is reserved for Afik.** It would put a credential that bypasses
RLS (`postgres`, BYPASSRLS) into CI. CLAUDE.md: "Nothing bypasses it: no service_role, no role with BYPASSRLS". That is
a change to the security model, which only Afik decides ("Decision authority", item 3). It goes on his morning list, with
the alternatives:
(1) DR-E1 as designed here, plus an Approved-exceptions entry;
(2) a narrow cleanup function as an approved SECURITY DEFINER exception, deleting only users who match the pattern,
called by a dedicated role (a migration, and still a security-model exception);
(3) no deletion: test users stay on preview, tagged by the pattern.
Until he decides, E runs without the cleanup step. Each run leaves its test users on nestly-preview, tagged by the
pattern, to be swept once a cleanup route is approved. The cleanup code may be built and unit-tested, but nothing
connects with `PREVIEW_DB_ADMIN_URL`. The pattern (gmail.com, anchored), the 3 h age and the cap of 10 here replace spec
criteria 5 and 9. `PREVIEW_SUPABASE_SECRET_KEY` is not used.
