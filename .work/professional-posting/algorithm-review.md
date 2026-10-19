# algorithm review — professional-posting (I3), step 5b, before BUILDER

**Author:** ALGORITHM & DATA, 19.10.2026. **Basis:** spec.md (c4, c5, c6, c7, c12, N3, N4; DR-1 ⭐ approved by Afik 19.10),
AC-061 (15-acceptance.md), `.work/_initiatives/I3-algorithm.md`, feed-repository.ts, feed-service.ts, shared/feed/score.ts,
migrations 20261014200000 (journey_contexts, children → regular_profiles), 20261017160000 (friendships → regular_profiles),
20261018200000 (comments/reactions prepare triggers).

## Purpose map delta (Professional viewer, I3)

| Input | Purpose | Approved by |
|---|---|---|
| Viewer `account_type` (already read by `classifyViewer` via `readOwnAccounts`) | choose the ranking profile (`regular` / `content`) and refuse Admin/Moderator; **never** a row filter | AC-061; DR-1 (Afik 19.10); I3-algorithm purpose map row 1 |
| `posts.created_at`, counts `n` (Pipeline 3, unchanged), `posts.author_id` (creator diversity only), `is_anonymous`, `shared_post_id` | Freshness, Quality, re-ranking — "content signals" | AC-061 ("content signals"); FR-ALG-002 |
| AlgorithmConfiguration, surface `regular_feed`, same pinned/active version | weights/caps/decay/page size; `wFriend`, `wStage` not applied | P-ALG-07 |

**Excluded for a Professional viewer** (AC-061): `friendships` (any read, any term), `journey_contexts` / `readOwnStages`,
`posts.stage_tag` as a ranking input, `children`, tracker data. `stage_tag` stays a **display** field (the author's own
published label on an `everyone` post, visible to any reader) — never an order, score or keyset input.

## Binding rules

R1 **Eligibility only via RLS.** A Professional's candidate set is whatever the posts policy returns (N4: as a Regular
non-friend — own posts + `everyone` posts). No app predicate on audience, author type or `account_type` in any feed SQL.
`friendships` read policies are **not** extended to Professionals (no feature needs it; the content profile never reads it).

R2 **Content profile = Friend and Stage terms omitted, not multiplied by 0.** For a Professional viewer the ranking
statement is
`score = wFresh·2^(−ageHours/halfLifeHours) + wQuality·min(ln(1+n)/ln(1+qualityCap), 1)` (tier 1: 0),
with the same float8 typing, `n` definition, `asOf` bound, tier, order key `(tier, score desc, created_at desc, id desc)`
and keyset. The SQL for this profile contains **no** reference to `friendships`, `stage_tag`, the Stage array parameter,
or `auth.uid()` in the ranking statement. `readOwnStages` is **not called** for a Professional, whatever `wStage` is.
Shared reference: `scorePost` gains the same profile (or a `scoreContentPost`) so fixtures have one reference.

R3 **Everything else unchanged:** re-ranking caps (`maxSameCreatorInWindow`, `diversityWindow`, `maxAnonymousInWindow`),
share dedup, page size, fallbacks (last known good → v0), cursor shape, display/like-state statements and their
allow-lists. Same surface `regular_feed` and `configVersion` in the response; no new configuration row or key in I3
(a `professional_feed` surface with profession/groups/follows is I11, FR-ALG-003). The Regular profile's ranking SQL is
byte-identical to today's.

R4 **Professional author's posts, Regular viewer:** no special case and no new read. Friend term is 0 by data
(`friendships` FKs → `regular_profiles`, BR-029); Stage term is 0 by the DB refusal of a non-null `stage_tag` (N2/D2).
The ranking statement must **not** read the author's account type to achieve this. A Professional's named posts count as
one named creator for diversity, like any named author.

R5 **`n` integrity with Professional engagement.** A Professional's likes/comments on others' posts count in `n` like any
active user's (engagement, FR-ALG-002). Their likes/comments on their **own** post set `is_by_author` /
`is_by_post_author` = true and never enter `n`; a stopped Professional's likes and comments leave `n` (liker/author
status copies). The existing triggers compare `author_id = uid`, so this holds structurally — N4 must keep it so and
pgTAP must prove it (bug 2).

R6 **No events** (I3 answer 4א unchanged).

## Static-test wording (proves c6 "no journey/child data, no Friend term" for a Professional viewer)

> **[U] Content profile reads no social or journey data.** Render `rankingStatement` for the content profile with a
> configuration whose `wFriend` and `wStage` are both > 0 and a non-empty `stages` argument if the signature still accepts
> one. Assert the SQL text contains none of `friendships`, `journey_contexts`, `children`, `stage_tag`, `auth.uid`, and
> that no bound parameter is an array. Assert the Regular profile's rendered SQL equals the F3.2 statement (no regression).
>
> **[U] Static source scan.** In `apps/server/src`, `journeys-repository` is imported by `feed-service.ts` only through the
> one `readOwnStages` call, and that call sits inside the Regular-profile branch (a unit test of the profile-selection
> function: `content` profile → stage read `false` for any `wStage`).
>
> **[I] Behaviour, real DB under RLS.** With a pinned configuration where `wFriend` = 2 and `wStage` = 2, and Regular posts
> carrying stage tags: (a) a Professional viewer's ids and order equal the content-only expected order computed by the
> shared reference; (b) with `readOwnStages` spied, it is called 0 times for the Professional's request; (c) with
> `wStage` = 0, a Professional and a Regular with no friendships and no journey context see identical ids and order for
> the same `asOf`.

## Open
None for Afik. I3-algorithm.md must take R1–R5 as a revision (Scope "Professional feed I11" → "I3: content profile,
I11: profession/groups/follows"; Pipeline 2 "No Professional units" → Professional authors' `everyone` posts are
candidates) — ALGORITHM & DATA writes it with the part's records.
