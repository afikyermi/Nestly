# schema — I3 PR-B revision 20.10 (purge schedule, fallback A2)

Continues `.work/i3-rest-schema/schema.md` § PR-B and E1, split for the schema.md budget. Gate 2 history there is unchanged.

## Decision (DATA ARCHITECT, 20.10)
**Evidence (TEST ENGINEER, local pinned image):** the app_jobs-owned job ran `failed`, `connection failed`: `cron.use_background_workers=off`, `cron.host=localhost` → pg_cron opens a libpq
connection as the job's username, and app_jobs is NOLOGIN without a password. Background workers are a server setting we cannot rely on in CI or hosted. B and C need a credential (and C an
Afik decision); A2 needs none. **Decision: A2**, with one deliberate change from the 19.10 wording — the command uses session-level `set role`, not `set local role` (reason under "Command").
The 19.10 Gate 2 text stays as history; where it conflicts, this file wins.

**Command (exact):** `set role app_jobs; select nestly.purge_held_content()`. Job name `nestly_purge_held_content`, schedule `17 3 * * *`, username `postgres`, database `postgres`, active.
Why `set role`, not `set local role`: `SET LOCAL` outside a transaction block only warns and does nothing. Whether pg_cron runs a multi-statement command as one implicit transaction
depends on its execution mode (libpq vs background worker), and that could change if the provider changes the setting. If it did nothing, the purge would run as postgres (BYPASSRLS, and through
`grant app_owner to postgres` it also has EXECUTE) — it would fail *open*, and silently. Session-level `SET ROLE` either takes effect or raises an error, never a silent no-op. Rule 3's
"transaction-local
only" is about pooled request connections that are reused across users. pg_cron opens a fresh connection (libpq) or a fresh worker for each run and closes it after, so nothing leaks into a
later session.

**`03-cron.sql` shape (run as postgres, one transaction, idempotent):** preconditions as now (current_user postgres; `nestly.purge_held_content()` exists; app_jobs exists) **plus**: raise if
a job named
`nestly_purge_held_content` exists with username ≠ `postgres` (the pre-revision app_jobs shape; message: run the pre-revision `03-cron-down.sql` from ce22488 first. Only CI/local scratch
DBs could hold one; nestly-preview never ran 03 — TE confirms
`select count(*) from cron.job` there before the first run). Then: `create extension if not exists pg_cron with schema pg_catalog`; `grant app_jobs to postgres with inherit false, set true`
(**persistent**;
no-op on re-run); `revoke usage on schema cron from app_jobs` (app_jobs never touches cron under A2, minimal grants; no-op if never granted); `select
cron.schedule('nestly_purge_held_content', '17 3 * * *', 'set role app_jobs; select nestly.purge_held_content()')`
as postgres, without changing role (an upsert keyed by name + username → idempotent). No `set local role`, no revoke of the membership. Header text updated to match: why A2, why `set
role`, why the membership stays.

**Step-1 check (`01-roles-check.sql`):** app_jobs' expected `held_by` depends on whether step 3 has run, decided inside the check by
`to_regclass('cron.job') is not null and exists (select 1 from cron.job where jobname = 'nestly_purge_held_content' and username = 'postgres')`:
- before step 3 (unchanged): `postgres(i=f s=f a=t) by supabase_admin`
- after step 3: `postgres(i=f s=f a=t) by supabase_admin, postgres(i=f s=t a=f) by postgres` (the existing order: admin row first, as on app_owner).
Every other column and role is unchanged. The header lists both expected strings and says which state selects which. The grantor must be `postgres`: a grant made under any other grantor
fails the check.
`member_of` for app_jobs stays `(none)`. TE verifies the exact grantor text on the image. If PG records a different grantor, raise a FINDING to DA; do not adapt the expectation.

**`03-cron-check.sql` (one read-only SELECT, `ok` true only if all hold):** pg_cron installed; exactly 1 job named `nestly_purge_held_content`; schedule `17 3 * * *`; command exactly
`set role app_jobs; select nestly.purge_held_content()`; username `postgres`; active; database = current_database(); exactly 1 row in `cron.job` whose command matches `nestly` (case-insensitive,
no dot required, so `"nestly".x` counts) and it is that job; no job with username `app_jobs`; `not has_schema_privilege('app_jobs','cron','USAGE')`; membership row exists exactly once:
`member=postgres, roleid=app_jobs, set_option=t, inherit_option=f, admin_option=f, grantor=postgres`; app_jobs `not rolcanlogin and not rolsuper and not rolbypassrls`. The column for USAGE
becomes `no_cron_usage`, and `membership_gone` becomes `set_membership`.

**pgTAP 86 (as app_server, via `tests.fx_cron_jobs()`; `pg_auth_members`, `pg_roles` and `has_schema_privilege` read directly):** replace the username/bypass assertions with:
1. exactly one job named `nestly_purge_held_content`; schedule `17 3 * * *`; command = the exact string above; username `postgres`; active; database `postgres`.
2. **No other postgres job touches nestly:** `count(*) where command ~* 'nestly'` = 1 **and** `count(*) where command ~* 'nestly' and not (jobname = 'nestly_purge_held_content' and username
   = 'postgres' and command = <exact>)` = 0.
Exact equality on the one allowed command is the guard: any job, under any owner, that mentions nestly in any other way fails. Accepted gap (stated in the test comment): a job calling a
   non-nestly function
   that reaches nestly indirectly cannot be detected from `cron.job`. No such function exists, and adding one would go through DA review.
3. no job with username `app_jobs`, and no job with username in (`app_owner`, `supabase_admin`) whose command matches `nestly` (implied by 2; kept as named assertions for a readable failure).
4. `postgres` holds app_jobs exactly as above (s=t, i=f, a=f, grantor postgres — one row), plus the ADMIN row by supabase_admin; app_jobs is a member of nothing; app_server is not a member
   of app_jobs or postgres
   (directly or through a chain: `pg_has_role('app_server','app_jobs','MEMBER')` false, same for postgres).
5. `has_schema_privilege('app_jobs','cron','USAGE')` false; app_jobs NOLOGIN, not superuser, NOBYPASSRLS.
Purge behaviour itself stays in 76.

**E1 for A2 (`supabase/ci/cron-e1.sql`, CI `db` job, as postgres, outside pgTAP, run AFTER pgTAP 86, because probes mention nestly and would break 2):** three probe jobs scheduled as
postgres (no role switching in
the script), each `5 seconds`, polled ≤ 60 s in `cron.job_run_details`, all unscheduled in step 3 whatever happened, then the verdict:
- `nestly_e1_role`: `set role app_jobs; do $$ begin if current_user <> 'app_jobs' or session_user <> 'postgres' then raise exception 'E1 role %/%', session_user, current_user; end if; end
  $$` → expect `succeeded` (pg_cron connects as postgres; the switch takes effect).
- `nestly_e1_denied`: `set role app_jobs; select count(*) from nestly.users` → expect `failed` and a return_message matching `permission denied` (the statement really runs as app_jobs and
  not as postgres; a pass here would mean the switch did not happen).
- `nestly_e1_purge`: the exact production command → expect `succeeded` (EXECUTE and the TO app_jobs policies work in the cron context; on CI's DB there may be nothing held — success is
  the assertion).
Fail if any expectation is not met or any probe is still scheduled; the failure message names the probe. Hosted: on nestly-preview, run 03 + 03-cron-check + E1 (agent via
`tools/db-preview.mjs`), then the
next day confirm a `succeeded` run of the real job, before Afik runs 03 on prod. If E1-A2 fails (e.g. a libpq connection as postgres is refused) → B/C, a DECISION REQUEST to Afik through
ORCHESTRATOR.

**`03-cron-down.sql` (as postgres, one transaction, idempotent — a second run exits 0 and changes nothing):** no role switch at all (today's failure on re-run comes from `set local role
app_jobs` after its USAGE
was revoked). `select cron.unschedule(jobid) from cron.job where jobname = 'nestly_purge_held_content' and username = 'postgres'`. Zero rows → no call. Use the jobid form, not the name:
the name form raises when the job does not exist.
`revoke app_jobs from postgres` (removes only the SET row we granted; the ADMIN row by supabase_admin stays; a no-op on re-run). `revoke usage on schema cron from app_jobs` (no-op). The
extension stays.
After down, the step-1 check returns to the "before step 3" string. TE asserts: down twice → both exit 0, then the step-1 check is all ok, and 03 again → 03-cron-check ok (round trip).

**Docs (same PR):** data-model rule 6 adds one clause: "a pg_cron job whose role cannot log in is owned by `postgres` and its command begins `set role app_jobs;` — every statement runs as
app_jobs (current_user), so RLS applies as app_jobs". The F3.0b
exception's Schedule clause is replaced by: "pg_cron job nestly_purge_held_content daily 03:17 UTC, owned by postgres, command `set role app_jobs; select nestly.purge_held_content()`;
postgres holds app_jobs WITH INHERIT FALSE, SET TRUE (persistent);
app_jobs has no cron rights; DA 20.10 A2". README step 3: same, plus a line for Afik's prod run: "the job is postgres's; it switches to app_jobs before the purge". 01-roles.sql header: the
app_jobs line names this one membership.

**Is A2 a security-model change (CLAUDE.md reserved item 3)? DA's assessment: no — substance unchanged, so an Afik decision is not required. The prod run is still his.**
- Enforcement point unchanged: the purge reaches rows only through the F3.0b `TO app_jobs` policies. RLS is decided by `current_user`, which is app_jobs (NOBYPASSRLS, not owner). Who may
  reach which rows is unchanged.
- No new credential and no new LOGIN. app_jobs stays NOLOGIN, and no secret moves anywhere (B and C would add a credential, which is why they come after A2).
- No new capability: postgres already holds ADMIN on app_jobs (it could grant itself SET at any time) and is already strictly more powerful (BYPASSRLS). The persistent SET row adds nothing
  anyone can reach. app_server is in neither role (asserted).
- Tampering: only postgres (or above) can change a postgres-owned job. Anyone who can do that already holds postgres. app_jobs cannot edit or create a postgres job, and has no cron rights at all.
- What changes is the literal wording of rule 6 ("SQL jobs in pg_cron run as app_jobs"): the session belongs to postgres and the statements run as app_jobs. That is the same pattern as rule
  2/3, where a login role drops to a restricted role. The difference is a session
role with BYPASSRLS, and that difference is what the `set role` choice, pgTAP 86 (2) and E1's `denied` probe exist to guard. I record it as an approved exception (the F3.0b entry), within
  DA's right to decide where the rule is enforced.
ORCHESTRATOR should still list it as an FYI in Afik's batch, not as a blocker: rules 1 and 6 were his decisions of 10–11.10, and he runs 03 on prod himself. If he wants it as a reserved
  decision, that is his call, and it blocks only the prod run of 03 (and so F3.7's merge).

**Optional hardening (not blocking; a later migration, DA review):** `nestly.purge_held_content()` begins with `if current_user <> 'app_jobs' then raise exception …`, making the fail-open
case impossible in the function as well as in the command.

**Reversible?** Yes: `03-cron-down.sql` (idempotent) restores the pre-step-3 state exactly, and the step-1 check proves it.

