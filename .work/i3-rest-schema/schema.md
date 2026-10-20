# schema — I3 rest (F3.4 names, F3.5 shares, F3.6 links, F3.7 reports, F3.8, F3.9 hides)

DATA ARCHITECT, 19.10.2026. Inputs: Schema needs of the six Gate-1 specs (`.work/_initiatives/I3-rest-gate1.md`), Afik 19.10 "Commenter names (question 7 → B)". Against migrations `20261018100000`, `20261018200000`, `20261018300000`, `20261019100000`.
F3.6, F3.8: no schema. Confirmed for F3.6: `posts.id` is `gen_random_uuid()` (v4, 122 CSPRNG bits, NFR-SEC-006); no table, policy, grant or cleanup change; `GET /posts/:id` 404 is unchanged.

**Delivery — split (one migration PR + one bootstrap PR) and one pre-step.** Why one PR is unsafe:
1. The pg_cron job cannot ship in a migration: it is bootstrap step 3 (data-model "bootstrap steps"; `app_owner` holds no cron rights and must never own a runtime job, rule 1/5), and it rests on an unverified provider assumption (E1 below). In the migration PR
   it would block F3.4/F3.9 on a provider question. → **PR-B** (no migration, not P6-gated): `supabase/bootstrap/03-cron*.sql`, the CI step and its contract test. Must be green and applied (preview, then prod by Afik) before F3.7 merges.
2. N1 deliberately changes what main's code returns (no code change, spec F3.4 c10). Main's `comments.db.test.ts` "[F3.3-b1 c7]" stranger row (`expected: null`) and the Restricted-commenter `name: null` assertion then fail in the P6 expand step, which runs
   main's tests unchanged. → **Pre-step T0** (DECISION REQUEST D1). Everything else is expand-safe (checked below). → **PR-A** (migration only + pgTAP + the two c7 expectations updated to the new rule): N1, S-share, S-hide, U-share, R-cap.

## Change (PR-A, one file, suggested `20261019200000_feed_i3_rest.sql`; down in `supabase/rollback/`)

**N1 regular_names** — one new permissive policy, 5 in all (party, post_reader, insert_own, profile_view, this): `regular_names_select_comment_reader` FOR SELECT TO authenticated USING `(select nestly.is_active_account()) and exists (select 1
from nestly.comments c where c.author_id = regular_names.user_id)`. The EXISTS runs under the caller's `comments_select_viewer`, which carries post readability (audience, friendship, hides, reporter-hides), held/deleted, parent status and commenter status. A NULL
`author_id` ("המחבר") never equals a user id: grants nothing; `post_authors` untouched. N2 confirmed: `authenticated` holds column SELECT on `comments.author_id` (F3.0b grant), the only column the EXISTS reads besides those the policy itself reads; no grant change.
**S-share posts_insert_prepare** (create or replace, still SECURITY INVOKER, `search_path ''`). For a share only, in this order: (a) caller gate: `not exists (select 1 from nestly.regular_profiles rp where rp.user_id = (select auth.uid()))` → raise
`42501` 'posts: not an active Regular account' (the own-row policy already requires `is_active_account()`); (b) read the original as today under the caller's RLS, now also selecting `author_id`; (c) refuse with **`NS002`** 'posts: the original cannot be shared' when
not found (unknown, unreadable, held, hidden/removed, author suspended/banned, hidden or reported by the caller), audience ≠ everyone, anonymous, a share, status ≠ active, **or `orig.author_id = auth.uid()`** (own post; FR-FEED-006). Non-share inserts unchanged.
Why (a): the BEFORE trigger runs before RLS WITH CHECK and the FKs, so without it a suspended caller would get NS002 (unreadable original) and a Professional NS002 or 23503 by original; with it, c6 is always 42501, c5 always NS002. RLS/FK stay the authority.
**S-hide post_hides_insert_guard** (create or replace, invoker). Order: (a) caller gate on `new.user_id` (= `auth.uid()` at runtime: `user_id` is never granted; `new.user_id` keeps the postgres fixture `tests.fx_ph_add` working) → `42501`; (b) readability:
`not exists (select 1 from nestly.posts p where p.id = new.post_id)` under the caller's RLS **and** `not exists (select 1 from nestly.post_hides h where h.user_id = new.user_id and h.post_id = new.post_id)` → **`NS004`** 'posts: the post cannot be hidden';
(c) own post (today's two reads) → **`NS003`** 'posts: a post cannot be hidden by its own author'. Readability before ownership: an own readable post is NS003 (c3 409), an own held/unreadable one NS004 (404). The (b) second test lets a repeat hide pass to
the PK (`on conflict do nothing` → 0 rows, c1 idempotent; without it 23505 as today). An unknown uuid now gets NS004 before the FK (no 23503 oracle, S1). Also new: a Professional's hide is refused (42501; was allowed by the users FK) — defence in depth for c7.
**U-share** — decided: the database refuses editing a share. New `nestly.posts_update_share_guard()` (invoker, `search_path ''`, EXECUTE revoked from PUBLIC); trigger `posts_update_share_guard` BEFORE UPDATE OF audience, body, stage_tag ON posts FOR EACH ROW
WHEN (old.is_share): if `(new.audience, new.body, new.stage_tag) is distinct from (old.…)` → **`NS005`** 'posts: a share cannot be edited'. Why: the UPDATE grant on these columns is generic (the PATCH path); the "share text immutable, tag NULL" rule of c3/c8 then
holds for any future path. Status changes (delete into held, `content_hold`) and the author_status cascade are not affected.
**R-cap reports** — `reports_details_length_check check (char_length(details) <= 1000)` (code points in a UTF-8 database; NULL passes); comment on `reports.details` updated ("cap 1,000 code points, F3.7 Q1"). NUL cannot be stored in `text` (Zod refuses it).
**Confirmed unchanged (F3.5):** share text capped by `posts_body_length_check` (2,000); `posts_audience_check` allows a share of either audience; `posts_shared_post_id_idx`; no new table, policy or grant. **Comments** on the three functions and the new policy state the codes above.

## SQLSTATE contract (server maps by code, never by message; add NS002–NS005 to the deterministic set in `lib/pg-error.ts`)

| Code | Raised by | Meaning → spec mapping |
|---|---|---|
| `42501` | share/hide triggers (a), RLS, privileges | caller not an active Regular account → F3.5 c6 / F3.9 c7 `403 not_allowed` |
| `NS002` | `posts_insert_prepare` | every F3.5 c5 refusal, one code, no reason → `403 not_shareable` |
| `NS003` | `post_hides_insert_guard` | own post → F3.9 c3 `409 own_post` |
| `NS004` | `post_hides_insert_guard` | unreadable/unknown post → F3.9 c2 `404 post_unavailable` |
| `NS005` | `posts_update_share_guard` | edit of a share → F3.5 c8 `400 share_not_editable` (backstop; the server refuses first) |
| `23514` | `reports_details_length_check` | F3.7 c3 backstop → 400 (Zod refuses first) |
`NS001` stays `profile_view`'s. Class `NS` is the project's custom class; never a standard class.

## Why
F3.4 N1/N2 (Afik Q7 B); F3.5 Schema needs 1–4 (FR-FEED-006, BR-064–066, c5, c6, c8); F3.7 Schema needs 2 (Q1); F3.9 S1–S3.

## Authorization (one enforcement point each)
Commenter names: `regular_names_select_comment_reader` (RLS), eligibility delegated to `comments_select_viewer`. Share eligibility: `posts_insert_prepare` over `posts_select_viewer`; caller: `posts_insert_author` + FK (the trigger's gate only orders the code, same
42501). Hide: `post_hides_*_owner` RLS + `post_hides_insert_guard` (readability, ownership). Share immutability: the guard trigger. No SECURITY DEFINER: `tests.approved_security_definer()` unchanged. **Recursion:** regular_names → comments → posts → friendships,
post_hides, reports, post_authors; none of them reads regular_names (pgTAP asserts; no 42P17). `profile_view` (app_owner inherits authenticated) sees extra name rows only for joins it never makes — the same as the F3.2 post_reader policy, accepted then.

## Migration — phase: expand (PR-A)
One transaction (CLI as app_owner): policy N1 + comment; replace the two trigger functions + comments; create the share guard function, trigger, revoke, comment; add the CHECK (validates existing rows: none written on main — no report route — fails closed otherwise;
brief ACCESS EXCLUSIVE on a near-empty table). P6 check of main's code on this schema: no share, hide or report route exists on main (posts routes forbid `sharedPostId`, c2 test); server fixtures share only others' posts and hide via postgres (`fx_ph_add`, kept working
by `new.user_id`); no main test PATCHes a share. The only main tests that break are the two c7 name assertions → T0.

## Rollback — `supabase/rollback/<same>.down.sql`
Drop the N1 policy; restore `posts_insert_prepare` and `post_hides_insert_guard` and their comments **verbatim from 20261018100000**; drop trigger + function `posts_update_share_guard`; drop `reports_details_length_check`, restore the old `reports.details` comment;
delete only its own history row. No data written, every row valid under the looser old rules: always safe, no refuse guard. Behaviour after down: strangers lose commenter names again (decision A shape), own-post shares allowed, hide oracle back.

## Backfill — none.
## Indexes — none new.
N1 probes `comments_author_id_idx` (author_id, partial NOT NULL; equality implies it), then the comments/posts policy per comment until the first readable one. Cost grows with a commenter's comments on posts the viewer cannot read; fine at MVP. At 100×: revisit
(the server could pass the thread's post; RLS cannot). Share own-check reads the same original row (PK). Hide (b) uses posts PK and `post_hides_pkey (user_id, post_id)`. Report CHECK: no index. Write cost: two trigger reads per hide, none added per post.

## Integrity — no new relation, FK or cascade. Orphans: none possible. Temporal: no new field; cron schedule in UTC (below).

## Blast radius
- regular_names readers: comments repository (names per thread: strangers now get names, Q7 B), feed repository (post authors: unchanged), friends lists (unchanged), `profile_view` (unchanged output). F3.3w2 branch tests and e2e that expect a stranger's
  commenter name `null` must be updated with PR-A (ORCHESTRATOR: check `work/comments-likes-w2-tests`).
- pgTAP amended in PR-A: `79` regular_names policy count 4 → 5; `70` "no function body mentions post_hides" excludes `post_hides_insert_guard` by name (the table's own guard; 7א intent — never a ranking input — unchanged); `70` trigger-function
  list gains `posts_update_share_guard`; `71` own-post hides 42501 → NS003, random-id hide → NS004; any fixture sharing its own post → NS002.
- **Cleanup tool:** no change. No new table (22 stay), delete order unchanged; new triggers are INSERT/UPDATE only; the CHECK and policy do not affect deletes. Purge on preview may delete held rows a cleanup run also deletes: second delete sees 0 rows.

## pgTAP for TEST ENGINEER (from the specs; fixtures via the harness; codes from this table, not the migration text)
- **81 names (F3.4 c9):** stranger S reads C's name via C's readable comment and via a reply on an everyone post; 0 rows when the comment is held (open report + `delete_comment`), hard-deleted, C suspended / banned, the post friends-only to S, hidden by S, reported by S, or
  the reply's parent held; A's "המחבר" comment alone → 0 rows of A's name, 0 `post_authors` rows; a suspended S reads 0; fixtures keep C from authoring any post S can read; structure: 5 policies, the new one permissive SELECT TO authenticated, no other table's policy
  mentions regular_names, definer list unchanged, `select` on regular_names raises no 42P17.
- **82 shares (F3.5 c5 c6 c8):** NS002 and 0 rows for own post, a share (own and others'), friends-only (also as Friend), anonymous, held, hidden, removed, author suspended / banned, unknown uuid (not 23503), friends-only of a non-Friend, hidden or reported by the
  caller; author's Restricted profile → OK:1; suspended caller → 42501 (not NS002) on a shareable and an unshareable original; Professional → 42501 (not NS002/23503) both ways; text 2,001 → 23514 `posts_body_length_check`; share UPDATE of body / audience /
  stage_tag → NS005, row unchanged; no-op UPDATE passes; `delete_post` of a share → 1 (and held with an open report); a named post's PATCH columns still update.
- **83 hides (F3.9 S1–S3):** readable other's post OK:1; repeat with `on conflict do nothing` OK:0, one row; plain repeat 23505; NS004 and 0 rows for a non-Friend's friends-only post, held, hidden, removed, suspended author, a post the caller reported, unknown uuid (same
  code as friends-only); own named and own anonymous → NS003; own held → NS004; suspended or Professional caller → 42501; B and the author read 0 of A's rows, B deletes 0 of them (71 covers; re-assert only if missing).
- **84 report cap (F3.7 c16):** 1,000 × '😀' (astral, 1,000 code points) OK; 1,001 → 23514 `reports_details_length_check`.
- **85 purge schedule (PR-B, F3.7 c16):** via a postgres fixture `tests.fx_cron_jobs()`: exactly one job `nestly_purge_held_content`, schedule `17 3 * * *`, command `select nestly.purge_held_content()`, username `app_jobs`, active, database `postgres`; no cron job
  owned by postgres/app_owner/supabase_admin mentions `nestly.`. Purge behaviour itself: `76` (unchanged).

## PR-B — purge schedule (bootstrap step 3; spec F3.7 Schema needs 1)
`03-cron.sql`, run as postgres, once per environment, one transaction, idempotent: `create extension if not exists pg_cron with schema pg_catalog`; `grant usage on schema cron to app_jobs`; `grant app_jobs to postgres with inherit false, set true` (postgres holds ADMIN on
it, step-1 check); `set local role app_jobs`; `cron.schedule('nestly_purge_held_content', '17 3 * * *', 'select nestly.purge_held_content()')` (job username = app_jobs: the purge runs as app_jobs under the existing TO app_jobs policies, never owner/superuser); `reset role`;
revoke that SET membership (step 1's check stays exact). Daily 03:17 UTC (≥ once a day; release is late by < 24 h at most). `03-cron-check.sql` (the assertions of 85); `03-cron-down.sql` unschedules the same way and revokes cron usage (extension stays).
Migration down never touches it; F3.0b's down (drops the function) must run after `03-cron-down.sql` — note added to its map entry. CI `db` job: run 03 after the migrations, then the check. Run history (`cron.job_run_details`): ~365 rows a year, kept.
**E1 — critical external assumption (TEST ENGINEER contract test, before F3.7 merges):** on Supabase PG 17.11, a pg_cron job whose username is the NOLOGIN, passwordless `app_jobs` runs. Failure scenario: the job never runs (pg_cron connects by libpq, or the
background worker refuses a NOLOGIN role); held content is never purged and reports never expire — silent, so the test must look for a `succeeded` run. Test: CI, committed outside pgTAP, as app_jobs schedule a `5 seconds` job running `select 1`, poll
`cron.job_run_details` ≤ 60 s for `succeeded`, unschedule. CI's image only approximates hosted config, so also on nestly-preview (agent via `tools/db-preview.mjs`): run 03 + check, then confirm a `succeeded` run the next day, before Afik runs it on prod.
Fallbacks, in order, if E1 fails: **A2** job username postgres, command `set local role app_jobs; select nestly.purge_held_content()` (the purge itself still as app_jobs; postgres keeps the SET membership; step-1 check updated) — DA-approved conditionally here;
**B** a code job in a separate Vercel project with its own app_jobs credential (rule 6) — needs LOGIN + a password Afik enters;
**C** a GitHub Actions schedule — not in rule 6, a credential in GitHub: DECISION REQUEST to Afik. pg_cron on our plan: available on every Supabase plan incl. Free per Supabase's extension list (not re-verified here; the preview run proves it).
Docs in PR-B: bootstrap README step 3, `01-roles.sql` app_jobs header (first job decided), data-model F3.0b exception (+ schedule).

## D1 — T0 pre-step (DECISION REQUEST to ORCHESTRATOR; default if unanswered: option 1)
1. **Recommended:** a tests-only PR to main first marks exactly the two superseded c7 assertions `it.skip` citing Afik 19.10 Q7 B (or carries it in F3.3w2's PR); PR-A restores them with the new expectations (stranger and Restricted commenter → full name).
2. A gate-only PR teaching the expand step a reviewed list of superseded main tests (durable; ci.yml is a gate file).
3. Afik merges PR-A by hand with only those two failures. Not option 4: a schema-adaptive test.

## Reversible?
Yes — PR-A has a data-free down script; PR-B has `03-cron-down.sql`. No DECISION REQUEST to Afik for irreversibility.

## PR-B revision 20.10 — E1 failed; A2 confirmed
Superseding PR-B/E1 above where they conflict: `.work/i3-rest-schema/pr-b-2010/schema.md` (job owned by postgres, command `set role app_jobs; select nestly.purge_held_content()`).
