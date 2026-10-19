# algorithm review — hide-post (F3.9), step 5b, 19.10.2026

**Reviewer:** ALGORITHM & DATA. **Against:** `spec.md` (Gate 1), `.work/_initiatives/I3-algorithm.md`, `I3-rest-gate1.md` item 5.
**Verdict:** 2 bugs (1 medium on c6, 1 low). Also checked `share-in-feed/spec.md` (organic pool, extra read): no bugs.

## Purpose map (F3.9)

| Input | Purpose | Approved by |
|---|---|---|
| Viewer's own `post_hides` row | viewer-only eligibility inside RLS (feed, post page, its comments/likes, a share's original for that viewer) | FR-ALG-009 Hide; 8א "אצלי בלבד"; I3-algorithm purpose map |
| Same row, read by the hide service | idempotent PUT/DELETE of the caller's own row only | 8א; F3.0 schema |

**Excluded:** a hide as a ranking, demotion or suppression signal (by creator, tag, source), as RecommendationFeedback,
as an event, as a count, or visible to anyone but the hider (8א; FR-ALG-009 remainder and AC-064 → I15). Any future use
of `post_hides` beyond viewer-only eligibility — including AC-064 in I15 — is a new purpose and needs a recorded decision
(8א says "not a matching signal"); it is not implied by the stored row.

**Ranking:** no change. Hiding X removes X through RLS before scoring; no other unit's `(tier, score)` changes.
Re-ranking is computed per page over the remaining units, so the *displayed* order may legitimately differ from
"before minus X" when X took part in a cap or in share dedup (`packages/shared/src/feed/rerank.ts` keys dedup on
`sharedPostId ?? id`). c6 must assert the invariant, not an order that correct code does not produce (bug 1).

## c6 wording (replacement)

6. 🔴 [I+U] Not a ranking signal (8א): seeded config, fixed `asOf`. (i) For every unit other than X, the ranking key
   `(tier, score)` returned by the ranking statement is identical before and after A hides X, for A and for another viewer
   B; (ii) with a fixture where no diversity cap binds and no share of X exists, all units fit one page, A's list equals
   the before-list minus X (same ids, same order) and B's list is identical; (iii) with a share S of X on the page, S is
   no longer displaced by dedup after the hide (BR-065 original unavailable), and same-author / same-tag units keep their
   score. Static: F3.2 c2 still forbids `post_hides` in `feed*.ts`; `post_hides` appears only in the hide repository, which
   no feed module imports. No RecommendationFeedback row or table, no event; log output holds no post or user id.
