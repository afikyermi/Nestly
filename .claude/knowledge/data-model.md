# Data model — as-built

**Maintained by:** DATA ARCHITECT. Updated on every schema change, in the same unit of work.
**Status:** schema `nestly` exists since I1 F1.1 part b (`nestly.users`, `nestly.regular_profiles`). The "Planned"
section maps the SRS for everything not built yet.

This file is one of the two maintained as-built descriptions. The other is `conventions.md`.
Everything else about the system is read from the code.

---

## Authorization enforcement layer — DECIDED

> **PostgreSQL Row Level Security. Enforced in the database, never in application code.**

### What this obliges

| Rule | Consequence |
|---|---|
| **Every table carries RLS policies** | a table with RLS disabled is a defect, not a shortcut |
| **Application code never filters for permission** — server code included | if code has to remove rows the user should not see, the policy is wrong. Fix the policy. The server authenticates, validates and rate-limits; the database decides who sees what |
| **The policy is the authorization model** | it must be readable top to bottom and say plainly who may read, write and delete each table |
| **A new table without a policy does not ship** | this is a `Not Ready`, not a concern |

### Why, in one line

A rule attached to the data cannot be bypassed by forgetting. Enforcement in code has to be repeated
at every read path — feed, search, notifications, profile, related content, any future API — and one
omission is a privacy leak.

### What DATA ARCHITECT owns as a result

The security boundary, not only the shape of the data. A schema change and a policy change are one
unit of work, reviewed together. Neither ships without the other.

SQL — policies, functions, triggers — is database configuration, not application code. Tables are described
in Drizzle's TypeScript schema; policies, functions and triggers are SQL in the migrations.

---

## Platform rules — database access — DECIDED

Decided by Afik on 2026-10-10 and revised on 2026-10-11, when the architecture moved to a server of our own
(Node.js + TypeScript, Drizzle) in front of Supabase Postgres (`decisions.md`). Each rule closes a way to reach
data without passing through a policy. DATA ARCHITECT designs to them; CRITIC checks every diff against them.

### Roles and connections

| # | Rule | Why |
|---|---|---|
| 1 | **Nothing at runtime bypasses RLS**: no service_role, no role with BYPASSRLS, no superuser, and never the role that owns the tables | each of these skips every policy. Table owners skip RLS by default — hence rule 8 |
| 2 | **The request server connects as `app_server`**: LOGIN, NOBYPASSRLS, owns no table. It is granted `authenticated` — and `anon` for guest endpoints — with `GRANT … TO app_server WITH INHERIT FALSE, SET TRUE` (Postgres 16+; on 15, NOINHERIT on the role does the same). Never a member of `service_role`, so never Supabase's `authenticator` | without inherited privileges, `app_server` can do nothing until a transaction sets a role. A forgotten identity fails closed |
| 3 | **Identity in every transaction.** The server verifies the JWT (JWKS, asymmetric keys), ignores the token's `role` claim, and inside the transaction runs `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', <claims>, true)`. Only transaction-local settings — never session-level | `auth.uid()` in every policy works unchanged. Session-level settings would leak between users through the pooler |
| 4 | **Guest endpoints** run with `SET LOCAL ROLE anon` and minimal grants, or touch no database at all. They exist only for what a Guest may reach (FR-AUTH-004) | anon gets nothing it does not need |
| 5 | **Connection:** the request server uses Supabase's pooler in transaction mode (port 6543), postgres-js with `prepare: false`, one connection per function instance. **Migrations** run as `app_owner`, a separate owner role, from CI only, through the pooler in **session mode** (port 5432) or a direct connection — never in transaction mode, never at runtime, never from a developer machine against production. Production migrations run only from `main`, after Afik's approval on the GitHub `db-production` environment. Outside the product schema `app_owner` holds exactly two grants and nothing else: **CREATE on the database**, so it can create the product schema and the migration tool's `supabase_migrations` history schema (T5, 7.3); and **`authenticated` `WITH INHERIT TRUE, SET FALSE`**, because on Supabase `postgres` holds USAGE on schema `auth` without grant option, so this membership is the only way `app_owner` can create policies, defaults and functions that call `auth.uid()`, and run them inside its own SECURITY DEFINER functions (T5, P1–P4, 11.10.2026). As built: `supabase/bootstrap/01-roles.sql`. It never runs at runtime (rule 1). Decided 2026-10-11 (7.3); that the pooler accepts a custom role is tested in 7.3 (T3) | transaction mode keeps no session state; DDL and the migration tool's locks need a session. A production write needs a person's approval that a tool enforces |
| 6 | **Background jobs run as `app_jobs`**, deployed apart from the request functions with their own credentials, which the request functions never hold — SQL jobs in pg_cron run as `app_jobs`, code jobs in a separate Vercel project (decided 2026-10-11, "Hosting"). NOBYPASSRLS, minimal grants. Where a job must read or write across users, it gets an explicit `TO app_jobs` policy on that table, listed below | a compromised request server cannot act as the job runner, and every cross-user reach is a named, reviewable policy |

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

**What CI enforces** (`supabase/ci/rls-gate.sql`, every CI run):
- The RLS gate covers `nestly` and every other schema `app_owner` owns (except the migration tool's history schema, which
  may hold only the tool's own tables), and fails if `nestly` is missing.
- It flags any materialized view or foreign table in those schemas: neither can carry RLS. Allowed only via "Approved
  exceptions" below.

### Writes across users, and audit

| # | Rule | Why |
|---|---|---|
| 17 | **A write that lands in another user's rows** — a notification to someone else, a counter, an aggregate, an analytics event, a ranking update — goes through a narrow SECURITY DEFINER function, one per kind of write, listed below | the caller's policy rightly forbids writing another user's rows; the function allows exactly one shape of write |
| 18 | **Audit is written by the database in the same transaction.** Admin and Moderator writes are audited by triggers. `authenticated` has no INSERT, UPDATE or DELETE on the audit table. The reason travels in a transaction-local setting | an action cannot happen without its record, and the server cannot forge one (NFR-AUDIT-001, BR-027) |
| 19 | **Protected reads go through an audited function.** A trigger does not run on SELECT, so revealing an anonymous author (P5, AC-077) and Moderator access to Private Group content (NFR-PRIV-002) go through a dedicated function that returns the data and writes the audit entry in the same call | the read and its record are one operation |
| 20 | **The real author of an anonymous post is not readable by anyone but the author.** It is kept in a separate table: the author reads their own rows (`author_id = auth.uid()`) — to see, edit and delete their anonymous posts and to get notifications on them. Nobody else reads it; the reveal function (rule 19) is the only other path. Final shape at Gate 2 | RLS hides rows, not columns, and a `security_invoker` view cannot mask a column its caller cannot read. A separate table makes row-level security enough (P4) |

**Realtime, when it comes** (chat, notifications; the MVP polls): Supabase Realtime private channels, authorized
by RLS policies on `realtime.messages`, carry **signals only** — "something changed on this topic", never content.
The client then fetches the content through the server, under rule 3. Why: Realtime checks its policy when a
client connects and keeps it for the connection, so a revoked or suspended user may receive until the token
expires (rule 15 cannot hold on that channel). Decided 2026-10-11, "Hosting".

**Connections from functions** (rule 5): the server runs as Vercel Functions, each instance holding one pooled
connection in transaction mode. The Free plan allows 200 pooler clients — watch it as traffic grows. Migrations: CI reaches the database through the session-mode pooler (IPv4), since the direct connection is IPv6
only on Free. They move to the direct connection when the IPv4 add-on is bought (I9 or later). Decided in 7.3.

**The `auth.users` anchor and bootstrap steps.** Exactly one product table references `auth.users`: the anchor,
`nestly.users`, through `users_id_fkey`. Every other table references the anchor, never `auth.users`. `app_owner`
cannot hold REFERENCES on `auth.users` (`postgres` lacks grant option, T5, 11.10.2026), so that one FK is added
by `postgres`, a member of `app_owner` (`WITH INHERIT TRUE, SET FALSE`), in a versioned, idempotent bootstrap
script run once per environment. On nestly-prod, Afik runs it. A pgTAP test asserts the FK exists. CRITIC flags
any migration that touches that constraint: `app_owner` can drop it, only `postgres` can restore it. **The anchor's
ON DELETE is RESTRICT** (Afik, 13.10.2026, `decisions/2026-10.md` "I1 open points"): an Auth user who still has a
Nestly account cannot be deleted. Deletion runs only through an orderly deletion flow (I9, SRS OP-028) that removes
the Nestly data first and the Auth user after; never as a side effect of deleting the Auth user. Changing the action
is irreversible in effect once a cascade has run — reserved for Afik. Bootstrap steps, the complete
list (anything else needing `postgres` is a `DECISION REQUEST`):
1. create `app_owner`, `app_server` and `app_jobs` and their grants, and `grant app_owner to postgres`;
2. the anchor's FK to `auth.users` — as built: `supabase/bootstrap/02-anchor-fk.sql`, verified by `02-anchor-fk-check.sql`;
3. extensions and pg_cron jobs, when needed.

**Open, under rules 16 and 17** — FORCE RLS (rule 8) holds a SECURITY DEFINER function owned by `app_owner` to the
table's policies, including those `TO authenticated` (which `app_owner` inherits). **Resolved for caller-only
helpers** (F1.1 Gate 2): they are SECURITY INVOKER and read through the caller's own-row policies (rule 16). **Still
open** for definer functions that must reach other users' rows (rules 17–19) — how they reach the rows they exist for
is decided with the first one — and for backfills: the first backfill inside a migration needs a pattern for the same
reason.

### Approved exceptions

A SECURITY DEFINER function (rules 10, 16, 17, 18, 19), a `TO app_jobs` policy (rule 6), or a materialized view or
foreign table in a schema `app_owner` owns exists only when it is listed here. Each entry:

```
<name> — what it does · why the caller's own rights cannot do it · approved in .work/<slug>/schema.md · date
```

*none yet.* `nestly.is_active_account()` is deliberately not one: it is SECURITY INVOKER (rule 16).

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
| Naming | snake_case, **plural** tables; singular `<entity>_id` FK columns; `is_`/`has_` booleans; `_at` instants, `_date` dates; constraints `<table>_<column>_<check\|key\|fkey>`; policies `<table>_<command>_<who>`. Never a quoted identifier. Every table and column carries a `COMMENT` with its meaning and SRS id |
| Enums | **`text` + a named `CHECK (… in (…))`**, lowercase snake_case values. The value list lives once in `packages/shared`; Drizzle declares `text(…, { enum })` from it. Postgres ENUM rejected: no value drop, `ADD VALUE` breaks atomic migrations |
| Delete | no default. Account lifecycle lives in `users.status`. Soft delete, where an entity needs it, is a nullable `deleted_at timestamptz` hidden by its policy — decided per entity against §13.4 |
| RLS helpers | in `nestly`, `language sql`, `STABLE`, no argument that names a user (caller only), `set search_path = ''` with every name schema-qualified, EXECUTE revoked from PUBLIC and granted to `authenticated` only, called as `(select nestly.fn())`. SECURITY INVOKER unless an approved exception says otherwise |
| Status gate placement | on `users` the active check is an inline column predicate; on every other table it is `(select nestly.is_active_account())`. A table's policy never calls a function that reads the same table (no recursion) |
| Migrations | hand-written SQL in `supabase/migrations/`, applied by the Supabase CLI as `app_owner`, each file and its history row in one transaction. One file = one unit: table + RLS + FORCE + policies + grants + comments. No non-transactional statements. Each has a down script in `supabase/rollback/` |
| Drizzle | `pgSchema('nestly')` in `apps/server/src/db/schema.ts` mirrors columns, types and nullability for typing only; a CI drift check compares it to the catalog. drizzle-kit never generates or pushes migrations. Policies and functions are SQL only |

**The naming convention still matters**: Drizzle's typed schema catches a wrong column name in TypeScript,
but not inside raw SQL, policies or functions.

---

## Planned — input from the SRS (nothing below is built)

The logical entities are listed in `docs/srs/13-data.md` (48 entities, with relations in §13.1, data
usage in §13.2, events in §13.3, retention in §13.4). This section does **not** copy them. It organizes
what a schema and its RLS policies have to encode, and points at the SRS for every rule.
**On any conflict, the SRS wins** — fix this section, never the SRS to match it.

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

### Open in the SRS — blocks part of the schema

Never design around these with a guess. Each one is a `DECISION REQUEST` to Afik when a feature needs it.

| Open point | Blocks |
|---|---|
| OP-003 — active context with several children or a pregnancy alongside children | JourneyContext, Child |
| OP-004 — gender field options | RegularProfile, Child |
| OP-005 — professional verification | ProfessionalProfile verification fields |
| OP-008 — fields of each Tracker (only breastfeeding is defined) | TrackerEvent |
| OP-011 — messaging capabilities (attachments, read receipts) | Message, MediaAsset |
| OP-012 — Marketplace listing fields and closing flow | MarketplaceListing |
| §13.4 — retention periods | soft/hard delete and archival per entity |
| NFR-MEDIA-001 — media formats and limits | MediaAsset |

---

## Entities

Built by `supabase/migrations/20261014100000_identity_schema.sql` (I1 F1.1 part b; down script
`supabase/rollback/20261014100000_identity_schema.down.sql`, safe only while both tables are empty) and bootstrap
step 2. Writes: none for `authenticated` yet — F1.4 adds the create path, I2 the edit path.

### nestly.users
```
purpose:        SRS User (§13) — one person's Nestly account. The anchor: the only product table that references auth.users
key fields:     id — uuid, PK, default auth.uid() — the account id = the Supabase Auth user id (JWT sub); never set by the client
                account_type — text, not null, no default — regular · professional · admin · moderator (SRS Role, §3, BR-016).
                  Fixed at creation, never changes. The only source of account type (rule 14)
                status — text, not null, no default — active · suspended · banned (FR-MOD-002, BR-024): whether the account may
                  use the product now. A warning is not a status; suspension end dates belong to AccountEnforcement (later)
                created_at — timestamptz, not null, default now() — when the Nestly row was created, not the Auth sign-up
                not stored: email and login details (stay in auth.users; BR-045 uniqueness is Auth's); no password or hash
                  (NFR-SEC-001). A copy of another user's email would be denormalization → DECISION REQUEST
owner:          the person; id is auth.uid(), set by the database (rules 12–13)
authorization:  RLS + FORCE. users_select_own — authenticated reads its own row, only while status = 'active' (checked inline;
                  never through a function that reads users). Grants: USAGE on nestly and SELECT → authenticated only.
                  No INSERT, UPDATE or DELETE grant or policy. I2's UPDATE will be column-level, excluding account_type and status
relations:      users_id_fkey (id) → auth.users (id) ON DELETE RESTRICT — bootstrap step 2, added by postgres.
                  Referenced by regular_profiles through users_id_account_type_key UNIQUE (id, account_type)
indexes:        users_pkey (id) — every policy and is_active_account() look up by id.
                  users_id_account_type_key — target of the subtype FK; one extra small btree per insert, accepted.
                  None on status: no query filters by it yet
retention:      no deleted_at. Hard delete only through the orderly deletion flow (I9, OP-028); RESTRICT blocks deleting the
                  Auth user while this row exists. Retention periods: §13.4 TBD
```

### nestly.regular_profiles
```
purpose:        SRS RegularProfile (§13) — a Regular parent's own FR-REG-002 fields, 1:1 with a regular account
key fields:     user_id — uuid, PK, default auth.uid() — the owning account, = nestly.users.id
                account_type — text, not null, default 'regular', CHECK = 'regular' — with the composite FK, only a Regular
                  account can hold a profile (BR-016, layer 2)
                full_name — text, not null — VAL-001: CHECK char_length(btrim(full_name)) between 2 and 60 (SRS 2.12,
                  decided 13.10.2026); char_length counts code points
                gender — text, null — VAL-006 (OP-004 closed): woman · man · other · prefer_not_to_say. NULL = not answered;
                  prefer_not_to_say is an answer
                created_at — timestamptz, not null, default now() — row creation
                not here: stage and due date (JourneyContext), children (Child) — F1.4 tables; JourneyContext waits on OP-003
owner:          the Regular account; user_id is auth.uid(), set by the database (rule 12)
authorization:  RLS + FORCE. regular_profiles_select_own — authenticated reads its own row, only while
                  (select nestly.is_active_account()). Grants: SELECT → authenticated only. No INSERT, UPDATE or DELETE grant or policy
relations:      regular_profiles_user_fkey (user_id, account_type) → users (id, account_type) ON DELETE CASCADE — the profile
                  is part of the account. Ids never update
indexes:        regular_profiles_pkey (user_id) — own-row reads, and the cascade lookup from users
retention:      goes with its users row (cascade); OP-028 direction: deleted in full. §13.4 TBD
```

Helper: `nestly.is_active_account()` — true when the caller's own account exists and is active (rule 15). SECURITY
INVOKER, caller only; checks `id = auth.uid()` and `status` itself rather than trusting the `users` policy.

When further entities exist, each gets:

```
### <entity>
purpose:        what it represents, in one line
key fields:     field — type — meaning. meaning is the part that matters
owner:          which actor owns a row, and how that is established
authorization:  who may read / write / delete, and where that rule is enforced
relations:      to what, with what cascade behaviour
indexes:        index — the query it serves
retention:      soft or hard delete, and what is retained after
```

---

## Conventions in force

See "Schema conventions — DECIDED" above (F1.1 Gate 2, 13.10.2026).

---

## Known debt

*none yet*

Anything knowingly imperfect in the model, with the reason it was accepted.
