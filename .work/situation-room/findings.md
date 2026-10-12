# findings — Situation room

## Slice 1 (log) — CRITIC on opus — verdict: Not Ready → Not Ready → Validated

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | high | .claude/hooks/guard.js:544 | the `$?` fix skipped every `$`-bearing token, then stripped whole `${…}`, so `cat ap*/web/src/a.ts$X` and `cat ${X:-apps}/web/src/a.ts` reached app source for TEST ENGINEER | strip only plain expansions; operator expansions stay globs; 17 bypass forms are `blocks` cases |
| 2 | medium | .claude/hooks/situation-log.js:132 | branch and relative paths taken from the session cwd, so a subdirectory cwd lost the branch and logged absolute paths | base dir = `CLAUDE_PROJECT_DIR || cwd`; subdirectory + worktree tests (mutation-proven) |
| 3 | medium | .claude/hooks/guard.test.js | criterion 19 tested only on `scrubReason()`; "throws on load" untested | real staged-`.env` block; a logger that throws on load |
| 4 | medium | decisions.md | the "Situation room" entry missing (criterion 34) | written |
| 5 | low | package.json | the `situation-room` script points at slice-2 work | closed by sequencing: the branch merges only with slice 2 |

Concerns, not findings: the guard's integrity now spans two files (both under `.claude/**`, reviewed as one unit) ·
agent-written descriptions are clipped, not scrubbed (no concrete path). Also fixed: the `$?` false positive that had
blocked TEST ENGINEER's ordinary CI commands since part a (`noise.md`).

## Slices 2–4 (server, live view, history) — verdict: Not Ready → Validated

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | high | server.mjs:39; derive.mjs:264, :355 | `push(...fresh)` and `Math.min(...)` over the whole log threw at ~125k events; the empty catch swallowed it and the history went blank | loops (`minOf`/`maxOf`); load failures reach the page as a `role="alert"` state; scale test with 150k events (mutation-proven) |
| 2 | medium | derive.mjs:308-317 | merge detection by subject substring: `part 1` matched `part 10`; a miss read "not merged" | word boundaries; "מיזוג לא זוהה" |
| 3 | low | derive.mjs:79-113 | no-part runs shared one counter; a truncated file replayed events | keyed by branch; no replay past the last seen time |
| 4 | low | index.html | the 30 s re-render reset open sections and focus | skip unchanged renders; restore open sections and focus |
| 5 | low | index.html | `unknown` / `all` shown in English | "לא ידוע" / "כל התפקידים" |
| 6 | low | derive.mjs:34 | an array-valued `ev` passed the name check | `typeof raw.ev === 'string'` first |

Also: `parseIncidents` accepted an impossible date (TEST ENGINEER) → round-trip check.
**Preview (ORCHESTRATOR, 12.10.2026): passed** on the real log — live cards with step (CRITIC 9/11, BUILDER 10), Block
reasons without commands, no prompt text; history with usage per agent, rounds per part, 126 blocks by role, "אין
נתונים" before the first source. Gaps → `debt.md`: the skills table stays empty (preloaded and path-loaded skills emit
no event); horizontal overflow below ~400px. Merged at 8e99ff2.
