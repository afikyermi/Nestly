# SRS review points — the invariants every review checks

**Derived from the SRS. On any conflict, the SRS wins** — fix this file, never the SRS to match it.
**Used by:** CRITIC on every Standard and Elevated diff, ALGORITHM & DATA on its areas, DATA ARCHITECT on
schema and policies, TEST ENGINEER as a source of adversarial cases.

These are the product-wide rules that no single feature owns, so they are easy to break from anywhere.
CRITIC's generic checklist says how to review. This file says **what must never be broken in this product**.

Severity column: the minimum severity of a finding that breaks the invariant.

---

## Authorization and access

| # | Invariant | SRS | Checks | Severity |
|---|---|---|---|---|
| A1 | Every permission is enforced server-side, in RLS. A client-side check is presentation only | NFR-SEC-002, data-model.md | CRITIC · DATA ARCHITECT | critical |
| A2 | Moderator is deny-by-default. A missing Permission Key means Access Denied, also on a direct API call | §3.1, BR-023, AC-026 | CRITIC · TEST ENGINEER | critical |
| A3 | No Moderator key unlocks an Admin Only action | §3.2, BR-025, NFR-SEC-004, AC-031 | CRITIC · TEST ENGINEER | critical |
| A4 | Every deep link — from Search, a Notification or Chat — re-checks authorization; a link never grants access | NFR-SEC-005, VAL-023, ERR-020 | CRITIC | high |
| A5 | Private Group content never leaks to a non-member, through search, API or deep link | NFR-PRIV-002, BR-039, AC-037 | CRITIC · TEST ENGINEER | critical |
| A6 | Group roles never act on an equal or higher role; the Owner leaves only after transferring ownership | BR-041, VAL-021, AC-038 | CRITIC · TEST ENGINEER | high |
| A7 | Admin and Moderator accounts never post, befriend, join groups or use social chat | BR-034, ERR-022 | CRITIC | high |

## Privacy of people and children

| # | Invariant | SRS | Checks | Severity |
|---|---|---|---|---|
| P1 | A non-Friend sees only the Basic Public Profile (Restricted) or the profile with Journey Summary (Open). A Professional viewer sees exactly what a Regular non-Friend sees | §1.4, FR-PRIV-001, BR-044, AC-054 | CRITIC · TEST ENGINEER | critical |
| P2 | Children and pregnancy reach a non-Friend only as Journey Summary — never names, birth dates, pregnancy week or due date | §1.4, VAL-027 | CRITIC · TEST ENGINEER | critical |
| P3 | Tracker Data never reaches a non-Friend, a Professional channel or an advertiser | NFR-PRIV-005, BR-053, AC-068 | CRITIC · ALGORITHM & DATA | critical |
| P4 | An anonymous post never exposes its author — not in the feed, search, notifications, comments, the API or the social-graph ranking | FR-FEED-005, BR-062, VAL-036, AC-075, AC-076 | CRITIC · ALGORITHM & DATA · TEST ENGINEER | critical |
| P5 | A Moderator reveals an anonymous author only while handling a report on that post, with both keys, and every reveal is audited | FR-FEED-005, AC-077 | CRITIC · TEST ENGINEER | high |
| P6 | Users cannot be listed in bulk: a query is required, rate limits apply, identifiers are not guessable | NFR-SEC-006, BR-063, AC-078 | CRITIC · DATA ARCHITECT | high |
| P7 | A child's birthday notification goes only to Friends, and only with the parent's consent | BR-037, NFR-PRIV-003, AC-046 | CRITIC | high |
| P8 | Tracker-based guidance stays general and non-diagnostic; with no approved mapping, the signal is ignored | NFR-PRIV-006, VAL-034, ERR-031, AC-069 | ALGORITHM & DATA · CRITIC | high |

## Data use, ranking and analytics — ALGORITHM & DATA leads

| # | Invariant | SRS | Checks | Severity |
|---|---|---|---|---|
| D1 | Authorization and eligibility run before any score; a score never overrides a permission | NFR-ALG-002, P-ALG-02, VAL-029 | ALGORITHM & DATA · CRITIC | critical |
| D2 | Chat and Support message bodies never feed personalization, recommendation or targeting | NFR-PRIV-004, BR-052, AC-067 | ALGORITHM & DATA | critical |
| D3 | Organic and paid are ranked and stored separately; payment never changes organic score or reputation; every paid unit is labelled | NFR-ALG-003, BR-004, BR-005, VAL-030, AC-062, AC-063 | ALGORITHM & DATA · CRITIC | high |
| D4 | Professional Analytics show own-account aggregates only — no identities, no raw queries | BR-057, VAL-032, AC-072 | ALGORITHM & DATA · CRITIC | high |
| D5 | Analytics events carry a unique id, are counted once, never copy message bodies, and never block the user's action | NFR-DATA-002, NFR-DATA-003, VAL-031, AC-070 | ALGORITHM & DATA | medium |
| D6 | Algorithm configuration is versioned and Admin Only, every change audited with before and after; a broken configuration falls back to the last valid one, never to an AI model | BR-059, VAL-033, ERR-030, AC-073 | ALGORITHM & DATA | high |
| D7 | Content recommended from search or consumption appears in the feed only — never as a notification | BR-035, AC-042 | CRITIC | medium |

## Audit and administration

| # | Invariant | SRS | Checks | Severity |
|---|---|---|---|---|
| G1 | Every meaningful Admin or Moderator action writes an audit entry: actor, role, permission, action, target, time, result, reason; before and after for permission changes | NFR-AUDIT-001, BR-026, AC-029 | CRITIC · TEST ENGINEER | high |
| G2 | The audit log is append-only; nothing in the product edits or deletes an entry | BR-027, AC-030 | CRITIC · DATA ARCHITECT | critical |

## Messaging and notifications

| # | Invariant | SRS | Checks | Severity |
|---|---|---|---|---|
| M1 | Chat opening follows relationship and context; a Professional reaches a Regular only by Offer Help or from an active Marketplace listing | FR-CHAT-002, BR-007, VAL-024, AC-059 | CRITIC · TEST ENGINEER | high |
| M2 | One Offer Help per Professional per post, and no full chat before Accept | BR-008, BR-010, AC-011, AC-012 | CRITIC · TEST ENGINEER | high |
| M3 | Chat Block stops messages only — no hiding, no removal of Friendship or Follow | BR-011, AC-052 | CRITIC | medium |
| M4 | Chat messages are not duplicated as notifications. Web uses In-App only; Security/Critical cannot be turned off | BR-036, BR-038, BR-061, AC-074 | CRITIC | medium |

## Product structure

| # | Invariant | SRS | Checks | Severity |
|---|---|---|---|---|
| S1 | Component architecture: reusable components with no business logic inside; logic lives in Feature/Page and services | §4.1, §4.2, conventions.md | CRITIC | medium |
| S2 | Business logic stays portable to React Native — none hidden in web-only UI | §4, OP-002, NFR-USAB-002 | CRITIC | medium |
| S3 | WCAG 2.2 AA on every new or changed screen | NFR-A11Y-001, workflow.md Accessibility domain | CRITIC · TEST ENGINEER | high on a core flow |
| S4 | No medical diagnosis or personalized medical advice anywhere in the product | BR-012, NFR-PRIV-006 | CRITIC · ALGORITHM & DATA | critical |

---

**Budget note:** this file is project knowledge, not CRITIC's required-checks list, so it does not count
against CRITIC's budget in `learning.md`. When the SRS adds a product-wide rule, add a row here. When a
row stops matching the SRS, fix or remove it.
