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
| **Application code never filters for permission** | if code has to remove rows the user should not see, the policy is wrong. Fix the policy |
| **The policy is the authorization model** | it must be readable top to bottom and say plainly who may read, write and delete each table |
| **A new table without a policy does not ship** | this is a `Not Ready`, not a concern |

### Why, in one line

A rule attached to the data cannot be bypassed by forgetting. Enforcement in code has to be repeated
at every read path — feed, search, notifications, profile, related content, any future API — and one
omission is a privacy leak.

### What DATA ARCHITECT owns as a result

The security boundary, not only the shape of the data. A schema change and a policy change are one
unit of work, reviewed together. Neither ships without the other.

SQL and RLS policies are database configuration, not application code, and are therefore outside the
iron rule on languages.

---

## Schema conventions — to be decided with the first table

Not decided yet, and deliberately not guessed. DATA ARCHITECT proposes, Afik approves, recorded here:

identifier type and generation · timestamp type and timezone · soft-delete vs hard-delete
representation · table and column naming · how enums are represented · how the RLS helper functions
are organized.

**The naming convention matters more than usual here**: with no typecheck, a wrong column name is a
runtime failure rather than a compiler error.

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
| A post always stores its real author, plus an anonymity flag | §13 Post, FR-FEED-005 |
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
