# Stage 6 — verification: every rule that moved, and where it is now

2026-10-13. Baseline: `.work/agent-slim/baseline.md` (stage 0). "Moved" = same meaning, new place. "Changed" = meaning
changed by Afik's explicit decision (`decisions.md` index, 2026-10-13 entries).

## Rule → where it is now

| # | Rule (before) | Was in | Now in | Kind |
|---|---|---|---|---|
| 1 | Read decisions before proposing an approach; re-proposing a rejected alternative wastes time | CLAUDE.md "Logs" · builder.md Principles + step 3 | CLAUDE.md "Logs" (reads the "In force" index; archive via SCOUT) · builder.md step 3 | moved (one rule, index form) |
| 2 | Decision entry format; append-only, newest last | decisions.md top | decisions.md top (format, "Adding a decision") · each `decisions/<YYYY-MM>.md` header (append-only) | moved |
| 3 | Every decision entry (65 original + 2 from PR 6 + 4 new on 13.10 = 71) | decisions.md body | `decisions/2026-09.md`, `decisions/2026-10.md` verbatim (985/985 lines); one index line each in decisions.md | moved |
| 4 | Pending — not yet decided | decisions.md end | decisions.md end, unchanged | unchanged |
| 5 | BUILDER reads data-model.md before writing | builder.md step 2 | builder.md step 2: only for a task touching data, database or schema | **changed** (Afik, stage 3) |
| 6 | WORKPLAN holds what is done, open, decided, next | CLAUDE.md top | CLAUDE.md top: open + last finished part + waiting on Afik + next; closed parts in `archive/WORKPLAN-<YYYY-MM>.md`; `/wrap-up` step 4 archives | **changed** (Afik — his slimming plan, stage 3 "WORKPLAN: only open + last finished; /wrap-up archives", in his plan message of 2026-10-13, summarised in "Agent-system slimming" as "3 slim decisions/WORKPLAN/incidents/CLAUDE.md") |
| 7 | Closed WORKPLAN parts 0, 1, 2, 3, 5, 7, architecture, external review, rows 4.1–4.10, skills row א, PR 1/PR 2 status lines | WORKPLAN-HE.md | `archive/WORKPLAN-2026-10.md` verbatim; open items inside them (7.0, 7.1 database checks and branch protection, 7.2 security-guidance, 7.3, 7.4, Storage, C2–C9) in WORKPLAN "פתוח מחלקים שנסגרו" | moved |
| 8 | Path selection: entry conditions per path | CLAUDE.md table "When" · workflow.md Light entry condition | CLAUDE.md table "When" (Light now lists "no risk flag" too); workflow.md Light points to it | moved (one place) |
| 9 | Who runs on each path | CLAUDE.md table "Who runs" · workflow.md path sections | workflow.md path sections only; CLAUDE.md points there | moved (one place) |
| 10 | Elevated: protection is reviewers, CI and hooks | CLAUDE.md path table | workflow.md Elevated | moved |
| 11 | Elevated: ORCHESTRATOR passes the gates; irreversible needs Afik; prod migration waits for db-production approval | workflow.md Elevated · CLAUDE.md Human gates / Decision authority / Mandatory reviews | CLAUDE.md only; workflow.md Elevated points there | moved (one place) |
| 12 | Upward channels (SPEC CHALLENGE, MATERIAL CHANGE, BLOCKER, QUESTION, DECISION REQUEST): who, when, blocking | workflow.md table · CLAUDE.md Message types (three of them) | CLAUDE.md "Message types" (merged, all columns); workflow.md keeps the SPEC CHALLENGE format and points there | moved (one place) |
| 13 | SRS editing: structure and IDs never renumbered · versioning · INDEX rebuild and AC names · Word archive never edited, Afik's Word imported by diff | CLAUDE.md "Product requirements" | `.claude/rules/srs-editing.md` (paths `docs/srs/**`, `tools/srs-ac-names.json`); CLAUDE.md points there; `/srs-update` header points to both | moved |
| 14 | Every hook block reported to Afik via incidents.md | CLAUDE.md "Report material failures" · guard.js header · critic.md | CLAUDE.md, incidents.md table: only blocks the guard writes to incidents.md (critical, or 3rd reader block per role and **session**); others counted by `/wrap-up`; false blocks → noise.md · guard.js header · critic.md | **changed** (Afik, F5 — he decided "per task"; built "per session", see WORKPLAN question) |
| 15 | 113 block lines | incidents.md (and PR 6 branch) | `archive/incidents-blocks-2026-10.md` | moved |
| 16 | CRITIC reads the diff with `git diff … ':(exclude)…notes.md'` | critic.md | critic.md: no shell; reads `.work/<slug>/review.diff` from `tools/critic-diff.mjs` | **changed** (Afik, approach a) |
| 17 | TEST ENGINEER may run shell commands that do not reach app source | test-engineer.md · guard.js | test-engineer.md: Read/Grep/Glob, Bash = one test run on explicit files; ORCHESTRATOR commits its tests | **changed** (Afik, approach a + conditions) |
| 18 | Two Not Ready on one task → stop for Afik | — | workflow.md "Two strikes" | **new** (Afik, approach c) |
| 19 | Hook blocks counted per task | — | `/wrap-up` step 2 | **new** (Afik, approach d) |
| 20 | `git add` and `git commit` separate; env-naming text via Write/Edit | guard.js message only | conventions.md "Git and shell" (CRITIC validated) | moved (into knowledge) |
| 21 | Log entries get no own commit; push only for CI / end of stage / end of session; squash with Implements in PR body | — | CLAUDE.md top · `/decision` step 6 · `/wrap-up` step 5 · workflow.md Traceability | **new** (Afik, stage 3) |
| 22 | PR 6 work files and entries | PR 6 branch | `.work/guard-allowlist/` · `decisions/2026-10.md` (superseded in the index) · escapes.md · archive | moved |
| 23 | Line budgets for always-read files and code | — | `tools/line-budgets.json` + `tools/check-budgets.mjs` in CI | **new** (Afik, stage 5) |

## Re-measure against stage 0

`node tools/measure-context.mjs`, bytes per run. BUILDER's data-model.md (19.4K) now counts as conditional.

| role | stage 0 | now | change |
|---|---|---|---|
| ORCHESTRATOR | 163.9K | 65.9K | −60% |
| BUILDER | 150.0K | 51.2K | −66% |
| CRITIC | 61.6K | 63.0K | +2% (critic.md: review.diff, hygiene line) |
| DATA ARCHITECT | 44.2K | 44.7K | +1% (CLAUDE.md) |
| SPEC | 28.0K | 28.6K | +2% |
| ALGORITHM & DATA | 27.9K | 28.5K | +2% |
| TEST ENGINEER | 27.1K | 28.5K | +5% (test-engineer.md: shell limits) |
| SCOUT | 21.5K | 22.1K | +3% |

| file | stage 0 | now |
|---|---|---|
| decisions.md | 91.3K · 1034 lines | 10.0K · 129 lines |
| WORKPLAN-HE.md | 37.2K · 264 lines | 19.8K · 147 lines |
| incidents.md | 22.8K · 118 lines | 5.7K · 45 lines |
| CLAUDE.md | 18.3K · 326 lines | 18.9K · 331 lines (gained the commit rules and the merged message types; lost the SRS editing bullets and the path "who runs") |
| .claude/workflow.md | 17.1K · 285 lines | 17.3K · 288 lines (gained "Two strikes" and squash; lost the channel table and duplicated conditions) |
| guard.js | 735 lines | 835 lines (accepted by Afik; readers no longer parse shell) |

CLAUDE.md grew by 0.6K although stage 3 removed duplicates: every agent loads it, so the rules every agent needs
(message types, commits) moved *into* it, and only path-specific or pipeline-order text moved out.
