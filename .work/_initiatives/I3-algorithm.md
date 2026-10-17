# algorithm — I3 Community feed (FR-ALG-002 subset)

**Author:** ALGORITHM & DATA, 18.10.2026 · **Status:** blocks I3 until the Open items below are answered.
**Scope:** the Regular User feed of I3 (FR-FEED-001..007, FR-MOD-001 report action, FR-ALG-002 subset; roadmap I3 row).
Not in I3: Interest/Intent and the profile (FR-ALG-001, I15), Negative Feedback/Exploration (FR-ALG-009, I15), Groups
(I10), Follows and the Professional feed (FR-ALG-003, I11), Sponsored (FR-ALG-007, I13), DATA-001 in full (I15).
Rule-based, no ML/LLM (P-ALG-01, BR-049). Any learned component is a separate reserved decision (CLAUDE.md item 6).

## Purpose map

| Input | Purpose in I3 | Approved by |
|---|---|---|
| Viewer identity, account status (active) | eligibility only | P-ALG-02; §13.2 Account/Role; data-model rule 15 |
| Author account status (active, not suspended/banned, not in deletion grace) | eligibility only | BR-065; BR-073 (hidden from everyone in grace); BR-024 |
| Post `status` (active / hidden / removed / deleted) | eligibility only | BR-064, BR-065; §18.3 step 1 "active status" |
| Post audience ("friends only" / "everyone") | eligibility only | FR-FEED-002, OP-033 |
| Friendship (viewer ↔ named author, accepted, both active) | eligibility (friends-only posts) and the Social component of the score | FR-REL-001; §13.2 Social Graph "Feed candidates, social relevance"; §18.2 Regular Social |
| Anonymity flag | eligibility path + exclusion from every social computation | FR-FEED-005 rule 3, BR-062, AC-076 |
| `created_at` | Freshness, snapshot bound, tie-break | FR-ALG-002 "Freshness"; §18.3 step 3 |
| Count of Likes and Comments by users other than the author (counts only, never who) | Quality component | FR-ALG-002 "engagement/quality signals"; §18.2 Regular Explicit "Like/Reaction, Comment/Reply → Organic Ranking" |
| Viewer's derived Stage label (from own JourneyContexts; never DOB, name or child id) | Stage component — **inactive until DR-2** | FR-FEED-004, BR-050, P-ALG-04; §13.2 Child/Journey "algorithms through derived Stage" |
| Content Stage metadata on the post | Stage component — **inactive until DR-2** | ContentMetadata (§13); FR-FEED-004 input |
| Share reference (original post id) | duplicate suppression in re-ranking; the original is re-checked per viewer | FR-FEED-006, BR-065, BR-066, VAL-038 |
| AlgorithmConfiguration (active version) | weights, caps, decay, page size | P-ALG-07, BR-059, §13 AlgorithmConfiguration |

## Excluded

| Input | Rule that excludes it |
|---|---|
| Real author of an anonymous post — for scoring, diversity, dedup or any join | FR-FEED-005 rule 3, BR-062, AC-076; data-model rule 20 (not readable). Each anonymous post is its own creator for diversity |
| Impressions, opens, dwell, scroll depth, share-link clicks | no consumer in I3 (I15 owns ALG-001/DATA-001); §13.4 event retention is TBD → DR-3 |
| Interest/Intent profile, search data | FR-ALG-001 (I15), FR-ALG-008 (I7); not built |
| Not Interested / Hide / Show Less | FR-ALG-009 (I15); RecommendationFeedback is an I15 entity |
| Report count or report existence (for others' feeds) | BR-074: 3+ reports raise priority, never hide automatically; §18.2 "reports primarily moderation". Reporter's own view → DR-4 |
| ChatBlock | BR-011: messaging only, not a global block |
| Chat or Support content | BR-052, AC-067, §13.2 Chat Content |
| Tracker data, child DOB/names/sex, pregnancy details | BR-053, §13.2 Tracker/Child; FR-ALG-004 is Guidance (I6), not the feed |
| Author's own JourneyContext/Stage as a post label | not approved for this purpose; inference risk on anonymous posts → DR-2 |
| Mutual-friend counts, friends-of-friends | not an approved I3 signal; boosting a non-Friend by graph proximity reveals the graph (§13.2 "do not expose the full graph") |
| Viewer or author sex, age, Profile Visibility (as a score input) | no approved ranking purpose (§13.2 Regular Profile) |
| Paid/sponsored anything | no Sponsored in I3; the organic score has no paid input (P-ALG-05, AC-062) |
| Medical-hotline taps | decision 2026-10-16 "seven open details" (4): taps are not recorded |

## Pipeline

1. **Eligibility (database, RLS).** The feed query runs as the verified viewer under `authenticated`; RLS returns only
   rows the viewer may see. App code adds **no** permission filter (CLAUDE.md; data-model "The policy is the authorization
   model"). The policies must express: viewer active (rule 15) · post active · author active and not in deletion grace ·
   audience = everyone, or friends-only and an accepted Friendship with both sides active, or author = viewer · anonymous
   posts reachable only through the everyone path, never through Friendship (FR-FEED-005 r.3) · from I5: any image not yet
   passed the server check is invisible to others (BR-076). DATA ARCHITECT owns the policy shape; pgTAP proves each line.
2. **Candidate generation.** One organic pool: own posts · Friends' posts (both audiences) · everyone-audience posts of
   any active Regular author, anonymous included · shares (a share is a Post of the sharer; its original is loaded per
   viewer, BR-065). Snapshot bound: `created_at ≤ asOf`. No Professional, Group or paid units in I3.
3. **Scoring (deterministic).** For posts with age ≤ `scoredWindowDays` (tier 0):
   `score = wFresh·2^(−ageHours/halfLifeHours) + wFriend·[named author is viewer's Friend] + wQuality·min(ln(1+n)/ln(1+qualityCap), 1) + wStage·stageMatch`
   where `ageHours` is measured from `asOf` (not now) and `n` = Likes + Comments by non-authors created ≤ `asOf`
   (the author's own comments on an anonymous post carry the "המחבר" flag and are excluded without reading the author).
   Anonymous posts: the Friend term is 0 by construction. Older posts (tier 1) follow in pure recency.
   Order key: `(tier asc, score desc, created_at desc, id desc)`. Score is computed in the query over RLS output.
4. **Re-ranking.** Applied per page, over eligible units only: (a) creator diversity — at most `maxSameCreatorInWindow`
   units by one named creator in any `diversityWindow` consecutive units; (b) source diversity — at most
   `maxAnonymousInWindow` anonymous units per window (uses the flag only); (c) one unit per original post per page
   (original vs its shares; BR-066 keeps chains flat). Displaced units move down, never out. No exploration slot in I3
   (exploration needs ALG-009; the everyone pool already gives non-Friend exposure).
5. **Delivery.** Units labelled `organic`; response carries `configVersion` and an opaque cursor. Shares whose original
   is unavailable show "הפוסט המקורי כבר לא זמין" with no original content (BR-065, AC-081).
6. **Pagination stability.** First page fixes `asOf` and `configVersion`; the cursor carries `(asOf, configVersion,
   tier, score, created_at, id)`, Zod-validated on input. Every input to the score is bounded by `asOf`, so pages do not
   reorder. A post deleted, removed or made ineligible after `asOf` simply drops out (RLS); an unlike can shift one unit
   across a page edge — the client de-duplicates by unit id. Refresh (MVP polling) starts a new snapshot. If the pinned
   configVersion is no longer valid, the next page starts a new snapshot from the top (no mixed versions in one list).

## Configuration

One AlgorithmConfiguration row per version, surface `regular_feed`, append-only, one active; validated by a shared Zod
schema (ranges below). Before/after is the previous row; every row has `version`, `createdAt`, `createdBy`, `reason`.

| Key | Default | Allowed range |
|---|---|---|
| `wFresh` | 1.0 | 0–5 |
| `halfLifeHours` | 24 | 1–336 |
| `wFriend` | 0.5 | 0–5 |
| `wQuality` | 0.2 | 0–2 |
| `qualityCap` | 20 | 1–1000 |
| `wStage` | **0** (inactive until DR-2) | 0–2 |
| `scoredWindowDays` | 14 | 1–90 |
| `maxSameCreatorInWindow` / `diversityWindow` | 2 / 5 | 1–window / 3–20 |
| `maxAnonymousInWindow` | 2 (per `diversityWindow`) | 1–window |
| `pageSize` | 20 | 5–50 |

**Who may change it.** BR-059/AC-073: Admin only through ALGORITHM_AI_CONFIG with audit — that tool is not in the MVP
(AC-073 is in I15). Until then (DR-5): a new version only by migration, reviewed by ALGORITHM & DATA, through CI;
`authenticated` and `app_server` get SELECT on the active row and no write grant (DATA ARCHITECT).

## Events

**I3 adds no analytics events** unless Afik decides otherwise in DR-3. Reasons: nothing in I3 consumes them (I15 owns
ALG-001 and DATA-001); §13.4 says event retention must be set before production and it is TBD; no real users before
launch (decision 2026-10-17 "Initiative order", NFR-SEC-008). Likes, comments, shares and reports are product rows, not events.
If DR-3 opens events, the only allowed shape is §13.3 / FR-DATA-001 / AC-070: `eventId` (unique, idempotent),
`eventType`, `timestamp`, viewer id, `entityType`, `entityId`, `surface='regular_feed'`, `position`, `source='organic'`,
`configVersion`. **Never** in an event: post or comment text, share text, report free text, image data, a child's or
pregnancy detail, Stage or JourneyContext, Tracker data, the real author of an anonymous post, chat/support content
(FR-DATA-001, BR-052, BR-053, BR-062). Logging failure never blocks the feed or the action (AC-070, §18.8).

## Evaluation

**Before I3 closes (gate, by tests):** privacy guards at 0 — pgTAP: no anonymous author id in any feed row; no
friends-only post to a non-Friend; no post of a suspended/banned/grace author; no removed post · ordering fixtures:
deterministic expected orders for fixed seeds, Friend vs non-Friend, decay, quality cap, diversity caps, anonymous
Friend term = 0, share dedup · stability: no duplicate or skipped unit across pages under concurrent inserts after `asOf`.
**After launch (success + guards, never one proxy, §18.8):** success = share of eligible posts that receive a
meaningful interaction (a comment from a non-author) within 48 h, in total and for new creators (first 30 days).
Guards: report rate per 1,000 delivered posts · creator concentration (top 10% creators' share of interactions) ·
anonymous-post reply rate · empty-feed rate for users with no Friends. Measured from product rows in aggregate (BR-058)
until I15 events exist; by configVersion. No metric is reported per user.

## Fallbacks

| Case | Behaviour |
|---|---|
| Active config missing or fails Zod | last known good version (previous valid row); if none, the built-in `fallback-recency-v0` = wFresh 1, every other weight 0, same caps — pure recency, tested; the response carries that version; an error is reported without personal data |
| New user, no Friends | everyone pool + own posts, same scoring (Friend term 0) |
| Empty feed (no eligible post) | empty state with "write a post" / "find friends" (copy: SPEC); never fill with ineligible or paid units |
| Viewer has no Stage | Stage component absent (FR-FEED-004 "continues without Stage") |
| Original of a share unavailable | the share stays, original replaced by the unavailable state (BR-065) |

## Open — decision requests

- **DR-1 Anonymous + "friends only"** (owner: Afik — privacy). A friends-only anonymous post reaches only the author's
  Friends, which uses the author's graph (forbidden, FR-FEED-005 r.3) and tells each reader "the author is one of my Friends".
  Options: (a) an anonymous post is always "everyone" — the audience picker is hidden when anonymous is chosen;
  (b) allow it. **Recommend (a):** (b) contradicts FR-FEED-005 r.3 and narrows the author to a small set.
- **DR-2 Where a post's Stage comes from** (owner: Afik — minors' data/privacy). FR-FEED-004 (I3) needs content Stage
  metadata; FR-FEED-002 defines no such field. Options: (a) optional Stage tag the author picks in the composer;
  (b) derived from the author's JourneyContexts; (c) no Stage in the I3 feed, FR-FEED-004 moves to I15. **Recommend (a):**
  explicit and chosen, uses no child data; (b) puts children's data on every post and is a quasi-identifier on anonymous posts.
- **DR-3 Analytics events in I3** (owner: Afik — privacy, §13.4 retention TBD). FR-FEED-001/004 post-conditions say
  impressions are recorded; FR-FEED-007 says the share-link event is recorded. Options: (a) none in I3, these
  post-conditions move to I15 with DATA-001; (b) minimal events per **Events** now, with a retention period Afik sets.
  **Recommend (a):** no consumer before I15 and no real users before launch; collecting now is purpose creep.
- **DR-4 Reporter's own feed** (owner: Afik — report/community policy). SRS silent. Options: (a) a post the viewer
  reported is hidden from that viewer only; (b) unchanged. **Recommend (a):** expected after reporting, affects no one
  else, BR-074 untouched.
- **DR-5 AC-060 and config authority in the MVP** (owner: ORCHESTRATOR — unreserved planning). AC-060 (roadmap: I3) names
  Interest/Intent, Group/Follow and (via P-ALG-06) Negative Feedback, which are I10/I11/I15. Recommend: AC-060 passes in I3
  for Eligibility-first, Social (Friends), Freshness, Quality, Diversity and no ML; the rest is asserted in the owning
  Initiative · config changes by reviewed migration until the I15 admin tool (BR-059). Reason: keeps the roadmap, and every
  clause stays testable where its data exists.
