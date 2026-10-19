# schema — comments-likes part a (I3 F3.3a): comment length CHECK, column comments vs grants

Gate 2 contract. DATA ARCHITECT, 19.10.2026. Source: spec.md c1 (Gate 1 approved), algorithm-review.md finding 8. One schema PR (P6), before b1.

**Change**
- `nestly.comments`: add `constraint comments_body_length_check check (char_length(body) <= 1000)`. Before: only `comments_body_check` (non-blank).
  After: both. `body` stays `text not null`, no default; `comments_body_check` and `posts_body_length_check` (2,000) unchanged.
- `char_length` counts code points, not bytes: 1,000 Hebrew letters (2,000 bytes) pass; niqqud and emoji ZWJ parts count one each, exactly as shared Zod (c2).
- Column comments only (COMMENT ON, catalog metadata; no grant, policy or data change). Seven comments say "never granted" for a column that a client role
  can SELECT; the grants are right (each is needed and RLS limits rows), the comments are wrong. New texts (verbatim; `''` as SQL quoting):
  1. `posts.author_id`: 'The named author (database default auth.uid(), a Regular profile); NULL on an anonymous post (set by posts_insert_prepare). Readable under
     posts_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.'
  2. `post_authors.author_id`: 'The real author (default auth.uid(); a Regular profile). Readable only by that author (post_authors_select_author, table SELECT grant);
     no INSERT or UPDATE grant. API responses never emit it.'
  3. `comments.author_id`: 'The commenter (default auth.uid()); NULL only for the real author of an anonymous post (comments_insert_prepare). Readable under
     comments_select_viewer (column SELECT grant; the server joins names on it); no INSERT or UPDATE grant. API responses never emit it.'
  4. `comments.is_by_post_author`: 'AC-076 "המחבר": set by comments_insert_prepare. Readable under comments_select_viewer (column SELECT grant; the server renders
     byAuthor from it); no INSERT or UPDATE grant.'
  5. `reactions.is_by_author`: 'The liker is the content''s author (reactions_insert_prepare); the quality count excludes it. Readable under reactions_select_reader
     (column SELECT grant; ranking SQL reads it); no INSERT or UPDATE grant. Carries no identity. API responses never emit it.'
  6. `reaction_owners.user_id`: 'The liker (default auth.uid(); a Regular profile). Readable only by that liker (reaction_owners_select_owner, table SELECT grant);
     no INSERT or UPDATE grant. API responses never emit it.'
  7. `reports.reporter_id`: 'The reporter (default auth.uid()); ON DELETE RESTRICT: I9 decides the minimal record. Readable only by that reporter
     (reports_select_reporter, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.'
- Two stale cap comments: `comments.body` → 'The text of a comment or a reply: 1-1,000 characters (comments_body_check, comments_body_length_check; shared
  COMMENT_BODY_MAX).'; `posts.body` → 'The text, or the sharer''s text on a share; NULL only on a share. At most 2,000 characters (posts_body_length_check).'
- Correct as written, untouched: `posts.held_xact`, `comments.held_xact`, `comments.parent_status`, `reactions.liker_status`, `recovery_events.occurred_at`.

**Why**
- c1: new VAL (SRS gap, ID at I3 close) comment 1-1,000 characters; the database enforces the same number as shared Zod, so a bypass of the server cannot store more.
- Finding 8: definitions are contracts; a comment that contradicts the grant misleads the next reviewer into "fixing" a needed grant. Fixing the grants instead would
  break ranking (`is_by_author`), `likedByMe` (c12, `reaction_owners`), name joins and "המחבר" (c6), and a reporter's own list (F3.7). Comments it is.
- Replies are `comments` rows (`parent_id`): the same CHECK covers them; no separate rule. Share text is `posts.body`: already 2,000 (F3.1); nothing needed.

**Authorization**   Unchanged. RLS stays the single enforcement point; no policy, grant, role or function changes. No SECURITY DEFINER;
`tests.approved_security_definer()` unchanged. The CHECK is integrity, not authorization. `is_by_author` readable to a target's readers reveals only "the author
liked it", never who (no identity column on `reactions`); the API emits neither it nor any `user_id`/`author_id` (spec c3, c6, c10, c11).

**Migration**   `supabase/migrations/20261019100000_comment_body_cap.sql`, phase **expand** (main's code writes no comment, so nothing it does can fail).
1. `alter table nestly.comments add constraint comments_body_length_check check (char_length(body) <= 1000);`
2. `comment on constraint comments_body_length_check on nestly.comments is` 'VAL (F3.3 c1): a comment or reply is at most 1,000 characters; shared COMMENT_BODY_MAX.'
3. The nine `comment on column …` above. Header in house style: source (this file), SRS (FR-FEED-003, BR-062, platform rule 1), "No SECURITY DEFINER", down path.
- Applied by the CLI as app_owner in one transaction with its history row. ADD CONSTRAINT takes ACCESS EXCLUSIVE on `comments` and scans it: the table is empty
  or near-empty everywhere (below), so milliseconds; NOT VALID + VALIDATE is not warranted.

**Rollback**   `supabase/rollback/20261019100000_comment_body_cap.down.sql`, as app_owner (guard `current_user`), one transaction:
1. `alter table nestly.comments drop constraint comments_body_length_check;`
2. Restore the nine previous texts verbatim from their source lines: feed_posts.sql 328 (posts.author_id), 337 (posts.body), 350 (post_authors.author_id);
   feed_interactions.sql 628, 630, 631, 644, 648, 654.
3. Delete only its own history row (`version = '20261019100000'`).
- Safe at any time: dropping a CHECK only loosens; no data touched. If b1 has merged, revert it first only to keep the server's 422 mapping meaningful (Zod still caps).
- CI up → down → up compares the catalog fingerprint (constraints included). Against preview/prod: Afik only, as every down script.

**Backfill**   None. Existing rows cannot violate: no product code inserts comments (server reads only a count in feed-repository.ts:147; no web/e2e writer);
pgTAP/db fixtures use short bodies (`tests.fx_cm_add` default 'comment body') inside rolled-back transactions. If a prod row ever exceeded 1,000, the ADD fails
and the transaction rolls back cleanly (no partial state) — a stop, not a corruption.

**Indexes**     None. A CHECK needs no index; no query shape changes. Write cost: one `char_length` per comment insert/update.
**Integrity**   No relation added; cascades unchanged. `body` NOT NULL, no default. No client UPDATE grant on `body` (only `status`), so the CHECK guards inserts and any
privileged update (I4 moderation, future edit). No orphan risk.

**Blast radius / who is affected**
- F3.3 b1: shared `COMMENT_BODY_MAX = 1000` must equal this number; `apps/server/src/lib/pg-error.ts` maps `23514` on `comments_body_length_check` the way it maps
  `posts_body_length_check` (422 `body_too_long`, spec c2). Ranking/feed SQL: unaffected (no column or predicate change). F3.2 tests: unaffected.
- Cleanup: `tools/preview-e2e-cleanup-cli.ts` and the per-user order (reports, reactions, post_hides, comments, posts) unchanged; F3.0b down script unaffected (drops
  the table, the CHECK goes with it; CI up → down → up runs only the newest migration). Suite growth: one small pgTAP file, no shard or timeout change.
- `.claude/knowledge/data-model-tables.md` "Feed tables": add "comments.body ≤ 1,000 characters (F3.3a)"; DATA ARCHITECT in the same PR.
- No external provider or Auth behaviour changes: no contract test needed.

**pgTAP for TEST ENGINEER** (expected values from spec c1 and the VAL, not from the migration text)
- New `supabase/tests/80_comment_body_cap.sql`, run as app_server, writes via `tests.dml_as('authenticated', …)` on a readable post (pattern of 78):
  1. 1,000 ASCII → `OK:1`; 1,000 Hebrew (U&'\05D0') → `OK:1` (characters, not bytes); same for a reply (`parent_id` set).
  2. 1,001 ASCII and 1,001 Hebrew → `ERR:23514` on insert; reply of 1,001 → `ERR:23514`; very long (100,000) → `ERR:23514`; 0 rows written each time.
  3. Update: authenticated `update … set body` → `ERR:42501` (no grant; proves no client path). Then a test-schema owner helper (new fixture, e.g. `tests.fx_cm_set_body`,
     SECURITY DEFINER in `tests` like its neighbours) sets 1,000 → ok and 1,001 → 23514, stored body unchanged.
  4. Blank (`'   '`) still → 23514 via `comments_body_check`; a 2,000-character post and share text still insert (posts cap unchanged).
  5. Comment texts: `col_description` of the nine columns equals the texts above (exact). Invariant: no `nestly` column whose description matches `(?i)never granted`
     has any column or table privilege (SELECT, INSERT, UPDATE, REFERENCES) for `authenticated` or `anon`; non-vacuous (≥ 5 such columns exist).
- Update `supabase/tests/73_feed_interactions_structure.sql` lines 121-127: add `comments_body_length_check` to the name list and `comments_body_length_check:c` to the
  expected string; assert its definition `CHECK ((char_length(body) <= 1000))` via `pg_get_constraintdef`. No other structure file pins comments or these constraints.

**Reversible?**   Yes. Down script drops the constraint and restores the comments; no data lost. No Afik decision needed.
**Gate 2 (ORCHESTRATOR, 19.10):** approved. data-model-tables.md cap line is a protected file → WORKPLAN "ממתין לך" (Afik asleep), not in this PR.
