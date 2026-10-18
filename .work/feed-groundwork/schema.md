# schema — F3.0a feed-groundwork: posts, author separation, shares, hides, configuration
DATA ARCHITECT, 18.10.2026; revised 18.10: A&D 1–2; Afik — restricted limits only the profile page, so `author_visibility` and its regular_profiles
UNIQUE target are dropped (no other use). Contract: `spec.md` c1–c9, c13 (post), c16 (hides), c17–c20 + Gates 1/2. Elevated. F3.0b is
`schema-b.md`, built on this file. **No SECURITY DEFINER in either part** (`tests.approved_security_definer()` unchanged, S-42 not touched).

**Change**  New `posts`, `post_authors` (rule 20, S-26 final shape), `post_hides`, `algorithm_configurations`; three SECURITY INVOKER trigger
functions; no existing table changes. Why: FR-FEED-001/002/005/006, BR-059/062/064–066/073, VAL-036/038, OP-033, Afik 2א/5א/6א/7א.
Posting is Regular-only (FKs to `regular_profiles`; I11 widens additively).

**Three rules the shape rests on**
1. *No policy re-enters posts.* Postgres raises "infinite recursion detected in policy" when policy expansion meets a relation already being
   expanded whose policies hold a sublink — every `(select nestly.is_active_account())` gate is one. `posts_select_viewer` reads friendships,
   post_hides (b: also post_authors, reports), so none of their policies reads posts, and no posts policy reads posts. "Is that post readable"
   checks (share original here; report target, reply parent in b) run in BEFORE INSERT invoker triggers: a separate query, same RLS.
2. *The anonymous author's id lives only in post_authors.* `posts.author_id` is NULL iff anonymous. `post_authors.post_id` references
   `posts (anonymous_post_id)`, non-NULL only on anonymous posts, so a separation row can never be attached to a named post (it would
   otherwise satisfy that post's update/delete ownership test).
3. *Author active without reading users* (F2.4a precedent, RI runs as owner outside RLS): named `posts (author_id, author_status) → users (id,
   status)` ON UPDATE CASCADE; anonymous `post_authors (author_id, author_status) → users` ON UPDATE CASCADE, and `posts (anonymous_post_id,
   author_status) → post_authors (post_id, author_status)` ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED — circular, checked
   at commit, so an anonymous post cannot commit without its separation row. A suspend/ban/reactivation rewrites every copy in its statement.
**Denormalization — ORCHESTRATOR decided at Gate 2:** `author_status` (posts, post_authors), FK-proven copies.
| Column | Type · null · default | Meaning / constraint |
|---|---|---|
| `posts.id` | uuid PK · `gen_random_uuid()` | the post (§13 Post) |
| `posts.author_id` | uuid · null · `auth.uid()` → regular_profiles (user_id) ON DELETE CASCADE | named author (a non-Regular: 23503); trigger NULLs it when anonymous. CHECK `(author_id is null) = is_anonymous`. Never granted |
| `posts.author_status` | text · not null · `'active'` | copy of users.status (FK above). Eligibility only (BR-065/073) |
| `posts.is_anonymous` | boolean · not null · false | FR-FEED-005. INSERT grant only: immutable (Gate 2 default) |
| `posts.anonymous_post_id` | uuid · null · UNIQUE | trigger: `= id` iff anonymous; CHECK `anonymous_post_id is not distinct from case when is_anonymous then id end` |
| `posts.audience` | text · not null · no default · CHECK everyone / friends | OP-033. CHECK `posts_audience_check`: `not (is_anonymous and audience = 'friends')` (c4, insert and update) |
| `posts.body` | text · null | text or share text. CHECK `body is null or btrim(body) <> ''` and `is_share or body is not null`. Length cap: F3.1 adds it (no writer before) |
| `posts.stage_tag` | text · null · CHECK in (planning, pregnant, has_child) | 5א author-chosen tag (= `JOURNEY_STAGES`); nothing derives it. Topics: F3.1, additive |
| `posts.is_share` | boolean · not null · false | trigger: `shared_post_id is not null` at insert; survives the original's deletion |
| `posts.shared_post_id` | uuid · null → posts (id) ON DELETE SET NULL | the original (VAL-038). CHECK `<> id`; `shared_post_id is null or is_share`; `not (is_share and is_anonymous)` |
| `posts.status` | text · not null · `'active'` · CHECK active/hidden/removed/deleted | hidden/removed: I4; deleted: b's held state. No UPDATE grant in a |
| `posts.created_at` | timestamptz · not null · `now()` | freshness, snapshot bound, keyset |
| `post_authors.post_id` | uuid PK → posts (anonymous_post_id) ON DELETE CASCADE | the anonymous post |
| `post_authors.author_id` | uuid · not null · `auth.uid()` → regular_profiles ON DELETE CASCADE | the real author (a Professional's anonymous post: 23503, c4). Never granted |
| `post_authors.author_status` | text · not null · `'active'` | `(author_id, author_status) → users` ON UPDATE/DELETE CASCADE; UNIQUE `(post_id, author_status)` = target of posts' deferred FK |
| `post_hides.user_id`, `.post_id` | uuid · not null; PK (user_id, post_id) | `auth.uid()` → users ON DELETE CASCADE; → posts ON DELETE CASCADE. 7א; never a ranking input |
| `post_hides.created_at` | timestamptz · not null · `now()` | |
| `algorithm_configurations` | id uuid PK; surface text CHECK ('regular_feed'); version integer > 0, UNIQUE (surface, version) — written by the migration, no sequence | one row per version, BR-059. `is_active` boolean not null, UNIQUE (surface) WHERE is_active |
| … weights (not null, one named CHECK each) | `w_fresh`, `w_friend` numeric 0–5 · `w_quality`, `w_stage` numeric 0–2 · `half_life_hours` int 1–336 · `quality_cap` int 1–1000 · `scored_window_days` int 1–90 · `diversity_window` int 3–20 · `max_same_creator_in_window`, `max_anonymous_in_window` int 1–diversity_window · `page_size` int 5–50 | `I3-algorithm.md` ranges |
| … record | `created_at` timestamptz now() · `created_by` text not null (reviewer + migration, not a user: no Admin exists) · `reason` text not null, both CHECK btrim <> '' | |

Seed v1 (c18 values, active, `created_by` 'ALGORITHM & DATA, migration 20261018100000', `reason` 'I3 defaults, I3-algorithm.md') is inserted
before RLS is enabled. Trigger `algorithm_configurations_guard` (BEFORE UPDATE OR DELETE): only `is_active` true→false passes, else 42501 —
so even a later migration (FORCE lifted, DR-C pattern) can only retire a version and insert the next: append-only.

**Authorization** — one enforcement point per table: its policies, all `TO authenticated` and gated by `(select nestly.is_active_account())`.
- `posts_insert_prepare()` BEFORE INSERT: sets author_id, anonymous_post_id, is_share; with a share, selects the original under the caller's RLS
  and requires audience everyone, not anonymous, not a share, else 42501 (c8). A `restricted` author profile plays no part (Afik 18.10).
  `posts_insert_author()` AFTER INSERT: anonymous → `insert into post_authors (post_id)`.
- `posts_select_viewer` USING `status = 'active' and author_status = 'active' and (audience = 'everyone' or author_id = uid or exists (friendships f
  where f.status = 'accepted' and ((f.requester_id = uid and f.addressee_id = posts.author_id) or (f.addressee_id = uid and f.requester_id =
  posts.author_id)))) and not exists (post_hides h where h.user_id = uid and h.post_id = posts.id)`. Friendships' RLS adds both-active; an
  anonymous post (author_id NULL) is reachable only by `everyone` (c3, c4). Profile visibility is not read (Afik 18.10).
- `posts_insert_author` WITH CHECK `status = 'active' and author_status = 'active' and ((not is_anonymous and author_id = uid) or (is_anonymous and author_id is null))`.
- `posts_update_author` USING = WITH CHECK `status = 'active' and (author_id = uid or exists (post_authors pa where pa.post_id = posts.id and pa.author_id = uid))`;
  `posts_delete_author` USING the same ownership test. (posts → post_authors only; post_authors' policies never read posts.)
- `post_authors_select_author` `author_id = uid`; `post_authors_insert_author` WITH CHECK `author_id = uid and author_status = 'active'`
  (the FK proves the post anonymous, the PK one row). **Rule 20 reading:** the author reads own rows; no other user, no `TO app_owner`/`app_jobs`
  policy, no view; I4's audited reveal (rule 19) is the only other path, designed then.
- `post_hides_{select,insert,delete}_owner` `user_id = uid`. No readability check on insert (it would re-enter posts, rule 1); the FK proves existence of an unguessable id.
- `algorithm_configurations_select_all` USING `true` under the gate: every version, active and retired (A&D 1) — versioned constants, no personal
  data; the service builds last good = highest version below the active one that passes Zod (`I3-algorithm.md` Configuration). No write policy for any role.
- Grants to authenticated only: posts SELECT, INSERT (is_anonymous, audience, body, stage_tag, shared_post_id), UPDATE (audience, body, stage_tag),
  DELETE · post_authors SELECT, INSERT (post_id) · post_hides SELECT, INSERT (post_id), DELETE · algorithm_configurations SELECT. `revoke all`
  from public, anon (and app_server, app_jobs hold nothing: as itself every command is 42501, rule 2). Functions: `revoke execute … from public`.
- **Feed query** (F3.2): identity transaction, `SET LOCAL ROLE authenticated`; RLS is the whole eligibility; the repository adds `created_at <= asOf`,
  the tier/score order and the `(created_at, id)` keyset — never a permission filter.

**Indexes** (each: query · write cost)
- `posts_feed_idx (created_at desc, id desc)`, **not partial** (A&D 2): after b, `posts_select_viewer` is `<active> OR <held branch>`; no qual implies
  `status = 'active'`, so a partial index stops matching (seq scan; an app-side status filter is forbidden). Ordered scan, RLS quals as filter;
  timestamptz/uuid comparisons are leakproof, so the `asOf` bound and keyset stay index conditions. Cost: one btree per insert (+ few non-active rows).
- **EXPLAIN check** (TEST ENGINEER, pgTAP file run after b's migration): as `authenticated` with a viewer's claims, `set local enable_seqscan = off`,
  `explain (format json)` of `select id from nestly.posts where created_at <= $1 order by created_at desc, id desc limit 21`, of its keyset form
  `and (created_at, id) < ($2, $3)` and of the tier-0 window `created_at > $1 - interval '14 days'` → plan uses `posts_feed_idx`, no Sort node.
- `posts_author_id_created_at_idx (author_id, created_at desc) WHERE author_id is not null` — own/profile list, both author FK cascades.
- `posts_anonymous_post_id_key` UNIQUE — post_authors FK target, deferred-FK cascade lookup. `posts_shared_post_id_idx WHERE not null` — SET NULL, dedup.
- `post_authors_pkey (post_id)` — the ownership EXISTS; `post_authors_post_id_author_status_key`; `post_authors_author_id_idx` — own list, cascades.
- `post_hides_pkey (user_id, post_id)` — per-viewer anti-join, exact match; `post_hides_post_id_idx` — cascade on post delete. Friends path uses
  `friendships_requester_id_idx` / `_addressee_id_idx` (exist). Write cost accepted: a status change rewrites all the author's posts (rare).

**Migration** `supabase/migrations/20261018100000_feed_posts.sql`, expand (new tables only), one transaction, F2.4a header, `comment on` all.
Order: posts → post_authors → deferred FK → triggers → RLS + FORCE + policies + grants → config table → seed → its RLS. Renumber if overtaken. **Backfill:** none (seed only).
**Rollback** `supabase/rollback/20261018100000_feed_posts.down.sql`: lifts FORCE in its own transaction, **refuses** while posts, post_authors, post_hides
hold a row or the config holds more than the seed; drops the four tables, three functions, its history row. After the first real post: forward fix. **Reversible?** yes (guarded).
**Integrity** Delete of a post (c13): post_authors, hides cascade; shares SET NULL and stay (c9). Account delete cascades the user's posts (named via
users FK, anonymous via post_authors → deferred FK). No orphan: every FK is CASCADE or SET NULL by decision above. Timestamps timestamptz µs UTC.

**Cleanup tool** (`tools/preview-e2e-cleanup*.ts`, same PR). `EXPECTED_NESTLY_TABLES` +4 → 18 (`algorithm_configurations`, `post_authors`,
`post_hides`, `posts`; never writes the config). Per user U, after the recovery rows and before `regular_profiles`: (1) `post_hides where user_id = U`;
(2) `posts where author_id = U or id in (select post_id from post_authors where author_id = U)` (cascades others' hides and post_authors; others'
shares SET NULL). `backlog` removed: `CleanupMode` loses it, `selectBacklog`, `MAX_BACKLOG_PER_RUN` go, the parser rejects `backlog`, the
workflow input options become `[dry-run]`; the data-model approved-exception entry text and debt.md:109 are updated in the same PR.
**Who is affected** `supabase/tests/20_registration_structure.sql` (fourteen → eighteen tables, names) and any table-count assertion; CI `db`
up→down→up (down passes on an empty schema); RLS gate unchanged; Drizzle drift is Drizzle→DB only, so `schema.ts` mirrors come with F3.1 (P6);
preview cleanup preflight in the same merge as the preview apply; `migrate` dispatch after merge. **External assumption:** none.
