# Data model — as-built

## Read map

For a data-access/schema task, read Authorization enforcement and Platform rules (including the
approved-exception list). Then read only the affected table sections and their dependency sections
from [the table index](data-model-tables.md#table-index); do not load the entire table catalog.
Schema changes also read Schema conventions; new domains read only relevant Planned layers/open points.
A UI-only part with no data-access change does not need this file.

| Need | Section |
|---|---|
| RLS boundary | [Authorization](#authorization-enforcement-layer--decided) |
| Roles, connections, views, audit, exceptions | [Platform rules](#platform-rules--database-access--decided) |
| New/changed schema | [Schema conventions](#schema-conventions--decided) |
| Not yet built | [Planned](#planned--input-from-the-srs-nothing-below-is-built) |
| Built tables and dependent write/read paths | [Table index](data-model-tables.md#table-index) |


**Maintained by:** DATA ARCHITECT. Updated on every schema change, in the same unit of work.
**Status:** schema `nestly` exists since I1 F1.1 part b (`nestly.users`, `nestly.regular_profiles`), since I1 F1.4 (`nestly.journey_contexts`, `nestly.children`, `nestly.legal_consents`), since I1 F1.6 (`nestly.recovery_answers`, `nestly.recovery_throttles`, `nestly.recovery_events`), since I2 F2.0 (`nestly.identity_link_checks`), since I2 F2.4a (`nestly.friendships`, `nestly.regular_names`), and since I2 F2.4c1 (`nestly.security_limits`, `nestly.profile_open_counts`, `nestly.security_events`), and since the notifications (`nestly.notifications`, `nestly.notification_preferences`, `nestly.friend_content_notification_preferences`, `nestly.people_search_counts`). The "Planned" section maps the SRS for everything not built yet.

One of the two maintained as-built descriptions, with its per-table part `data-model-tables.md`; the other is `conventions.md`. Everything else is read from the code.

---

## Authorization enforcement layer — DECIDED

> **PostgreSQL Row Level Security. Enforced in the database, never in application code.**

### What this obliges

| Rule | Consequence |
|---|---|
| **Every table carries RLS policies** | a table with RLS disabled is a defect, not a shortcut |
| **Application code never filters for permission** — server code included | if code has to remove rows the user should not see, the policy is wrong. Fix the policy. The server authenticates, validates and rate-limits; the database decides who sees what |
| **The policy is the authorization model** | it must be readable top to bottom and say plainly who may read, write and delete each table |
| **A new table without a policy does not ship** | this is a blocking bug under workflow → Verdicts |

### Why, in one line

A rule attached to the data cannot be bypassed by forgetting. Enforcement in code has to be repeated at every read
path — feed, search, notifications, profile, related content, any future API — and one omission is a privacy leak.

### What DATA ARCHITECT owns as a result

The security boundary, not only the shape of the data. A schema change and a policy change are one unit of work,
reviewed together; neither ships without the other. Tables are described in Drizzle's TypeScript schema; policies,
functions and triggers are SQL in the migrations — database configuration, not application code.

---

## Platform rules — database access — DECIDED

Decided by Afik on 2026-10-10 and revised on 2026-10-11, when the architecture moved to a server of our own
(Node.js + TypeScript, Drizzle) in front of Supabase Postgres (`decisions.md`). Each rule closes a way to reach
data without passing through a policy. DATA ARCHITECT designs to them; CRITIC checks every diff against them.

### Roles and connections

| # | Rule | Why |
|---|---|---|
| 1 | **Nothing at runtime bypasses RLS**: no service_role, no role with BYPASSRLS, no superuser, and never the role that owns the tables | each of these skips every policy. Table owners skip RLS by default — hence rule 8 |
| 2 | **The request server connects as `app_server`**: LOGIN, NOBYPASSRLS, owns no table. It is granted `authenticated` — and `anon` for guest endpoints; `app_recovery` for the recovery flow only, see Approved exceptions — with `GRANT … TO app_server WITH INHERIT FALSE, SET TRUE` (Postgres 16+; on 15, NOINHERIT on the role does the same). Never a member of `service_role`, so never Supabase's `authenticator` | without inherited privileges, `app_server` can do nothing until a transaction sets a role. A forgotten identity fails closed |
| 3 | **Identity in every transaction.** The server verifies the JWT (JWKS, asymmetric keys), ignores the token's `role` claim, and inside the transaction runs `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', <claims>, true)`. Only transaction-local settings — never session-level. The claims are `{sub, role, session_id, iat, amr}` (F2.0 DR-S1): the last three identify the session for `nestly.session_guard()`, read in the same statement; never type, status or permission (rule 14) | `auth.uid()` in every policy works unchanged. Session-level settings would leak between users through the pooler |
| 4 | **Guest endpoints** run with `SET LOCAL ROLE anon` and minimal grants, or touch no database at all. They exist only for what a Guest may reach (FR-AUTH-004). Exception: the recovery flow runs as `app_recovery` | anon gets nothing it does not need |
| 5 | **Connection:** the request server uses Supabase's pooler in transaction mode (port 6543), postgres-js with `prepare: false`, one connection per function instance. **Migrations** run as `app_owner`, a separate owner role, from CI only, through the pooler in **session mode** (port 5432) or a direct connection — never in transaction mode, never at runtime, never from a developer machine against production. Production migration authority and its temporary pre-launch delegation are defined only in `.claude/workflow.md` → "Batched approvals"; that section never permits a direct developer-machine production path. Outside the product schema `app_owner` holds exactly two grants and nothing else: **CREATE on the database**, so it can create the product schema and the migration tool's `supabase_migrations` history schema (T5, 7.3); and **`authenticated` `WITH INHERIT TRUE, SET FALSE`**, because on Supabase `postgres` holds USAGE on schema `auth` without grant option, so this membership is the only way `app_owner` can create policies, defaults and functions that call `auth.uid()`, and run them inside its own SECURITY DEFINER functions (T5, P1–P4, 11.10.2026). As built: `supabase/bootstrap/01-roles.sql`. It never runs at runtime (rule 1). Decided 2026-10-11 (7.3); that the pooler accepts a custom role is tested in 7.3 (T3) | transaction mode keeps no session state; DDL and the migration tool's locks need a session. Production uses only the authorized CI path; see workflow → Batched approvals |
| 6 | **Background jobs run as `app_jobs`**, deployed apart from the request functions with their own credentials, which the request functions never hold — SQL jobs in pg_cron run as `app_jobs`, code jobs in a separate Vercel project (decided 2026-10-11, "Hosting"); since I5 a separate Vercel function in the same project with its own credential (Afik 20.10.2026, approved exception below). NOBYPASSRLS, minimal grants. Where a job must read or write across users, it gets an explicit `TO app_jobs` policy on that table, listed below | a compromised request server cannot act as the job runner, and every cross-user reach is a named, reviewable policy |

### Tables, views and functions

| # | Rule | Why |
|---|---|---|
| 7 | **Product tables live in a schema the Supabase Data API does not expose**, with anon privileges revoked. The Data API is off for the product schema; this is the second fence | the only public surface is the server's endpoints |
| 8 | **`FORCE ROW LEVEL SECURITY` on every table** | even the owning role is held to the policies |
| 9 | **Every view is created `WITH (security_invoker = true)`** | a view without it runs with its owner's rights and skips RLS |
| 10 | **Functions run as SECURITY INVOKER by default.** SECURITY DEFINER only when DATA ARCHITECT approves it in `schema.md`, with a fixed `search_path` and an explicit `auth.uid()` check inside; listed below | a definer function runs with its owner's rights — the bypass of rule 1, hidden inside the database |
| 11 | **A write of several steps that must succeed or fail together runs in one transaction** — one Drizzle transaction inside the identity transaction, or one database function. Never split across requests | a dropped connection between requests leaves partial state |
| 12 | **Ownership is set by the database**: the owner column defaults to `auth.uid()` and the policy's `WITH CHECK` requires it | an identifier sent by the client never establishes ownership |
| 13 | **Identifiers are generated by the database.** The identifier type is decided with the first table and must satisfy NFR-SEC-006 | the client cannot choose, guess or collide an identifier |
| 14 | **Account type, permissions and status come from database tables only** — never from `user_metadata`, which the user can edit, and never from the token's claims beyond the user id | a user must not be able to promote themselves |
| 15 | **A suspended or banned account is blocked at once**: `is_active_account()` is checked in RLS, not only when the JWT expires | a token stays valid for its lifetime; the policy is checked on every query |
| 16 | **Permission Keys are checked in policies through one function**, `has_permission(key)`: STABLE, fixed `search_path`, called as `(select has_permission(...))` so it runs once per statement. **Caller-only helpers — those that answer only for `auth.uid()` and read only rows the caller's own policies already let it read — are SECURITY INVOKER**; `is_active_account()` is one (F1.1 Gate 2). SECURITY DEFINER stays for a helper that must read rows the caller cannot, as an approved exception. Whether `has_permission` needs that is decided with it | one reviewable place for the Moderator model (deny by default, NFR-SEC-002/004), and no per-row cost. A definer that sees no more than the caller gains nothing and costs an exception |

**What CI enforces** (`supabase/ci/rls-gate.sql`, every CI run): the RLS gate covers `nestly` and every other schema `app_owner` owns (except the
migration tool's history schema, which may hold only the tool's own tables), and fails if `nestly` is missing. It flags any materialized view or
foreign table in those schemas — neither can carry RLS; allowed only via "Approved exceptions" below.

### Writes across users, and audit

| # | Rule | Why |
|---|---|---|
| 17 | **A write that lands in another user's rows** — a notification to someone else, a counter, an aggregate, an analytics event, a ranking update — goes through a narrow SECURITY DEFINER function, one per kind of write, listed below | the caller's policy rightly forbids writing another user's rows; the function allows exactly one shape of write |
| 18 | **Audit is written by the database in the same transaction.** Admin and Moderator writes are audited by triggers. `authenticated` has no INSERT, UPDATE or DELETE on the audit table. The reason travels in a transaction-local setting. Exception: `nestly.recovery_events` is written by the server under `app_recovery`, not by a trigger, because the audited action (the Auth password reset) happens outside the database; the insert policy binds handle, IP hash and user id to the transaction's declared subject, while the server chooses `kind`; the three F2.0 subject-bound kinds (takeover_cleared, password_set_forced, first_password_set) bind user id to the transaction's sub or NULL (`recovery_events_insert_subject`) and no longer pass the handle-bound policy. `authenticated` and `anon` have no access to it | an action cannot happen without its record, and the server cannot forge one (NFR-AUDIT-001, BR-027) |
| 19 | **Protected reads go through an audited function.** A trigger does not run on SELECT, so revealing an anonymous author (P5, AC-077) and Moderator access to Private Group content (NFR-PRIV-002) go through a dedicated function that returns the data and writes the audit entry in the same call | the read and its record are one operation |
| 20 | **The real author of an anonymous post is not readable by anyone but the author.** It is kept in a separate table: the author reads their own rows (`author_id = auth.uid()`) — to see, edit and delete their anonymous posts and to get notifications on them. Nobody else reads it; the reveal function (rule 19) is the only other path. Final shape at Gate 2 | RLS hides rows, not columns, and a `security_invoker` view cannot mask a column its caller cannot read. A separate table makes row-level security enough (P4) |

**Realtime, when it comes** (chat, notifications; the MVP polls): Supabase Realtime private channels, authorized by RLS policies on
`realtime.messages`, carry **signals only** — "something changed on this topic", never content. The client then fetches the content through the
server, under rule 3. Why: Realtime checks its policy when a client connects and keeps it for the connection, so a revoked or suspended user may
receive until the token expires (rule 15 cannot hold on that channel). Decided 2026-10-11, "Hosting".

**Connections from functions** (rule 5): each Vercel Function instance holds one pooled connection in transaction mode. The Free plan allows 200
pooler clients — watch it as traffic grows. CI migrates through the session-mode pooler (IPv4), since the direct connection is IPv6 only on Free; it
moves to the direct connection when the IPv4 add-on is bought (I9 or later). Decided in 7.3.

**The `auth.users` anchor and bootstrap steps.** Exactly one product table references `auth.users`: the anchor,
`nestly.users`, through `users_id_fkey`; every other table references the anchor. `app_owner` cannot hold REFERENCES
on `auth.users` (`postgres` lacks grant option, T5, 11.10.2026), so that one FK is added by `postgres`, a member of
`app_owner` (`WITH INHERIT TRUE, SET FALSE`), in a versioned, idempotent bootstrap script run once per environment. On
nestly-prod, Afik runs it. A pgTAP test asserts the FK exists. CRITIC flags any migration that touches that
constraint: `app_owner` can drop it, only `postgres` can restore it. **The anchor's ON DELETE is RESTRICT** (Afik,
13.10.2026, `decisions/2026-10.md` "I1 open points"): an Auth user who still has a Nestly account cannot be deleted.
Deletion runs only through an orderly deletion flow (I9, SRS OP-028) that removes the Nestly data first and the Auth
user after; never as a side effect of deleting the Auth user. Changing the action is irreversible in effect once a
cascade has run — reserved for Afik. Bootstrap steps, the complete list (anything else needing `postgres` is a
`DECISION REQUEST`):
1. create `app_owner`, `app_server`, `app_jobs` and `app_recovery` and their grants, and `grant app_owner to postgres`;
2. the anchor's FK to `auth.users` — as built: `supabase/bootstrap/02-anchor-fk.sql`, verified by `02-anchor-fk-check.sql`;
3. the single Super Admin (`supabase/bootstrap/03-super-admin.sql`, run once per environment by Afik, a separate Auth account; approved by Afik 20.10.2026); later: extensions and pg_cron jobs, when needed.

**Open, under rules 16 and 17** — FORCE RLS (rule 8) holds a SECURITY DEFINER function owned by `app_owner` to the table's policies, including those
`TO authenticated` (which `app_owner` inherits). **Resolved for caller-only helpers** (F1.1 Gate 2): SECURITY INVOKER, reading through the caller's
own-row policies (rule 16). **Resolved for a definer that reads other users' rows** (F2.3b, DR-G1): it reaches them only through `TO app_owner`
policies scoped to a target it declares in a transaction-local setting and clears; no runtime role is in `app_owner` (rule 1), so the setting opens
nothing outside it — `nestly.profile_view` below. **Resolved for that definer writing the caller's own rows** (F2.4c1, Afik DR-L): the same gate plus `user_id = auth.uid()`. **Resolved for rule-17 writes into other users' rows** (notifications, Afik 20.10.2026): the same gate, one definer per kind of write ("Approved exceptions"). **Resolved for rule-19 audited reads** (I4, Afik 20.10.2026): `reveal_post_author`, below. **Resolved for children's tracker trends** (I14 completion, Afik 21.10.2026): `child_tracker_trends`, below — the same gate, opened for one statement and cleared, returning aggregates only.
**Backfills:** constant (F2.3a): `ADD COLUMN … NOT NULL DEFAULT <constant>`, catalog-only, no row written. Computed (F2.4a DR-B): in the migration's transaction,
`NO FORCE` on the source, `INSERT … SELECT` as owner, `FORCE` again at once (ACCESS EXCLUSIVE till commit: rule 8 holds at every commit); never at runtime.

### Approved exceptions

A SECURITY DEFINER function (rules 10, 16, 17, 18, 19), a `TO app_jobs` policy (rule 6), a role or credential outside
rules 1–4, or a materialized view or foreign table in a schema `app_owner` owns exists only when it is listed here
(`nestly.is_active_account()` is deliberately not one: it is SECURITY INVOKER, rule 16). Each entry:

```
<name> — what it does · why the caller's own rights cannot do it · approved in .work/<slug>/schema.md · date
```

```
F1.6 recovery and F2.0 S-01/S-16 (FR-AUTH-003/005, OP-029) — Afik 2026-10-13, widened 2026-10-16 (AR-1). Two parts, nothing else:
(a) Auth: set the password in five flows only — recovery reset (as below), the S-01 clear (random, never kept), the forced
    new password, the change after two answers, the F1.8 first password (no account row) — key SUPABASE_SECRET_KEY read only
    in apps/server/src/recovery/auth-admin.ts; no other admin operation; the set itself ends every session of the user, the caller's
    included (GoTrue; Gate 2 A6, DR-E: no separate sign-out call), the reset keeps its scope=global logout; each set audited in recovery_events after it (a lost row is logged); every set and the S-01 clear hold the per-user password-state lock (A4). The S-01
    detection reads the caller's identities with the caller's own token (GET <issuer>/user); its gateway `apikey` is SUPABASE_PUBLISHABLE_KEY, as is the reset's logout (caller-token calls); admin calls and the token grant send the secret key; a missing key fails closed, no fallback (Afik, I2). The reset, resetPassword({userId, email, password,
    clientIp}): exactly four calls, in this order — GET <issuer>/admin/users/<uuid> (only email is read and compared, normalised, with the request's email; different or
    missing ends the sequence with no further call: outcome email_mismatch, answered 401 invalid_recovery, audited
    reset_email_mismatch); PUT <issuer>/admin/users/<uuid> {password}; after a 2xx one POST <issuer>/token?grant_type=
    password with the new password the request already holds; then POST <issuer>/logout?scope=global with that access
    token, which revokes every refresh token. The token is discarded (never returned, logged or stored). Sb-Forwarded-For
    carries the platform-verified client IP on the read, the sign-in and the logout (not on the set-password call). Called
    only by the redeem service after both answers matched under the limits and a reset_verified row was committed.
    Why: no database role may set an Auth password (auth.users is outside the product's roles, rule 1); a signed-out user
    has no token; the admin API has no revoke-by-user-id, and a reset that leaves an attacker's session alive does not end
    a takeover; only Auth knows the account's current email (Amendment 2: a password is set only on the account the
    request's email names now). Fence: credentials.static.test allows each key's name (src/) in that one file only and asserts it
    is there; the admin, token-grant and logout literals appear in that file only; never in .github/. The key is not scoped
    by Supabase (service_role power over the whole project): the fence is the code and the CI check, not the credential.
    Approved in .work/password-recovery/schema.md (Amendment 1; Amendment 2 adds the email read) · 2026-10-15; widened in
    .work/account-takeover-close/schema.md (Gate 2; decisions/2026-10.md "F2.0 AR-1/AR-2") · 2026-10-16
(b) role app_recovery — NOLOGIN, NOINHERIT, NOBYPASSRLS, owns nothing; granted only to app_server WITH INHERIT FALSE,
    SET TRUE. The signed-out redeem, and the recovery verification and audit writes, run under SET LOCAL ROLE
    app_recovery, held by RLS + FORCE. It reads recovery_answers and reads/writes recovery_throttles only for the handle
    and IP hash the transaction declares (nestly.recovery_handle(), nestly.recovery_ip()); its one write on
    recovery_answers releases the declared handle (email_handle and handle_claimed_at to NULL) only on a row whose claim
    is older than the declared one (nestly.recovery_claimed_at(), policy recovery_answers_release_recovery) — it can set
    no handle, touch no hash, delete no row; it appends recovery_events (and the three subject-bound kinds of F2.0,
    user_id = the transaction's sub, nestly.recovery_subject(), DR-S2) and reads no audit and no other table; I4 adds only UPDATE of recovery_throttles.ladder_failures (column grant, `20261021300000`, NFR-SEC-010, Afik 20.10.2026).
    Why: a guest endpoint has no auth.uid(), and anon must hold nothing in nestly (rule 7, CI anon_privilege). Not a
    SECURITY DEFINER function; adds nothing to tests.approved_security_definer().
    Approved in .work/password-recovery/schema.md · 2026-10-15 (DR-G1, ORCHESTRATOR; release policy: Amendment 2)

```
Preview E2E test-user cleanup (DR-E1, option 1) — credential PREVIEW_DB_ADMIN_URL: role `postgres` (BYPASSRLS), nestly-preview only, user postgres.<preview
ref>, session pooler, port 5432. CI only, `preview-e2e-cleanup`: main's code (never the deployment sha), in environment `preview-e2e` restricted to `main`
(Afik, 17.10; verified via API). On `workflow_run`: the per-run cleanup. On manual `workflow_dispatch` (main only): mode `dry-run` only (preflight, counts,
ages; no delete; `backlog` removed in F3.0a). Victims: only the exact `TEST_EMAIL_PATTERN`. Caps unchanged: this run's
users uncapped, sweep 10, refusal above 50 (workflow_run). One transaction per user, leaf first, SET LOCAL row_security = off (raises, never filters); feed rows per
user before friendships: reports, reactions (reaction_owners by cascade), post_hides, comments, posts (post_authors by cascade).
Fail-closed preflight: exactly the thirty nestly tables (F2.4c1 fourteen; F3.0a +4, F3.0b +4, I6 +3, I4 +5; security_limits, algorithm_configurations, status_guides, report_reasons and audit_log listed, never
written). · .work/preview-e2e/schema.md, .work/feed-groundwork/schema.md, schema-b.md · decisions/2026-10.md "DR-E1", "Preview cleanup"
```

```
nestly.profile_view(text) — one other Regular account's profile (FR-PRIV-001, BR-044, AC-054, AC-078, NFR-SEC-006; F2.3b, F2.4c1). First counts the open: N, W
from security_limits (absent or invalid → NS001, all rolled back); the caller's profile_open_counts row locked; at ≥ N one row, outcome 'limited', rest NULL, and
one security_events row per refusal stretch (the server COMMITs it). Else 0/1 row 'shown': full_name, children_count, is_pregnant, shows_empty_journey_sentence;
gender, child_ages ([{years, months}]) when Open or the caller's Friend (DR-2 A); relationship (NULL for a non-Regular caller); friends, mutual_friends
([{userId, fullName}]). Never a child's name, sex, birth date, id or slot, a due date, a setting or a status. Caller active (is_active_account(), its auth.uid() check);
target active + Regular, else 0 rows (still counted). Reach: 11 *_profile_view policies TO app_owner, open only while the transaction-local GUC
nestly.profile_view_target holds the target it sets and clears: reads the target's rows (4), its accepted Friendships and Friends' names (2); config, and only auth.uid()'s
count row and events (5; events INSERT only). Helpers profile_view_target(), child_age_months() invoker, no runtime EXECUTE; now(), never a parameter. Owner app_owner;
EXECUTE authenticated; search_path ''. Why: RLS hides rows, not columns; an invoker that can test its count can read it (c21). · .work/profile-privacy/, .work/friends/schema.md · Afik 2026-10-17 (DR-G1, DR-L)
```

```
Notification triggers and People Search (rule 17; `20261020400000_notifications_search.sql`) — approved by Afik 20.10.2026, with conditions. Four SECURITY DEFINER functions
owned by app_owner, fixed search_path, each one kind of write into another user's rows (or a read no policy allows): triggers `notify_friendship()` (a Friend Request received or
accepted; a decline is silent), `notify_comment()` (a comment on my post, the real author of an anonymous post included; a reply to my comment; never to oneself), `notify_post()` (a share
of my post; a named post of a Friend to the Friends who chose to follow that Friend) - no EXECUTE for any runtime role - and `search_people(text, integer, integer)` (EXECUTE authenticated:
counts the call against the people_search limit, returns id and full name of active Regular accounts for a query of 2 to 100 characters, at most 50 rows). Conditions: (1) no "new post of a
Friend" for an anonymous post (AC-076); (2) no query returns nothing, and never an Admin, Moderator or inactive account; blocked pairs excluded both ways (user_blocks);
(3) no notification between users who blocked each other (notify_deliver, `20261021250000_user_blocks.sql`), and every notification respects the recipient's preferences. Each declares a scope in a transaction-local setting
(`nestly.notify_scope`, `nestly.search_scope`) that opens its eight `TO app_owner` policies on posts, post_authors, comments, friendships, users, regular_names, security_limits and
security_events (plus the new tables'), and clears it; no runtime role is a member of app_owner. `notify_deliver()` is SECURITY INVOKER, run only by those definers. No like creates a notification.
Also the retention job's `TO app_jobs` policies `search_intents_select_jobs` / `search_intents_delete_jobs` (rows older than 30 days) and `purge_search_intents()` (EXECUTE app_jobs only; rule 6). I10 (`20261022300000_groups.sql`; to be confirmed by Afik — built on the same shape overnight 21.10.2026): `notify_group()`, a fifth trigger definer of this kind (no EXECUTE for any runtime role): a Group recommendation, invitation, Join Request (to the Owner and Admins) and its approval; a new group post (members on mode all); a pinned post and a post at the Highlights threshold (members on all/highlights). Scope `group` opens `group_members_select_notify` and `group_notification_preferences_select_notify` (TO app_owner) only. I11 follow-ups (`20261022700000_i11_followups.sql`; approved by Afik 21.10.2026, OP-051 cancelled, decisions-in-force.md §9.8, in the I7 pattern and conditions): `notify_professional()`, a sixth trigger definer of this kind (no EXECUTE for any runtime role), on `outreach_requests` (an Offer Help accepted or declined), `professional_reviews` (a new review) and `professional_follows` (new followers, one weekly digest row timed at the week's end); conditions, each with a pgTAP test (file 98): never to oneself, never across a user block (checked as the caller through `user_blocks_select_party`, since the actor is not passed), the recipient's category switch honoured, the actor never named (actor NULL). Scope `professional` opens only the existing `notifications_*_notify` and `notification_preferences_select_notify` policies; no new TO app_owner policy. Rule 19 for Private Group content (NFR-PRIV-002) is met without a definer: a staff view row (`private_group_content_views`, audited by `audit_trigger()`) opens the reported item to that viewer inside that transaction only.
```

```
F3.0b purge — TO app_jobs policies on posts, comments, reports: read held rows (and replies of a held comment) and the open reports on them, delete held rows,
expire open reports past release; purge_held_content() invoker, EXECUTE app_jobs only · a job has no auth.uid() and must reach every user's held rows (rule 6);
app_server is never a member of app_jobs · .work/feed-groundwork/schema-b.md · 2026-10-18
I4 (rules 18, 19; approved by Afik 20.10.2026) — nestly.audit_trigger(): the one trigger function that appends every Audit entry (I6 adds the status_guides branch, FR-ADMIN-012, 21.10.2026; I8 the support_requests, support_messages and reported_message_views branches, `20261022100000`; I12 the marketplace_listings hide/restore and sponsored_products branches, `20261022600000`; the I14 completion the report_escalations branch and the invitation's id on moderator_joined, `20261022800000`); nestly.reveal_post_author(uuid): the audited read of an anonymous author (REPORTS_VIEW + CONTENT_MODERATE, and PRIVATE_GROUP_MODERATE on Private Group content since the I14 completion, a valid session, an OPEN report; writes author_revealed with the report id in the same call). Both SECURITY DEFINER, owner app_owner, search_path '', reading only through policies TO app_owner scoped to auth.uid() or to the one row the function named · no role holds INSERT on audit_log and authenticated cannot read post_authors, so the definer is the only writer/reader · details and deviations: data-model-tables.md "Safety and admin core" · I5 media (Afik 20.10.2026, decisions-in-force.md §7): (1) the Supabase secret key (SUPABASE_SECRET_KEY, the recovery key) is also read in apps/server/src/media/storage-admin.ts, for Storage only: upload to the private bucket `media`, the job's read and write of `media` and `media-training` (each training read logged first as an `accessed` event), removal, and short-lived signed read URLs issued only after the caller's RLS-checked read of the media_assets row; credentials.static.test allows the name in that file only and fences the training bucket to the jobs code; (2) the job is api/jobs.ts in the same Vercel project, with its own LOGIN role app_media_jobs (bootstrap step 1; NOBYPASSRLS, member of nothing) through APP_MEDIA_JOBS_DATABASE_URL, which the request server never imports, and CRON_SECRET, which the request server reads only in media/job-kick.ts to ask for a run after an upload or a queue decision (Vercel variables are shared by the project, decisions-in-force.md §7; static test); (3) TO app_media_jobs policies with column grants on media_assets, media_reviews, profile_photos, stories, media_training_candidates, media_training_samples and media_training_events: read every image row, record a check on a pending image (its review first when queued), mark a rejected not-held image's file removed once its training copy exists, add a sample of a blocked or unsure image staff decided (children included) or of a candidate (an image removed after a handled non-child-safety report), never a held or suspected one, delete samples at exactly 6 months or when their image becomes suspected, append access events that name a real sample, and purge per BR-077 (never a queued or held image early; a held one after 90 days); no client policy on the training set (no manual viewing). No new SECURITY DEFINER; audit_trigger() gains the media decision and suspicion branches; a suspicion on a passed or approved image rejects and holds it in the same statement (SECURITY INVOKER trigger, as the staff member). I14 completion (Afik 21.10.2026, decisions-in-force.md §9.2, approved once for this function family): `child_tracker_trends(text, text, text, integer)`, children's tracker data as trends only — CHILD_DATA_VIEW (the Admin always, not part of ANALYTICS_VIEW), closed lists (metric x field x dimension x 30/90/365 days, else 22023), aggregates only, a cell under 10 children or 10 families suppressed, children of active accounts only, an audit row (child_data_queried) per call; reads through three `*_select_child_data` TO app_owner policies open only under its transaction-local `nestly.child_data_scope` and for a CHILD_DATA_VIEW caller; details and tests: data-model-tables.md "Staff work", pgTAP file 100. Not a definer, also there: staff review reads (`posts_select_staff_review`, `comments_select_staff_review`: every active staff account reads every active post and comment) and the audited Private Group page opening `group_staff_views` (PRIVATE_GROUP_MODERATE, rule 19 without a definer, like private_group_content_views).
```

---

## Schema conventions — DECIDED

Proposed by DATA ARCHITECT and approved by ORCHESTRATOR at F1.1 Gate 2, 13.10.2026
(`.work/identity-platform/schema.md`, `decisions/2026-10.md` "F1.1 Gate 2").

| Topic | Convention |
|---|---|
| Product schema | **`nestly`**, owned by `app_owner`. Never `public` (rule 7) |
| Identifier | **`uuid`**; generated ids use **`gen_random_uuid()`** (v4, 122 CSPRNG bits — satisfies NFR-SEC-006, BR-063). No sequence, identity or counter anywhere in `nestly`. UUIDv7 rejected: it leaks creation time and orders ids |
| Person ids | a person's id **is** the Supabase Auth user id (`auth.uid()`), set by `default auth.uid()` (rules 12–13); never by the client. Policies compare to `auth.uid()` with no lookup in between |
| Time | **`timestamptz`** only, default `now()`, microsecond precision, stored UTC; the UI converts to Asia/Jerusalem. Calendar dates (birth date, due date) are `date`. Never `timestamp without time zone` |
| Naming | snake_case, **plural** tables; singular `<entity>_id` FK columns; `is_`/`has_` booleans; `_at` instants, `_date` dates; constraints `<table>_<column>_<check\|key\|fkey>`; policies `<table>_<command>_<who>`. Never a quoted identifier. Every table and column carries a `COMMENT` with its meaning and SRS id. It still matters under Drizzle: the typed schema catches a wrong column name in TypeScript, not inside raw SQL, policies or functions |
| Enums | **`text` + a named `CHECK (… in (…))`**, lowercase snake_case values. The value list lives once in `packages/shared`; Drizzle declares `text(…, { enum })` from it. Postgres ENUM rejected: no value drop, `ADD VALUE` breaks atomic migrations |
| Delete | no default. Account lifecycle lives in `users.status`. Soft delete, where an entity needs it, is a nullable `deleted_at timestamptz` hidden by its policy — decided per entity against §13.4. Hard delete, no history row, so far: `children` and `journey_contexts` by their owner (F2.2b, Afik DR-1 A); platform backups may hold a deleted row for their window (§13.4, Privacy Policy) |
| RLS helpers | in `nestly`, `language sql`, `STABLE`, no argument that names a user (caller only), `set search_path = ''` with every name schema-qualified, EXECUTE revoked from PUBLIC and granted to `authenticated` only — except the four recovery helpers (`recovery_handle`, `recovery_ip`, `recovery_claimed_at`, `recovery_subject`), granted to `app_recovery`, not `authenticated`, and `profile_view_target` (F2.3b), granted to no role: only its owner runs it, in `profile_view` and its eleven `TO app_owner` policies — called as `(select nestly.fn())`. SECURITY INVOKER unless an approved exception says otherwise |
| Status gate placement | on `users` and `identity_link_checks` there is **no** status gate on SELECT — an account reads its own row in every status (F1.5 DR-1 A; F2.0); on every other table the gate is `(select nestly.is_active_account())`. Seeing the own `users` row never means "active". A table's policy never calls a function that reads the same table (no recursion) |
| Write grants | INSERT (and, when it comes, UPDATE) is granted **per column**, only on the columns the client's data fills. Identifiers, owner columns, clocks and columns fixed to a constant default (e.g. `regular_profiles.account_type`) are never granted, so their defaults always apply: rules 12–13 are held by privilege, and the policy's WITH CHECK is the second fence. One exception: `regular_names.user_id` (F2.4a), INSERT-granted because its trigger names it; WITH CHECK `= auth.uid()` and the composite FK to the own profile fence it. A column the server sets but the policy constrains (e.g. `users.account_type`, `users.status`) is granted, and the policy is its first fence. SELECT stays table-level, except where a column must never be read back: `recovery_answers` has the first column-level SELECT (`authenticated` reads user_id, email_handle, handle_claimed_at, created_at; hashes, salts and the chosen questions are not readable by `authenticated` or `anon`; `app_recovery` reads them for the declared handle only). In Drizzle every write goes through a write-model object (`<table>Insert`) in `schema.ts` that names exactly the granted columns: Drizzle names every column of the object it inserts into, and naming an ungranted column is 42501. Decided F1.4 part a (CRITIC finding 1). Proposed by DATA ARCHITECT (`.work/register-account-create/schema.md` Amendment 1); validated by CRITIC with its wording change (`.work/register-account-create/findings.md`, part a re-check) |
| Migrations | hand-written SQL in `supabase/migrations/`, applied by the Supabase CLI as `app_owner`, each file and its history row in one transaction. One file = one unit: table + RLS + FORCE + policies + grants + comments. No non-transactional statements. Each has a down script in `supabase/rollback/`. A part that adds a `nestly` table updates `tools/preview-e2e-cleanup*.ts` (`EXPECTED_NESTLY_TABLES` and the per-user delete order: every row of the user before what it references, RESTRICT FKs satisfied) in the same PR; DATA ARCHITECT checks the delete order at Gate 2 (Afik 17.10.2026, "Preview cleanup" b) |
| Drizzle | `pgSchema('nestly')` in `apps/server/src/db/schema.ts` mirrors columns, types and nullability for typing only; a CI drift check compares it to the catalog. drizzle-kit never generates or pushes migrations. Policies and functions are SQL only |

---

## Planned — input from the SRS (nothing below is built)

The logical entities are in `docs/srs/13-data.md` (48 entities; relations §13.1, data usage §13.2, events §13.3,
retention §13.4). This section does **not** copy them: it organizes what a schema and its RLS policies have to encode,
and points at the SRS for every rule. **On any conflict, the SRS wins** — fix this section, never the SRS to match it.

### Authorization layers — what the RLS policies must express

Read top to bottom. A request passes a layer before it reaches the next one.

| # | Layer | The rule in short | SRS |
|---|---|---|---|
| 1 | Authentication | A Guest reaches nothing but Welcome, Login and Registration | FR-AUTH-004, BR-015, AC-016 |
| 2 | Account type | Regular and Professional are separate accounts. Admin and Moderator are system accounts with no social participation | BR-016, BR-034, ERR-022 |
| 3 | System permissions | Admin has full access. Moderator is deny-by-default, only via assigned Permission Keys, with key dependencies. Nine Admin Only actions can never be assigned | §3.1, §3.2, BR-022–028, NFR-SEC-002, NFR-SEC-004, AC-026, AC-031, AC-032 |
| 4 | Relationships | Friendship only between two Regular users; Follow only toward a Professional Profile | BR-029, BR-030, VAL-017, VAL-018 |
| 5 | Profile visibility | Basic Public Profile always; Open or Restricted for non-Friends; children and pregnancy only as Journey Summary; Tracker Data never to a non-Friend; a Professional viewer is treated exactly like a Regular non-Friend | §1.4, FR-PRIV-001, BR-044, VAL-027, AC-054 |
| 6 | Groups | Public content readable by signed-in users, Private content by members only; posting needs membership; group role hierarchy; system Moderator access to Private content only with PRIVATE_GROUP_MODERATE, audited | BR-031–033, BR-039–041, NFR-PRIV-002, VAL-019–021 |
| 7 | Content state and authorship | Removed or hidden content is unavailable; an anonymous post never exposes its author to community users; a Moderator reveals the author only while handling a report on it, audited | ERR-011, FR-FEED-005, BR-062, VAL-036, AC-075–077 |
| 8 | Messaging | Only participants read a conversation; opening rules depend on relationship and context; Chat Block affects messaging only; Support Thread is tied to a SupportRequest | FR-CHAT-002, BR-011, BR-042, BR-043, VAL-024–026 |
| 9 | Owner-only personal data | Child, JourneyContext, TrackerEvent and TrackerData belong to their Regular owner. USER_VIEW does not grant Tracker Data; full sensitive access is Admin Only | §3.1 USER_VIEW, §3.2 SENSITIVE_DATA_FULL_ACCESS, NFR-PRIV-005, NFR-PRIV-006 |
| 10 | Analytics and personalization | PersonalizationProfile is system-only. Professionals see aggregates of their own account only. Admin sees aggregates by default. **Purpose limits belong to ALGORITHM & DATA** | BR-057, BR-058, VAL-032, §13.2 |
| 11 | Commerce | Listings belong to their owner; a promotion to its buyer and to Admin finance; Sponsored Products are Admin Only | BR-046, BR-047, §3.2 BILLING_FINANCE_MANAGE, SPONSORED_PRODUCT_MANAGE |
| 12 | Audit | Append-only. A Moderator with AUDIT_LOG_VIEW reads and never writes; nothing in the product deletes or edits an entry | NFR-AUDIT-001, BR-026, BR-027, AC-029, AC-030 |
| 13 | Enumeration | No listing of users without a query; rate limits; non-guessable identifiers | NFR-SEC-006, BR-063, VAL-037, AC-078 |

### Facts that shape tables

| Fact | SRS |
|---|---|
| Email is unique across **all** account types | BR-045, VAL-002 |
| A post always stores its real author, plus an anonymity flag. For an anonymous post, the real author sits in a separate table readable only by the author (platform rule 20) | §13 Post, FR-FEED-005 |
| Children's birth dates are stored; a non-Friend sees only derived ages, and only in an Open profile | §1.4 Journey Summary |
| A conversation between Regular users survives Remove Friend | §13 Conversation, BR-042 |
| Organic and paid metrics are stored separately; payment never touches organic history | NFR-ALG-003, §13 ProfessionalPromotionMetric |
| Notification preferences carry separate In-App and Push flags; Security/Critical stay mandatory | §13 NotificationPreference, BR-061 |
| Algorithm configuration is versioned, Admin Only to change, audited with before/after | BR-059, VAL-033 |
| Analytics events carry a unique event id, are counted once, and never copy message bodies | NFR-DATA-002, NFR-DATA-003, VAL-031 |
| Permission changes are audited with before and after | §3.3, NFR-AUDIT-001 |

### Open in the SRS
Recheck `docs/srs/appendix-b-open-points.md` before designing any table; never design around an open point with a guess (OP-003 active context, OP-011 messaging, OP-012 Marketplace listing, §13.4 retention).
---

## Entities

All thirty-five tables are in `nestly` (the notification and search tables: `data-model-tables.md` "Notifications and People Search"; feed tables of F3.0: posts, post_authors, post_hides, algorithm_configurations, comments, reactions, reaction_owners,
reports — FORCE RLS, client policies TO authenticated gated by is_active_account(), column-level SELECT without held_xact/liker_status/parent_status, no SECURITY
DEFINER; post_authors and reaction_owners owner-only; policies never read their own table, row checks in invoker triggers), built by `supabase/migrations/` and bootstrap step 2, each migration with a down script in `supabase/rollback/`. The
list of migrations by feature, each down script's guard, the write paths, per-table detail, the lock and the new-entity template: `data-model-tables.md`.
