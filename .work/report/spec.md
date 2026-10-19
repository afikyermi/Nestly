# report (F3.7) — report a post, comment or user

**Problem**        A user who meets harmful content or a harmful person (danger to a child, harassment, exposed details) has no
way to tell the team. F3.0b stores reports, but nothing can create one, and held deletion (3א) is never purged.
**Requirements**   FR-MOD-001 (05-functional/moderation.md) · AC-106 (link + 8 reasons; queue order is I4) · BR-074 · BR-075 +
PG-049 · UC-26 · ERR-004, 011, 033 · decisions 16.10 "Before I3–I5" (3) + §3 of `docs/decisions-before-i3-i5-HE.md` · Afik 7א · Afik
18.10 (reported comment/user stays visible) · 18.10 "F3.0/F3.1 open points" (3, 5) · S-35 · F3.0 c14, c15 · `docs/design/direction.md`
"דפוסי אינטראקציה" (Afik 19.10: sheet/window, "⋯", Back/Esc/outside).
**Scope**          `POST /api/reports` (shared Zod, route → service → repository, insert under RLS) · the shared sheet/window
primitive (F3.5/F3.6 reuse it) · "דיווח על הפוסט" in F3.9's post "⋯" menu · a "⋯" menu on every comment (own: delete, moved from
F3.3's button; others': report) · a report button on another user's profile · the report sheet · outcome per target · the Community
Rules page (Q2) + menu link · the purge schedule (Schema needs).
**Out of scope**   I4: queue, priority sort, 3-report raise, moderator view, enforcement, status changes, snapshot of the reported
text (S-35) · withdrawing, editing or re-reading a report · a "you reported this" marker · reporting a listing, image, group, article
or message (UC-26 "Listing" is I12) · reporting the quoted original inside a share card · reporting a user from a card or comment ·
the post "⋯" menu itself and its edit/delete/hide items (F3.9) · notifications to anyone (I7) · rate limits on reports · an external
hotline link (Afik 18.10) · Admin editing the reasons (FR-ADMIN-007) · a Guest rules page · usage events (4א) · Admin/Moderator reporters.
**Data touched**   `nestly.reports` INSERT (as built, F3.0b); posts/comments through existing RLS; pg_cron job (new).
**Risk flags**     personal data (reporter identity, free text) · minors (child-safety reason) · schema migration → **Elevated**.
No new external surface: every route is signed-in.

**Schema needs** (DATA ARCHITECT, schema-first PR; against `.work/feed-groundwork/schema-b.md`)
1. Purge schedule: a pg_cron job that runs `nestly.purge_held_content()` at least daily as `app_jobs` (never owner/superuser for
   the purge); pgTAP asserts job, schedule and role; down migration unschedules it.
2. `reports.details` CHECK: at most 1,000 code points (same bound as the shared Zod rule, Q1), defense in depth.
3. Nothing else: reasons, target kinds, `other` ⇒ details, one report per person and target, own/unreadable refusal (42501), self-user
   CHECK, reporter-only SELECT, no UPDATE/DELETE grant, reporter-hide on posts, cleanup tool — all as built.

**Acceptance criteria**  (layer in brackets)
1. 🔴 [server] A signed-in Regular or Professional user `POST /api/reports` `{targetKind: post|comment|user, targetId, reason,
   details?}` on a readable post or comment, or another existing account → 201 `{received: true}` only; exactly one row: reporter =
   the verified user, status `open`, the matching target column, reason, trimmed details or null. [FR-MOD-001, UC-26]
2. 🔴 [server] Strict body: any other key (`reporterId`, `status` …) → 400, no row. No or invalid session → 401, no row. [FR-MOD-001]
3. 🟡 [shared+server] One shared rule: reason outside the 8 keys → 400; details trimmed, blank → null; over 1,000 code points or
   containing NUL → 400; `other` without details → 400 `details_required`. [FR-MOD-001; §3 "אחר (עם טקסט חופשי)"; Q1]
4. 🔴 [server+db] One answer, 404 `unavailable`, no row, for: a post or comment the reporter cannot read (other audience, deleted,
   held, a post they already reported), a non-existent id, their own post or comment (incl. own anonymous post), their own user id.
   [FR-MOD-001 precondition, ERR-011, F3.0 c15]
5. 🔴 [server] A second report by the same user on the same target, any reason → 409 `already_reported`, first row unchanged. Two
   different users on one target → two rows. [F3.0 c15, BR-074 counts people]
6. 🔴 [server+db] No trace for the reported side: before vs after a report, the author / reported user gets identical responses from
   GET /feed, GET /posts/:id, the comment thread, own profile, post edit and post/comment delete (S-35); every user but the reporter
   reads 0 report rows; no endpoint reads, changes or withdraws a report. [S-35, FR-MOD-001, F3.0 c15]
7. 🔴 [server] After a post report the post is absent from the reporter's GET /feed, GET /posts/:id → 404, a share of it shows ERR-033
   to the reporter; unchanged for everyone else. A comment or user report changes nothing for anyone, reporter included; a
   `child_safety` report hides nothing. [7א, Afik 18.10, BR-074 "no automatic hiding"]
8. 🔴 [server+web] An anonymous post's report stores its post id only; no response or screen shows author data; no "report user"
   path from an anonymous post or an "המחבר" comment. [FR-FEED-005, F3.0 rule 19]
9. 🎨 [web] Entry points (screen.md): "דיווח על הפוסט" in F3.9's "⋯" on every card and post-page post not `isMine` (anonymous
   posts: everyone, `isMine` false); one "⋯" on every comment and reply — own: "מחיקה" (F3.3's visible button removed; same
   confirmation and status), others': "דיווח על התגובה"; profile button on `/u/:id` loaded states (restricted too), never own.
   Menus close on Back, Esc and outside click, focus back to "⋯". [FR-MOD-001, direction "⋯"]
10. 🎨 [web] Shared primitive: below 1024 px a bottom sheet, from 1024 px a small centred window; dialog role, aria-modal; the page
    behind blurred (computed `backdrop-filter: blur(4px)`), inert; the feed neither scrolls nor navigates (URL and scroll position
    unchanged). Back, Esc, outside click or "ביטול" close it with no request; focus returns to the opener. [direction, decision 16.10 (3)]
11. 🎨 [web] The report sheet: exactly 8 radios in FR-MOD-001 order, "תוכן שמסכן ילד" first, none preselected, focus on the first;
    optional details with counter; "כללי הקהילה" opens `/community-rules` in a new tab, so input is kept. [AC-106, BR-075]
12. 🎨 [web] Send without a reason, `other` without details, or over 1,000: field message, focus on the field, no request. Send is
    disabled while pending; a double press sends one request. [FR-MOD-001; Q1]
13. 🎨 [web] Outcomes: 201 on a post → sheet closes, the card leaves the feed (also after back-navigation restore) or the post page
    shows the post-reported text + "חזרה לפיד"; 201 on a comment/profile → closes, status message, nothing else changes. 409 →
    closes with the already-reported text (a post card is removed too). 404 → closes with the unavailable text. Network/5xx → sheet
    stays, input kept, ERR-004 alert + retry. 401 → ERR-038 as today. [FR-MOD-001 "אישור קליטה"]
14. 🎨 [web] `/community-rules` (signed-in): h1 "כללי הקהילה", BR-075's 8 rules in order and wording; rule 2 links to the hotline
    page once F3.8 is merged, else plain text; side-menu item "כללי הקהילה"; no request. [BR-075, PG-049; Q2]
15. 🎨 [web] axe 0 at 375 px and desktop for menus, every sheet/window state and the rules page; RTL; keyboard only; targets
    ≥ 44×44 px; visible focus; status in a polite live region. [as F3.3]
16. 🟡 [db] Schema needs 1–2: the purge job exists and runs as `app_jobs` at least daily; held content past release is gone after a
    run; details over 1,000 code points are refused by the database. [3א, F3.0 Q purge]

**Open questions**
- Q1 Details length: not in the SRS (VAL gap) → **assumed if unanswered:** 1,000 code points, as comments; VAL at the I3 close.
- Q2 PG-049 has no owner in the I3 plan, yet FR-MOD-001/AC-106 need the link → **assumed:** built here, static, signed-in only.
- Q3 User target = any existing other account, no "can view the profile" check (ids unguessable; I4 must see reports on hidden
  users) → **assumed:** as built, no DB change.
- Q4 An anonymous post's author who reports it gets the 404 text; only their own action shows it → **assumed:** accepted.
- Q5 Order: F3.9 (post "⋯") merges before F3.7 → **assumed:** yes; otherwise F3.7 waits, it does not build the post menu.
- No DECISION REQUEST: every reserved point (reasons, order, window, reporter-hide, visibility, no hotline link) is decided.

**Findings for the I3 close (/srs-update)** `11-assumptions-constraints.md` "TBD Report Escalation" is stale (OP-009 closed) · no
VAL for report text, no ERR for a duplicate report · reasons are a DB CHECK, so FR-ADMIN-007 needs a later schema change.

**Size estimate**  ~650 product lines: shared Zod ~40 · server ~140 · sheet/window primitive ~90 · report sheet ~170 · comment "⋯"
+ entry points ~100 · outcomes ~50 · rules page + menu ~60. Schema-first PR separate per cadence. One feature PR, no split.
