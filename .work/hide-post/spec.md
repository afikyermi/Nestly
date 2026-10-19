# hide-post (F3.9) — "hide this post" for oneself, with undo · the card's one "⋯" menu

**Problem**        A Regular user cannot remove an unwanted post from their feed; it returns on every visit. F3.0's `post_hides` row and
RLS exist, but nothing writes it. Own posts can be edited or deleted only from the post page.
**Requirements**   FR-ALG-009 — **Hide only** · P-ALG-06 · Afik 8א (for me only, not a matching signal; "not interested" stays I15) ·
`I3-algorithm.md` purpose map / "Excluded" · F3.2 c1/c2 · F3.3 c4 · BR-065 / AC-081 · FR-FEED-002 + 3א (own edit/delete, F3.1) ·
`docs/design/direction.md` "דפוסי אינטראקציה" (Afik 19.10). **Not in the SRS (flagged):** undo, placeholder, texts, the 409 response.
**Scope**          Shared: params/error Zod. Server: `PUT` and `DELETE /posts/:id/hide`. Web: ONE "⋯" menu on every feed card (own: edit,
delete; others': hide), the hide placeholder with undo, the in-feed delete, failure states, the feed cache honouring both.
**Out of scope**   "Not interested", Show Less, any ranking effect, RecommendationFeedback, AC-064 (I15) · a hidden-posts list or unhiding
after leaving the feed · hide on the post page, a comment or a user · "דיווח" and menus on the post page/comments (F3.7) · in-place
edit and in-card comments (later I3 UX-polish parts) · any server change for edit/delete (F3.1's `PUT`/`DELETE /posts/:id` as built) ·
telling the author, hide counts, Admin view of hides · Professional feed (I11) · instant removal of loaded shares of X (c12).
**Data touched**   `post_hides` (F3.0): insert / delete / select of the caller's own row under RLS. Reads `posts` under RLS. No new table.
**Risk flags**     personal data (which posts a user hid) · authz → **Elevated** (+ ALGORITHM & DATA review of c6).
**Schema needs**   (DATA ARCHITECT, after Gate 1; no SQL here)
- S1. Refuse a hide of a post the caller cannot read under `posts_select_viewer` (today the FK alone: a stranger's friends-only id can
  be hidden, and a missing id fails differently — an existence oracle). A repeat hide of an already-hidden post must still pass (c1).
- S2. The own-post refusal (`post_hides_insert_guard`) and an RLS refusal both raise 42501; make them distinguishable (SQLSTATE or
  constraint name) so c2 → 404 and c3 → 409 without reading `post_authors` (forbidden outside `isMine`).
- S3. pgTAP for S1/S2 and own-row-only read/insert/delete (where F3.0's tests do not already cover it).

**Behaviour decided (unreserved).** A hide is a server row: it survives reload, sign-out and another device (FR-ALG-009 "העדפה נשמרת";
8א; F3.0). Lifetime: until undo, the post's deletion or the hider's account deletion (cascade). Undo: in place until the user leaves the
feed screen or reloads; then permanent in the MVP.

**Acceptance criteria** (U unit · I integration, real DB, RLS · P pgTAP · E e2e)
1. 🔴 [I] `PUT /posts/:id/hide`, active Regular, a post they can read and did not write → 204, no body; one own row. Repeat → 204, one
   row. Then, new snapshot and a second session: `GET /feed` omits it; `GET /posts/:id` and its comments/likes → 404 `post_unavailable`.
2. 🔴 [I+P] Unreadable → 404 `post_unavailable`, one identical body, 0 rows: a non-friend's friends-only post, deleted/held/removed post,
   suspended author's post, a post the caller reported, an unknown uuid. Non-uuid id or any body → 400. pgTAP: S1.
3. 🔴 [I] Own post, named or anonymous → 409 `own_post`, 0 rows; no author id in the response. [F3.0 guard]
4. 🔴 [I] `DELETE /posts/:id/hide` → 204, the caller's row gone, the post back in `GET /feed` and `GET /posts/:id`. No row, never hidden or
   unreadable → 204 (no oracle). User B's DELETE never removes user A's row.
5. 🔴 [I+P] For oneself only: others, the author included, still see the post with `likeCount`/`commentCount` unchanged; no response
   emits a hide, a hide count or who hid. pgTAP: B and the author read 0 of A's rows; A's rows go with the post and with A's account.
6. 🔴 [I+U] Not a ranking signal (8א; A&D 5b): seeded config, fixed `asOf`. (i) For every unit other than X, the ranking key
   `(tier, score)` returned by the ranking statement is identical before and after A hides X, for A and for another viewer B;
   (ii) with a fixture where no diversity cap binds and no share of X exists, all units fit one page, A's list equals the before-list
   minus X (same ids, same order) and B's list is identical; (iii) with a share S of X on the page, S is no longer displaced by dedup
   after the hide (BR-065 original unavailable), and same-author / same-tag units keep their score. Static: F3.2 c2 still forbids
   `post_hides` in `feed*.ts`; `post_hides` appears only in the hide repository, which no feed module imports. No
   RecommendationFeedback row or table, no event; log output holds no post or user id.
7. 🔴 [I] No token → 401; Professional or suspended → 403 `not_allowed`; no row written or deleted.
8. 🎨 [U] ONE menu on **every** feed card (direction.md; F3.7's names): button "פעולות נוספות לפוסט" (`aria-haspopup="menu"`,
   `aria-expanded`), last in the card's tab order (like, comments — still a link to the post page in I3 —, time link, "⋯"). Menu
   "פעולות נוספות". `isMine` true (own named card): "עריכת הפוסט", "מחיקת הפוסט". `isMine` false (others' cards and the viewer's own
   anonymous card): "הסתרת הפוסט" (F3.7 adds "דיווח על הפוסט"). Enter/Space opens, focus on the first item; arrows move; Esc, an
   outside click or Back (history) closes it — Back does not leave the feed — and focus returns to the button. No second menu.
9. 🎨 [U+E] Hide sends one `PUT` (double click: one); on 204 the card becomes, in place, a placeholder article (same `aria-posinset`)
   "הפוסט הוסתר" with "ביטול ההסתרה", focused, polite status. Undo sends one `DELETE`; on 204 the same card returns in place from
   client data (no refetch), focus on its "⋯".
10. 🎨 [E] Leaving the feed or reloading: no placeholder, the card absent. Back from `/posts/:id` restores the list (F3.2 c20) without
    the hidden card. The hidden post's link shows "הפוסט אינו זמין".
11. 🎨 [U] Hide failures (screen.md texts): network/5xx → card unchanged, status, focus on "⋯" · 404 → card removed, "הפוסט אינו זמין" ·
    409 → card unchanged, own-post status · undo failure → placeholder stays, focus on undo. Test: the viewer's own anonymous card →
    hide → 409 → the own-post status message, card unchanged.
12. 🎨 [E] Hiding a share hides that share only; its original stays eligible. A loaded share of a hidden original keeps showing it until
    reload, then "הפוסט המקורי כבר לא זמין" (BR-065, AC-081). axe 0 at 375 px with the menu open, a placeholder and the delete
    dialog; "⋯", menu items and undo ≥ 44×44 px, visible focus.
13. 🔴 [U+E] Own items (FR-FEED-002, 3א; direction.md): "עריכת הפוסט" opens `/posts/:id` with its existing edit form open (F3.1).
    "מחיקת הפוסט" opens F3.1's alertdialog "למחוק את הפוסט?" (Esc, Back or "ביטול" closes, focus to "⋯"); confirm sends one
    `DELETE /posts/:id`; 204 or 404 → card removed, status "הפוסט נמחק", the user stays in the feed (no navigation), focus on the next
    card's first control, else the h1; back-restore omits it. Failure → dialog stays, "המחיקה לא הצליחה. אפשר לנסות שוב".

**Open questions**
- Menu → **decided (ORCHESTRATOR, Gate 1 amendments 19.10):** one "⋯" menu, F3.7's names; F3.9 builds it, F3.7 adds "דיווח". R2's four
  card actions unchanged. How the edit entry opens the form (router state or hash) is BUILDER's, in notes.md.
- Undo window → **assumed:** as "Behaviour decided". Hide from the post page → **assumed:** not offered.
- No DECISION REQUEST: 8א decides scope and "for me only"; persistence follows FR-ALG-009 and the approved F3.0 schema.

**Size estimate**  ~330 product lines (shared ~15, server ~90, menu ~80, placeholder/undo ~80, in-feed delete/edit entry ~50, api/cache
~15). S1–S3 ship in DATA ARCHITECT's I3 schema PR first. One part.
**Combined PR with F3.8:** ~440 product lines → **one PR**, 13 + 7 = 20 criteria (= the Elevated cap), **Elevated**, ALGORITHM & DATA on
c6. If S1–S3 are late, F3.8 ships alone. Any further criterion forces a split.
