# Agent-system slimming — stage 0 baseline

2026-10-13 · main @ 63414c7 · produced by `node tools/measure-context.mjs` (bytes; re-run in stage 6).

"auto" = agent definition + CLAUDE.md + preloaded skills. "instructed" = files the definition, a preloaded skill
or CLAUDE.md says to read on every run. "conditional" = read only for some tasks. Task files (spec.md, schema.md,
SRS slices) are not counted. Assumption: subagents load CLAUDE.md.

| role | auto | instructed | total | conditional |
|---|---|---|---|---|
| ORCHESTRATOR | 18.3K | 145.6K | 163.9K | 9.5K |
| BUILDER | 27.9K | 122.1K | 150.0K | 17.5K |
| CRITIC | 33.4K | 28.2K | 61.6K | 0.0K |
| DATA ARCHITECT | 24.8K | 19.4K | 44.2K | 0.0K |
| SPEC | 28.0K | 0.0K | 28.0K | 0.0K |
| ALGORITHM & DATA | 27.9K | 0.0K | 27.9K | 4.0K |
| TEST ENGINEER | 27.1K | 0.0K | 27.1K | 0.0K |
| SCOUT | 21.5K | 0.0K | 21.5K | 0.0K |

| file | bytes | lines |
|---|---|---|
| decisions.md | 91346 | 1034 |
| WORKPLAN-HE.md | 37153 | 264 |
| incidents.md | 22796 | 118 |
| debt.md | 7888 | 47 |
| escapes.md | 1542 | 30 |
| noise.md | 3378 | 56 |
| open-questions.md | 10278 | 226 |
| CLAUDE.md | 18336 | 326 |
| .claude/workflow.md | 17078 | 285 |
| .claude/learning.md | 9541 | 220 |
| .claude/hooks/guard.js | 30274 | 735 (1337 on PR 6) |

Other facts at baseline:

- decisions.md: 65 entries (16 from 2026-09, 49 from 2026-10). It is 61% of BUILDER's instructed reads and 56%
  of ORCHESTRATOR's.
- incidents.md: 76 entries; about 70 are correct hook blocks, 4–5 are real failures (CI red on main and its
  resolution, db-check login failures, Vercel posting no deployment status).
- Repeated blocks: CRITIC reaching notes.md ≈25 · TEST ENGINEER reaching app source ≈20 · `git add` and
  `git commit` in one command ≈13.
- 15 skills, 40.8K together. Agent definitions 50.8K together.
- Finding for stage 3: `open-questions.md` (10.3K) is a second status-like file next to WORKPLAN. Not touched now
  (Afik, 2026-10-13).
