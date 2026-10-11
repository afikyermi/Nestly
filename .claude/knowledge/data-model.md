# Data model — as-built

**Maintained by:** DATA ARCHITECT. Updated on every schema change, in the same unit of work.
**Status:** no schema exists yet. The "Planned" section maps the SRS for the first schema design.

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
| 5 | **Connection:** Supabase's pooler in transaction mode, postgres-js with `prepare: false`. **Migrations** run as a separate owner role over a direct connection — never through the pooler, never at runtime. Check in part 7 that the pooler accepts a custom role | transaction mode does not keep prepared statements; DDL needs a direct session |
| 6 | **Background jobs run as `app_jobs`**, in a separate process with its own credentials, which the request server never holds. NOBYPASSRLS, minimal grants. Where a job must read or write across users, it gets an explicit `TO app_jobs` policy on that table, listed below | a compromised request server cannot act as the job runner, and every cross-user reach is a named, reviewable policy |

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
| 16 | **Permission Keys are checked in policies through one function**, `has_permission(key)`: STABLE, SECURITY DEFINER with a fixed `search_path`, called as `(select has_permission(...))` so it runs once per statement. `is_active_account()` follows the same pattern | one reviewable place for the Moderator model (deny by default, NFR-SEC-002/004), and no per-row cost |

### Writes across users, and audit

| # | Rule | Why |
|---|---|---|
| 17 | **A write that lands in another user's rows** — a notification to someone else, a counter, an aggregate, an analytics event, a ranking update — goes through a narrow SECURITY DEFINER function, one per kind of write, listed below | the caller's policy rightly forbids writing another user's rows; the function allows exactly one shape of write |
| 18 | **Audit is written by the database in the same transaction.** Admin and Moderator writes are audited by triggers. `authenticated` has no INSERT, UPDATE or DELETE on the audit table. The reason travels in a transaction-local setting | an action cannot happen without its record, and the server cannot forge one (NFR-AUDIT-001, BR-027) |
| 19 | **Protected reads go through an audited function.** A trigger does not run on SELECT, so revealing an anonymous author (P5, AC-077) and Moderator access to Private Group content (NFR-PRIV-002) go through a dedicated function that returns the data and writes the audit entry in the same call | the read and its record are one operation |
| 20 | **The real author of an anonymous post is not readable by anyone but the author.** It is kept in a separate table: the author reads their own rows (`author_id = auth.uid()`) — to see, edit and delete their anonymous posts and to get notifications on them. Nobody else reads it; the reveal function (rule 19) is the only other path. Final shape at Gate 2 | RLS hides rows, not columns, and a `security_invoker` view cannot mask a column its caller cannot read. A separate table makes row-level security enough (P4) |

**Realtime, when it comes** (chat, notifications): WebSocket connections on the server pass through the same
identity mechanism as rule 3, so RLS applies to them too.

### Approved exceptions

A SECURITY DEFINER function (rules 10, 16, 17, 18, 19) or a `TO app_jobs` policy (rule 6) exists only when it is
listed here. Each entry:

```
<name> — what it does · why the caller's own rights cannot do it · approved in .work/<slug>/schema.md · date
```

*none yet*

---

## Schema conventions — to be decided with the first table

Not decided yet, and deliberately not guessed. DATA ARCHITECT proposes, Afik approves, recorded here:

identifier type and generation · timestamp type and timezone · soft-delete vs hard-delete
representation · table and column naming · how enums are represented · how the RLS helper functions
are organized.

**The naming convention still matters**: Drizzle's typed schema catches a wrong column name in TypeScript,
but not inside raw SQL, policies or functions.

**One convention is already constrained by the SRS:** user and profile identifiers must be
non-sequential and not guessable (NFR-SEC-006, BR-063). Whatever identifier type is chosen must satisfy that.

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

*none yet*

When entities exist, each gets:

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

*none yet*

Recorded here once decided: identifier type and generation · timestamp type and timezone ·
soft-delete representation · naming convention for tables and columns · enum representation.

---

## Known debt

*none yet*

Anything knowingly imperfect in the model, with the reason it was accepted.
