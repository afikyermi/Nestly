# hide-post (F3.9) — "hide this post" for oneself, with undo

**Problem**        A Regular user who does not want to see a post in the feed (upsetting, irrelevant, repetitive) cannot remove it; it comes
back on every visit. The schema has the row (F3.0 `post_hides`, RLS already drops a hidden post for its hider), but nothing writes it.
**Requirements**   FR-ALG-009 (05-functional/algorithms-data.md) — **the Hide action only** · P-ALG-06 (18-algorithms-spec.md; met in the MVP by
this hide) · Afik 8א (`I3-questions.md` → "תשובות": for me only, not a matching signal; "not interested" stays I15)
· `I3-algorithm.md` purpose map and "Excluded" · F3.2 c1/c2 · F3.3 c4 (hidden post → 404) · BR-065 / AC-081.
**Not in the SRS (flagged):** the menu, undo, the placeholder, error texts, the own-post refusal response — unreserved UI defaults;
none touches privacy, money or minors.
**Scope**          Shared: params/error Zod. Server: `PUT` and `DELETE /posts/:id/hide`. Web: the card's "more actions" menu (shared with F3.7)
with one item, the in-place placeholder with undo, failure states, the feed cache honouring hides.
**Out of scope**   "Not interested", Show Less, any ranking effect or suppression by creator/topic/source, RecommendationFeedback, AC-064 (I15)
· a hidden-posts list or unhiding after leaving the feed (no SRS home) · hide on the post page, on a comment, or of a user (block is
BR-011, messaging only) · the "דיווח" item and the menu on the post page or comments (F3.7) · telling the author, any hide count,
Admin/Moderator view of hides · Professional feed (I11) · hiding own posts · instant removal of loaded shares of X (c12) · events (4א).
**Data touched**   `post_hides` (F3.0): insert / delete / select of the caller's own row under RLS. Reads `posts` under RLS. No new table.
**Risk flags**     personal data (which posts a user hid) · authz → **Elevated** (+ ALGORITHM & DATA review of c6).
**Schema needs**   (DATA ARCHITECT, after Gate 1; no SQL here)
- S1. A hide is refused for a post the caller cannot read under `posts_select_viewer`. Today the FK alone proves existence, so a stranger's
  friends-only post id can be hidden and a missing id fails differently (existence oracle). The readability test must still allow a
  repeat hide of a post the caller already hid (c1 idempotency), though RLS now hides it from them.
- S2. The own-post refusal (`post_hides_insert_guard`, 42501) and an RLS refusal (also 42501) must be distinguishable to the server
  (a distinct SQLSTATE or constraint name), so c2 → 404 and c3 → 409 without the server reading `post_authors` (forbidden outside
  `isMine`, `I3-algorithm.md`).
- S3. pgTAP for S1/S2, and that a user reads, inserts and deletes only their own rows (if F3.0's tests do not already cover a line).

**Behaviour decided (unreserved, ORCHESTRATOR may overrule at Gate 1).** Persistence: a server row, so a hide survives reload, sign-out
and another device (FR-ALG-009 "העדפה נשמרת"; 8א; F3.0 schema). Lifetime: until undo, the post's deletion, or the hider's account
deletion (cascade, F3.0). Undo: in place, until the user leaves the feed screen or reloads; then the hide is permanent in the MVP.

**Acceptance criteria** (U unit · I integration, real DB, RLS · P pgTAP · E e2e)
1. 🔴 [I] `PUT /posts/:id/hide`, active Regular, a post they can read and did not write → 204, no body; one own row. Repeat → 204, one row.
   Then, in a new snapshot and in a second session (another token): `GET /feed` omits it, `GET /posts/:id` and its comments/likes → 404
   `post_unavailable` (F3.3 c4). [FR-ALG-009 Hide, 8א]
2. 🔴 [I+P] Unreadable → 404 `post_unavailable`, one identical body, 0 rows: a non-friend's friends-only post, deleted, held or removed post,
   suspended author's post, a post the caller reported, an unknown uuid. Non-uuid id or any body → 400. pgTAP: S1. [8א; data-model rule]
3. 🔴 [I] Own post, named or anonymous → 409 `own_post`, 0 rows; the response holds no author id. [F3.0 guard; not in SRS: the code]
4. 🔴 [I] `DELETE /posts/:id/hide` → 204; the caller's row gone; the post is back in `GET /feed` and `GET /posts/:id`. No row, a post never
   hidden or unreadable → 204 (no oracle). User B's DELETE never removes user A's row. [not in SRS: undo]
5. 🔴 [I+P] For oneself only: another viewer, the author included, still sees the post in feed and post page with `likeCount`/`commentCount`
   unchanged; no response emits a hide, a hide count or who hid. pgTAP: B and the author read 0 of A's rows. A's rows go with the post
   and with A's account (cleanup order unchanged). [8א; owner-only reads as data-model rule 20]
6. 🔴 [I+U] Not a ranking signal (8א; A&D 5b): seeded config, fixed `asOf`. (i) For every unit other than X, the ranking key
   `(tier, score)` returned by the ranking statement is identical before and after A hides X, for A and for another viewer B;
   (ii) with a fixture where no diversity cap binds and no share of X exists, all units fit one page, A's list equals the before-list
   minus X (same ids, same order) and B's list is identical; (iii) with a share S of X on the page, S is no longer displaced by dedup
   after the hide (BR-065 original unavailable), and same-author / same-tag units keep their score. Static: F3.2 c2 still forbids
   `post_hides` in `feed*.ts`; `post_hides` appears only in the hide repository, which no feed module imports. No
   RecommendationFeedback row or table, no event; log output holds no post or user id.
7. 🔴 [I] No token → 401; Professional or suspended → 403 `not_allowed`; neither writes or deletes a row. [F3.3 c4 pattern]
8. 🎨 [U] One menu, F3.7's (Gate 1 amendment): every card with `isMine` false (named, share, others' anonymous, **including the viewer's
   own anonymous card**, which F3.2 returns as `isMine` false) has a button "פעולות נוספות לפוסט" (`aria-haspopup="menu"`,
   `aria-expanded`), last in the card's tab order (after like, comments, time link); `isMine` true: none in F3.9. Menu "פעולות נוספות"
   with the `menuitem` "הסתרת הפוסט"; Enter/Space opens with focus on it; arrows move; Esc or outside click closes, focus back on the
   button. F3.7 adds "דיווח על הפוסט" to this menu; no second menu. [not in SRS]
9. 🎨 [U+E] Hiding sends one `PUT` (a double click: one); on 204 the card is replaced in place by a placeholder article (same `aria-posinset`)
   "הפוסט הוסתר" with a button "ביטול ההסתרה", focus on it, polite status. Undo sends one `DELETE`; on 204 the same card returns in place
   from client data (no refetch), focus on its "פעולות נוספות לפוסט" button. [not in SRS]
10. 🎨 [E] Leaving the feed or reloading: no placeholder, the card absent. Back from `/posts/:id` restores the list (F3.2 c20) without the
    hidden card. Opening the hidden post's link shows "הפוסט אינו זמין". [8א; F3.2 c20]
11. 🎨 [U] Failures (screen.md texts): hide network/5xx → card unchanged, status, focus on the more button · 404 → card removed, status
    "הפוסט אינו זמין" · 409 → card unchanged, own-post status · undo failure → placeholder stays, status, focus on "ביטול ההסתרה".
    Test: the viewer's own anonymous card → hide → 409 → the own-post status message, card unchanged.
12. 🎨 [E] Hiding a share hides that share only; its original stays eligible. A loaded share whose original was hidden keeps showing it
    until reload, then "הפוסט המקורי כבר לא זמין" (BR-065, AC-081). axe 0 at 375 px with the menu open and with a placeholder;
    more button, menu item and undo ≥ 44×44 px, visible focus.

**Open questions**
- Q1 → **decided (ORCHESTRATOR, Gate 1 amendment 19.10):** one menu, F3.7's names (`.work/report/screen.md` 6–8); F3.8+F3.9 build first,
  so F3.9 builds it and F3.7 adds "דיווח". R2's four card actions are unchanged.
- Q2: undo window → **assumed:** as "Behaviour decided" (in place, until leaving the feed).
- Q3: hide from the post page → **assumed:** not offered (out of scope).
- No DECISION REQUEST: 8א decides scope and "for me only"; persistence follows FR-ALG-009 and the approved F3.0 schema.

**Size estimate**  ~270 product lines (shared ~15, server ~90, web menu ~70, placeholder/undo/state ~80, api client and feed cache ~15).
Schema needs S1–S3 ship in DATA ARCHITECT's I3 schema PR first. One part.
**Combined PR with F3.8:** both small (~380 product lines together) → **one PR**, 12 + 7 = 19 criteria (≤ 20, the Elevated cap), run
**Elevated** because of this part's flags, with ALGORITHM & DATA on c6. If S1–S3 are late, F3.8 ships alone.
