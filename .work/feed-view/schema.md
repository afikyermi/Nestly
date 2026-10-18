# schema — feed-view (I3 F3.2): author names on readable posts

Gate 2 contract for the 6b names policy (spec.md, "Afik 18.10 (6ב, final)"). DATA ARCHITECT, 18.10.2026. One schema PR (P6), before F3.2 a2.

**Change**
- Table `nestly.regular_names`: no column, constraint, grant or index change. One new permissive SELECT policy, added beside the three existing ones:
```sql
create policy regular_names_select_post_reader on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.posts p
                where p.author_id = regular_names.user_id and not p.is_anonymous));
```
- Before: a name row is readable by self, request counterparties and Friends (`regular_names_select_party`), and by `profile_view` (TO app_owner).
- After: also by any active account that can read, under its own `posts_select_viewer`, at least one named post whose author is that user.

**Why**
- Afik 18.10 (6b, final): a reader sees the author's full name on every named post the reader is allowed to see. Spec c12: `author.name` = what `regular_names` returns under RLS.
- Option D (exclude Restricted authors) was not chosen: a Restricted profile limits the profile page only (Afik 18.10, F3.0a), so its name shows on its readable posts.

**Authorization**
- One enforcement point for "may this viewer see this name because of a post": this policy, delegating eligibility to `posts_select_viewer` (the one place that already encodes
  viewer/author active, status, audience, friendship, hides, reporter-hides, held state). The EXISTS on `posts` runs under the caller's RLS, so the name follows the post exactly.
- Gated by `(select nestly.is_active_account())` (rule 15). SECURITY INVOKER only: no function, no view, no definer. `tests.approved_security_definer()` unchanged.
- The server never filters names for permission; it may target rows (`where user_id in (<author ids on the page>)`) and RLS decides.
- Shares: a share is a named post of the sharer (`posts_share_anonymous_check`: never anonymous), so the sharer's name is readable whenever the share is.
  The original's author name is readable only when the original row itself passes `posts_select_viewer` for the viewer (or via another readable post / friendship).
  Original deleted (SET NULL), held, hidden, removed, edited to friends-only for a non-friend, hidden or reported by the viewer, or its author suspended: that path gives nothing.
- Anonymous posts never reach a name (proof):
  1. `posts_author_id_check`: `(author_id is null) = is_anonymous`, so every anonymous row has `author_id` NULL.
  2. `NULL = regular_names.user_id` is NULL, never true, so no anonymous row satisfies the EXISTS; `not p.is_anonymous` repeats it locally (defence if the CHECK ever changes).
  3. The real author lives only in `post_authors` (rule 20), which this policy does not read; `post_authors_select_author` stays owner-only.
  4. An anonymous author's own comments carry `author_id` NULL (AC-076); this policy does not read comments at all.
  So an author who posts only anonymously gains no new name exposure; an author with a named readable post is named because of that post, never linked to the anonymous one.
- Professional accounts: `posts_select_viewer` has no account-type gate, so at DB level an active Professional reads the names of authors whose posts it can already read.
  No new exposure beyond the posts themselves; the server refuses Professionals (spec c12, 403). Noted, not changed here.
- Commenters (F3.3): NOT covered. Afik's 6b covers post authors. Making a commenter's name readable to every reader of the post extends who sees a name, so it is a
  separate reserved privacy point (CLAUDE.md reserved 4) — see Open. A commenter with no readable named post is still named only to self, counterparties and Friends.

**Recursion check** (an RLS expansion meeting a relation already being expanded raises 42P17)
- Expansion chain: regular_names → posts (`posts_select_viewer`) → friendships, post_hides, reports, post_authors. `is_active_account()` is a function call, not expanded at rewrite.
- None of those tables' policies reads `regular_names` or `posts`: friendships_select_party (own row + status copies), post_hides/reports/post_authors (owner-only).
  `posts_select_jobs` / `_delete_jobs` are TO app_jobs and are not applied to authenticated. The F3.0b policies on comments/reactions read posts (one direction, already built).
- Invariant made explicit and tested: no policy on any table other than `regular_names` mentions `regular_names`; no policy on `posts` reads comments or reactions.

**Migration** — `supabase/migrations/20261018300000_feed_author_names.sql`, phase: **expand** (adds a permissive policy; compatible with main's code)
1. `create policy regular_names_select_post_reader …` (above).
2. `comment on policy …` (rule, source 6b, the anonymous proof in one sentence). The other three regular_names policies are unchanged.
- No data written, no lock beyond the brief ACCESS EXCLUSIVE of CREATE POLICY on `regular_names` (catalog only). Applied by CLI as app_owner, one transaction with its history row.
- Header in the house style: source (this file), SRS (FR-FEED-001/005, BR-062, rule 15, rule 20), "No SECURITY DEFINER", down script path.

**Rollback** — `supabase/rollback/20261018300000_feed_author_names.down.sql`
- As app_owner (guard `current_user`), one transaction: `drop policy regular_names_select_post_reader on nestly.regular_names;` and delete only its own history row.
- Safe at any time: no data, no dependent object. Effect: non-friend authors show "חבר/ת בקהילה" again (spec c12/c14 hold for either state). No code revert required first.
- CI runs up → down → up. Against preview/prod: Afik only, as every down script.

**Backfill**   None. No row written; no live-data step.
**Indexes**
- None added. The EXISTS probes `posts` by `author_id = <user_id>`: served by `posts_author_id_created_at_idx (author_id, created_at desc) where author_id is not null`
  (the equality implies NOT NULL, so the partial index applies). `regular_names_pkey (user_id)` serves the outer targeted read. Write cost: zero.
- Per probed name, `posts_select_viewer` is evaluated on that author's posts until one passes: bounded by one author's post count (worst case: many friends-only posts, viewer not a friend).
  Accepted at MVP volume; revisit if an author's post count reaches thousands (100x: still an index range scan per name, cheap when the caller targets ids).

**Integrity**   No new relation, cascade or orphan. Names still cascade from `regular_profiles` (ON UPDATE / DELETE CASCADE); a deleted post simply stops granting the name.

**Blast radius / who is affected**
- `friends-repository.readVisibleNames` (used by `readFriendLists`, GET /api/friends) selects every readable name with no WHERE. After this policy it also returns every
  author of a readable post (soon: most active users) and evaluates the EXISTS for each. Output stays correct (the service maps by the list's ids and ignores extras),
  but cost grows with the user count. FINDING for BUILDER (Light): target the read to the listed ids (`inArray(regularNames.userId, otherIds)`) — targeting, RLS still decides.
  Recommended before this migration reaches production; not a blocker for the expand check (main's tests stay green).
- `nestly.profile_view` (SECURITY DEFINER as app_owner, which inherits authenticated): the new policy also applies inside it, but its names come only from a join on the
  target's accepted friendships rows, so its output is unchanged. pgTAP 53/63 stay valid.
- F3.2 a2 display statement: LEFT JOIN `regular_names` on `posts.author_id` (and on the original's author) under RLS; null → "חבר/ת בקהילה". Targeted by page ids.
- F3.1 post read (GET /posts/:id) and F3.3 comments: gain post-author names automatically if they join names; commenters' names depend on the Open item.
- pgTAP 62_regular_names: "a stranger reads no name" assertions hold only while the stranger fixture has no readable named post; TEST ENGINEER re-checks the fixtures.
- Cleanup tool (`tools/preview-e2e-cleanup*`): no impact — no new table, no order change. Suite: one new pgTAP file, small; no timeout or shard change.
- `data-model-tables.md` "Friendships and regular names" Authorization cell gains the policy in the schema PR (DATA ARCHITECT). SRS trace: names visibility (6b) in the Initiative update.

**pgTAP for TEST ENGINEER** — `supabase/tests/79_feed_author_names.sql` (fixtures through the harness; anonymous posts inserted as their author with `is_anonymous`)
1. Structure: the policy exists, permissive, SELECT, TO authenticated, its qual calls `is_active_account`; `regular_names` has exactly 4 policies; approved definer list unchanged.
2. Recursion guard: no `pg_policies` row on a table other than `regular_names` mentions `regular_names`; a SELECT on `regular_names` as a viewer raises no 42P17.
3. Stranger V (no friendship, no request) reads A's name when A has one active `everyone` named post; reads 0 rows for A before A posts.
4. A's only post is friends-only: stranger V reads 0 rows; Friend F reads the name.
5. Anonymous: A's only post is anonymous (`everyone`, readable by V as a post): V reads 0 name rows for A and 0 `post_authors` rows; same with an anonymous comment by A.
6. Mixed: A has one anonymous and one named post; V reads the name (via the named one); deleting the named post → 0 rows again.
7. Share: S (no other post) shares A's original; V reads S's and A's names. A edits the original to friends-only → V reads S's, not A's. A deletes it → S's only; share still listed.
8. Eligibility carried: V hides A's only post → 0 rows; V reports A's only post → 0 rows; A suspended (author_status cascade) → 0 rows; A's held post (open report) → 0 rows.
9. Viewer suspended → 0 rows of every name, own included; self always reads own name while active.
10. Commenter C with no posts, commenting on A's readable post: V reads 0 rows for C (until the Open item is decided).
11. `profile_view` for a stranger target with a public post returns the same friends list as before (63 regression).

**Reversible?**   Yes: dropping the policy restores the previous visibility exactly; no data created or lost. Contract test: none (no Auth/session/deletion/provider change).

**Open**
- DECISION REQUEST (Afik, reserved 4, for F3.3; nonblocking for F3.2): commenters' names. Options: A show a commenter's name only per today's rules (self, counterparties,
  Friends, or authors of a readable named post), else "חבר/ת בקהילה" · B the same rule as 6b for comments: the name is readable when the viewer can read a named comment
  (`comments_select_viewer`, author_id not NULL) by that user. Recommend **B**: a comment is published to the same readers as its post, and naming post authors but not
  commenters on the same card is inconsistent; anonymous-post authors stay safe (their comments have author_id NULL). ⭐ default A until decided (no schema now).
- QUESTION (ORCHESTRATOR): land the `readVisibleNames` targeting fix (BUILDER, Light) before the production apply. Default: yes, as a Light part ahead of a2.
**Gate 2 (ORCHESTRATOR, 18.10):** approved. readVisibleNames narrowed to listed ids in a2 (no real users yet; not a permission filter). Commenter names → Afik question 7 (default A).
