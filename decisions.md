# Decisions

**Read the "In force" index below before proposing an approach.** Re-proposing a rejected alternative wastes Afik's
time and burns tokens. The full entries — reasons, alternatives rejected, accepted costs — are in `decisions/<YYYY-MM>.md`.
Read the entry an index line points to when the topic is yours; to search the archive, ask SCOUT.

**Adding a decision** (`/decision` does this): append the full entry to `decisions/<YYYY-MM>.md` of its date, in the format
below, then add one line to "In force". When it supersedes or updates an earlier decision, move that line to "Superseded"
(or edit its "updated by" note). Full entries are append-only and never edited; only this index changes.

```
YYYY-MM-DD | <decision in one line>
  alternatives: <what else was considered>
  why:          <the reason>
  accepted cost: <what we are knowingly giving up>
  decided by:   <who>
```

---

## In force

Month = the archive file. "upd." = updated by a later entry, which is listed too.

| Date | Decision | Month |
|---|---|---|
| 2026-09-12 | ORCHESTRATOR is the main loop, not a separate agent | 09 |
| 2026-09-12 | BUILDER is a subagent, not the main loop | 09 |
| 2026-09-12 | Six agents, not eleven — split only where context is disjoint (upd. 10-10 ALGORITHM & DATA, 10-11 design consistency) | 09 |
| 2026-09-12 | Gate 2 is scoped by risk (schema, irreversible, external provider), not every feature | 09 |
| 2026-09-12 | As-built is the repo plus two maintained knowledge files (data model, conventions) | 09 |
| 2026-09-12 | Gate quality is measured both ways: escapes.md and noise.md | 09 |
| 2026-09-12 | Improvement is budgeted and provisional: caps, 3-occurrence threshold, 5-feature trial, never stacked | 09 |
| 2026-09-12 | Learning lands in knowledge files, not agent definitions, by default | 09 |
| 2026-09-12 | Primary market at launch: Israel only (no GDPR scope at launch) | 09 |
| 2026-09-12 | CRITIC and TEST ENGINEER stay separate (TEST ENGINEER never sees the diff) | 09 |
| 2026-09-12 | Database: PostgreSQL via Supabase, one source of truth; derived stores only as rebuildable copies | 09 |
| 2026-09-12 | Authorization is enforced in the database, via RLS | 09 |
| 2026-09-12 | UI: React + Tailwind | 09 |
| 2026-10-10 | Test tooling follows SRS NFR-QA-001: Vitest + RTL, Playwright (Chrome, Edge), axe, pgTAP, npm audit; tests in repo | 10 |
| 2026-10-10 | The SRS is markdown in docs/srs/, split per section; the Word file is archived | 10 |
| 2026-10-10 | SRS scope, versioning (minor per batch) and Word export (D1) | 10 |
| 2026-10-10 | ALGORITHM & DATA agent owns purpose limits, ranking rules, events, evaluation (D2) | 10 |
| 2026-10-10 | AI/ML agent dormant; AI ideas recorded in the SRS; entry conditions in ai-ml-readiness.md (D3) | 10 |
| 2026-10-10 | Product decisions D5 and D6 live in the SRS (2.3) | 10 |
| 2026-10-10 | External engineering guidelines: nine practices adopted (A1–A9), the coordination layer rejected | 10 |
| 2026-10-10 | Web build: Vite, React single-page app (upd. 10-11 "Vite stays") | 10 |
| 2026-10-11 | Rule 0: all product code in TypeScript, strict, no any or ts-comments (supersedes the JS iron rule) | 10 |
| 2026-10-11 | Own server: Node.js + TypeScript on Fastify, route → service → repository (upd. 10-11 Hosting) | 10 |
| 2026-10-11 | Monorepo, npm workspaces: apps/web · apps/server · packages/shared · apps/mobile later | 10 |
| 2026-10-11 | Supabase: Postgres + Auth; Data API off for the product schema; Storage TBD (upd. 10-11 Hosting: Realtime) | 10 |
| 2026-10-11 | Database access: Drizzle, roles that cannot bypass RLS, user identity in every transaction | 10 |
| 2026-10-11 | Audit written by the database in the same transaction; protected reads through audited functions | 10 |
| 2026-10-11 | Zod for validation, in packages/shared | 10 |
| 2026-10-11 | Traceability: FR/AC IDs in test names, an `Implements:` line in commits | 10 |
| 2026-10-11 | Web build: Vite stays, reason updated (the server is a separate app) | 10 |
| 2026-10-11 | Agent-model fixes from the SRS comparison (open items never filled, Not Ready from either reviewer blocks…) | 10 |
| 2026-10-11 | Skills introduced — process, shared methods, tasks, stack craft (upd. 10-13 guard: hooks part) | 10 |
| 2026-10-11 | UX/UI design track before the first UI feature — WORKPLAN part 9 | 10 |
| 2026-10-11 | Visual direction: soft, calm, Facebook's patterns without its identity; no dark mode (upd. R1, R2) | 10 |
| 2026-10-11 | UI library package approved in advance (shadcn/Radix, Lucide, RHF + Zod, TanStack Query, Router…) | 10 |
| 2026-10-11 | Design consistency without a design agent (lint, contrast test, design-system skill, CRITIC check) | 10 |
| 2026-10-11 | Product changes from the sketch review (to SRS 2.9): email login, password rule (upd. 10-14: minimum 8), no phone… | 10 |
| 2026-10-11 | Bottom navigation: the services tab is labelled "יועצים" | 10 |
| 2026-10-11 | R1: palette A (apricot, terracotta), Rubik, centred column with a navigation rail | 10 |
| 2026-10-11 | The eighth tracker tile is "אמבטיה" — OP-007 closes | 10 |
| 2026-10-11 | D7 closed: 15 initiatives, MVP is I1–I9; I1 scope and its decided points (upd. 10-13 I1 points) | 10 |
| 2026-10-11 | Elevated path: no diff review by Afik — CRITIC on opus, DATA ARCHITECT, CI, hooks (upd. 10-11 Working rules) | 10 |
| 2026-10-11 | R2 approved; post card has four icon actions — Like, Comment, Share in feed, Share link | 10 |
| 2026-10-11 | Repository layout and naming (WORKPLAN 7.0); tests outside src | 10 |
| 2026-10-11 | Hosting: web + server on Vercel (Functions, fra1), database on Supabase Frankfurt; polling in the MVP | 10 |
| 2026-10-11 | Sharing defined — internal share in the feed, external share by link (to SRS 2.9) | 10 |
| 2026-10-11 | GitHub remote github.com/afikyermi/Nestly, public for now | 10 |
| 2026-10-11 | JWT verification: `jose` with `createRemoteJWKSet` | 10 |
| 2026-10-11 | Migration path: CI over the session pooler, `migrate` workflow, app_owner, Data API off (upd. 10-11 env names) | 10 |
| 2026-10-11 | Working rules: ORCHESTRATOR decides unreserved points and passes the gates; reserved list for Afik | 10 |
| 2026-10-11 | app_owner holds `authenticated` (inherit, no set); one anchor table holds the only FK to auth.users | 10 |
| 2026-10-11 | UI wave 1 Gate 1: five shared components join SRS §4.2; Button gets a pending state | 10 |
| 2026-10-11 | GitHub environments for migrations: `db-preview`, `db-production`; T7 passed | 10 |
| 2026-10-12 | UI wave 1 spec addenda, parts c–e (props, announced errors, target size…) | 10 |
| 2026-10-12 | No merge to `main` without green CI on GitHub (workflow.md 1.7) | 10 |
| 2026-10-12 | UI wave 1 spec addenda, part f (layout, focus, nav) | 10 |
| 2026-10-12 | Vercel builds only `main` and branches with an open PR | 10 |
| 2026-10-12 | The migration secret is `APP_OWNER_DATABASE_URL` in `db-preview` and `db-production` | 10 |
| 2026-10-13 | Agent-system slimming before I1, seven stages, one PR each | 10 |
| 2026-10-13 | Guard approach a–d (stage 1): CRITIC no shell, TEST ENGINEER one test run, loader, local block log | 10 |
| 2026-10-13 | Guard stage 1 continues after Not Ready; a third triggers a minimum plan (closed: merged as PR 8) | 10 |
| 2026-10-13 | Commits and pushes: logs ride with work commits; push only for CI, end of stage or session; squash merges | 10 |
| 2026-10-13 | Guard env-file rule (R4) judges path arguments and redirection targets, not text; Not Ready → debt | 10 |
| 2026-10-13 | Three older texts yield to the working rules (DATA ARCHITECT, SPEC CHALLENGE, /wrap-up) | 10 |
| 2026-10-13 | F5: /wrap-up rotates the block log, so reader-block escalation counts per task | 10 |
| 2026-10-13 | agent-slim and guard-allowlist closed; next is I1, Afik sees spec.md before Gate 1 (upd. 10-13: F1.1 only) | 10 |
| 2026-10-13 | System → product: agent system frozen until I1 merges; lean records; pace and progress line; retro after I1 | 10 |
| 2026-10-13 | The guard is a fence, not a fortress: effortful bypasses are accepted risk; F1.1 spec answers Q1–Q3 | 10 |
| 2026-10-13 | F1.1 Gate 2: schema conventions (nestly, uuid, timestamptz, text+CHECK…); caller-only helpers are INVOKER | 10 |
| 2026-10-13 | I1 points: ON DELETE RESTRICT · age by declaration · parallel journeys, ≤10 children · Google + email, no verification, in-app recovery · VAL-001 2–60 | 10 |
| 2026-10-13 | Round limit: one fix round after Not Ready, one re-check, never a third; process tasks stay unmerged, products stop | 10 |
| 2026-10-14 | Settings: "ask" only for .claude/** and CLAUDE.md; overnight rules (irreversible = prod, real data, GitHub) (upd. 10-14 narrowed) | 10 |
| 2026-10-14 | Settings: "ask" narrowed to agents, skills, hooks, rules, settings, workflow, learning — knowledge updates without a prompt | 10 |
| 2026-10-14 | Pace: local checks before push, CI waits ≤ 20 min, independent work meanwhile, split only when needed, WORKPLAN facts only | 10 |
| 2026-10-14 | F1.2 Gate 1: unknown path when signed in → /feed; Q1–Q8 defaults | 10 |
| 2026-10-14 | CI once per part: local checks between steps, one push per finished part; CI jobs filtered by changed paths | 10 |
| 2026-10-14 | F1.3 Gate 1: due date −30/+300 days, child name 1–60, birth date ≥ 1900, ERR-003 missing or invalid | 10 |
| 2026-10-14 | Node ≥ 22.22 for react-router; F1.2 source-scan tests a named exception (file:line only) | 10 |
| 2026-10-14 | Pace: spec ≤ ~150 lines and ≤ 12/20 criteria, 1–2 tests per criterion, notes ≤ 60, lean review diff, debt PR before F1.5, session handoff | 10 |
| 2026-10-14 | Preview access: bypass secret stays a repository secret; preview-shot trusts only GitHub-listed deployment URLs; server drops the bypass header | 10 |
| 2026-10-14 | F1.3 spec revised to 20 criteria / 120 lines (pace rule); two criteria move from source scans to behaviour | 10 |
| 2026-10-14 | F1.3 review: three error texts (due date range, child name length, birth date floor); revealed fields sit under their choice | 10 |
| 2026-10-14 | Speed-up: CI browser matrix, Vercel builds branches with an open PR, root vitest, TEST ENGINEER runs and edits tests, interface sheet, jq filters not paths | 10 |
| 2026-10-14 | Speed-up 4–6 (Afik): TEST ENGINEER edits and runs its tests, BUILDER writes interface.md, jq filters are text in the guard | 10 |
| 2026-10-14 | F1.4 Gate 1: DR-2 orphan Auth user completed by F1.5 (DR-1 superseded: web calls Auth) | 10 |
| 2026-10-14 | F1.4 Gate 2 passed; new rows are owner read + insert only until I2 (criterion 14 narrowed); one consent row per acceptance | 10 |
| 2026-10-14 | Taken email (F1.4): option A, reveal at sign-up only with a generic message, rate-limited · password minimum 8 (Afik) | 10 |
| 2026-10-14 | F1.4 Gate 2 amendment: INSERT granted per column; the server inserts through `*Insert` write models | 10 |
| 2026-10-14 | F1.4: the web calls Supabase Auth directly; `POST /api/register` writes the account for the new session (Afik; supersedes DR-1) | 10 |
| 2026-10-14 | Waiting on Afik: keep working on independent work, one side track at most, resume points in WORKPLAN (workflow 1.13) | 10 |
| 2026-10-14 | Tests from F1.5: depth by type (🔴/🎨/🟡), one layer per behaviour, Chrome-only PRs, blocking visual regression, ≤2× soft ceiling (Afik) | 10 |
| 2026-10-14 | F1.4: 500 after Auth sign-up → fallback message, no retry; any transient transaction failure → 503 | 10 |
| 2026-10-15 | Visual regression tolerance starts tight (maxDiffPixelRatio 0.0005); loosened only after observed CI flake, cited | 10 |
| 2026-10-15 | F1.4: Auth 5xx/network → retry state; unmapped Auth 4xx → fallback without retry | 10 |
| 2026-10-15 | F1.4: while a sign-up token is held, email and password are read-only (no silent second Auth user) | 10 |
| 2026-10-15 | Edge after the merge to main and by hand, not a production gate (as built); no release branch or tag now | 10 |
| 2026-10-15 | Lecturer presentation: Afik's idea doc v2 is the scope (I1–I14 first, live site) — upd. 10-15 "plan v2": no presentation tool | 10 |
| 2026-10-15 | Lecturer presentation plan v2: no presentation tool or split; product built to the end, then demo users and content through the product; lecturer signs in normally | 10 |
| 2026-10-15 | Lecturer presentation answers: ASAP; G1–G6 (Marketplace = listing + contact, no purchase); prices TBD; back-dating over days and hours; §15 positions; SRS 2.15 | 10 |
| 2026-10-15 | F1.5 Gate 1: own users row readable whatever its status (`/api/me` active/unavailable/unregistered); orphan Auth user completes registration; session in localStorage | 10 |
| 2026-10-15 | F1.5 part b: completion state may read /terms, /privacy; restore retries only when unreachable (backoff); `apps/web/src/platform/` is the one fenced browser-adapter folder | 10 |
| 2026-10-15 | F1.6: recovery by security questions — 3 offered at registration, pick 2 and answer (Afik; temporary until email recovery with a domain); recovery key rejected | 10 |
| 2026-10-15 | F1.6 Gate 1: questions pet / nickname / street; lookup by stored email HMAC; questions screen required after account creation (no "later") | 10 |
| 2026-10-15 | F1.6 Gate 2: fenced `app_recovery` role for the signed-out path; reset = admin set-password + one global sign-out, fail-safe 503 | 10 |
| 2026-10-15 | F1.6 Amendment 2 (CRITIC findings 1-2): current-email check at redeem, stale handle released on store and re-keyed on /api/me; one limited event per subject per lock, IP checked first | 10 |
| 2026-10-15 | Development speed (A–F): freeze to F1.8 without exceptions · one session and one records pass per feature · path per part, ≤ 2 reviews, 🎨 depth kept · hard 2× tests, TEST ENGINEER reads source · Preview automation · record caps, SRS once per Initiative · full I1–I14 (upd. 10-15 CRITIC round; 10-16 Audit decisions: one review per part, session per part, 2× is information) | 10 |
| 2026-10-15 | Development speed, CRITIC round: records-only via PR on green CI · per-Initiative SRS update is Standard · a part merges after its review · CRITIC 1.6 checks expected values, reviews after the tests · TEST ENGINEER 2.0 · tsc --noEmit only · lock-file summary in review.diff | 10 |
| 2026-10-16 | F1.6 merges on automated Preview E2E (E), built first: a fresh random user per run, full flow, deleted at the end; no manual Preview from now on (Afik) | 10 |
| 2026-10-16 | Before I3–I5 (Afik): deletion with a 30-day grace · 8 community rules · 8 report reasons · manual 5-step ladder · M1–M6 with in-browser blur and a background server check · Stories and medical hotline referral · no lawyer | 10 |
| 2026-10-16 | Placement: medical hotline referral in I3, Stories in I5 | 10 |
| 2026-10-16 | The seven open details of the I3–I5 decisions take their defaults (ladder per §4, Stories, hotline page, terms by Claude in I9, grace-period sign-in, demo Stories) | 10 |
| 2026-10-16 | OP-031–034 (Afik): own open-source image model in app_jobs · ERR-041 copy · audience per post and Story · related data deleted with the account | 10 |
| 2026-10-16 | E is built inside PR 31, not its own PR; nothing merges to main overnight (Afik) (upd. 10-16 Audit decisions 1: overnight merges allowed) | 10 |
| 2026-10-16 | F1.6 wrap-up: Amendments 3–4, DATA ARCHITECT c23 (claim order is the server's), N1 to debt | 10 |
| 2026-10-17 | Guard-freeze exception (Afik): TEST ENGINEER may write `e2e-preview/*.flow.ts`; only that, with the next work (F1.8) | 10 |
| 2026-10-17 | DR-E1 (Afik, option 1): test-user cleanup by SQL as postgres on nestly-preview, CI env preview-e2e only — approved exception to "nothing bypasses RLS" | 10 |
| 2026-10-17 | E part 2: own test users always deleted, sweep ≤ 10 oldest, refusal above 50; cleanup as workflow_run on main code, main-only environment | 10 |
| 2026-10-17 | F1.8 DR-2/DR-3: recovery-questions gate unchanged for Google-only accounts (debt); `profile` scope accepted and ignored if `openid email` cannot be forced | 10 |
| 2026-10-17 | F1.8 (Afik): Rule L not built — takeover risk open in `security-privacy-open.md`; DR-5: Google name/picture never read, cleared from user_metadata | 10 |
| 2026-10-17 | F1.8 (Afik): a first Google sign-in goes through full registration incl. a password; completion holds until the account exists | 10 |
| 2026-10-16 | Audit decisions (Afik), 1–12: pre-approved merge on green CI + E · batched approvals and a questionnaire per Initiative · local checks before push · one review round, a bug list · a test per AC · a session per part, compact at 200K · simpler guard, no more system building · lean records · two sessions from I3 · S-01 in I2 · account deletion in I9 · 5–7 features a day | 10 |
| 2026-10-16 | Guard simplified (Afik): secret scan and BUILDER rules kept, also in pre-commit; r4, TEST ENGINEER Bash allowlist, outside-root and reader escalation removed | 10 |
| 2026-10-16 | I2 questionnaire (Afik): profile Open by default (existing too) · S-01 option a · password change after two security questions · child birthdays on by default · prod migrate by ORCHESTRATOR without approval until launch | 10 |
| 2026-10-16 | PR 37 accepted risks (Afik): two open guard bugs accepted (S-62 trailing-dot Grep, S-63 secret-scan bypass); the -n bug to debt | 10 |
| 2026-10-16 | F2.0 AR-1/AR-2 (Afik): secret-key exception widens to set-password in four flows (S-01 clear, forced new password, change, F1.8 first password); email change via the Auth API stays open to I9 | 10 |
| 2026-10-17 | Standing rule (Afik): never stop on what an agent can do itself; work around what waits on Afik, one list for him; stop only with no other work · ORCHESTRATOR makes and commits visual baselines itself, after looking at them | 10 |
| 2026-10-17 | I2 reserved items: F2.2 hard delete, no end reason · ages in years+months · DR-G1 profile_view approved · Friend = Open view · 100 opens/h (config) · terms shown · publishable gateway key | 10 |

## Superseded

Kept for the record; the full entries stay in the archive.

| Date | Decision | Superseded by |
|---|---|---|
| 2026-10-17 | F1.8 DR-1: Rule L by detect-unlink-sign-out in the return route + server 401 on an OAuth token whose providers hold `email`; probe on final Preview | 2026-10-17 F1.8 (Afik): Rule L not built |
| 2026-10-17 | F1.8 DR-4 (upd. DR-1): Supabase "Manual linking" on so the return route can unlink; clear name/picture from user_metadata first | 2026-10-17 F1.8 (Afik): Rule L not built |
| 2026-09-12 | No role-specific skill files yet | 2026-10-11 Skills introduced (its criterion stands) |
| 2026-09-12 | IRON RULE — React, JavaScript, CSS, HTML only | 2026-10-11 Rule 0: TypeScript |
| 2026-09-12 | CI and a PreToolUse hook approved, not yet built | built in WORKPLAN 7.1 and 7.2 |
| 2026-10-10 | First initiative deferred (D7) | 2026-10-11 D7 closed |
| 2026-10-11 | `git push` moves from deny to ask | 2026-10-11 Working rules (push without a prompt); 2026-10-13 commits and pushes |
| 2026-10-12 | The guard keeps a single record: incidents.md, no second log, no module | 2026-10-13 guard approach (b) loader and (d) local block log |
| 2026-10-12 | The guard's protected-file rule: an allowlist as the base | 2026-10-13 guard approach (a); PR 6 closed |
| 2026-10-13 | guard-allowlist: the allowlist key is the command name (PR 6) | 2026-10-13 guard approach (a); PR 6 closed unmerged |
| 2026-10-13 | guard-allowlist round 3: prettier off the list… (PR 6) | 2026-10-13 guard approach (a); PR 6 closed unmerged |

---

## Pending — not yet decided

~~**Type checking via JSDoc.**~~ **Closed 2026-10-11** — superseded by the decision to write all product
code in TypeScript (entry "Rule 0 reopened").

~~**First initiative.**~~ **Closed 2026-10-11** — the roadmap and the MVP are decided (entry "D7 closed").

~~**Media decisions M1–M6.**~~ **Closed 2026-10-16** — decided by Afik (entry "Decisions before I3–I5").

~~**GitHub remote.**~~ **Closed 2026-10-11** — github.com/afikyermi/Nestly, public (entry "GitHub remote").

~~**Migration path.**~~ **Closed 2026-10-11** — CI over the session-mode pooler (entry "Migration path, migration role…"). Was: in 7.3 — the direct connection is IPv6 only; DATA ARCHITECT decides between the session-mode
pooler and the IPv4 add-on (entry "Hosting").

~~**Sharing in the SRS.**~~ **Closed 2026-10-11** — approved (entry "Sharing defined"); it enters SRS 2.9.

**Design choices at the review rounds.** The Reaction's name at R2. Palette, font, desktop layout and the eighth
tracker tile were decided on 11.10.2026 (entries "R1" and "The eighth tracker tile").

**Open product points** are tracked in the SRS itself: `docs/srs/appendix-b-open-points.md` (OP-xxx),
plus every "TBD" or "נדרש אישור" in the section files. They are product decisions, so they belong there.
