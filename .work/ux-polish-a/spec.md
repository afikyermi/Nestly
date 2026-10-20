# ux-polish-a (I3 UX polish, part A) — comments inside the feed card

**Problem**        To read or answer the comments on a post, a user must leave the feed for the post page and come back.
direction.md "דפוסי אינטראקציה" (Afik 19.10) puts them inside the card: one or two comments, "show more", a field, reply in place.
**Requirements**   FR-FEED-001 (like and comment on every card), FR-FEED-003 (05-functional/feed.md) · FR-FEED-005 r.1, AC-075,
AC-076 "המחבר" (15-acceptance.md) · FR-MOD-001 comment report (05-functional/moderation.md) · direction.md "תגובות" row · F3.3
c8, c13–c19, F3.4 c14, F3.7 c9/c13 (as built) · Q7 B names (decisions 19.10) · I3-community-feed.md "ליטוש UX" item 2.
**Not in the SRS (flagged, SRS-changes rows 6/7 at the I3 close):** comments in the card, the two-comment preview, "הצגת עוד תגובות".
**Scope**          Web only. On every feed card that has the like control: up to two comments, "הצגת עוד תגובות", replies in
place, the comment field at the bottom, each comment's like and "⋯" (own: delete; others: report) — all through the F3.3/F3.7
endpoints as built.
**Out of scope**   Any server, Zod, schema or endpoint change; no preview inside `GET /feed` · a newest-first or "relevant"
order (needs a server parameter) · the post page thread (unchanged; `/posts/:id#comments` still lands on its heading) · comment
edit · mentions, notifications (I7) · who liked · comments on a hide placeholder · Professional-specific UI · keeping comment
state after leaving the feed · ranking effects · the window/history mechanism itself (ux-polish-b).
**Data touched**   None (reads and writes through F3.3/F3.7 endpoints under existing RLS).
**Risk flags**     None: no server, schema, authz or new surface → Standard. c6 is 🔴 because it re-asserts AC-075 in a new place;
ORCHESTRATOR may choose Elevated for that reason.

**Decided here (unreserved; ORCHESTRATOR confirms at Gate 1)**
- Preview = the thread's own order (top-level oldest first, F3.3 c8): the first two. Another order needs the server (out of scope).
- Lazy: a card asks for its comments once, when it first comes within one viewport height of the visible area, only if its
  `commentCount` > 0. Loaded comments and the expanded state live while the feed screen stays mounted.
- Build after ux-polish-b: the comment menus, confirmation and report sheet use its Back/outside/one-press behaviour.

**Acceptance criteria** (U unit · E e2e Playwright; desktop = 1024 px, phone = 375 px)
1. 🎨 [U+E] Preview: a card with `commentCount` 0 sends no comments request and shows only the field. With > 0, coming near the
   viewport sends exactly one `GET /posts/:id/comments` (no cursor) for it; the card shows the first ≤2 top-level comments as the
   post page draws them (name, "מהקהילה" or "המחבר"; time; body; like; "השבה"; "⋯"), replies not shown. Cards never near the
   viewport send nothing; the `GET /feed` request and response are unchanged.
2. 🎨 [U+E] "הצגת עוד תגובות" shows while the card has top-level comments not shown (loaded, or `nextCursor`). First press reveals
   the rest of the loaded page with no request; later presses fetch the next page (one request with the cursor) and append; focus
   moves to the first newly shown comment; the button leaves at the end. Under a shown comment, "הצגת עוד השבות" shows while its
   `replyCount` exceeds the replies shown: the first press reveals its inline replies (no request), then pages as F3.3 c15/c19.
3. 🎨 [U+E] States inside the card: loading → skeleton lines, the field stays; load failure → inline alert + "נסו שוב" (one new
   request), the field stays; next-page failure → list kept, alert + "נסו שוב"; 404 → the comment area shows "הפוסט אינו זמין"
   and no field. None of these navigates or moves the feed's scroll.
4. 🎨 [U+E] The field at the bottom of every card with the like control (shares and anonymous cards too) behaves as F3.3 c17
   (blank, 1,001, counter, double press = one request, failure keeps the text). Success appends the server comment last in the
   card's list (shown, also when collapsed), clears the field, "תגובות, N" +1, status "התגובה נוספה" in the feed's status region;
   focus stays in the field. The card's `<form>` has no accessible name (not a landmark); its textbox is named "כתיבת תגובה".
5. 🎨 [U+E] Reply in place: "השבה" on a shown top-level comment opens F3.3's reply box under it inside the card, focus in it;
   success appends the reply under that comment (shown) and "תגובות, N" +1; "ביטול" closes it, focus back on "השבה". At most one
   reply box per card. Its `<form>` has no accessible name (not a landmark); its textbox is named "כתיבת השבה".
6. 🔴 [U+E] Anonymity (AC-075, AC-076; F3.3 c16; F3.4 c14): a `byAuthor` comment shows "המחבר" with no name, avatar or link; the
   card's DOM, props and test ids hold no author data. On an anonymous card the real author gets F3.4's "המחבר" notice under the
   field and reply box, everyone else the name notice; the card learns this only from `GET /posts/:id` `isMine` (F3.4 c4–c5's
   approved read); until that answers, an anonymous card shows no field. If that read fails, the card shows no field and F3.3's
   load-failure text "לא הצלחנו לטעון את התגובות. אפשר לנסות שוב" (ERR-004) with "נסו שוב" (one new read). `GET /feed`, its SQL
   and the F3.2 c2 / F3.4 c8 static tests are unchanged. No "report user" path from an "המחבר" comment.
7. 🎨 [U+E] Comment "⋯" (F3.7 names): own → "מחיקה" → F3.3's confirmation; confirm removes the comment and its replies from the
   card, "תגובות, N" drops by the removed count, status "התגובה נמחקה", focus on the card's "תגובות"; failure keeps the dialog with
   F3.3's text. Others' → "דיווח על התגובה" → F3.7's sheet over the feed; outcomes per F3.7 c13 (status, comment stays, focus on its "⋯").
8. 🎨 [U] Comment likes in the card behave as F3.3 c13: count ±1 at once, a quick double press sends one request, failure reverts
   with F3.3's like status.
9. 🎨 [U+E] The action row's "תגובות" becomes a button (supersedes F3.3 c13/c14's link, for the card only); name "תגובות" /
   "תגובות, N" unchanged; activating it moves focus to that card's field, with no navigation and the URL unchanged. Tab order per
   card: like, comments, share in feed, share link, time link, card "⋯", then each shown comment in CommentItem's existing order
   ("⋯", like, "השבה", as on the post page), "הצגת עוד תגובות", the field, "שליחה".
10. 🎨 [E] One overlay on /feed: card "⋯", comment "⋯", the comment confirmation and the report sheet; one press switches between
    any two "⋯" (card or comment, same or another card); Back closes the open one and stays on /feed at the same scroll; the next
    Back leaves the feed (no dead entry).
11. 🎨 [E] After adding and deleting comments in a card, open another post and Back: the restored card shows the updated
    "תגובות, N" and its preview loads again, collapsed; hidden and reported cards stay absent (F3.9 c10, F3.7 c13).
12. 🎨 [E] axe 0 at 375 px and 1024 px: preview, expanded with replies, reply box, field with each notice, load error, comment menu
    open, two or more cards with fields (landmark-unique); new controls ≥44×44 px, visible focus; RTL; keyboard only. A card
    without the like control shows no comment area.

**Open questions**
- Q1 Request count: scrolling a page of 20 cards can send up to 20 comment requests (one per card with comments that comes near)
  → **assumed:** acceptable for the MVP (PERF targets are delegated, 17.10). A preview inside `GET /feed` would be a server and
  ALGORITHM & DATA change (Elevated, its own part).
- Q2 Preview order → **assumed:** oldest first, as the thread. Q3 Focus after send → **assumed:** stays in the field (as built).
- Q4 An anonymous card's `GET /posts/:id` (c6) → **assumed:** one request, made together with the comments request or when
  the card comes near with `commentCount` 0.
- No DECISION REQUEST: placement and behaviour come from direction.md (Afik 19.10); no SRS TBD or open OP is touched.

**Size estimate**  ~460 product lines: the thread view shared by the post page and the card ~120 · per-card comment state (lazy
load, expand, writes, likes) ~170 · card area, field, notices ~90 · feed overlay wiring (menus, confirmation, report) ~60 ·
"תגובות" button ~20. One PR, after ux-polish-b.

**Amendment (ORCHESTRATOR, Gate 1 screen items):** unnamed card form, textbox "כתיבת תגובה" (c4, c12) · in-comment Tab order "⋯", like, "השבה" (c9) · failed anonymous-card read: no field, F3.3 load-failure text + "נסו שוב" (c6).
**Amendment 2 (ORCHESTRATOR):** the in-card reply `<form>` is unnamed too; its textbox keeps "כתיבת השבה" (c5).
