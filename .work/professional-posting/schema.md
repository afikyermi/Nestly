# schema — professional-posting (I3, PR-A3, migration only)

Gate 2 input. Spec: `.work/professional-posting/spec.md` (N1–N4); Afik 19.10 DR-1..3 ⭐ and the DR-2 correction
(decisions/2026-10.md "Professional posting details", "Professional audience"). Migration
`supabase/migrations/20261019400000_professional_posting.sql`, after PR-A2's `20261019300000_commenter_names.sql`.
Down: `supabase/rollback/20261019400000_professional_posting.down.sql`. Phase: **expand**.

**Change**
- New RLS helper `nestly.caller_account_type()` returns text: `select u.account_type from nestly.users u where u.id = auth.uid()
  and u.status = 'active'`. If there is no row, it returns NULL. Language sql, STABLE, SECURITY INVOKER, `search_path ''`. EXECUTE is
  revoked from PUBLIC and granted to `authenticated` only. Policies call it as `(select nestly.caller_account_type())`. It is
  caller-only and reads through `users_select_own` (rule 16), so it adds no exception.
- **posts**: drop `posts_author_id_fkey` (→ regular_profiles). `posts_author_status_fkey` (author_id, author_status) → users
  (id, status), ON UPDATE/DELETE CASCADE, stays and still proves the author exists and still cascades.
  - `posts_insert_author` WITH CHECK keeps its current terms and adds:
    `and ((select nestly.caller_account_type()) = 'regular' or ((select nestly.caller_account_type()) = 'professional'
    and not is_anonymous and audience = 'everyone' and stage_tag is null))`.
  - `posts_update_author` WITH CHECK keeps its current terms and adds:
    `and ((select nestly.caller_account_type()) = 'regular' or ((select nestly.caller_account_type()) = 'professional'
    and audience = 'everyone' and stage_tag is null))`. USING is unchanged.
  - `posts_select_viewer` and `posts_delete_author` are unchanged.
  - `posts_insert_prepare` is unchanged. Its share gate (42501 when the caller has no own regular_profiles row) keeps
    Professional shares refused.
- **post_authors**: unchanged. `post_authors_author_id_fkey` → regular_profiles stays as the integrity backstop, so a
  separation row is Regular-only.
- **comments**: drop `comments_author_id_fkey` (→ regular_profiles). `comments_author_status_fkey` → users stays.
  `comments_insert_commenter` WITH CHECK adds `and (select nestly.caller_account_type()) in ('regular', 'professional')`.
- **reaction_owners**: drop `reaction_owners_user_id_fkey` (→ regular_profiles). `reaction_owners_liker_status_fkey` → users stays.
  `reactions_insert_reader` WITH CHECK adds `and (select nestly.caller_account_type()) in ('regular', 'professional')`.
  This gate is the only one needed: a reaction_owners row can only exist with its reactions row (the PK and the deferred FK
  pair), and a direct client insert always hits 23505.
- **Not changed**: posts_select_viewer, comments_select_viewer, reactions_select_reader, the regular_names policies
  (A2's included), comments_insert_prepare, reactions_insert_prepare, delete_post/delete_comment, content_hold,
  post_hides_insert_guard, reports, grants. N4 reads need nothing. Those policies gate on `is_active_account()` only, so an
  active Professional already reads exactly as a Regular non-friend: `everyone` posts and their own. Friendships are
  Regular-only (FKs to regular_profiles), so the friends branch can never match.
- Comment text that says "Regular only / a Regular profile" is rewritten: posts table, posts.author_id,
  comments.author_id, reaction_owners.user_id, and the comments of the changed policies. post_authors.author_id stays "a Regular profile".

**Why** N1–N2: DR-2 and D2 require that a Professional writes named `everyone` posts with no stage tag. AC-076 refuses
anonymous posts by a Professional, explicitly (N1 asks for more than an FK error). 3א covers edit and delete. N3: author_status
is type-independent. N4 (DR-1): comments, replies and likes.

**Authorization** — one enforcement point per rule, all RLS:
| Rule | Enforced in |
|---|---|
| who may post (Regular; Professional; never Admin/Moderator; stopped refused) | `posts_insert_author` (+ `is_active_account`) |
| Professional: never anonymous, only `everyone`, no stage tag | `posts_insert_author`; edits `posts_update_author` |
| Regular anonymous is never friends-only | `posts_audience_check` (unchanged) |
| separation row is Regular-only | `post_authors_insert_author` + FK to regular_profiles (unchanged) |
| who may comment / like | `comments_insert_commenter` / `reactions_insert_reader` |
| Professional share / hide refused | `posts_insert_prepare` (a) / `post_hides_insert_guard` (a) (unchanged) |
| reads | unchanged policies (above) |
No server code reads `account_type` to allow a post write (c5). No SECURITY DEFINER, so `tests.approved_security_definer()` is unchanged.
Integrity note: the row-level "author is Regular" guarantee moves from an FK to the policy. Only the owner role, which runs
migrations and fixtures, could write a row the policy would refuse. No runtime role is the owner (rule 1).

**DR-2 correction — `followers` is not prepared now (recommendation; ORCHESTRATOR decides).** Adding it to
`posts_audience_value_check` is one statement. The rest of the change is not small, and it does not help I11:
(1) The Regular insert and update branches would need a new `audience in ('everyone','friends')` term, because today they rely
on the CHECK. (2) The data-model convention keeps an enum's value list once in `packages/shared`. A DB value the shared
enum lacks either breaks that convention, or pulls shared/server/web type changes into a migration-only PR, with a dead `followers`
case in every exhaustive switch (P6 scope). (3) A value with no defined meaning breaks "definitions are contracts".
Its meaning is I11's design, together with Follow: who counts as a follower, and what an unfollow does to past posts.
(4) I11 must still add Follow, a posts_select_viewer branch and the insert/update terms, so the CHECK widening saves it nothing
structural. Widening a CHECK on posts later is cheap: a validating scan, no rewrite. The Professional terms above say
`audience = 'everyone'`; I11 changes them to `in ('everyone','followers')`. → I11-commitments: Follow + `followers`
(CHECK, policies, shared enum) as one unit. If ORCHESTRATOR still wants it now, the exact delta is (1) plus the widened
CHECK plus the shared enum, and that is no longer migration-only.

**Migration** (one transaction, as app_owner): create the helper with its grants and comment. Drop the three FKs. Drop and
recreate `posts_insert_author`, `comments_insert_commenter` and `reactions_insert_reader`. `alter policy posts_update_author ...
with check`. Then the comments. No data written, no table rewrite. Dropping the FKs and changing the policies takes brief ACCESS
EXCLUSIVE locks on posts, comments, reactions, reaction_owners and regular_profiles. All are small.

**Rollback** (down script, written before the migration): (1) It refuses with a raise and deletes nothing if any posts
row (named), comments row or reaction_owners row has an author/liker without a regular_profiles row. Re-adding the FKs would
fail on those rows anyway; the refusal names the reason. (2) It restores the three policies to their exact
20261018100000/20261018200000 text and the three FKs with their original names and actions (`on delete cascade`). (3) It drops
the helper and restores the original comments, so the CI fingerprint check (down returns the same catalog) passes. It is
reversible as long as no Professional has written anything. After that, rolling back means deleting those rows first, and that
is a DECISION REQUEST.

**Backfill** none.

**Indexes** none added. `caller_account_type()` uses the users PK and runs once per statement. `posts_author_id_created_at_idx`
and `comments_author_id_idx` still serve the status-FK cascades: author_id is the leading column. reaction_owners'
`(user_id, target_id)` key serves its cascade. No existing query loses an index.

**Integrity** Cascades: a users delete still removes posts, comments and likes through the status FKs. A delete of a
regular_profiles row alone no longer cascades posts, comments or likes. Nothing deletes a profile apart from its user: account type
is fixed, and deletion is I9. The preview cleanup deletes feed rows explicitly, before the profile. No orphan risk: author_id still
references users. Anonymous rows are unchanged: author_id stays NULL and post_authors stays Regular.

**Blast radius / who is affected**
- Main's server (P6): it keeps working. `postFaultReply` already maps 42501 to 403 `not_allowed`. Admin, Moderator, anonymous and
  friends/tag refusals by a Professional move from 23503 to 42501 and stay 403. Comments, likes and feed still refuse a Professional
  in the service (`classifyViewer`) until PR b. **One behaviour of main changes:** `POST /api/posts {everyone}` by a Professional
  returns 201. Main's web shows Professionals a placeholder with no composer, and production has no Professional accounts
  (registration is Regular-only).
- Tests that PR-A3 must amend, as PR-A2 did with superseded assertions: `apps/server/tests/db/posts.db.test.ts:193` (F3.1-a c4
  Professional → 403, now superseded by c1/c2), `supabase/tests/71_feed_posts_access.sql:176` (Professional ordinary insert),
  `74_feed_comments_reactions.sql:119` and `:255` (Professional comment/like refused), `20_registration_structure.sql:391` (function
  list +1, "twenty-nine"), plus any EXECUTE inventory in `10_identity_structure.sql`. These stay true: 71:174, 82:118, 83:108,
  feed.db c12, comments.db c4, likes.db c10, anonymous-post.db c3.
- Server comments that go stale (PR b): `posts-service.ts:2` "a Professional is 23503".
- Ranking: the server's Friend and Stage terms are 0 for a Professional (no friendships, no journey). Whether the viewer uses the
  `regular_feed` configuration is ALGORITHM & DATA's call (no schema need). `is_by_author` and the quality count work for any author.
- regular_names: a Professional has no row, so the name is null and the web shows "מהקהילה" (DR-3). A2 has no overlap: it adds a
  regular_names policy and touches 60/79/81 tests and comments.db. This PR touches other objects. Rebase after A2 merges.
- Cleanup tool: no new table. Deletes are by user id and independent of type, so no change is needed.

**SQLSTATEs for the server** — nothing new. **42501**: every Professional refusal (anonymous, friends, stage tag, share, hide),
Admin/Moderator posting/commenting/liking, and stopped accounts. PATCH with a WITH CHECK failure raises 42501 and leaves the row
unchanged. **23514** `posts_audience_check` (Regular anonymous+friends) is unchanged; RLS runs before CHECK, so a Professional
gets 42501 there, not 422. `posts_body_length_check` is unchanged for everyone.

**pgTAP** (new file `85_professional_posting.sql`; P = 10_'s Professional, S/X stopped, admin/moderator fixtures if present, else
built in the file):
1. P inserts `everyone`, null tag → 1 row, author_id = P, is_anonymous false, author_status active.
2. P refused with 42501 and 0 rows, 0 post_authors: is_anonymous; `friends`; each stage_tag; a share.
   Suspended or banned P → 42501. Admin and Moderator → 42501.
3. P updates body → 1 row. Audience to `friends` or a stage_tag → 42501, row unchanged. Another user's update/delete of P's post → 0 rows.
4. `delete_post` by P → 1 and the row is gone. With an open report → 1 and held (status deleted).
5. Suspending P hides P's posts from B and from P (author_status cascade). Reactivating restores them.
6. B (Regular stranger) reads P's post. `regular_names` gives B no row for P.
7. P reads `everyone` posts and own posts, but not a friends-only post (exists: 71:143) or a hidden one. comments_select_viewer and
   reactions_select_reader show P what a Regular non-friend sees.
8. P comments and replies on a readable post and on their own (`is_by_post_author` true on own). P likes a post and a comment
   (`is_by_author` true on own). On a held/unreadable post or with stopped P → refused as F3.3. Admin/Moderator comment/like → 42501.
9. Regular insert/update matrix unchanged (F3.0/F3.4 files pass). Regular anonymous+friends is still 23514 `posts_audience_check`.
10. Structure: the three FKs are absent. `caller_account_type` is invoker, STABLE, search_path '', EXECUTE authenticated only.
    post_authors FK → regular_profiles is present. `approved_security_definer` is unchanged.
11. Down/up fingerprint (CI). The down refuses while a Professional post, comment or like exists.

**Reversible?** Yes, conditionally (see Rollback). It does not need Afik.
