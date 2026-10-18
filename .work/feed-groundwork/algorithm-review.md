# ALGORITHM & DATA review of schema.md / schema-b.md — 18.10.2026 (returned as text; saved by ORCHESTRATOR)

Findings (summary of the reviewer's text, severities and owners unchanged):
1. Medium — DATA ARCHITECT. schema.md:66 `algorithm_configurations_select_active` = `is_active` makes the "last known good version" fallback (I3-algorithm.md:123) unbuildable. Fix: SELECT policy over every row of the surface (versioned constants, not personal data); last good = highest version below active that passes Zod; adjust c18 wording.
2. Medium — DATA ARCHITECT. schema.md:74 partial `posts_feed_idx` (status/author_status active) stops being usable after schema-b.md:44-45 adds an OR branch to `posts_select_viewer`; feed falls back to seq scan, and the only workaround is an app-code filter (forbidden). Fix: non-partial `(created_at desc, id desc)`; prove with EXPLAIN as `authenticated` after b.
3. Medium — DATA ARCHITECT. schema-b.md:27-32, :87 likes of suspended/banned accounts keep counting toward wQuality (like-ring survives a ban; inconsistent with comments). Fix: carry liker status without identity (e.g. `reaction_owners (user_id, liker_status) → users (id, status)` ON UPDATE CASCADE, `reactions (id, liker_status) → reaction_owners` ON UPDATE CASCADE), `liker_status = 'active'` in `reactions_select_reader`.
4. Medium — A&D doc: score in double precision, cursor carries it as a JS number.
5. Low — A&D doc: configVersion 0 reserved for fallback-recency-v0.
6. Low — A&D doc: define n precisely (likes on the post + comments incl. replies, RLS-visible, author excluded by flags, active accounts only).
7. Low — A&D doc: allow-list of feed-query inputs; F3.2 review checks the feed SQL never references post_hides, reports, post_authors, reaction_owners, journey_contexts, or scores author_visibility.
8. Low — Afik (privacy): suspending/reactivating an author hides/shows their named and anonymous posts in the same statement → a watcher could correlate them (BR-065/BR-073 consequence).
9. Low — A&D doc: mark DR-1..DR-4 answered.
ORCHESTRATOR: finding 3 reopens Gate 2's "Accepted" (yes). Findings 1–3 → DATA ARCHITECT, validated by A&D. 4–7, 9 → A&D edits I3-algorithm.md before F3.2. 8 → Afik.

**Validation (A&D, 18.10):** findings 1–3 fixed in schema.md / schema-b.md and spec re-amend; no new findings. Side finding (likes drop together on suspension) joins DR-6 for Afik, default accept.
- **ORCHESTRATOR 18.10 (TE finding 3):** intended — after G2 a commenter keeps reading (and can delete) their own active comment under a post that is held; the held post itself stays hidden from everyone (c14 applies to the held content).
- **ORCHESTRATOR 18.10 (BUILDER column grants):** posts.author_id, comments.author_id, comments.is_by_post_author, reactions.is_by_author stay readable (named author/commenter display, the המחבר mark; anonymous author_id is NULL). Only held_xact (posts, comments) and reactions.liker_status are excluded. reaction_owners.user_id / reports.reporter_id: owner-only rows by RLS.
