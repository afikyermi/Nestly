# share-in-feed (F3.5) — share a post into one's feed

**Problem**        A Regular user who finds a helpful post can like or comment on it, but cannot pass it on to their own Friends and
community. The feed already renders shares (F3.2 c12/c17), but nothing can create one, and nothing proves a share never copies or leaks its original.
**Requirements**   FR-FEED-006 (05-functional/feed.md) · BR-064, BR-065, BR-066 (08-business-rules.md) · VAL-038 (09-validations.md) · ERR-033,
ERR-034 (10-errors-edge-cases.md) · AC-079, AC-080, AC-081 (15-acceptance.md) · Afik 2א (only "everyone" posts) · Afik 18.10 (decisions/2026-10.md:2253:
Restricted has no relation to posts or sharing; supersedes the Restricted clause of BR-064/AC-080) · OP-033 + 1א (audience per post) · §13 Post (a share is
the sharer's post). Built on F3.0a schema (`posts.is_share`, `shared_post_id`, `posts_insert_prepare`), F3.2 feed unit, F3.3 action row.
**Note**           The I3 row cites "AC-079–086 (share part)": the share ACs are AC-079–083 only; AC-084–086 are registration (084) or cancelled (085, 086).
AC-082/083 belong to F3.6.
**Scope**          Shared Zod and pure share-target function · server `POST /posts/:id/shares`, share view on `GET /posts/:id`, PATCH refusal on a share ·
web: "שיתוף בפיד" action on feed cards and the post page, share dialog, share view on `/posts/:id`.
**Out of scope**   Share link, WhatsApp/email/copy, link preview (F3.6) · notification to the original author (FR-NOTIF-003 → I7, with all notifications) ·
share events or analytics (4א → I15) · share count, "who shared" list · editing a share (delete and share again) · sharing a comment, profile, child,
Journey Summary, Tracker data or message: no control exists for any of them · anonymous share (DB forbids) · private-group and sponsored content (none
exist before I10/I12) · Professional sharing (I11) · inserting the new share into the loaded feed list (it appears on the next load) · a "one share per
post" limit · rate limit · ranking change (shares are already in the organic pool and deduplicated, F3.2 c8) · stage tag on a share · images (I5).
**Data touched**   `posts`: insert of a share row (`body` = sharer text, `audience`, `shared_post_id`); reads of posts, regular_names under RLS. One trigger
change (Schema needs). Delete via the existing `delete_post`.
**Risk flags**     auth/authz · personal data (sharer text) · schema change (trigger, in I3's one migration PR) → **Elevated**.

**Acceptance criteria** (U unit · I integration, real DB under RLS · E e2e; one PR)
1. 🟡 [U] VAL-038: strict `createShareSchema` `{text?, audience}`: `text` trimmed, absent/blank → null; 2,000 code points pass, 2,001 → `body_too_long`
   (`POST_BODY_MAX`, the post limit); `audience` `everyone|friends` required; keys `sharedPostId`, `authorId`, `isAnonymous`, `stageTag`, `status`, `id` → 400.
2. 🟡 [U] Pure `shareTargetOf(unit)` (shared): a named `post`, audience `everyone`, `isMine` false → its id; a `share` whose `original` is available,
   `everyone` and `isMine` false → the original's id (BR-066); else null: anonymous, `friends`, own, original unavailable, original now `friends`, original own.
3. 🔴 [I] FR-FEED-006, BR-065: active Regular A, `POST /posts/:id/shares` on B's active `everyone` post → 201 with the share view of c7; stored row:
   author A, `is_share` true, `shared_post_id` = id, `body` = trimmed text or null, `audience` as sent, `stage_tag` null, not anonymous; B's row unchanged;
   no column of the share holds B's body, name or tag.
4. 🔴 [I] BR-066: `:id` is a share S (by C) of original O → stored `shared_post_id` = O; the 201 and every later read name only O's author, and no key
   holds S's id or C's name. S whose original is deleted or unreadable → refused as c5.
5. 🔴 [I] ERR-034, AC-080, BR-064, 2א: one identical 403 `{error:"not_shareable"}` and 0 rows for: a `friends` original (also when A is B's Friend);
   anonymous original (harness fixture); A's own post, or a share of it; original deleted, held, `hidden` or `removed` (fixtures); author suspended or
   banned; unknown uuid; a post A cannot read. No response, header or log names the reason. B's `restricted` profile → 201 (Afik 18.10). Malformed id → 400.
6. 🔴 [I+U] No token → 401; Professional or suspended caller → 403 `not_allowed`; 0 rows. c5's refusals come from the database (trigger and RLS);
   static test: the share repository has no `where` on `author_id`, `audience`, `status`, `author_status` or `is_anonymous`; its only extra read is a
   share's `shared_post_id` (BR-066), under the identity transaction as `authenticated`; every query lists its columns.
7. 🔴 [I] AC-079, AC-081, BR-065, ERR-033: `GET /posts/:id` on a share the viewer can read → `kind:"share"`, `sharerText`, sharer `author`, and `original`
   by the feed unit's Zod (amended: `original.isMine`), loaded per viewer at every read. `{available:false}` and no original field when the original is
   deleted, held, its author suspended, edited to `friends` (non-Friend viewer) or hidden by the viewer; after the author's reactivation it returns.
   A plain post → `kind:"post"`, fields unchanged. Unreadable share → 404 as F3.1 c12. The feed unit gains only `original.isMine` (F3.2 c12 amended).
8. 🔴 [I] Lifecycle: the sharer's `DELETE /posts/:id` → 204, share gone, original and others' shares unchanged; the original's author deleting the
   share → 404, unchanged; the original deleted → share still 200 with `available:false`, its own comments and likes kept (F3.3: they are on the share
   row). `PATCH /posts/:id` on a share → 400 `share_not_editable`, row unchanged.
9. 🎨 [U] "שיתוף בפיד" button on a card (after "תגובות") and on the post page exactly when `shareTargetOf` ≠ null; otherwise absent, never disabled
   (BR-064). Professional: none. Anonymous cards gain no author data.
10. 🎨 [E] Dialog (screen.md): quote of the original (name, body), optional text, audience preselected as the composer does (1א, same stored choice),
    counter at ≤100 left, too-long message; "שיתוף" sends one request (double click); Esc or cancel sends none and returns focus to the button.
    Success: closes, polite "השיתוף פורסם", focus on the button, chosen audience stored; on reload the share card shows sharer, text and original (AC-079).
11. 🎨 [E] `not_shareable` → alert in the dialog "אי אפשר לשתף את הפוסט הזה" (no reason), text kept; network or 5xx → the screen.md retry alert, text kept;
    403 `not_allowed` → dialog closes with the ERR-004 alert; nothing stored on failure.
12. 🎨 [U+E] Post page of a share: sharer header and text, original in a quote with link "לפוסט המקורי" to its page, or "הפוסט המקורי כבר לא זמין" with
    no original content (AC-081); the sharer sees "מחיקה", nobody sees "עריכה"; F3.3 comments region unchanged. axe 0 at 375 px; new controls ≥44×44 px.

**Schema needs** (DATA ARCHITECT, I3 remaining-schema migration; no SQL here)
- `posts_insert_prepare`: also refuse a share whose original's named author is the caller (c5, own post; FR-FEED-006 "פוסט של משתמש אחר").
- The refusals of c5 raise one SQLSTATE/message distinct from the caller-level 42501/23503 (suspended, Professional), so c5 vs c6 map without an app check.
- Decide whether share rows also refuse UPDATE in the database (c8 refuses in the server; the UPDATE grant on body/audience/stage_tag covers shares).
- Confirm unchanged: share text capped by the 2,000 body CHECK; `audience` CHECK allows a share of either audience; `posts_shared_post_id_idx`; no new
  table, policy or grant. Cleanup: none (a share is the sharer's post, already deleted by author); pgTAP for the new refusal.

**Open questions**
- Own post → **assumed** not shareable into one's feed (FR-FEED-006 text "של משתמש אחר"; link sharing of own posts stays allowed, F3.6). Needs the trigger change.
- Share audience → **assumed** the sharer picks it per share, preselected per 1א (a share is the sharer's post, §13; OP-033 closed). Unreserved.
- Same post shared twice by one user → **assumed** allowed (SRS silent; feed dedup groups by original, F3.2 c8).
- Original hidden or reported by the viewer → **assumed** shows "not available" to that viewer (as built: RLS excludes it).
- AC-080 Restricted clause and BR-064/065 Restricted text → SRS update at I3 close (Afik 18.10). No reserved point open here.

**Size estimate**  ~520 product lines (shared ~60, server ~180, web ~280) + ~650 test lines. One PR (server + screen), after the I3 schema PR and F3.3w2.
