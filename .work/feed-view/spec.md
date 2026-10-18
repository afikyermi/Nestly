# feed-view (F3.2) — the community feed for a signed-in Regular user

**Problem**        A signed-in Regular user lands on a placeholder. Posts exist (F3.1) but nobody can read them; nothing proves an ineligible post or an
anonymous author's id never reaches a feed.
**Requirements**   FR-FEED-001, FR-FEED-004 (impression post-conditions move to I15, 4א) · FR-ALG-002, AC-060 subset (DR-5) · PG-008 · ERR-027 · BR-065 ·
FR-FEED-005 r.3 · `I3-algorithm.md` · Afik 5א–8א, 6ב and 18.10 (Restricted no effect on posts; reported post hidden from its reporter only).
**Scope**          Shared Zod (config, cursor, response). Server `GET /feed?cursor=`: config + last-good/`fallback-recency-v0`, viewer Stage read, ranking query under
RLS, re-ranking, snapshot cursor. Web: FeedPage as Regular landing (F3.1 composer button stays), cards (named, share, anonymous), infinite scroll, states.
**Out of scope**   Likes, comments, counts (F3.3) · share and share-link (F3.5/6) · report (F3.7) · hide (F3.9): **no action row** (c15) · anonymous toggle, "המחבר",
composer, any anonymous display beyond c16 (F3.4) · profile links · Professional feed/landing (I11) · images · search · notifications · analytics events (4א) ·
polling or "new posts" banner · ML · config admin tool (I15) · "not interested" · edit/delete on cards.
**Data touched**   No schema change in F3.2. Reads `posts` (listed columns), `friendships`, `comments`/`reactions` (counts), `algorithm_configurations`, `regular_names` (display,
under RLS), own `journey_contexts` (`stage` only, separate read). Writes none. The `regular_names` policy of 6ב is DATA ARCHITECT's schema PR (see Dependencies).
**Risk flags**     auth/authz · personal data → **Elevated** (+ ALGORITHM & DATA review).

**Acceptance criteria** (U unit · I integration on real DB under RLS · E e2e; parts a1, a2, b: see Size)
1. 🔴 [I a2] Eligibility is RLS only. Absent for one viewer: author suspended/banned/in grace; post removed/deleted/held; post the viewer hid or reported; friends-only post of a
   non-friend or pending friend; suspended viewer gets none. Present: own, friend's friends-only, stranger's `everyone`, `restricted` author's `everyone`. Others still see hidden/reported ones.
2. 🔴 [U a2] Static test of the ranking SQL **and the display statement**: only the allow-list of I3-algorithm.md (display adds `body`, `audience`, `regular_names`, the original's fields of c12); any
   `post_hides`, `reports`, `post_authors`, `reaction_owners`, `journey_contexts`, `held_*`, `author_visibility`, predicate on `status`/`author_status`/`liker_status`, `is_active_account()`
   or `select *` fails; runs as `authenticated`; the display fetch is a separate statement by page ids and cannot change order.
3. 🟡 [I a2] Seeded v1, fixed `asOf`, exact id lists: friend's post above an equal stranger's; a 24 h older post has half the freshness term; quality caps (n=20 equals n=200); age ≤ 14 days
   is tier 0, older follows all of tier 0 by `created_at desc, id desc`; an anonymous post by a viewer's friend gets Friend term 0; equal scores tie-break `created_at desc, id desc`.
4. 🟡 [U a1, I a2] Stage is a signal, never a filter. Seed `wStage` 0: a `pregnant` viewer gets identical order and set whether posts are tagged `pregnant`, `has_child` or not at all, and
   no journey query runs. Injected `wStage` 1 (pure scorer): `stageMatch` 1 only if the tag is in the viewer's set, else 0 (no tag, no Stage, other tag); other-tag posts stay in the result.
5. 🔴 [I a2] `n` = likes (not `is_by_author`) + comments and replies (not `is_by_post_author`), `created_at ≤ asOf`, RLS-visible. Not counted: comment likes, the author's own, suspended/banned
   accounts' rows, rows after `asOf`, reports, a reply under a held/hidden parent (accepted limitation: the commenter's own-branch quirk may still show such a reply to its writer). No count, score or identity in the response. Weights `::float8`.
6. 🔴 [U a1, I a2] Cursor Zod, opaque not secret: `score` finite number (not string); `asOf`/`created_at` text from `to_char(x AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, exactly 6 fractional
   digits (3 rejected); `configVersion` integer ≥ 0; `tier` 0|1; uuid id. Structurally invalid, extra-key or out-of-range cursor → 400 `cursor_invalid`, no ranking query; `asOf` later than DB `now()` is checked in the DB → same 400.
7. 🔴 [I a2] Timestamps come from the DB: `asOf` is DB `now()`, both formatted as in c6, never via JS `Date`. Fixtures with µs `.000000` and `.120000` keep order and survive the cursor.
   3 pages, posts inserted after `asOf` and one post deleted between pages: no repeat, none skipped among those still eligible; scores differing in the last float8 bits keep order; last page
   `nextCursor` null. Other shifts (unlike, status change) are an accepted limitation; the client deduplicates.
8. 🟡 [U a1] Re-ranking, pure, per page, caps and window from config, in order: (1) group by `coalesce(shared_post_id, id)`, keep the first-ranked unit per group (two shares of one original are one group; rest suppressed);
   (2) greedy: for each slot take the highest-ranked remaining unit that breaks no cap (≤ `maxSameCreatorInWindow` units of one named creator, ≤ `maxAnonymousInWindow` anonymous, in any `diversityWindow`
   consecutive units), else the highest-ranked (the tail may break caps); each anonymous post is its own creator; none dropped except by (1). Fixtures: satisfiable, impossible (one creator) → order unchanged, none lost; deterministic.
9. 🔴 [U a1, I a2] **`nextCursor` is built from the last unit of the fetched set in ranked order, before re-ranking, suppressed units included** (pageSize+1 fetched to know there is more). Fixtures where
   the last ranked unit is displaced to mid-page and where it is suppressed: next page repeats and skips nothing.
10. 🟡 [U a1, I a2] Config as a pure function, tested: seeded v1 → `configVersion` 1; no active row → highest valid version; active row fails Zod → highest valid version **below the active one**; none valid → built-in 0
    (wFresh 1, other weights 0, v1 caps and page size); pinned version invalid or missing → new page one, `restarted:true`; fallback log holds version and error class; `pageSize` Zod range 5–50.
11. 🟡 [I a2] Cold start (ERR-027): no friends → `everyone` pool plus own posts, Friend term 0, 200. No eligible post → 200 `{items:[],nextCursor:null,configVersion}`, never an error.
    Logs of any failure hold no cursor text and no post id (test on the log output).
12. 🔴 [U a1, I a2] No token → 401; Professional → 403 `not_allowed`; suspended → 403; none returns post data. A cursor from another viewer grants nothing (eligibility recomputed per request).
    Unit, strict Zod: `{id, kind:'post'|'share', source:'organic', body, audience, stageTag, createdAt, isMine, isAnonymous, author:{name|null}}`; `author.name` is whatever `regular_names` returns under RLS (6ב: the full name,
    also to a non-friend reader), else null; `isMine` false for every anonymous unit. Shares add `sharerText` and `original:{available:true, id, body, audience, createdAt, isAnonymous, author?:{name|null}}` (no `author` key
    when anonymous) or `{available:false}`, nothing else. No `authorId`, `score`, `tier`, `isFriend`, count; an anonymous unit has no `author` key; the real id is absent.
13. 🎨 [E b] A Regular user on the landing route sees `main`, heading "הפיד", "כתיבת פוסט" (F3.1) and cards in server order; a Professional still sees the placeholder; AppShell unchanged;
    the only request is `GET /feed` (no analytics call).
14. 🎨 [U b] Card: `article` in `role="feed"` (`aria-posinset`, `aria-setsize="-1"`, labelled); author name, or "חבר/ת בקהילה" when `name` is null; `<time datetime>` as the only link, to `/posts/:id`;
    audience "כולם"/"חברים בלבד"; stage tag text if set; body as plain text with line breaks (`<script>` shows as text); `dir="auto"`; axe 0 at 375 px; visible focus.
15. 🎨 [U b] No like/comment/share control, no counts, no disabled placeholder (tokens.md: disabled only when no alternative; a dead control misleads screen readers; each later part adds its own).
    A card has zero `button` elements.
16. 🔴 [U+E b] Anonymous unit (eligible by RLS): in server order, header "אנונימי" (shared `ANONYMOUS_AUTHOR_LABEL`), no avatar, name or link; DOM, props, test ids hold no author data.
    Fixtures come from the harness (F3.1 refuses `isAnonymous`); F3.4 creates them.
17. 🎨 [U b] Share unit: header as c14, sharer text, original in a quote block (its header "אנונימי" if `isAnonymous`), or "הפוסט המקורי כבר לא זמין" with no original content (BR-065, AC-081); the share stays listed.
18. 🎨 [E b] Infinite scroll: no "more" button, no footer; sentinel near the last card requests the next page; `aria-busy` only while loading; one polite `role="status"` "נטענו N פוסטים נוספים"
    per load; cards in tab order, focus unmoved; shown ids deduplicated; `restarted:true` replaces the list; no request after `nextCursor` null; rapid scroll sends one request.
19. 🎨 [E b] First load: skeleton (no spinner; no shimmer under `prefers-reduced-motion`). Empty: small abstract SVG (no baby/pregnancy imagery), "עוד אין פוסטים בפיד", one action "כתיבת פוסט".
    First-page error: `inline-alert` in the feed, "ניסיון חוזר", no technical text. Later-page error keeps loaded cards, alert after the last, retry re-sends the same cursor.
20. 🎨 [E b] Back from `/posts/:id` restores loaded pages and scroll (same session); reload starts a new snapshot; after a long scroll a quiet "חזרה למעלה" (44×44 px, named) focuses the heading.

**Open questions**
- **Names → decided (Afik, 6ב):** full author name on every named post the reader can see. A non-friend reader gets the name in `author.name` (c12; tests assert it); null only if RLS returns nothing.
- **DR-6** (anonymous/suspension correlation): Afik, open, not blocking; ⭐ (a) accept, record in `security-privacy-open.md`.
- **Anonymous boundary → decided:** F3.2 shows eligible anonymous posts (dropping them in app code is a filter); it owns only c16's header; F3.4 owns every other anonymous surface.
- Empty state → **decided:** one action (design "מצבים"); "find friends" dropped. Stage set → **decided:** distinct `stage` of the viewer's own journey rows, nothing else read.

**Dependencies**   F3.1 merged · DATA ARCHITECT, before a2's review: the `liker_status` change to `reactions_select_reader` (else c5 fails) and the `regular_names` policy for 6ב (schema PR, P6).
**Size estimate**  ~1,300 lines with tests: **split in three.** a1 shared + service (c4 pure, 6, 8–10, 12 schema) ~400; a2 repository, route, integration (c1–5, 7, 9–12) ~450, after a1;
b web (c13–20) ~450, after a1 against the shared response, merges after a2. Each Elevated, own review.

**Gate 1 (ORCHESTRATOR, 18.10.2026):** approved with A&D findings 1–12 validated; N1–N4 applied (A&D re-validates at a1 review).
Split a1 → a2 → b accepted; the regular_names policy (6ב) ships as a schema PR before a2.
**ORCHESTRATOR 18.10 (a1 test open items):** c9 = the last of the first pageSize units in ranked order (the extra +1 unit only signals "more"); a named original requires `author` (author.name nullable).
