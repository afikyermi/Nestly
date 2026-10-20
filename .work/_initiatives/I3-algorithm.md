# algorithm — I3 Community feed (FR-ALG-002 subset)

**Author:** ALGORITHM & DATA, 18.10.2026 · **Revised** 18.10.2026 (own review findings 4–9, `.work/feed-groundwork/algorithm-review.md`;
Afik's final decisions of 18.10 on reported comments/users and on "restricted" profiles, relayed by ORCHESTRATOR) · 18.10.2026
(F3.2a2 review low 4, `.work/feed-view/findings-a2.md`: Pipeline 6 lists the score inputs not bounded by `asOf`; DR-6 decided) ·
19.10.2026 (F3.3 review finding 5, `.work/comments-likes/algorithm-review.md`: displayed counts and the viewer's own like-state
added to the purpose map; display and like-state statements added beside the ranking allow-list) · 19.10.2026 (F3.3 b1 CRITIC
open item, `.work/comments-likes/findings-b1.md`: comment-thread `isMine` may read the caller's own `post_authors` row; section
"Comment-thread statement" added) · 19.10.2026 (professional-posting, `.work/professional-posting/algorithm-review.md` R1–R5;
Afik's professional-posting DR-1..DR-3 of 19.10: a Professional viewer reads the feed on the **content profile**, Professional
authors' `everyone` posts are candidates; Scope, Purpose map, Excluded, Pipeline 1–3 and 6, allow-list, Configuration,
Evaluation and Fallbacks revised).
**Status:** DR-1..DR-4 (incl. DR-4b) and DR-6 answered by Afik (`I3-questions.md` → "תשובות" and his 18.10 final decisions;
DR-6: 4א, 18.10), DR-5 decided by ORCHESTRATOR; professional-posting DR-1..DR-3 answered by Afik 19.10 (that spec's
"Decided"). Nothing open for Afik in this file.
**Scope:** the community feed of I3 — Regular Users on the **regular profile**, Professional Users on the **content profile**
(FR-FEED-001..007, FR-MOD-001 report action, FR-ALG-002 subset; AC-061 "content signals" only; roadmap I3 row).
Not in I3: Interest/Intent and the profile (FR-ALG-001, I15), Negative Feedback/Exploration (FR-ALG-009, I15; only "hide
this post" enters I3 as F3.9, answer 8א), Groups (I10), Follows and the Professional feed's profession/groups/follows
signals and a `professional_feed` surface (FR-ALG-003, AC-061, I11), Organic Professional matching (FR-ALG-005, Services;
never a feed input), Sponsored (FR-ALG-007, I13), DATA-001 in full (I15).
Rule-based, no ML/LLM (P-ALG-01, BR-049). Any learned component is a separate reserved decision (CLAUDE.md item 6).

## Purpose map

| Input | Purpose in I3 | Approved by |
|---|---|---|
| Viewer identity, account status (active) | eligibility only | P-ALG-02; §13.2 Account/Role; data-model rule 15 |
| Viewer `account_type` (read once by `classifyViewer` via `readOwnAccounts`) | choose the ranking profile (`regular` / `content`) and refuse Admin/Moderator; **never** a row filter, never a score input | AC-061; professional-posting DR-1 (Afik 19.10); that spec's c5 |
| Author account status (active, not suspended/banned, not in deletion grace) | eligibility only | BR-065; BR-073 (hidden from everyone in grace); BR-024 |
| Post `status` (active / hidden / removed / deleted) | eligibility only | BR-064, BR-065; §18.3 step 1 "active status" |
| Post audience ("friends only" / "everyone") | eligibility only | FR-FEED-002, OP-033; anonymous is always "everyone" (answer 6א) |
| Friendship (viewer ↔ named author, accepted, both active) | eligibility (friends-only posts) and the Social component of the score — **regular profile only** | FR-REL-001; §13.2 Social Graph "Feed candidates, social relevance"; §18.2 Regular Social |
| Anonymity flag | eligibility path + exclusion from every social computation | FR-FEED-005 rule 3, BR-062, AC-076 |
| `created_at` | Freshness, snapshot bound, tie-break | FR-ALG-002 "Freshness"; §18.3 step 3 |
| Count of Likes and Comments by active users other than the author (counts only, never who; precise `n` in **Pipeline** 3) | Quality component (both profiles) | FR-ALG-002 "engagement/quality signals"; AC-061 "content signals"; §18.2 Regular Explicit "Like/Reaction, Comment/Reply → Organic Ranking" |
| Displayed counts: `count(*)` of RLS-visible likes per post or comment and of RLS-visible comments + replies per post (author's own included, no `asOf`) | display only (`likeCount`, `commentCount` on cards, post page, comments); never ranking, never fed into `n` | FR-FEED-001 (like and comment on every card); F3.3 spec c11 |
| Viewer's own likes (`reaction_owners` rows RLS returns to the viewer) | the viewer's own like-state display only (`likedByMe`); **never ranking**, never display counts, never another viewer | FR-FEED-001; F3.3 spec c12; data-model rule 20 (owners readable by the owner only) |
| Viewer's own `post_authors` row (RLS returns only the caller's own) — for comments with `author_id` NULL | the caller's own `isMine` on comments in the comment thread only; **never ranking**, never any count, never another viewer (**Comment-thread statement** below) | FR-FEED-003 (delete own comment); data-model rule 20 (owner readable by the owner only); schema-b `comments.author_id` NULL only for the real author on their anonymous post |
| Viewer's derived Stage set (from own JourneyContexts; never DOB, name or child id), passed to the feed query as a bound parameter | Stage component — **regular profile only** | FR-FEED-004, BR-050, P-ALG-04; §13.2 Child/Journey "algorithms through derived Stage" |
| `posts.stage_tag` — the author's optional, explicitly chosen tag | Stage component — **regular profile only**; for any viewer also a display label | answer 5א (DR-2); FR-FEED-004 input |
| Viewer's own hides and own **post** reports | eligibility only, inside RLS; never read by the feed query | answers 8א (F3.9) and 7א (DR-4, posts only) |
| Share reference (original post id) | duplicate suppression in re-ranking; the original is re-checked per viewer | FR-FEED-006, BR-065, BR-066, VAL-038; only "everyone" posts are shareable (answer 2א) |
| AlgorithmConfiguration (pinned or active version) | weights, caps, decay, page size | P-ALG-07, BR-059, §13 AlgorithmConfiguration |

## Excluded

| Input | Rule that excludes it |
|---|---|
| Real author of an anonymous post — for scoring, diversity, dedup or any join | FR-FEED-005 rule 3, BR-062, AC-076; data-model rule 20 (not readable). Each anonymous post is its own creator for diversity. Sole exception: the caller's **own** `post_authors` row for their own `isMine` in the comment thread (**Comment-thread statement**) |
| For a Professional viewer (content profile): `friendships` (any read, any term), `journey_contexts` / `readOwnStages`, `posts.stage_tag` as an order, score or keyset input, `children`, tracker data | AC-061; FR-ALG-003 (no Child/Journey/Tracker data); R1–R2 of `.work/professional-posting/algorithm-review.md`. `stage_tag` stays a display field |
| Author `account_type` — for eligibility, score, diversity or any join | R4: a Professional author's Friend term is 0 by data (`friendships` FKs → `regular_profiles`, BR-029) and Stage term 0 by the DB refusal of their `stage_tag` (professional-posting D2); no special case |
| Profession, ServiceCategory, Follows, Group membership, Professional rating/quality signals | AC-061 profession/groups/follows and FR-ALG-003 are I11; FR-ALG-005 is Services matching, not the feed |
| Impressions, opens, dwell, scroll depth, share-link clicks | answer 4א (DR-3): no usage events in I3; FR-FEED-001/004/007 event post-conditions move to I15 with DATA-001 |
| Interest/Intent profile, search data | FR-ALG-001 (I15), FR-ALG-008 (I7); not built |
| Not Interested / Show Less, and a hide as a ranking signal | FR-ALG-009 (I15). "Hide this post" (F3.9) acts only as viewer-only eligibility in RLS and is never a signal (answer 8א) |
| Report count or report existence (for others' feeds) | BR-074: 3+ reports raise priority, never hide automatically; §18.2 "reports primarily moderation". Reporter's own view: a reported post is hidden from the reporter only (7א); a reported comment or user stays visible to everyone, the reporter included (Afik, 18.10) |
| ChatBlock | BR-011: messaging only, not a global block |
| Chat or Support content | BR-052, AC-067, §13.2 Chat Content |
| Tracker data, child DOB/names/sex, pregnancy details | BR-053, §13.2 Tracker/Child; FR-ALG-004 is Guidance (I6), not the feed |
| Author's own JourneyContext/Stage as a post label | answer 5א: no automatic tagging from the profile; inference risk on anonymous posts |
| Mutual-friend counts, friends-of-friends | not an approved I3 signal; boosting a non-Friend by graph proximity reveals the graph (§13.2 "do not expose the full graph") |
| Author's Profile Visibility (open / restricted) — for eligibility, audience, sharing or score | Afik, 18.10: "restricted" limits only viewing the profile page and has no relation to posts; `author_visibility` is dropped from posts (DATA ARCHITECT) |
| Viewer or author sex, age, any other profile field (as a score input) | no approved ranking purpose (§13.2 Regular Profile) |
| Likes on comments — as a ranking input | not a post-quality signal in I3; a comment's like is about the comment (shown only as that comment's displayed `likeCount`) |
| Viewer's own likes / `reaction_owners` — as a ranking input, in display counts, or for anyone but the owner | purpose limited to own like-state (purpose map); who liked is never shown (F3.3 out of scope "who liked") |
| `post_authors` — as a ranking input, in any count (`n`, `likeCount`, `commentCount`, `replyCount`), in any filter/order/keyset, or for anyone but the owner | purpose limited to the caller's own comment `isMine` (purpose map) |
| Paid/sponsored anything | no Sponsored in I3; the organic score has no paid input (P-ALG-05, AC-062) |
| Medical-hotline taps | decision 2026-10-16 "seven open details" (4): taps are not recorded |

## Pipeline

1. **Eligibility (database, RLS).** The feed query runs as the verified viewer under `authenticated`; RLS returns only
   rows the viewer may see. App code adds **no** permission filter (CLAUDE.md; data-model "The policy is the authorization
   model"). The policies must express: viewer active (rule 15) · post active · author active and not in deletion grace ·
   audience = everyone, or friends-only and an accepted Friendship with both sides active, or author = viewer · anonymous
   posts reachable only through the everyone path, never through Friendship (FR-FEED-005 r.3; 6א makes friends-only
   anonymous impossible) · not hidden by the viewer (8א) · not reported by the viewer (7א, posts only) · from I5: any image
   not yet passed the server check is invisible to others (BR-076). The author's Profile Visibility plays no part (Afik,
   18.10). Comments carry no reporter clause: a reported comment stays visible to its reporter. An active **Professional
   viewer** is admitted exactly as a Regular non-friend — own posts + `everyone` posts (data-model rule 5; professional-posting
   N4, R1); `friendships` read policies are **not** extended to Professionals. No app predicate on audience, author type or
   `account_type` in any feed SQL. DATA ARCHITECT owns the policy shape; pgTAP proves each line.
2. **Candidate generation.** One organic pool: own posts · Friends' posts (both audiences; empty for a Professional viewer)
   · everyone-audience posts of any active Regular **or Professional** author, anonymous included (a Professional author's
   posts are named, `everyone` and untagged only — professional-posting N1/N2, AC-076), whatever their Profile Visibility ·
   shares (a share is a Post of the sharer; its original is loaded per viewer, BR-065). Snapshot bound: `created_at ≤ asOf`.
   No Group or paid units in I3.
3. **Scoring (deterministic).** For posts with age ≤ `scoredWindowDays` (tier 0), **regular profile**:
   `score = wFresh·2^(−ageHours/halfLifeHours) + wFriend·[named author is viewer's Friend] + wQuality·min(ln(1+n)/ln(1+qualityCap), 1) + wStage·stageMatch`
   - **Profiles (R2).** The viewer's `account_type`, read once by `classifyViewer`, selects the profile. **content**
     (Professional viewer) = the formula with the Friend and Stage terms **omitted, not multiplied by 0**:
     `score = wFresh·2^(−ageHours/halfLifeHours) + wQuality·min(ln(1+n)/ln(1+qualityCap), 1)` (tier 1: 0), with the same
     float8 typing, `n`, `asOf` bound, tier, order key and keyset. Its ranking SQL references no `friendships`,
     `stage_tag`, Stage array parameter or `auth.uid()`; `readOwnStages` is **not called**, whatever `wStage` is. The
     regular profile's ranking SQL stays byte-identical to F3.2's. The shared reference `scorePost` carries both profiles.
   - **Professional authors (R4).** No special case and no read of the author's account type: the Friend term is 0 by
     data (`friendships` FKs → `regular_profiles`, BR-029), the Stage term 0 by the DB refusal of their `stage_tag`. A
     Professional's posts count as one named creator for diversity, like any named author.
   - `ageHours` = `extract(epoch from (asOf − created_at)) / 3600`, measured from `asOf` (not now).
   - **`n`, precisely** = (a) Likes on **the post itself** (`reactions.post_id = post.id`; likes on its comments do not
     count) with `is_by_author = false` and `created_at ≤ asOf`, **plus** (b) Comments on the post, **top-level and replies**,
     with `is_by_post_author = false` and `created_at ≤ asOf`. Both are counted over **RLS-visible rows only**, which means:
     comment `status = 'active'` and commenter active; like whose liker is **active** — only active accounts' likes and
     comments count. The liker part depends on DATA ARCHITECT's change (likes carry liker status without identity,
     `liker_status = 'active'` in `reactions_select_reader`); F3.2 does not pass review before it is merged. The author is
     excluded by the trigger-set flags alone (named author and the anonymous "המחבר" alike), never by reading the author.
     Counts only: no join reveals who liked or commented. Reports never change `n`. **Professional engagement (R5)**
     counts like any active user's; on their own post the triggers' `author_id = uid` test sets `is_by_author` /
     `is_by_post_author` = true, so it never enters `n`; a stopped Professional's likes and comments leave `n` (status
     copies). pgTAP proves it (professional-posting c7).
   - `stageMatch` = 1 when `posts.stage_tag` is set and is in the viewer's derived Stage set (bound parameter), else 0.
     A viewer with no Stage or a post with no tag gives 0.
   - Anonymous posts: the Friend term is 0 by construction. Older posts (tier 1) follow in pure recency with `score = 0`.
   - **Numeric type.** The whole expression is evaluated in **`double precision`** (weights cast `::float8`; `power`,
     `ln` and the division in float8). Never `numeric`: a numeric score would not survive the JS round trip and the keyset
     would skip or repeat units. The query returns score as float8 and the driver maps it to a JS `number` (no string mapping).
   Order key: `(tier asc, score desc, created_at desc, id desc)`. Score is computed in the query over RLS output.
4. **Re-ranking.** Applied per page, over eligible units only, identical for both profiles: (a) creator diversity — at most
   `maxSameCreatorInWindow` units by one named creator in any `diversityWindow` consecutive units; (b) source diversity — at
   most `maxAnonymousInWindow` anonymous units per window (uses the flag only); (c) one unit per original post per page
   (original vs its shares; BR-066 keeps chains flat). Displaced units move down, never out. No exploration slot in I3
   (exploration needs ALG-009; the everyone pool already gives non-Friend exposure).
5. **Delivery.** Units labelled `organic`; response carries `configVersion` and an opaque cursor. Shares whose original
   is unavailable show "הפוסט המקורי כבר לא זמין" with no original content (BR-065, AC-081).
6. **Pagination stability.** First page fixes `asOf` and `configVersion`; the cursor carries `(asOf, configVersion,
   tier, score, created_at, id)`, Zod-validated on input: `score` is a JS `number` (`z.number().finite()`), passed back to the
   query as a float8 parameter and compared with the same float8 expression — PostgreSQL's shortest-exact float8 output and
   the IEEE double of JS make the round trip exact. `asOf` and `created_at` travel as ISO text with full microseconds, never
   through a JS `Date` (millisecond precision would break the keyset). `configVersion` is an integer ≥ 0 (0 =
   `fallback-recency-v0`). Bounded by `asOf`: the candidate set (`created_at ≤ asOf`), `ageHours` and the Likes/Comments
   in `n`. **Not** bounded by `asOf` — accepted limitations (F3.2a2 review, low 4): (i) **Friendship** — a friendship
   accepted or removed between pages flips the Friend term (and, for friends-only posts, eligibility through RLS) on
   later pages; (ii) **the viewer's Stage set**, when `wStage > 0` — it is re-derived per page from the viewer's current
   JourneyContexts, so a Stage added or removed between pages flips `stageMatch`; (iii) an unlike, a comment removed or
   a liker/commenter suspended after `asOf` lowers `n` (RLS hides the row; `created_at ≤ asOf` cannot restore it); (iv) a
   post deleted, removed or made ineligible after `asOf` drops out (RLS). (i) and (ii) do not arise on the content
   profile (no Friend or Stage input). Each can move a unit across a page edge: the
   client de-duplicates by unit id, so a repeat is never shown twice, but a unit whose score rose above the cursor can
   be **skipped** until the next refresh. Accepted because these are rare, viewer-driven or moderation events, binding
   them to `asOf` would need history tables (friendship and Stage as-of) for little gain, and a refresh restores the full
   list. Refresh (MVP polling) starts a new snapshot. Later pages read the pinned version by
   `(surface, version)` — still readable after a newer version becomes active; if that row is missing or fails Zod, the
   next page starts a new snapshot from the top (no mixed versions in one list).

### Feed-query allow-list (checked in F3.2's review)

The ranking query (candidates, score, order, keyset) may reference **only**:

| Source | Allowed columns / use |
|---|---|
| `posts` | `id`, `author_id` (Friend term, creator diversity), `is_anonymous`, `is_share`, `shared_post_id` (dedup), `stage_tag` (regular profile only), `created_at` |
| `friendships` | the accepted-friendship test between the viewer and a named `author_id`, for the Friend term only — regular profile only |
| `comments` | `count(*)` per `post_id` with `is_by_post_author = false` and `created_at ≤ asOf` |
| `reactions` | `count(*)` per `post_id` with `is_by_author = false` and `created_at ≤ asOf` |
| `algorithm_configurations` | the row for `surface = 'regular_feed'` and the pinned/active `version` |
| Bound parameters | `asOf`, the cursor tuple, the viewer's derived Stage set (regular profile only), the configuration values; viewer identity only through the identity transaction (`auth.uid()`; regular profile only) |

**Content profile** (R2): this allow-list minus `friendships`, `stage_tag`, the Stage parameter and `auth.uid()`; no
array parameter. A static test proves it on the rendered SQL with `wFriend`, `wStage` > 0 (professional-posting c14).
Display columns (body, audience label, author display data, the share's original) are fetched for the page's ids after
ordering, under the same RLS, and never influence order.
**Forbidden in the feed SQL** (a reference is a FINDING, high): `post_hides`, `reports`, `post_authors`, `reaction_owners`,
`journey_contexts` (the viewer's Stage is derived by a separate own-data read and bound as a parameter), any predicate on
`status`, `author_status`, `liker_status` or `is_active_account()` (RLS already applies them; an app copy is a permission
filter), `author_visibility` / Profile Visibility in any role (filter, eligibility or score — Afik 18.10; the column is
being dropped from posts), `account_type` or the accounts table in any role (the profile is chosen in the service by
`classifyViewer`), any other profile field as a score input, `held_*` columns, chat/support/tracker/child tables,
and any table or column not in the allow-list above.

### Display statement and like-state statement (F3.3; checked in its review)

Three statements per page, separate and run in **one transaction at REPEATABLE READ** (so `likeCount ≥` the viewer's own
like when `likedByMe` is true): (1) the ranking query above, unchanged; (2) the display statement; (3) the like-state
statement. None feeds another's order, cursor or score; `n` and the displayed counts differ and never feed each other.

**Display statement** — besides the display columns above, it may add only:

| Source | Allowed use |
|---|---|
| `reactions` | `count(*)` grouped by `post_id` or `comment_id`, for the page's post ids or the thread's comment ids → `likeCount` |
| `comments` | `count(*)` grouped by `post_id` → `commentCount` (top-level + replies the thread renders; a reply only when its parent row is RLS-visible) |

Over RLS-visible rows only; author's own included; **no** predicate on `status`, `author_status`, `liker_status`,
`is_by_author`, `is_by_post_author`, `created_at` / `asOf`, and no `user_id` or any column that identifies a liker or
commenter. `reaction_owners` is **forbidden** here (FINDING, high).

**Like-state statement (`likedByMe`)** — the only statement that may read `reaction_owners`, exactly:
`select target_id from reaction_owners where target_id = any($pageIds)` — no `user_id = …` predicate (RLS already limits
the rows to the viewer's own; an app copy is a forbidden permission filter), no join to any other table, no count, no
aggregation. Its result sets only `likedByMe` for the viewer and is never passed to the ranking or display statement.
`reaction_owners` stays **forbidden in the ranking and display statements**; a reference there is a FINDING, high.
Responses never emit `user_id` or `is_by_author`.

### Comment-thread statement — `isMine` (F3.3 b1; decided 19.10.2026, `.work/comments-likes/findings-b1.md` Open)

**Allowed.** The comment-thread statements (`apps/server/src/repositories/comments-repository.ts` `selectComments`, used
by the single-comment read, the top-level page, the replies read and the replies page) are the **only** application
statements that may read `post_authors`, and only as this select-list expression:
`case when c.author_id is null then exists (select 1 from nestly.post_authors pa where pa.post_id = c.post_id and
pa.author_id = (select auth.uid())) else c.author_id = (select auth.uid()) end` → `isMine`.

Why: the purpose is the caller's own authorship shown to that caller only (FR-FEED-003 delete own comment; data-model
rule 20, the owner row is readable by its owner only — `post_authors_select_author`). `comments.author_id` is NULL only
for the real author on their anonymous post (CHECK `author_id is not null or is_by_post_author`, schema-b), so the
expression mirrors the database's own ownership test and tells the caller nothing they do not already know. For any
other caller the EXISTS is false (RLS returns no row), which equals a named comment that is not theirs — no oracle.

Conditions (each a FINDING, high, if broken): (a) select list only, a boolean scalar EXISTS per row — no join, no count,
no `post_authors` column read beyond the test or emitted; (b) no `where`, `order by`, keyset, limit or grouping depends
on it or on `post_authors`; (c) no `pa.author_id = …` copy as a permission filter anywhere else — the test names the
caller's own row and RLS already limits rows to it; (d) `isMine` is per caller, never cached, shared or returned to
another viewer, and the response never emits `author_id`; (e) never an input to ranking, `n`, `likeCount`,
`commentCount` or `replyCount`. `isMine` drives display only (delete control, own mark); deletion authority stays with
`delete_comment` / RLS.

**Still forbidden:** `post_authors` in the feed ranking query, the feed display statement, the like-state statement, and
**every count aggregate**. In particular **b2** (likes on comments, `likeCount`, `likedByMe` on comments) and the
`replyCount` / `commentCount` statements must not reference `post_authors` (FINDING, high). A static test asserts that
`post_authors` appears in the server repositories only inside this `isMine` expression.

## Configuration

One AlgorithmConfiguration row per version, surface `regular_feed`, append-only, one active; validated by a shared Zod
schema (ranges below). Stored versions are integers > 0; **`configVersion` 0 is reserved for the built-in
`fallback-recency-v0`** and is never stored. Before/after is the previous row; every row has `version`, `createdAt`,
`createdBy`, `reason`. All rows of the surface are readable (versioned constants, no personal data) — required by
pagination pinning and by the last-known-good fallback. Both profiles read the same surface and pinned/active version;
the content profile does not apply `wFriend` or `wStage`. No new row, key or surface in I3 (a `professional_feed` surface
is I11, FR-ALG-003).

| Key | Default | Allowed range |
|---|---|---|
| `wFresh` | 1.0 | 0–5 |
| `halfLifeHours` | 24 | 1–336 |
| `wFriend` | 0.5 (regular profile only) | 0–5 |
| `wQuality` | 0.2 | 0–2 |
| `qualityCap` | 20 | 1–1000 |
| `wStage` | **0** in v1 (no post carries a tag before F3.1); a later version may raise it; regular profile only | 0–2 |
| `scoredWindowDays` | 14 | 1–90 |
| `maxSameCreatorInWindow` / `diversityWindow` | 2 / 5 | 1–window / 3–20 |
| `maxAnonymousInWindow` | 2 (per `diversityWindow`) | 1–window |
| `pageSize` | 20 | 5–50 |

**Who may change it.** BR-059/AC-073: Admin only through ALGORITHM_AI_CONFIG with audit — that tool is not in the MVP
(AC-073 is in I15). Until then (DR-5, decided): a new version only by migration, reviewed by ALGORITHM & DATA, through CI.
The feed reads configuration as `authenticated`; no role has a write grant (grants and policy shape: DATA ARCHITECT).

## Events

**I3 adds no analytics events** (answer 4א, DR-3; unchanged for Professional viewers, professional-posting R6).
FR-FEED-001/004 impression and FR-FEED-007 share-link event
post-conditions move to I15 with DATA-001, where purpose, retention (§13.4 TBD) and user explanation are set. Likes,
comments, shares, hides and reports are product rows, not events.
For I15, the only allowed shape is §13.3 / FR-DATA-001 / AC-070: `eventId` (unique, idempotent),
`eventType`, `timestamp`, viewer id, `entityType`, `entityId`, `surface='regular_feed'`, `position`, `source='organic'`,
`configVersion`. **Never** in an event: post or comment text, share text, report free text, image data, a child's or
pregnancy detail, Stage or JourneyContext, Tracker data, the real author of an anonymous post, chat/support content
(FR-DATA-001, BR-052, BR-053, BR-062). Logging failure never blocks the feed or the action (AC-070, §18.8).

## Evaluation

**Before I3 closes (gate, by tests):** privacy guards at 0 — pgTAP: no anonymous author id in any feed row; no
friends-only post to a non-Friend; no post of a suspended/banned/grace author; no removed post; no post the viewer hid or
reported; no like or comment of a suspended/banned account in `n` · visibility guards: a comment or user the viewer
reported stays visible to that viewer; a "restricted" author's posts are eligible exactly as an "open" author's ·
ordering fixtures: deterministic expected orders for fixed seeds, Friend vs non-Friend, decay, quality cap, Stage match,
diversity caps, anonymous Friend term = 0, share dedup · stability: no duplicate or skipped unit across pages under
concurrent inserts after `asOf`, including scores that differ only in the last float8 bits · fallback: active row invalid →
previous valid version; none valid → version 0 · F3.3: ids, order, cursor and score identical before/after the display and
like-state statements are added; `likedByMe` false for the viewer when only another user liked; static test that
`reaction_owners` appears only in the like-state statement · F3.3 b1: `isMine` true for the real author on their own
anonymous-post "המחבר" comment and false for every other viewer of that comment; static test that `post_authors` appears
only in the `isMine` expression · professional-posting: a Professional's `everyone` post ranks exactly as a Regular
non-friend's untagged post of the same age and `n` (c4); content profile with `wFriend` = `wStage` = 2 equals the shared
reference, `readOwnStages` 0 calls, and at `wStage` = 0 a Professional and a Regular with no friends and no journey see
the same ids and order (c6); static: content SQL holds no `friendships`, `journey_contexts`, `children`, `stage_tag`,
`auth.uid` or array parameter, regular SQL unchanged (c14); no `account_type` in feed SQL or write gates (c5); pgTAP:
a Professional's likes/comments count in `n`, on their own post and once stopped they do not (c7).
**After launch (success + guards, never one proxy, §18.8):** success = share of eligible posts that receive a
meaningful interaction (a comment from a non-author) within 48 h, in total and for new creators (first 30 days).
Guards: report rate per 1,000 delivered posts · creator concentration (top 10% creators' share of interactions) ·
anonymous-post reply rate · empty-feed rate for users with no Friends. Measured from product rows in aggregate (BR-058)
until I15 events exist; by configVersion and profile. No metric is reported per user.

## Fallbacks

| Case | Behaviour |
|---|---|
| Active config missing or fails Zod | last known good = the highest-version row of the surface **below the active version** (or the highest row, if none is active) that passes Zod — readable because every row of the surface is readable; if none, the built-in `fallback-recency-v0` = `configVersion` 0: wFresh 1, every other weight 0, same caps and page size as the v1 defaults — pure recency, tested. The response and cursor carry the version actually used; an error is reported without personal data |
| Pinned version (cursor) missing or invalid | new snapshot from the top under the rule above |
| New user, no Friends | everyone pool + own posts, same scoring (Friend term 0) |
| Professional viewer | content profile under the same configuration and the same fallbacks; v0 orders both profiles alike (recency) |
| Empty feed (no eligible post) | empty state with "write a post" / "find friends" (copy: SPEC); never fill with ineligible or paid units |
| Viewer has no Stage | Stage component 0 (FR-FEED-004 "continues without Stage") |
| Original of a share unavailable | the share stays, original replaced by the unavailable state (BR-065) |

## Open — decision requests

- **DR-1 Anonymous + "friends only"** — **answered 6א (Afik, 18.10):** an anonymous post is always "everyone"; the
  audience picker disappears when anonymous is chosen (schema CHECK `posts_audience_check`).
- **DR-2 Where a post's Stage comes from** — **answered 5א (Afik, 18.10):** an optional Stage/topic tag the author chooses;
  no automatic tagging from the profile. Stage component active in the formula; v1 seeds `wStage` 0 until tags exist.
- **DR-3 Analytics events in I3** — **answered 4א (Afik, 18.10):** none in I3; the event post-conditions of FR-FEED-001,
  004 and 007 move to I15 with DATA-001.
- **DR-4 Reporter's own feed** — **answered 7א (Afik, 18.10) for posts:** a post the viewer reported disappears from that
  viewer's feed only (RLS); BR-074 untouched.
- **DR-4b Reporter's own view of a reported comment or user** — **answered (Afik, final decisions 18.10):** a reported
  comment or user stays visible to everyone, the reporter included; reporter-only hiding applies to posts only. Closed.
- **Profile Visibility and posts** — **decided (Afik, final decisions 18.10):** "restricted" limits only viewing the
  profile page; audience, feed eligibility and sharing of posts are unchanged, and `author_visibility` is dropped from
  posts (DATA ARCHITECT). Recorded here because it removes an input from the feed.
- **DR-5 AC-060 and config authority in the MVP** — **decided by ORCHESTRATOR** (unreserved; recorded in
  `I3-questions.md` → "לידיעה בלבד"): AC-060 passes in I3 for Eligibility-first, Social (Friends), Freshness, Quality,
  Diversity and no ML; every other clause is asserted in the Initiative that brings its data (I10, I11, I15). Config
  changes only by migration reviewed by ALGORITHM & DATA until the I15 admin tool (BR-059).
- **DR-6 Suspension correlation of anonymous posts** — **decided 4א (Afik, 18.10): option (a), accepted;** recorded in
  `security-privacy-open.md` as **S-34**. Closed. Background (from review finding 8): when an author is suspended,
  banned, enters deletion grace or is reactivated, their named **and** anonymous posts disappear or reappear in the same
  statement (BR-065, BR-073 require hiding both). Someone watching the feed at that moment can see an anonymous post
  vanish together with a named author's posts and link the two. Options were: (a) accept — it needs a watcher at the
  exact moment and one of rare moderation events; (b) keep anonymous posts of a suspended author visible — contradicts
  BR-065/BR-073 and leaves a sanctioned author's content up; (c) hide anonymous posts with a random delay — only blurs
  the link, adds a job and a window where sanctioned content stays visible. ALGORITHM & DATA recommended (a) with a
  revisit in I4 (moderation).
- **professional-posting DR-1..DR-3** — **answered (Afik, 19.10, final; `.work/professional-posting/spec.md` "Decided"):**
  Professionals read, comment, reply and like in I3 on the content profile, I11 adds profession/groups/follows; their
  posts are "everyone" only in I3 ("followers only" in I11, never "friends"); shown as "מהקהילה" with no name until I11.
  Closed. AC-061 passes in I3 for its "content signals" and no Child/Journey/Tracker clause; profession/groups/follows/
  search are asserted in I11 (same rule as DR-5).
