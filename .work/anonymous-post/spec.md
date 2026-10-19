# anonymous-post (F3.4) — post anonymously; commenter names (Q7)

**Problem**        A Regular user with a sensitive question cannot ask it without her name on it: the composer has no anonymous option
(F3.1 refuses `isAnonymous`), and the author of an anonymous post could not find, edit or delete it. Commenters' names reach
only friends and request counterparties, unlike post authors (6ב); Afik decided otherwise (Q7 → B, 19.10).
**Requirements**   FR-FEED-005 r.1, r.3, r.6 (05-functional/feed.md) · AC-075, AC-076 (I3 part) (15-acceptance.md) · FR-FEED-003 "המחבר" line
· BR-062/VAL-036 · Afik 6א (anonymous = everyone), 5א, 6ב, Q7 → B (decisions/2026-10.md, 19.10) · data-model rules 19, 20 · I3-algorithm.md
**Scope**          Shared: `isAnonymous` on create · server: create anonymous, read/edit/delete own anonymous post, `isAnonymous` and the
author's `isMine` on `GET /posts/:id`, audience refusal mapping · web: composer toggle, anonymous post-page header and own note,
edit form without audience, comment-composer notices (Q7) · tests for AC-075/076 and the Q7 name rule.
**Out of scope**   Moderator reveal and its audit (I4, P5/AC-077) · any Admin screen or read path for the real author (I4 Super Admin,
rule 19 function) · notifications of any kind (I7 carries FR-FEED-005 r.2) · Offer Help (I11, r.4) · reputation, Give Back,
profile counters (none exist; r.5 binds whoever adds them) · search (none yet) · Groups (I10) · anonymous comments by non-authors (v1
forbids) · changing anonymity after posting (column is insert-only) · sharing an anonymous post (DB forbids; F3.5 hides buttons, BR-064)
· a name header on named posts' page · an own-post mark on the author's anonymous feed card (feed SQL may not read `post_authors`)
· images (I5) · Professional (I11) · rate limit · ranking or config change.
**Data touched**   No anonymity schema change: `posts.is_anonymous` (insert grant), `posts_audience_check`, `post_authors` (rule 20),
ownership policies and comment "המחבר" triggers exist (feed-groundwork schema.md, schema-b.md). One `regular_names` policy for
Q7 (Schema needs). Reads/writes posts, post_authors (own row, through triggers/RLS), comments, regular_names under RLS.
**Risk flags**     auth/authz · personal data → **Elevated** (+ ALGORITHM & DATA: post-detail `isMine` reads `post_authors`; schema in DA's I3 PR)

**Schema needs** (DATA ARCHITECT designs after Gate 1, in I3's single migration PR; no SQL here)
- N1 — `regular_names`: one new permissive SELECT policy, TO authenticated, active viewer: the name row of a user who is the
  `author_id` of a comment or reply the viewer can read under the comments policies (which carry post readability, held, hidden,
  commenter status). A comment with `author_id` NULL (the anonymous author's "המחבר") grants nothing. Beside the 4 existing policies;
  recursion guard: no comments/posts/reactions policy reads `regular_names`; approved definer list unchanged. DA decides index.
- N2 — confirm only: the comments column grant covers `author_id` as the policy needs; no other column, grant, policy or table
  changes for F3.4. No Admin read of `post_authors` in I3 (rule 19's audited function comes with I4).

**Acceptance criteria** (U unit · I integration, real DB under RLS · P pgTAP · E e2e; one PR, schema N1 merged first)
1. 🔴 [U] `createPostSchema` adds optional `isAnonymous` (boolean, absent = false); `{isAnonymous:true, audience:"friends"}` →
   `audience_not_allowed`; `updatePostSchema` still refuses `isAnonymous` (true or false) → 400; `authorId`, `status`, `id` still refused.
2. 🔴 [I] `POST /posts {body, audience:"everyone", isAnonymous:true}`, active Regular → 201 strict `{id, body, audience, stageTag,
   createdAt, isAnonymous:true}`; stored `author_id` NULL, `is_anonymous` true; the caller reads one own `post_authors` row for it.
   A named post's 201 gains `isAnonymous:false` (amends F3.1 c3). No author id in any response.
3. 🔴 [I] Anonymous create by a Professional → 403 `not_allowed`, 0 posts and 0 post_authors rows (AC-076); suspended → 403; no
   token → 401. The DB's `posts_audience_check` 23514 (a payload past Zod, repository test) → 422 `audience_not_allowed`, told apart
   from the body CHECK by constraint; no pg text in the body.
4. 🔴 [I] `GET /posts/:id`, anonymous post: strict response adds `isAnonymous:true`; `isMine` true for the real author only (friend,
   stranger: false); no `author` key. Named post: `isAnonymous:false`, `isMine` unchanged. 404 cases of F3.1 c12 unchanged.
5. 🔴 [U] Post-detail `isMine` (A&D amendment, `algorithm-review.md`, exact text binding): one pinned select-list expression
   `case when p.author_id is null then exists (… post_authors … (select auth.uid())) else p.author_id = (select auth.uid()) end as "isMine"`
   in one exported post-detail read of `posts-repository.ts`, imported only by `posts-service.ts` `readPostById`; named posts' `isMine`
   comes from it too (no service-side comparison). `readPost` (readability gate reused by comments, likes, hides, shares) keeps its
   columns. Static test: `post_authors` occurs in repositories only inside the two pinned `case when c./p.author_id is null … end as
   "isMine"` matches, each holding `post_authors`, `exists (`, `(select auth.uid())` and none of `join`, `count(`, `order by`,
   `group by`, `limit`; with both cut out, no repository file holds `post_authors`; posts-repository cuts its match before the F3.1-a
   c13 where-scan; `feed-sql.static.test.ts` unchanged.
6. 🔴 [I] Real author: `PATCH` body/stageTag → 200; `audience:"friends"` → 422 `audience_not_allowed`, row unchanged; `DELETE` → 204,
   comments/likes/post_authors gone; with an open report → the same 204, then 404 for all. Another user's PATCH/DELETE → 404, unchanged.
7. 🔴 [I] AC-075 leak scan. Fixture: A has one anonymous and one named post and a "המחבר" comment; V is A's friend, S a stranger.
   No body V or S gets (feed pages, post, comments, replies, likes, 4xx) holds A's id or email; no item for the anonymous post or the
   "המחבר" comment holds A's name. Logger records of A's create/read/edit/delete hold neither A's id nor the post id.
8. 🔴 [I] AC-076 social graph: A's anonymous post (made via `POST /posts`) scores in V's feed exactly as the same post by a
   non-friend (Friend term 0); it counts toward `maxAnonymousInWindow`, not toward A's `maxSameCreatorInWindow`; `isMine` false
   for A in A's own feed (F3.2 c12 unchanged).
9. 🔴 [P] N1 (with DA's migration): S reads commenter C's name when S can read C's comment or reply on an "everyone" post; 0 rows
   when that comment is held or deleted, C suspended, the post friends-only to S or hidden by S; A's "המחבר" comment alone gives S 0
   rows for A and 0 `post_authors` rows; structure: 5 policies on `regular_names`, none elsewhere mentions it, no 42P17.
10. 🔴 [I] Q7: F3.3 c7's fixture table changes only its expectations: stranger → full name on a comment and a reply; the "המחבר"
    comment keeps no `author` key. No server code change for Q7.
11. 🎨 [U+E] Composer: checkbox "פרסום אנונימי", unchecked on every open (never stored). Checked: audience group leaves the DOM,
    the name notice becomes the anonymous notice; unchecked: the earlier audience choice returns. Submit sends `isAnonymous:true`,
    `audience:"everyone"`; an anonymous post leaves the remembered audience (F3.1 c15) untouched.
12. 🔴 [U+E] Post page of an anonymous post: header "אנונימי" (`ANONYMOUS_AUTHOR_LABEL`) for every reader; the real author also sees
    the own note, "עריכה", "מחיקה"; others see neither. DOM, props, test ids hold no author data.
13. 🎨 [E] Edit form of an anonymous post: no audience group, no checkbox, the fixed line instead; saving shows the update.
14. 🎨 [E] Comment and reply composer (Q7): the name notice under the textbox (aria-describedby); for the anonymous post's real
    author the "המחבר" notice instead. That author's sent comment shows "המחבר" to them and to S, never the name.
15. 🎨 [E] S opens a named post with C's comment: C's full name shows, not "מהקהילה".
16. 🎨 [E] axe 0 at 375 px: composer both states, anonymous post page as author and as S, thread with both notices; checkbox
    ≥44×44 px, focus stays on it when toggled; only this spec's requests.

**Open questions**
- **DECISION REQUEST (Afik, privacy terms — reserved 4), pending:** does the anonymous notice say staff can see the author
  (FR-FEED-005 r.6)? Gate 1 decision 2: the composer uses the ⭐ screen.md text until Afik answers. Alternative: name-hiding only.
- Admin view of the real author in I3 → **Gate 1 item 1:** none; "Admin-only" in I3 = only the author reads it; I4 adds rule 19's read.
- Toggle not remembered → **decided (unreserved):** an anonymous default carried into the next post would surprise; off each time.
- Stage tag on an anonymous post → **assumed:** allowed, author's choice (5א), the existing hint "התגית תוצג לקוראים" stays.
- SRS gaps for I3's `/srs-update`: commenter-name visibility (Q7) and `audience_not_allowed` are not in the SRS.

**Size estimate**  ~320 product lines (shared ~30, server ~90, web ~200) + ~550 test lines: **one PR**, after N1's migration PR.
