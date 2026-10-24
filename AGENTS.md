# AGENTS.md — handoff to Codex (from Claude Code, 22.10.2026)

> **24.10:** dates, models, file locations and state below are historical. `CLAUDE.md` (Stages, model per task) and `WORKPLAN-HE.md` win; the initiative map is `docs/initiative-map.md`, the bug list `docs/final-stage-HE.md`.

> Codex reads this file automatically (as Claude Code reads `CLAUDE.md`). `CLAUDE.md` stays the rulebook for both;
> this file only adds what Codex needs to take over and to hand back (§8).

You are taking over Nestly from Claude Code mid-sprint. Read this file, then `CLAUDE.md` (the project rules — they
apply to you word for word; wherever it says "Claude", read "the agent"), then `WORKPLAN-HE.md` **on the branch
`records/session-close-1022` (PR #183)** — it is newer than the copy on main. Afik (owner) writes Hebrew; answer him in
Hebrew, plain text, short.

## 1. Product and deadline
- Nestly: a Hebrew (RTL) social network for pregnancy planning, pregnancy and parenting — feed, friends, groups, chat,
  stories, trackers, Professionals, Marketplace, monetization (promotions), staff moderation.
- Roles: Regular, Professional (`/pro/*`), Moderator (permission-based), Admin / Super Admin (`/admin/*`).
- **24.10 midnight: no new features. 25–26.10: tests, bugs, demo, SRS alignment, Word export. 27.10: lecturer review**
  (code, files, SRS, every feature, bugs). Production: https://nestly-blue.vercel.app

## 2. Where things live
| Path | What |
|---|---|
| `CLAUDE.md` | The rules (product thinking, never-list, work method, dates). Binding. |
| `WORKPLAN-HE.md` | The ONLY status file: state, open PRs, next steps, "ממתין לך" (waiting for Afik), flaky tests, bug list for 25–26.10. Update it each step; never create other progress files. |
| `decisions-in-force.md` | Afik's decisions not yet in the SRS + the initiative map (I4–I14, I9: FR/BR/AC per initiative). A decision moves into the SRS in the PR that builds it. |
| `docs/srs/` | The SRS (markdown is master). Start at `INDEX.md`; read only what you need. `17-traceability.md` = FR status table; `00-document-info.md` = version rows; `appendix-b-open-points.md` = OP rows. `archive/` = old Word, never edit. |
| `.claude/rules/srs-editing.md` | How to edit the SRS (IDs continue, WHAT not HOW, ⭐ defaults → OP row, `node tools/build-srs-index.js` must pass, new AC → `tools/srs-ac-names.json`). |
| `.claude/knowledge/` | `data-model.md` (DB + RLS rules), `data-model-tables.md` (tables), `conventions.md` (stack, boundaries, errors, git/shell). |
| `.claude/skills/*/SKILL.md` | Procedures (see §4). Codex does not auto-load them: open the file and follow it. |
| `docs/design/` | Design system docs. `docs/lecturer-demo-plan-HE.md` = demo users/content for 25–26.10. |
| `security-privacy-open.md` | Every open/deferred security or privacy issue, with status. Add to it, don't drop items. |
| `.work/briefs/` | Initiative briefs (I10-C, I11-C, I13, I14-B). `.work/wt/<name>` = git worktrees (many stale; see §6). Other `.work/*` dirs are old scratch. |
| `apps/server` | Fastify + TS: `routes/`, `services/`, `repositories/`, `jobs/`, `recovery/`, `media/`, `plugins/`. Tests in `apps/server/tests` (incl. `tests/db`). |
| `apps/web` | React + Vite + Tailwind: `src/features/<feature>` (no cross-feature imports — eslint rule), `components/ui|layout|shared|domain`, Storybook. |
| `packages/shared` | Zod schemas, errors (ERR catalog), constants, design tokens — shared by web and server. |
| `supabase/` | `migrations/` (43), `tests/` pgTAP (next number after 107), `rollback/`, `bootstrap/`, `ci/`. |
| `e2e/` | Playwright against Storybook/local (desktop Chrome). `e2e-preview/` = flows against a real Vercel Preview — read its `README.md` (main flow = action + result seen by another user; staff only on Preview; the strict-query `path` trap). |
| `tools/` | `build-srs-index.js`, `export-srs-docx.js` (Word), `preview-e2e-cleanup.ts` (update `EXPECTED_NESTLY_TABLES` + deletion order when a migration adds a table), `check-budgets.mjs` (line budgets), `db-local.mjs`, `db-preview.mjs`, `dev.mjs`. |
| `.github/workflows/` | `ci.yml` (typecheck, lint, budgets, tokens, stories, tests, build, browser shards, db/pgTAP), `db-check.yml`, `migrate.yml` (push to main on migrations + dispatch; preview then production), `preview-e2e.yml` + `preview-e2e-cleanup.yml`, `preview-smoke.yml`, `update-baselines.yml`. |

## 3. Stack and commands
React + TS + Tailwind (Vite) · Fastify + TS · Zod in `packages/shared` · PostgreSQL on Supabase via Drizzle ·
Supabase Auth/Storage · Vercel. TS strict. Node ≥ 22.22. Windows machine, Git Bash.
- `npm install` · `npm run dev` · `npm run ci` (full local gate) · `npm run typecheck` · `npm run lint` · `npm test`
- `npm run test:browser` (Storybook + Playwright, the "full Chrome suite") · e2e-preview: see its README.
- `gh` is not on PATH: use `"/c/Program Files/GitHub CLI/gh.exe"`. Use `--template`, not `--jq`.

## 4. Skills (procedures — read the SKILL.md before the task)
- `srs-lookup` — find/cite FR/AC/BR/VAL/ERR/NFR/OP via INDEX; **writes the initiative Brief** before any initiative.
- `srs-update` — update the SRS after a change (section format, version row, AC names, §17, rebuild INDEX).
- `done-check` — before merging an initiative's code PR: every brief line has code + a test naming the AC ID + a
  Preview flow; SRS matches decisions, no HOW text, status rows updated. Output: table of what's missing.
- `accessibility` (WCAG 2.2 AA), `rtl-hebrew` (logical utilities ms-/me-, mixed text, IL dates/currency),
  `design-system` (semantic tokens only, shared components, one primary action), `ux-copy-he` (gender-neutral
  Hebrew, no slash forms, errors from the SRS ERR catalog).

**Mandatory — read the skill file at that moment, every time (not from memory):**
| When | Read and follow |
|---|---|
| Before an initiative or completion | `srs-lookup` → write/refresh `.work/briefs/<initiative>.md` |
| Before writing or changing any screen or component | `accessibility`, `rtl-hebrew`, `design-system`, `ux-copy-he` |
| Any user-facing text or error | `ux-copy-he` (errors from the SRS ERR catalog) |
| After any SRS change, and at an initiative's end | `srs-update` + `.claude/rules/srs-editing.md` |
| Before merging an initiative's code PR | `done-check` |

**Where a skill or CLAUDE.md assumes Claude-only tools, do this instead** (record any further adaptation in
`.codex/adaptations.md`, see §8):
- "run in a separate subagent" (`done-check`) → a separate pass: finish the code, then start fresh — re-read the brief,
  `git diff origin/main...HEAD` and the skill, and fill its table as if someone else wrote the code. Put the table in
  the PR body.
- `/code-review` on sensitive diffs → a separate self-review pass on the diff for authorization, RLS, minors/health
  data, media, deletion and money; list findings and fixes in the PR body.
- "builder subagents in parallel" → work one initiative at a time (or parallel Codex tasks, each in its own worktree).
- The daily 20:00 scheduled message → write it at the end of each working day into WORKPLAN "ממתין לך" top line or
  give it to Afik in chat.

## 5. How the work is done (from CLAUDE.md, adapted to Codex)
- **Agents:** Claude ran as orchestrator with up to 2–3 builder subagents, each in its own worktree on a different
  initiative. You may work the same way (one worktree per branch under `.work/wt/`) or serially. One initiative
  = server + web + tests + SRS update → one PR. Dependencies: I13 after I11+I12; I9 last.
- **Migrations:** migration-only PR first, merged alone, one at a time; then dispatch `migrate.yml` from main
  yourself (Afik's standing delegation, 16.10). A new table needs RLS policies + pgTAP tests + the cleanup-tool update.
- **Merge rules:** green CI only; rebase before merge; check the latest run on main is green first; PRs touching
  shared files (layout, shell, menu, routing) run the full Chrome suite before merge. Red main / red nightly is fixed
  before any merge. A test that fails then passes on one rerun → a line in WORKPLAN "טסטים לא יציבים", not a blocker.
  A manually dispatched CI fails on visual tests until baselines are refreshed on 25.10 — not a real red.
- **Tests:** pgTAP for permissions, server tests for rules, one Playwright test per new screen (desktop), no new visual
  baselines, no phone duplicates. A feature is done only when its main flow passes on a real Preview.
- **Sensitive diffs** (authorization, minors/health data, media, deletion, money): do a careful self code review
  before the PR.
- **Records:** only the PR body (what + `Implements:` IDs), the SRS, `decisions-in-force.md`, `WORKPLAN-HE.md`.
- **Open SRS questions:** build per the ⭐ recommended option, add an OP row, and one batched question per initiative
  in WORKPLAN "ממתין לך". Keep building meanwhile.
- **Daily 20:00 message to Afik** (built today, waiting for him, new screens with links, forecast). Claude had a
  scheduled task for this; it does not carry over to Codex — Afik will ask, or produce it at end of day.

## 6. Guardrails Claude had that Codex does NOT enforce — follow them by hand
`.claude/settings.json` + `.claude/hooks/guard.js` (PreToolUse hook) + `.githooks/pre-commit` (secret scan; keep
`git config core.hooksPath .githooks`). Never:
- read/print/edit `.env*` or any secret; enter API keys anywhere (Afik enters keys; give him name + environment).
- `rm -rf`, `git push --force`, `git reset --hard`, `git clean`, `git remote add`, `psql`/`dropdb`/`supabase db reset`
  against anything, `vercel --prod`, `npm publish`.
- write to production directly; use service_role/BYPASSRLS at runtime; authorize outside RLS.
- decide for Afik: secrets, production steps, irreversible changes, legal/privacy/minors/money/ML policy.
Stale worktrees under `.work/wt/` and `C:/Users/Afik/nestly-review/*` belong to merged/old branches; do not delete
them without asking (Afik's "ענפים למחיקה ידנית" list is his to do).

## 7. State at handoff (22.10, morning) — no builder is running
Initiatives: I1–I8, I11, I12, I14 + part A ✅ · I10 completion code in #180 · I13 schema ✅, code in #177 · I14-B code
#174 · I11 completion and I12-B not started · I9 not started. SRS 2.38 on main (2.39/2.40/2.41 in the open PRs —
whoever merges second bumps the version above the one on main).

Open PRs: #183 records (WORKPLAN session close — merge first, records-only) · #182 `build/i13-settings-rls` migration,
**CI red in db, cause unknown** · #177 `build/i13-code` WIP · #180 `build/i10c-code` · #174 `build/i14b-code` green,
missing the staff part of its Preview flow · #181 `fix/srs-audit-flow-timeout` (test:tools hung twice) · #109 draft,
after 27.10.

Next steps, in order:
1. **main green:** CI of `802386f` (merge of #178) was cancelled, rerun failed in browser shard 2 — check and rerun;
   fix a real failure before any merge.
2. **#182** fix the db job → merge → dispatch migrate → **#177**: CI, self-review, full Chrome, done-check, merge,
   preview-e2e. (Locally 4 web login/registration tests failed on #177 — check.)
3. **#180**: CI, done-check, merge, preview-e2e; then a follow-up migration closing direct writes to the group-blocks table.
4. **#174**: needs Afik's answer on "ממתין לך 1" (Preview Moderator). No answer by 23.10 evening → merge without the
   staff part and note it in WORKPLAN. Then: migration dropping 30/90/365 `child_tracker_trends`, small code PR for
   FR-ADMIN-012.
5. I11 completion (brief `.work/briefs/I11-C.md`, blocked on "ממתין לך 10") · I12-B (§10.5–10.6).
6. **I9** (23.10): one daily purge job for all §13.4 retention rules + a server logger with Sentry (bug 4).
7. 24.10: missing e2e-preview flows (list in WORKPLAN). 25–26.10: per CLAUDE.md "Dates" + the 25-item bug list.
If 23.10 ends without I11/I12-B, do I9 first.

## 8. Full sync between Codex and Claude Code (both directions)
Both agents resume cold, from the repo alone (main + open PRs). Nothing in either agent's private session or memory
carries over. One project, one set of records, one rulebook (`CLAUDE.md`); the skills stay single-source in
`.claude/skills/` — never copy them, so they cannot drift.

**`.codex/` — Codex's own folder** (Claude Code knows it is Codex's; see `.codex/README.md`):
- `.codex/adaptations.md` — every place you had to do a rule or skill differently from how it is written, and why.
  Claude reads it on takeover; a rule that should change for both goes to Afik in "ממתין לך".
- `.codex/session-log.md` — one short entry per Codex session: date, what was done (PR numbers), what was left
  half-done and where (branch, commit), anything Claude must know that does not belong in WORKPLAN.
- Any other Codex-only working file goes here, not in `.claude/`, `.work/` records or the repo root.

**Handover checklist — run it when you stop (and Claude runs the same when it stops):**
1. Every branch committed and pushed; no work left only in a local worktree.
2. WORKPLAN updated with the exact state (below), the "עובד כרגע/נעצר" line set, and pushed to main via a
   records-only PR (merge it when its CI is green).
3. `.codex/session-log.md` entry written (Codex) / `AGENTS.md` §7 refreshed (Claude, if Codex continues next).
4. Open PRs each have an up-to-date body: what is done, what is left, CI state.

Claude Code reads `CLAUDE.md`, its own memory and `WORKPLAN-HE.md` — nothing you keep in your own session. So:
- **WORKPLAN-HE.md is the handover.** After every step (a PR opened, merged, a migrate run, a blocker found) update
  "איפה אנחנו עומדים", the initiatives table, "ענפים ו-PR פתוחים" (branch, last commit, what is left, CI state)
  and "המשך מכאן". Write the exact state, not intentions: what is done, what is red and why, what was not checked.
- Mark who is working: at the top of "איפה אנחנו עומדים" write `**עובד כרגע:** Codex (מ-<date>)`. When you stop,
  change it to `**נעצר:** <date, time> — Codex` and make sure "המשך מכאן" step 1 is the very next action.
- Push WORKPLAN changes to main via a records-only PR (like #183) at least at every session end; Claude reads main.
- Decisions you take yourself that Afik should confirm → "ממתין לך" under "החלטות שקיבלתי בעצמי". New Afik
  decisions → `decisions-in-force.md` (until they enter the SRS). Flaky tests → "טסטים לא יציבים".
- Every PR body: what it does + `Implements:` IDs; end it with `Prepared by Codex` so the history shows who built it.
- Briefs stay in `.work/briefs/<initiative>.md`; worktrees in `.work/wt/<name>` on branches `build/…`, `fix/…`,
  `records/…` — the same naming Claude uses.
- Do not edit `CLAUDE.md`, `.claude/**` or this file's rules without Afik's OK; if a rule should change, propose it in
  "ממתין לך".
