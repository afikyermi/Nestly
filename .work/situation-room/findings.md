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
