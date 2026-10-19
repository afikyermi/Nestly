# report (F3.7) — report a post, comment or user

**Problem**        A user who meets harmful content or a harmful person (danger to a child, harassment, exposed details) has no
way to tell the team. F3.0b stores reports, but nothing in the product can create one, and held deletion (3א) is never purged.
**Requirements**   FR-MOD-001 (05-functional/moderation.md) · AC-106 (link + 8 reasons; queue order is I4) · BR-074 (reason
order) · BR-075 + PG-049 (rules page, linked from the window) · UC-26 · ERR-004, ERR-011, ERR-033 · decisions 16.10 "Before I3–I5" (3)
and §3 of `docs/decisions-before-i3-i5-HE.md` · Afik 7א (reported post leaves the reporter's feed) · Afik 18.10 (reported comment/user
stays visible to all) · 18.10 "F3.0/F3.1 open points" (3, 5) · S-35 · F3.0 c14, c15, Q "purge wired in F3.7".
**Scope**          `POST /api/reports` (shared Zod, route → service → repository, insert under RLS) · report entry points on the
feed card, the post page, each comment/reply and another user's profile · the report window · outcome per target · the Community
Rules page (Q2) with a menu link · the purge schedule (Schema needs).
**Out of scope**   I4: queue, priority sort, 3-report raise, moderator view, enforcement, report status changes, snapshot of the
reported text (S-35) · withdrawing, editing or re-reading a report (no GET/PATCH/DELETE) · a "you reported this" marker on comments
or profiles · reporting a listing, image, group, article or message (UC-26 "Listing" is I12) · reporting the quoted original inside
a share card (report it where it appears itself) · reporting a user from a card or comment (names are not links) · notifications to
anyone, incl. the reported user (I7) · hide post (F3.9) · rate limits on reports · an external hotline link in the window (Afik
18.10) · Admin editing the reason list (FR-ADMIN-007) · a public (Guest) rules page · usage events (4א) · Admin/Moderator reporters.
**Data touched**   `nestly.reports` INSERT (as built, F3.0b); posts/comments read through existing RLS; pg_cron job (new). See
**Schema needs**.
**Risk flags**     personal data (reporter identity, free text) · minors (child-safety reason, text about children) · schema
migration (cron job, CHECK) → **Elevated**. No new external surface: every route is signed-in.

**Schema needs** (DATA ARCHITECT, schema-first PR; against `.work/feed-groundwork/schema-b.md`)
1. Purge schedule: a pg_cron job that runs `nestly.purge_held_content()` at least once a day, executing as `app_jobs` (never
   owner/superuser for the purge itself); pgTAP asserts the job, its schedule and its role. Down migration unschedules it.
2. `reports.details` length CHECK: at most 1,000 code points (same bound as the shared Zod rule, Q1), defense in depth.
3. Nothing else: target kinds, 8 reason keys, `other` ⇒ details, one report per person and target, own/unreadable target refusal
   (42501), self-user CHECK, reporter-only SELECT, no UPDATE/DELETE grant, reporter-hide on posts, cleanup tool — all as built.

**Acceptance criteria**  (layer in brackets)
1. 🔴 [server] A signed-in Regular or Professional user `POST /api/reports` `{targetKind: post|comment|user, targetId, reason,
   details?}` on a readable post or comment, or another existing account → 201 `{received: true}` and nothing else; exactly one row:
   reporter = the verified user, status `open`, the matching target column, reason, trimmed details or null. [FR-MOD-001, UC-26]
2. 🔴 [server] The body is strict: any other key (`reporterId`, `status`, `postId` …) → 400, no row. No or invalid session → 401
   with no row. A request never chooses the reporter. [FR-MOD-001, CLAUDE.md Zod]
3. 🟡 [shared+server] Validation, one shared rule: reason outside the 8 keys → 400; details trimmed, blank → null; over 1,000 code
   points or containing NUL → 400; `other` without details → 400 `details_required`. [FR-MOD-001; §3 "אחר (עם טקסט חופשי)"; Q1]
4. 🔴 [server+db] One answer, 404 `unavailable`, no row, for: a post or comment the reporter cannot read (other audience, deleted,
   held, a post they already reported), a non-existent id, their own post or comment (incl. their own anonymous post), their own
   user id. [FR-MOD-001 precondition, ERR-011, F3.0 c15]
5. 🔴 [server] A second report by the same user on the same target, any reason → 409 `already_reported`; the first row is
   unchanged (reason, details). Two different users on one target → two rows. [F3.0 c15, BR-074 counts people]
6. 🔴 [server+db] No trace for the reported side: before vs after a report, the author / reported user gets identical responses from
   GET /feed, GET /posts/:id, the comment thread, their own profile, the post edit and the post/comment delete (S-35); every user
   but the reporter reads 0 report rows; no endpoint reads, changes or withdraws a report. [S-35, FR-MOD-001, F3.0 c15]
7. 🔴 [server] After a post report, that post is absent from the reporter's GET /feed pages, GET /posts/:id → 404, and a share of it
   shows ERR-033 to the reporter; for every other viewer it is unchanged. A comment or user report changes nothing for anyone,
   reporter included; a `child_safety` report hides nothing either. [7א, Afik 18.10, BR-074 "no automatic hiding"]
8. 🔴 [server+web] Reporting an anonymous post stores its post id only; neither the response nor any screen shows author data,
   and no "report user" path exists from an anonymous post or an "המחבר" comment. [FR-FEED-005, F3.0 rule 19]
9. 🎨 [web] Entry points (screen.md): a "more actions" menu on every feed card (shares too) and on the post page post; on each
   comment and reply that is not `isMine`; a profile button on `/u/:id` (restricted view too). None on own named posts, own
   comments, own profile, or the profile's 404/429/failure states; an anonymous post shows it to everyone (`isMine` false). [FR-MOD-001]
10. 🎨 [web] The window: modal dialog titled by target; the page behind is blurred (computed `backdrop-filter: blur(4px)` on the
    backdrop), inert and unscrollable; focus starts on the first radio and is trapped; Esc or "ביטול" closes with no request and
    focus returns to the opener. [FR-MOD-001, decision 16.10 (3)]
11. 🎨 [web] Inside: exactly 8 radios in FR-MOD-001 order, "תוכן שמסכן ילד" first, none preselected; an optional details box with
    counter; a "כללי הקהילה" link to `/community-rules` in a new tab, so the window keeps its input. [AC-106, FR-MOD-001, BR-075]
12. 🎨 [web] Send without a reason, `other` without details, or over 1,000: field message, focus on the field, no request. Send is
    disabled while pending; a double press sends one request. [FR-MOD-001; Q1]
13. 🎨 [web] Outcomes: 201 on a post → window closes, the card leaves the feed (also after back-navigation restore) or the post page
    shows the post-reported text + "חזרה לפיד"; 201 on a comment/profile → window closes, a status message, nothing else changes,
    focus to the opener. 409 → closes with the already-reported text (a post card is removed too). 404 → closes with the
    unavailable text. Network/5xx → window stays, input kept, ERR-004 alert + retry. 401 → ERR-038 as today. [FR-MOD-001 "אישור קליטה"]
14. 🎨 [web] `/community-rules` (signed-in): h1 "כללי הקהילה", the 8 rules of BR-075 in order and wording; rule 2 links to the
    hotline page when F3.8 is merged, else plain text; a side-menu item "כללי הקהילה"; no request. [BR-075, PG-049; Q2]
15. 🎨 [web] axe 0 violations at 375 px and desktop for the menus, every window state and the rules page; RTL; keyboard only
    (menu arrows, Esc); targets ≥ 44×44 px; visible focus; status via polite live region. [NFR a11y as F3.3]
16. 🟡 [db] Schema needs 1–2: the purge job exists and runs as `app_jobs` at least daily; held content past release with no open
    report is gone after a run; details over 1,000 code points are refused by the database. [3א, F3.0 Q purge]

**Open questions**
- Q1 Details length: not in the SRS (VAL gap) → **assumed if unanswered:** 1,000 code points, as comments; VAL added at the I3 close.
- Q2 PG-049 has no owner in the I3 plan, yet FR-MOD-001/AC-106 need the link → **assumed:** built here, static, signed-in only, BR-075
  text verbatim. A Guest version would be a new external surface — out.
- Q3 User target = any existing other account, no "can view the profile" check (ids are unguessable; the reporter learns nothing; I4
  must see reports on hidden users) → **assumed:** as built, no DB change.
- Q4 An anonymous post's author who reports it gets the 404 text; only their own action shows it → **assumed:** accepted, no change.
- No DECISION REQUEST: every reserved point (reasons, order, window, reporter-hide, visibility, no hotline link, retention to I9) is
  decided above.

**Findings for the I3 close (/srs-update)** `11-assumptions-constraints.md` row "TBD Report Escalation" is stale (OP-009 closed) ·
no VAL for report text, no ERR for a duplicate report · reason keys are a DB CHECK, so FR-ADMIN-007 editing needs a later schema change.

**Size estimate**  ~600 product lines: shared Zod ~40 · server route/service/repo + error map ~140 · web dialog ~200, menus and
entry points ~110, outcomes ~50, rules page + menu ~60. Schema-first PR (cron, CHECK) separate per cadence. One feature PR, no split.
