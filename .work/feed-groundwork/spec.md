# feed-groundwork (F3.0) — data layer of I3

**Problem**        F3.1–F3.9 have nowhere to store a post, comment, like, report or ranking setting, and nothing yet guarantees that an
anonymous author stays hidden, a deleted post is gone, or a friends-only post stays with friends. The Preview cleanup tool does not know
these tables and still has a manual `backlog` mode (audit B1; debt.md 2026-10-17).
**Requirements**   FR-FEED-001..003, 005, 006 · FR-MOD-001 (store only) · FR-ALG-002 (config) · BR-062, 064–066, 073, 074 · VAL-036, 038 ·
AC-075..077 (data guarantees) · §13 Post/Comment/Reaction/ContentMetadata/Report/AlgorithmConfiguration · OP-019, OP-033 · Afik 1א–8א
(`I3-questions.md`) · data-model rules 15, 19, 20 · S-26 · `I3-algorithm.md` (pipeline 1, Configuration).
**Scope**          Tables, RLS, grants, constraints, pgTAP for: posts (text, audience, anonymous flag, optional author-chosen tag, share
reference, status) · anonymous real-author separation · comments, one reply level · reactions · reports · per-viewer hides ·
algorithm_configurations with the seeded v1 row · held-deletion purge routine · cleanup-tool update and `backlog` removal.
**Out of scope**   Endpoints, screens, Zod forms, services (F3.1–F3.9). Moderator/Admin reveal of an anonymous author (rule 19, I4); report
queue, ladder, "handled" action (I4); user block (I4); account-deletion flow and grace state (I9; policies key on `users.status = 'active'`,
so any later status is excluded); images (I5); mentions (I7); groups (I10); analytics events (4א, I15); "not interested" and any learning
from hides (I15); scheduling the purge job (F3.7); post text length limit and composer (F3.1).
**Data touched**   New tables only (DATA ARCHITECT's schema.md owns names/columns); reads `users.status`, `friendships`, `regular_profiles`;
`tools/preview-e2e-cleanup.ts`, its CLI and workflow. **Risk flags**  schema migration · auth/authz · personal data → Elevated.

**Acceptance criteria** (pgTAP unless stated; a = F3.0a, b = F3.0b, see Size)
1. 🔴 [a] Every new table has RLS enabled and at least one policy; `anon`/PUBLIC hold no privilege on any; `authenticated` and `app_server` hold
   only the grants the criteria below need; no function is SECURITY DEFINER unless schema.md lists it as approved. (Platform rules)
2. 🔴 [a] Eligibility (FR-FEED-001, BR-065, BR-073, rule 15): a post is returned to a viewer only if the viewer is active, the post status is
   `active` and its author is active. Fixtures: author suspended, author banned, post hidden, removed, deleted, viewer suspended → 0 rows each; all active → the row.
3. 🔴 [a] Audience (OP-033): an `everyone` post is returned to any eligible viewer. A `friends only` post is returned to its author and to an
   accepted friend of an active author; not to a stranger, a pending request, a declined or removed friend, or a suspended friend.
4. 🔴 [a] Anonymous (6א, FR-FEED-005 r.3, BR-062, VAL-036): insert or update of a post with anonymous = true and `friends only` is refused; an
   anonymous post reaches a friend of its author only as it reaches a stranger (`everyone` path); a Professional's anonymous insert is refused.
5. 🔴 [a] Author separation (rule 20, AC-075, S-26): for an anonymous post the author store returns the author their own rows and 0 rows to
   every other user; no column another user can read on any new table contains an anonymous post's author id; no view or policy exposes it.
6. 🔴 [a] Post writes: insert with another user's id as author is refused; a non-author's update or delete changes 0 rows; the author cannot
   set status hidden or removed (only delete); audience cannot be edited into the state refused by 4.
7. 🔴 [a] Tag (5א): a post inserts with no tag (null); a tag outside the allowed list is refused; a post by a user with a pregnancy or child
   profile stores null unless the author sent a tag (nothing reads `journey_contexts`).
8. 🔴 [a] Share (2א, BR-064/066, VAL-038): a share is refused when its original is `friends only`, anonymous, not active, itself a share, unreadable
   to the sharer, or by an author whose profile is `restricted`. A valid share stores the original id and optional sharer text, no original content.
9. 🔴 [a] Share view (BR-065, ERR-033): a viewer who cannot read the original (author suspended, original deleted) still gets the share row
   with its text and 0 rows for the original; when the original is eligible again it is returned.
10. 🔴 [b] Comments (FR-FEED-003): returned only to a viewer who can read the post and only while the commenter is active; insert on an unreadable
    post or with another user's id is refused; a reply to a reply, or to a parent on another post, is refused.
11. 🔴 [b] "המחבר" (AC-076, FR-FEED-005 r.1): a comment by the real author on their anonymous post is marked by the database; a client-sent mark
    by anyone else is refused; other readers get the mark and no author id; other commenters keep theirs.
12. 🔴 [b] Reactions: one like per (user, target); a second is refused; the target must be a readable post or comment; users delete only their
    own; rows are readable by their owner only; a count for a readable target is obtainable and nothing for an unreadable one.
13. 🔴 [a post, b comment] Deletion (3א): the author's delete of content with no open report removes the row and, in the same transaction, its
    comments, replies, reactions, hides and separation row; shares of a deleted post remain (see 9).
14. 🔴 [b] Held deletion (3א): deleting content with an open report leaves it hidden from every viewer including its author, with a release time
    at most 90 days after the delete (later is refused); the purge routine removes it once the report is handled or the time has passed, not
    before, and nothing remains. Callable by the jobs role only.
15. 🔴 [b] Reports (FR-MOD-001, BR-074): a user reports a readable post or comment, or another user, with one of the 8 decided reasons
    (`docs/decisions-before-i3-i5-HE.md` §3) and optional text; an unknown reason, a self-report, or a second report by the same user on the same
    target is refused (the 3-report threshold counts people). Rows are readable by the reporter only.
16. 🔴 [a hides, b reporter] Hides (7א, 8א): a post the viewer hid, or reported (b), is returned to that viewer 0 times and still to other eligible
    viewers; hide rows are readable and writable by their owner only; no other policy, function or view depends on the hide or report tables (`pg_depend`) — never a ranking input.
17. 🔴 [a] No events (4א): the migration creates exactly the tables schema.md names and no table, trigger or function recording a view,
    impression, click or dwell.
18. 🔴 [a] Configuration (BR-059): a seeded v1 row, surface `regular_feed`, active, holds the defaults of `I3-algorithm.md` (wFresh 1.0, halfLifeHours 24,
    wFriend 0.5, wQuality 0.2, qualityCap 20, wStage 0, scoredWindowDays 14, 2/5, maxAnonymousInWindow 2, pageSize 20) plus version, createdAt, createdBy,
    reason. Update and delete of a row are refused; a second active row is refused; out-of-range values (wStage 3, pageSize 4, maxSame > window) are
    refused; `authenticated` and `app_server` can select the active row and get 42501 on insert, update, delete.
19. 🟡 [a] Cleanup tool (audit B1; tool test + CI): `EXPECTED_NESTLY_TABLES` lists the new tables and the drift check passes on the migrated database;
    a test user owning a post, share, comment, reaction, report, hide and anonymous post is deleted without error and leaves no row; the `backlog`
    mode is gone from parser, CLI, workflow input and `MAX_BACKLOG_PER_RUN` (input `backlog` rejected); the debt.md row is closed.
20. 🟡 [a, b] P6: each PR changes only `supabase/migrations`, `supabase/tests`, `tools` and records; nothing under `apps/` or product code in `packages/shared/src` (CRITIC checks the diff).

**Open**
- DECISION REQUEST (Afik, report policy): 7א hides a reported **post** for the reporter. Also a reported **comment** or user? SRS silent. Recommend yes for a
  comment (same expectation, no one else affected), no for a user. **Until answered:** posts only.
- DECISION REQUEST (Afik, privacy): does a `restricted` profile change feed eligibility of its `everyone` posts? SRS says only "not shareable" (BR-064/065).
  Recommend no change. **Until answered:** criterion 8 only.
- Tag list → **assumed:** closed list `JOURNEY_STAGES` (planning, pregnant, has_child); topics join with F3.1's picker by an additive migration. Free text is refused (identifies an anonymous author).
- Shares cannot be anonymous → **assumed:** BR-066 names the sharer; BR-064 forbids sharing anonymous posts.
- Deleting a top-level comment deletes its replies → **assumed:** a reply cannot stand without its parent in a one-level thread.
- Purge scheduling (`app_jobs`) → **assumed:** wired in F3.7, the first part that can open a report; before it no held content exists.
- For DATA ARCHITECT: held content vs a later account-deletion cascade (I9); rule 20 says the author reads their separation rows, the brief "not readable by users" — read as other users.

**Size estimate**  ~900 lines of diff with pgTAP and tool: **split.** F3.0a = posts, separation, shares, tag, self-hide, immediate delete, configuration,
cleanup + `backlog` removal (1–9, 13 post, 16 hides, 17–20). F3.0b = comments, reactions, reports, held deletion and purge, reporter-hide (10–12, 13 comment,
14, 15, 16 reporter). ~450 each, each its own migration PR (P6); b depends on a.

**Gate 1 (ORCHESTRATOR, 18.10.2026):** approved against the SRS and 1א–8א. Split accepted: **F3.0a** then **F3.0b**, one slug, each its own
migration PR (P6). The two DECISION REQUESTs go to Afik; their "until answered" defaults apply and are additive later. Assumptions accepted as reasoned.
**Gate 2 (ORCHESTRATOR, 18.10.2026)** — schema.md (a) and schema-b.md (b) approved; denormalised `author_status`/`author_visibility` with composite
FKs approved (F2.4a precedent). Amendments, as DATA ARCHITECT found the wording unbuildable under the Platform rules:
c18 → `authenticated` (inside the app_server transaction) selects the active row; `app_server` as itself gets 42501 on every command (rule 2).
c12 → a like is two rows: an id-free `reactions` row readable by whoever can read the target (counts; unreadable target = 0) and an owner-only
`reaction_owners` row (who liked). c16 → `pg_depend` allows exactly the table's own objects plus `posts_select_viewer`.
Defaults taken: `is_anonymous` immutable after insert · post/comment/like Regular-only in I3 (I11 widens) · no comment editing in I3.
**Afik 18.10 (final):** a reported comment or user stays visible to everyone incl. the reporter (Open item 1 closed: posts only, per 7א) ·
Restricted limits only profile viewing, no effect on posts (Open item 2 closed; c8's restricted-author clause removed). Still with Afik: expired report at 90 days (default `expired`), anonymous/suspension correlation (default accept).
Gate 2 re-amend (DATA ARCHITECT, A&D 1–3): c18 → last clause "`authenticated` (in the app_server transaction) selects every version,
active and retired, and gets 42501 on every write; `app_server` as itself gets 42501 on every command"; c12 → "One like
per (user, target); a second is refused; the target must be a readable post or comment; each deletes only own; the id-free row is
readable while its target is readable and liker active, the owner row by its owner only; a readable target's count includes only active
likers (suspend/ban removes, reactivation restores); unreadable gives 0"; c8 → "Share (2א, BR-064/066, VAL-038): a share is refused
when its original is `friends only`, anonymous, not active, itself a share, or unreadable to the sharer. A valid share stores the original id
and optional sharer text, no original content."
