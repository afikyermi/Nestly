# algorithm review — anonymous-post (F3.4), step 5b, 19.10.2026

**Reviewer:** ALGORITHM & DATA. **Against:** `spec.md` (Gate 1), `.work/_initiatives/I3-algorithm.md`, `I3-rest-gate1.md`.
**Verdict:** 2 bugs (1 medium, 1 low). The bug list goes to ORCHESTRATOR; this file holds the purpose map and the amendment.

## Purpose map (F3.4 delta)

| Input | Purpose | Approved by |
|---|---|---|
| `posts.is_anonymous` | eligibility path (always "everyone"), source diversity cap, response flag `isAnonymous` | FR-FEED-005 r.3, BR-062, 6א; I3-algorithm purpose map |
| Caller's own `post_authors` row (RLS returns only the caller's) | `isMine` on `GET /posts/:id` for the caller only: display (own note, edit/delete controls) | FR-FEED-005 (author edits/deletes own post); data-model rule 20; this amendment |
| Commenter's `regular_names` row (N1) | display of the commenter's name to a reader of that comment | Afik Q7 → B (19.10) |

**Excluded (unchanged):** the real author for scoring, diversity, dedup, counts or any feed statement; the author's
JourneyContext as a label (5א); any Admin/Moderator read in I3 (Gate 1 item 1; I4 rule 19 function).

**Ranking:** no change. Anonymous post: Friend term 0 by construction, its own creator for `maxSameCreatorInWindow`
(`author_id` NULL), counted by `maxAnonymousInWindow`; `n` excludes the "המחבר" comment by `is_by_post_author`. c8 is the right test.

## Amendment to I3-algorithm.md → "Comment-thread statement" (to be folded in at I3 close; binding from now)

**Post-detail statement — `isMine` (F3.4).** One more application statement may read `post_authors`: the post read used
**only** by `GET /posts/:id` (`readPostById`), in `apps/server/src/repositories/posts-repository.ts`, as exactly this
select-list expression:
`case when p.author_id is null then exists (select 1 from nestly.post_authors pa where pa.post_id = p.id and
pa.author_id = (select auth.uid())) else p.author_id = (select auth.uid()) end as "isMine"`.
Conditions (a)–(e) of the comment-thread statement apply unchanged, plus:
(f) it lives in a post-detail read function that is not the readability gate (`readPost`) reused by comments, likes,
hides or shares — those keep their current column list with no `post_authors`;
(g) for named posts `isMine` comes from the same expression (no second, service-side comparison that could disagree).
**Still forbidden:** `post_authors` in every `feed*.ts` statement, every count, like-state, hide, share and report statement.

## Static-test wording (replaces F3.3-b1 c6 and amends F3.1-a c13)

1. `post_authors` appears in `apps/server/src/repositories/*.ts` only inside the pinned `isMine` expressions:
   `case when c\.author_id is null[\s\S]*?end as "isMine"` in `comments-repository.ts` and
   `case when p\.author_id is null[\s\S]*?end as "isMine"` in `posts-repository.ts`; each pinned match contains
   `post_authors`, `exists (` and `(select auth.uid())`, and no `join`, `count(`, `order by`, `group by`, `limit`.
   After cutting those matches out, no repository file contains `post_authors`.
2. `posts-repository.ts`: the pinned expression is cut out **before** the F3.1-a c13 where-scan (whose regex would
   otherwise read the EXISTS's `where pa.author_id = (select auth.uid())`); the where-scan stays otherwise unchanged.
3. The expression appears in exactly one exported function of `posts-repository.ts`, and that function is imported
   only by `posts-service.ts` `readPostById`.
4. `feed-sql.static.test.ts` unchanged (`post_authors` forbidden in `feed*.ts`).
