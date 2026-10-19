# notes — report (F3.7)

**Approach** Shared Zod `checkCreateReport` + reasons/limit constants; `POST /api/reports` route → service → repository, refusals mapped by SQLSTATE in `reportFaultReply`.
Web: `SheetPanel` (ui/dialog) as the shared sheet/window; `ReportSheet` (components/domain) + `useReport` hook; entry points on feed cards, post page, every comment (own: delete moved into "⋯"), profile; `/community-rules` + menu item.
**Decisions**
- Mapping: 42501, 23503, 23514 `reports_self_check` → 404 `unavailable`; 23505 → 409; 23514 `reports_other_details_check` → 400 `details_required`, other 23514 → 400 `invalid`.
- A stopped account → 403 `account_unavailable` (ERR-037), as comments/likes; Professional may report (c1). No account row → 403 `not_allowed`.
- A repeat post report is 404 (trigger 42501: the post is already reporter-hidden), never 409 — matches c4; 409 is reachable for comment/user.
- One Back entry per screen: report state joins the existing overlay of FeedScreen; PostScreen, comments region, profile each own one `useBackCloses`. Comment delete confirm now also closes on Back.
- Feed outcomes reuse F3.9's `withHideResult` (`removed` for 201/409, new `noted` for 404: card stays, focus to its "⋯").
- The reason group is named by its visible legend "מה הבעיה?" (screen.md amended 19.10); `TextArea` gained `dir` (`auto` for the report text).
- Rules page: BR-075 text minus SRS-reader bits (IDs BR-076/FR-FEED-005, "קישור ל-FR-MENU-002" = the link). Rule 7's FR-FEED-005 reference became "פוסט אנונימי רק דרך האפשרות לפרסם באופן אנונימי".
- Sheet height: `max-h-dvh` (lint forbids arbitrary values); desktop window is centred by `inset-0 m-auto h-fit`.
**Deviations** none from spec/screen intent; the 404/403 split above is internal HOW.
**Deliberately not done** pg_cron purge (PR-B, Gate 2); tests (TEST ENGINEER); post-page own edit/delete stay buttons (F3.1 scope).
**Uncertain**
- Rule 4 states automatic blurring (BR-076) that is not built (no media yet); rule 5 keeps "Marketplace" in Latin script.
- Not checked in a browser: sheet layout at 375/1024, menu→sheet focus hand-off, Back across two `useBackCloses` on the post page.
**Evidence** typecheck (web: only the stale `tests/comment-item.test.tsx`), lint, check:budgets, check:stories, shared 437/437, server 836/836, db-local 757 pass. Web: 17 fail = stale comment-item (13), access-decision route list (1), 3 load timeouts that pass alone.
**Stale for TEST ENGINEER** `apps/web/tests/comment-item.test.tsx` (onDelete prop, "מחיקה" button → "⋯" menu) · `tests/app/access-decision.test.ts` (PROTECTED_PATHS + /community-rules)
e2e: `comments.spec.ts` (מחיקה button) · `app-shell-guard-shell.spec.ts` (menu list, banned "כללי הקהילה") · `user-profile-actions.spec.ts:108` (no button for P viewer) · visual baselines of CommentsView, PostContent OthersPost, UserProfileContent, MoreActionsMenu Open.
**Neighbouring** none.
