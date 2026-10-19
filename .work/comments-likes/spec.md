# comments-likes (F3.3) — comment, reply and "לייק" on cards and the post page

**Problem**        A Regular user can read posts (F3.2) but cannot answer one, react, or see that anyone did. Comments have no length limit.
**Requirements**   FR-FEED-003 (mentions/tags → I7) · FR-FEED-001 (like and comment on every card) · FR-FEED-005 r.1, AC-076, VAL-036 ("המחבר")
· BR-062 · Afik 3א, 6ב, 18.10 · F3.0b c10-12
**Scope**          Comment-length VAL and its CHECK · server: comment, reply, thread, delete own, like/unlike post or comment, counts · web: action
row on cards; thread, composer, reply, delete, likes on `/posts/:id`
**Out of scope**   Mentions, any notification (I7) · comment edit · deleting others' comments · report, hide, share controls (F3.7/9/5/6: none
rendered, no disabled placeholder) · anonymous composer and post-page header (F3.4) · who liked · inline composer on a card · Groups (I10)
· images · Professional (I11) · rate limit · ranking change (F3.2 c5 already counts them)
**Data touched**   One CHECK on `comments.body` (part a). Else reads/writes comments, reactions, reaction_owners, regular_names under RLS
**Risk flags**     auth/authz · personal data → **Elevated**

**Boundary.** "המחבר" is rendered here, wherever comments show (c6, c16). F3.4 owns creating anonymous posts and the post-page header;
until then fixtures come from the harness (as F3.2). The action row is this part's; F3.5/6/7/9 add their own control later.

**Acceptance criteria** (U unit · I integration, real DB, RLS · P pgTAP · E e2e; parts a, b1, b2, w1, w2)
1. 🟡 [P a] New VAL (SRS gap; ID at I3 close): comment 1-1,000 characters. `comments_body_length_check`: 1,000 inserts; 1,001 → 23514;
   blank check and posts check unchanged. Only migrations, tests, records change (P6).
2. 🟡 [U b1] `COMMENT_BODY_MAX` 1000; strict create schema `{body, parentId?}`: trimmed; blank → `body_required`; 1,000 code points pass,
   1,001 → `body_too_long`; extra keys (`authorId`, `byAuthor`, `status`, `postId`) → 400.
3. 🔴 [I b1] `POST /posts/:id/comments`, active Regular, readable post → 201 `{comment}` strict `{id, parentId, body, createdAt, isMine,
   byAuthor, author?:{name|null}}`; trimmed body stored; no author id, post id, status or count key.
4. 🔴 [I b1] No token → 401; Professional or suspended → 403; post missing, deleted, held, hidden, a stranger's friends-only, or by a
   suspended author → 404 `post_unavailable`; none writes a row.
5. 🔴 [I b1] `parentId` of a top-level comment on the same post → 201 with `parentId`. Reply to a reply, parent on another post, unreadable,
   held or unknown → 400 `parent_invalid`, identical body, 0 rows.
6. 🔴 [I b1] "המחבר": on an anonymous post the real author's comment returns `byAuthor:true`, no `author` key, `isMine:true` to them, `false`
   to others; other commenters keep `author`. On a named post the author's comment keeps `author`. The real id is in no response, error or log.
7. 🔴 [I b1] `author.name` = what `regular_names` returns to the viewer under RLS, else null. One fixture table (self, friend, request
   counterparty, stranger → expected) holds the expectation, so a policy change edits the table, not code.
8. 🔴 [I b1] `GET /posts/:id/comments?cursor=`: `{items, nextCursor}`; top-level oldest first (`createdAt, id`), 20 a page; each item carries its first 3
   `replies` oldest first and `replyCount` (RLS-visible replies under it, none whose parent isn't visible); empty → `{items:[],nextCursor:null}`; invalid cursor → 400 `cursor_invalid`;
   unreadable post → 404. Absent: suspended or banned commenter, held comment, reply under a held parent. Present: a reported comment (Afik 18.10), a `restricted` commenter's. Delete between pages: no repeat, no skip.
   `GET /api/comments/:id/replies?cursor=` → `{items, nextCursor}`, replies oldest first, 20 a page, keyset (`createdAt, id`), first call from the oldest (client merges by id);
   invalid, extra-key or non-reply cursor → 400 `cursor_invalid`; parent unknown, itself a reply, held, or on an unreadable post → 404 `comment_unavailable`, one identical body; 401/403 as c4; 25 replies = 3 inline + pages of 20 and 5 without repeat or skip.
9. 🔴 [I b1] `DELETE /comments/:id`: commenter → 204, row, replies, likes gone; with an open report → 204, gone for every reader, same response.
   Another's comment (post author too) or unknown → 404, unchanged. G2: own comment deletable after hiding or reporting the post, and by an anonymous post's author.
10. 🔴 [I b2] `PUT`/`DELETE /posts/:id/like` and `/comments/:id/like` (active Regular, readable target) → 204, idempotent (repeat PUT: one like;
    repeat DELETE: 204); removes only the caller's; unreadable or missing → 404, 0 rows; 401/403 as c4; no identity; no response emits `is_by_author` or `user_id`.
11. 🔴 [I b2] Displayed counts on `GET /posts/:id`, each feed item (a share counts its own row) and each c8 comment: `likeCount` = `count(*)` of
    RLS-visible reactions on the target (author's own included, no `asOf`); `commentCount` = RLS-visible comments + replies the thread renders ("המחבר" included),
    a reply only when its parent row is RLS-visible. No SQL predicate on status, `liker_status`, `author_status`, `is_by_*`, `created_at`. They differ from F3.2 `n`, never feed it.
    Fixtures: suspend removes a like, reactivation restores; a held-parent own-reply; card count = rendered items. No liker list or id; unreadable → 404, not 0; no `is_by_author` or `user_id` emitted.
12. 🔴 [U+I b2] `likedByMe` = `select target_id from reaction_owners where target_id = any($pageIds)`, no `user_id` predicate (RLS limits it; an app copy is a
    forbidden permission filter): static test, plus a fixture where another user liked (`false` for the viewer). Separate from ranking and display SQL (`reaction_owners`
    stays forbidden there, F3.2 c2); the three statements run in one REPEATABLE READ transaction. Amends F3.2 c5 ("no count" → no score, no `n`, no identity) and c12:
    only the three keys are added; same fixtures: ids, order, cursor, score identical before/after.
13. 🎨 [U+E w2] Card (amends F3.2b c14/15): after the body a like button (`aria-pressed`, "לייק" / "לייק, N") and link "תגובות" / "תגובות, N" →
    `/posts/:id#comments`; share and anonymous cards too, no author data added. Click: count ±1 at once, quick double click one request, failure reverts with the screen.md status. Scroll and the single `GET /feed` unchanged.
14. 🎨 [E w2] Like, open the post, go back: the restored card shows the new state. The comments link lands on the "תגובות" heading, focused.
15. 🎨 [U w1] Post page: region "תגובות" with the post's like and count; thread `ul`, replies nested `ul`; each: name, time, plain-text body (`dir=auto`),
    like, "השבה" (top-level only), "מחיקה" (`isMine`); "הצגת עוד השבות" when `replyCount` exceeds the loaded replies. Name = `author.name ?? "מהקהילה"`, so Afik's open answer needs no web change.
16. 🔴 [U+E w1] `byAuthor` without `author` shows "המחבר": no name, avatar, link; DOM, props, test ids hold no author data; delete shows for `isMine`.
17. 🎨 [E w1] Composer (comment, reply): blank → field message, focus on box; 1,001 → too-long message; counter at 100 left or fewer; success appends the
    server comment, clears, status "התגובה נוספה"; failure keeps text with alert; double click sends one request.
18. 🎨 [E w1] Delete: alertdialog (cancel focused, Esc cancels); confirm removes comment and replies, status "התגובה נמחקה", focus on heading; failure keeps dialog with alert. Others' comments show no delete.
19. 🎨 [E w1] Loading, empty (composer stays), error with "נסו שוב", "עוד תגובות" when `nextCursor` and "הצגת עוד השבות" when replies remain (each error keeps the list); post 404 unchanged; like failure reverts.
20. 🎨 [E w1+w2] axe 0 at 375 px on both screens; like, reply, delete, comments link ≥44×44 px, visible focus; only this spec's requests.

**Open questions**
- **DECISION REQUEST (Afik, privacy; question 7 pending):** may a stranger see a commenter's name? ⭐ names only as `regular_names` RLS allows
  (self, friends, request counterparties), else "מהקהילה". An answer is a schema PR on that policy; c7, c15 absorb it; open names add one copy notice.
- Length 1,000 → **decided (unreserved):** half a post; ~175 Hebrew words fit a supportive answer.
- Rate limit (SRS silent) → **assumed:** none beyond the platform's. Replies: 3 inline, rest 20 a page (ORCHESTRATOR, CRITIC b1); 20 top-level a page.
- Own-content like → **assumed:** allowed. Comment on a share → **assumed:** on the share row. A&D after Gate 1: I3-algorithm.md allow-list; S-34 widened; DATA ARCHITECT: column comments vs grants.

**Size estimate**  ~1,500 lines: **five PRs.** a CHECK+pgTAP (c1) ~50, DATA ARCHITECT, P6 · b1 shared + comments (c2-9) ~450, after a · b2 likes, counts,
feed (c10-12) ~400, after b1 · w1 post page (c15-19, c20) ~450, `LikeButton` here, after b2 · w2 feed card (c13-14, c20) ~250, after w1.

**Gate 1 (ORCHESTRATOR, 19.10):** spec.md + screen.md approved after A&D findings 1–4, 6, 8 validated (I3-algorithm.md amended). Split a → b1 → b2 → w1 → w2 accepted. Re-stated after SPEC's c8 rewrite (bounded replies, ORCHESTRATOR decision 19.10, findings-b1.md).
