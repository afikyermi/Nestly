# Nestly
Social network for pregnancy planning, pregnancy and parenting. Owner: Afik. Goal: the whole SRS built by 26.10; lecturer review 27.10 (code, files, SRS, every feature, bugs).

## Product
Nestly is a community social network for pregnancy planning, pregnancy and parenting, with additions: trackers, Professionals, Marketplace and groups. Development is done with product thinking: before every feature, understand who uses it (Regular, Professional, Moderator, Admin), what each of them needs and what their experience will be. Draw on how successful social networks work (feed, groups, promotion, reviews, moderation) and adapt it to a sensitive parenting community: safety, privacy, children. A feature isn't just "meets the requirement"; it's what a real user would expect to find. If a requirement leads to a bad experience for one of the user types, write it in "ממתין לך" with a suggestion.

## Sources
- Product: `docs/srs/` (INDEX.md first; read only what you need). Afik's decisions (one line each, with the SRS reference when there is one): `decisions-in-force.md`; the initiative map (FR/BR/AC per initiative): `docs/initiative-map.md`.
- DB and RLS rules: `.claude/knowledge/data-model.md` (tables: `data-model-tables.md`). Code conventions: `.claude/knowledge/conventions.md`. Design: `docs/design/`.
- UI skills: `accessibility`, `rtl-hebrew`, `design-system`, `ux-copy-he`. SRS skills: `srs-lookup`, `srs-update`.
- Open SRS item: ask Afik once per initiative, in one batch, in WORKPLAN "ממתין לך"; keep building other things meanwhile.
- Codex (`AGENTS.md`, `.codex/`) only if WORKPLAN says it worked since: then read `.codex/session-log.md`. When you stop: everything pushed, WORKPLAN "המשך מכאן" exact, "נעצר: … Claude".

## Stack
React + TypeScript + Tailwind (Vite) · Fastify + TypeScript · Zod in `packages/shared` · PostgreSQL on Supabase via Drizzle · Supabase Auth/Storage · Vercel. TypeScript strict. Reuse existing patterns and components.

## Never
- Authorization outside RLS; a new table without policies and pgTAP tests; service_role / BYPASSRLS at runtime.
- Reading or printing secrets; writing to production directly. Schema changes: migration-only PR first, then the `migrate` workflow. Dispatching `migrate.yml` from main after a merged migration is Afik's standing delegation (16.10): run it yourself, without waiting.
- Merging without green CI; force push.
- Deciding for Afik: secrets, production steps, irreversible changes, legal/privacy/minors/money/ML policy.

## Work
- You are the only orchestrator. Run up to 3 builder subagents in parallel, each in its own worktree (`.work/wt/<name>`) on a different initiative; I9 last.
- Model per task (Afik 24.10): Opus for features, sensitive parts, reviews and `/code-review`; Sonnet for mechanical or tightly scoped work. No automatic switch by date.
- A builder does the whole feature: server + web + tests + SRS update, then one PR. Rebase before merge. Merge on green CI. Migrations merge one at a time.
- A migration that adds a table also updates `EXPECTED_NESTLY_TABLES` and the deletion order in `tools/preview-e2e-cleanup.ts`.
- Before every merge, check that the latest run on main is green. A PR that touches shared files (layout, app shell, menu, routing) runs the full Chrome suite (dispatch) before merge, not just the changed specs.
- A red nightly run or red main is fixed before any new merge. A test that fails and passes on one rerun gets a line in WORKPLAN and does not block the merge; only a repeating failure blocks.
- Tests: pgTAP for permissions, server tests for rules, one Playwright test per new screen's main flow (desktop). No new visual baselines, no phone duplicates.
- Before each initiative (or completion): the brief (`srs-lookup` → "Brief", `.work/briefs/<initiative>.md`). Before merging its code: `done-check`. e2e-preview flows follow `e2e-preview/README.md`.
- A feature is done only after its main flow passes against a real Preview (an e2e-preview flow with a real server), not just against a stub.
- Sensitive parts (authorization, minors/health data, media, deletion, money): `/code-review` on the diff before the PR.
- SRS: updated in the same PR, following `.claude/rules/srs-editing.md` (IDs continue their sequence, an open question is built per its ⭐ with an OP row, `node tools/build-srs-index.js` must pass). It states WHAT the product does, never how it is built or by whom. Every new decision of Afik's that changes behaviour (UX, rules, policy) enters the SRS too. At each initiative's end: one version row in `00-document-info.md` and `17-traceability.md` updated.

## Records
None except: PR body (what, `Implements:` IDs), the SRS, `decisions-in-force.md` (new Afik decisions only), WORKPLAN-HE.md (short status, "ממתין לך"; lean — history is in git), `docs/final-stage-HE.md` (bug list, flaky history) and `docs/initiative-map.md`.

## Stages (Afik 24.10)
No fixed freeze. Each initiative is tested when it ends, including its main flow on a real Preview, before the next one. Work through the night; never wait for Afik: what needs him goes to "ממתין לך". Final stage, after all initiatives: full test suite, Edge and visual tests with baselines refreshed, bug fixes (WORKPLAN list), demo users for every role and demo content created through the product per `docs/lecturer-demo-plan-HE.md`, SRS–code check, FR status table in `17-traceability.md`, Word export (`node tools/export-srs-docx.js`).
No message at a fixed time (Afik 24.10). When Afik asks to end a session: a short summary — what was built, what waits for him, new screens with a direct link to each on nestly-blue.vercel.app, forecast to 27.10.
