# schema — F3.0b feed-groundwork: comments, reactions, reports, held deletion, purge
DATA ARCHITECT, 18.10.2026; revised 18.10 for A&D 3 (likes count only from active likers) and Afik's report-policy decision.
Contract: `spec.md` c10–c12, c13 (comment), c14, c15, c16 (reporter) + Gate 1/2. Elevated. Builds on `schema.md`
(F3.0a; its rules 1–3 hold here). No SECURITY DEFINER. New: `TO app_jobs` policies for the purge — an approved-exception entry (rule 6), below.
**Change** New `comments`, `reactions`, `reaction_owners`, `reports`; posts gains the held state; functions `content_hold()` (trigger),
`delete_post(uuid)`, `delete_comment(uuid)`, `purge_held_content()`, three insert triggers — all SECURITY INVOKER, `search_path ''`.
Report reasons: the 8 of `decisions-before-i3-i5-HE.md` §3. Reporter-hide: posts only (7א); a reported comment or user stays visible to everyone,
reporter included (Afik 18.10) — no report clause in comments' or users' policies.
**How an open report is known without a definer.** `reports.post_id` / `comment_id` / `reported_user_id` are ON DELETE SET NULL and CHECK
`reports_open_target_check` requires an open report's target. Deleting reported content makes the RI action (owner, outside RLS) violate it:
23514 in the same statement. The author never reads the report; `delete_post` catches exactly that constraint and holds instead.
**Why the held branch.** Postgres checks the new row of an `UPDATE … WHERE` against SELECT policies, so an author could not move their post to
`deleted` if no policy showed it. The branch shows it only inside the holding transaction: `held_xact = pg_current_xact_id_if_assigned()`
(NULL in every read-only transaction, different in every later one). After commit no one, author included, reads it (c14).

| Column | Type · null · default | Meaning / constraint |
|---|---|---|
| `posts.held_at`, `held_until` | timestamptz · null | trigger-stamped `now()`, `now() + interval '2160 hours'` (90 d, DST-proof). CHECK `posts_held_check`: `(status = 'deleted') = (held_at is not null)`, both and `held_xact` NULL together, `held_until <= held_at + interval '2160 hours'` (later refused, c14) |
| `posts.held_xact` | xid8 · null | the holding transaction; never granted |
| `comments.id`, `post_id` | uuid PK `gen_random_uuid()` · not null → posts ON DELETE CASCADE | §13 Comment. UNIQUE (id, post_id) = reply FK target |
| `comments.parent_id` | uuid · null | `(parent_id, post_id) → comments (id, post_id)` ON DELETE CASCADE: same post (c10); one level: trigger |
| `comments.author_id` | uuid · null · `auth.uid()` → regular_profiles ON DELETE CASCADE | commenter; NULL only for the real author on their anonymous post (c11). CHECK `author_id is not null or is_by_post_author` |
| `comments.author_status` | text · not null · `'active'` | `(author_id, author_status) → users` ON UPDATE/DELETE CASCADE (commenter active, c10) |
| `comments.is_by_post_author` | boolean · not null · false | "המחבר" (AC-076); trigger-set, never granted (a client-sent mark is 42501) |
| `comments.body` | text · not null · CHECK btrim <> '' | length cap with F3.4's Zod |
| `comments.status`, `held_*`, `created_at` | as posts | active/hidden/removed/deleted; held columns and CHECK as posts |
| `reactions.id` | uuid PK `gen_random_uuid()` | one Like, **identity-free**: `post_id` → posts / `comment_id` → comments, both ON DELETE CASCADE, CHECK exactly one |
| `reactions.target_id` | uuid · generated `coalesce(post_id, comment_id)` stored | UNIQUE (id, target_id) = owner FK target |
| `reactions.liker_status` | text · not null · `'active'` | copy of the liker's users.status, **no identity**; never granted. Only `'active'` rows are readable, so a reader learns nothing (A&D 3) |
| `reactions.is_by_author` | boolean · not null · false | the liker is the content's author (anonymous via own post_authors); trigger-set. Quality excludes it |
| `reactions.created_at` | timestamptz · not null · `now()` | the `asOf` bound of the quality count |
| `reaction_owners.reaction_id` | uuid PK | `(reaction_id, target_id) → reactions (id, target_id)` ON DELETE CASCADE; reactions `(id, liker_status) → reaction_owners (reaction_id, liker_status)` ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED (actions immediate, existence checked at commit) |
| `reaction_owners.user_id`, `target_id` | uuid · not null · `auth.uid()` → regular_profiles ON DELETE CASCADE | UNIQUE (user_id, target_id): one like per person and target (23505, c12) |
| `reaction_owners.liker_status` | text · not null · `'active'` | `(user_id, liker_status) → users (id, status)` ON UPDATE/DELETE CASCADE (`users_id_status_key`, F2.4a); UNIQUE (reaction_id, liker_status) = reactions' FK target |
| `reports.id`, `reporter_id` | uuid PK · not null `auth.uid()` → users ON DELETE **RESTRICT** | FR-MOD-001; RESTRICT so I9 decides the "minimal record" (decisions §1) |
| `reports.target_kind` | text · not null · CHECK post/comment/user | survives its target's SET NULL |
| `reports.post_id`, `comment_id`, `reported_user_id` | uuid · null · ON DELETE SET NULL | CHECK `num_nonnulls(…) <= 1`, `reported_user_id <> reporter_id`, and `reports_open_target_check`: `status <> 'open'` or the column named by target_kind is the non-null one |
| `reports.reason` | text · not null · CHECK in (child_safety, harassment, sexual_violent_hateful, personal_information, medical_misinformation, impersonation, spam, other) | §3 order is I4's queue, not stored |
| `reports.details` | text · null | CHECK `details is null or btrim(details) <> ''`, `reason <> 'other' or details is not null`. Cap with F3.7's Zod |
| `reports.status`, `closed_at`, `created_at` | text not null `'open'` CHECK open/handled/expired · timestamptz null · now() | CHECK `(closed_at is null) = (status = 'open')`. handled: I4; expired: the purge (DR below) |

UNIQUE (reporter_id, post_id), (reporter_id, comment_id), (reporter_id, reported_user_id): one report per person and target (c15).
**Authorization** (TO authenticated, gate `(select nestly.is_active_account())`; uid = `(select auth.uid())`)
- `content_hold()` BEFORE UPDATE OF status on posts and comments: only active→deleted, stamps held_*; else 42501 (author never sets hidden/removed).
- posts: `posts_select_viewer` replaced = a's text (posts only) `and not exists (reports r where r.reporter_id = uid and r.post_id = posts.id)`, OR the held branch
  `status = 'deleted' and held_xact = pg_current_xact_id_if_assigned() and <a's ownership test>`. `posts_update_author` WITH CHECK
  `status in ('active', 'deleted')`. Grant UPDATE (status). Reports' policies never read posts (rule 1).
- `comments_insert_prepare()` BEFORE INSERT: a parent must be readable (RLS) and top-level, else 42501; own post_authors row for the post →
  `author_id := null, is_by_post_author := true`; named post author → flag true; else false.
- `comments_select_viewer` `(status = 'active' and (author_id is null or author_status = 'active') and exists (posts p where p.id = comments.post_id))`
  OR the held branch (ownership: `author_id = uid or (author_id is null and exists own post_authors for post_id)`). The post's RLS carries
  eligibility, audience, hides and reporter-hides into every comment.
- `comments_insert_commenter` WITH CHECK `status = 'active'`, post readable, and `author_id = uid` or `(author_id is null and is_by_post_author and
  exists own post_authors)`. `comments_update_commenter` (status) / `comments_delete_commenter`: the ownership test. Grants: SELECT, INSERT
  (post_id, parent_id, body), UPDATE (status), DELETE.
- `reactions_insert_prepare()` sets is_by_author; AFTER INSERT inserts the owner row. `reactions_select_reader`: `liker_status = 'active'` and target readable
  (posts or comments RLS) — so `count(*)` per readable target works and an unreadable one gives 0; no identity on the row. `reactions_insert_reader` WITH
  CHECK `liker_status = 'active'` and target readable; `reactions_delete_owner` `exists (reaction_owners o where o.reaction_id = reactions.id and o.user_id = uid)`.
  `reaction_owners_select_owner` `user_id = uid`; `_insert_owner` adds `liker_status = 'active'`. Grants: reactions SELECT, INSERT (post_id, comment_id), DELETE;
  reaction_owners SELECT, INSERT (reaction_id, target_id) (written by the trigger). c12: spec.md Gate 2 re-amend.
- `reports_insert_check()` BEFORE INSERT: a post/comment target must be readable to the reporter (RLS) and not their own (named author, own
  post_authors, own comment), else 42501. `reports_select_reporter` `reporter_id = uid`; `reports_insert_reporter` WITH CHECK `reporter_id = uid
  and status = 'open'`. Grants: SELECT, INSERT (target_kind, post_id, comment_id, reported_user_id, reason, details). No UPDATE/DELETE (I4).
- `delete_post(uuid)` / `delete_comment(uuid)` returns integer, EXECUTE authenticated: DELETE under RLS; on `check_violation` whose constraint is
  `reports_open_target_check` only, `UPDATE … SET status = 'deleted'` under RLS; returns the row count (1 for deleted and held alike, 0 for not
  yours). Cascades (c13): comments, replies, reactions → owners, hides, post_authors; shares SET NULL. A bare DELETE on reported content fails closed.
- **Purge** `purge_held_content()` returns integer, EXECUTE **app_jobs only**: (1) open reports on held rows past `held_until` (for a post, also on its
  comments) → `expired`, `closed_at = now()`; (2) each held row deleted in its own subtransaction; 23514 (an open report, release not reached) → kept.
  Policies TO app_jobs: `posts_{select,delete}_jobs`, `comments_delete_jobs` USING `status = 'deleted'`; `comments_select_jobs` `status = 'deleted'
  or exists (posts p where p.id = post_id)`; `reports_select_jobs` `status = 'open'`; `reports_update_jobs` USING open and target held past release,
  WITH CHECK `status = 'expired'`. Grants app_jobs: USAGE on nestly; SELECT, DELETE on posts, comments; SELECT, UPDATE (status, closed_at) on reports.
  pgTAP reaches app_jobs through a CI-only postgres fixture; app_server never gets app_jobs (rule 6).

**Approved exception (data-model, this PR):** `F3.0b purge — TO app_jobs policies on posts, comments, reports: read held rows and the open reports
on them, delete held rows, expire open reports past release · a job has no auth.uid() and must reach every user's held rows (rule 6) ·
.work/feed-groundwork/schema-b.md · 2026-10-18`.

**Indexes** `comments_post_id_created_at_idx (post_id, created_at, id)` thread order, comment counts, cascade · `comments_parent_id_idx`,
`comments_author_id_idx` (partial, not null) cascades · `posts_held_until_idx`, `comments_held_until_idx (held_until) WHERE status = 'deleted'` purge ·
`reactions_post_id_idx`, `reactions_comment_id_idx` (partial) the count and cascades · `reaction_owners_user_id_target_id_key` "mine", one like, status cascade ·
`reaction_owners_reaction_id_liker_status_key` FK target (reactions_pkey serves the reverse cascade) ·
reports' three UNIQUE keys (the first is the reporter-hide anti-join) and `reports_post_id_idx`, `_comment_id_idx`, `_reported_user_id_idx`
(partial) the SET NULL lookups. Cost: ~3 btrees per comment/like/report write; a status change rewrites the user's likes twice (rare). Accepted.
**Migration** `supabase/migrations/20261018200000_feed_interactions.sql`, expand (new tables, nullable columns, policy replacements of a's two;
main's code reads none of them). **Rollback** `…/20261018200000_feed_interactions.down.sql`: refuses while comments, reactions, reaction_owners
or reports holds a row or a post is `deleted`; restores a's two policies verbatim, drops b's objects, columns and app_jobs grants, deletes its own
history row. **Backfill** none. **Reversible?** yes (guarded); forward fix after the first real row.
**Integrity** No orphan: CASCADE or SET NULL per FK above; reports outlive content with a NULL target, kept until I9 retention (§13.4 TBD).
Likes (A&D 3; Gate 2 "Accepted" reopened): a suspend/ban cascades users → reaction_owners → reactions.liker_status in its statement, so the
like stops counting; reactivation restores it. **Denormalization — ORCHESTRATOR decides:** `liker_status` (two FK-proven copies, as author_status).
**Rule for I9 (account deletion).** Delete a user's posts and comments only through `delete_post` / `delete_comment` (or the same CHECK): content
with an open report is held and purged by the job, never cascaded away; the `users` row goes only once none remains (the CHECK and RESTRICT
on `reports.reporter_id` make any shortcut fail 23514 / 23503). I9 never lifts `reports_open_target_check`, never deletes or expires an open report
to unblock a cascade, and decides the reporter's own reports (RESTRICT) and the "deleted user" comment row additively.
**Cleanup tool** (same PR) `EXPECTED_NESTLY_TABLES` +4 → 22 (`comments`, `reaction_owners`, `reactions`, `reports`). P(U) = U's posts (a);
C(U) = comments `where author_id = U or post_id in P(U) or parent_id in (comments where author_id = U)`. Per user, before a's steps: (1) `reports
where reporter_id = U or reported_user_id = U or post_id in P(U) or comment_id in C(U)`; (2) `reactions where id in (reaction_owners where user_id =
U)`; then a's post_hides; (3) `comments where author_id = U or (author_id is null and post_id in P(U))`; then a's posts. No open report survives
into a cascade, so no 23514. **Who is affected** table-count tests (22); CI `db` up→down→up; data-model approved-exceptions list; I4 (report
status values, held content), F3.4/F3.7 (call the functions, schedule the purge as `app_jobs`), I9 (rule above). **External assumption:** none.
