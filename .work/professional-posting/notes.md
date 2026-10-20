# notes — professional-posting (code part: shared + server + web; PR-A3's migration notes are in fbdfe4a)

**Approach**        Server: `rankingStatement` takes a profile; `content` (Professional viewer) renders Freshness + Quality only, no
friendship/tag/`auth.uid()`/array parameter; the Regular render is byte-identical to F3.2 (compared with PgDialect before/after, 4
variants). `feed-service`: `rankingProfileOf(accountType)` picks the profile (Admin/Moderator → 403 not_allowed), `readsViewerStages`
is false for `content`, and `readOwnStages` sits in the Regular branch only. Shared `scoreContentPost` is the fixture reference.
Comments/likes: Professionals pass the service check. Posts: no code change (RLS decides). Web: the posting right `not-allowed` became
`everyone-only` (404 no_profile, D1); PostForm `everyoneOnly` hides box/audience/tag/name notice and shows "הפוסט יוצג לכולם" (the form's
aria-describedby when revealed; also in the edit form); the feed shows the list and composer for Professionals; no "הסתרה" item for
them; comment boxes without the name notice (`namesWriter`).

**Decisions**       `profile` is optional on the Regular variant of `RankingParameters` (absent = regular), so post-hides.db's existing
call still typechecks. PostScreen reads the posting right once and passes it to CommentsSection (was a second /api/profile call).
The composer is also hidden when the feed answers 403 (`blocked`): with D1 an Admin/Moderator would otherwise see a composer.
Professionals get no audience memory read/write.

**Deviations**      comments-service and likes-service still read account_type, now only to refuse Admin and Moderator. Their thread/
reply reads have no RLS refusal for those accounts (Gate 2 note, security-privacy-open, I4); dropping the check would open the reads.
This conflicts with TE's c5 static test (`comments`/`likes` services must not read account_type) — raised as a FINDING, not changed.

**Deliberately not done**   tests and e2e (TEST ENGINEER); I11 tag, followers, Professional name; shares (no web UI exists).

**Uncertain**       c5's intended scope (above). `canHide` keys on the posting right, which is "everyone-only" for any account
without a parent profile — fine today (only Professionals reach the feed among those).

**Evidence**        typecheck · lint (src) · check:stories ok. check:budgets and full lint fail only on TE's uncommitted
feed.db.test.ts (878 lines > 800). Unit: shared 472, web 1157 pass; server 882 pass, 2 fail = TE's c5 comments/likes static tests.
DB (`node tools/db-local.mjs test`, with TE's in-progress db tests in the worktree): 24 files, 848 passed, 5 skipped. pgTAP not run.

**Neighbouring**    none.
