# Findings — guard-notes-case (PR 2)

**CRITIC (opus), 12.10.2026 — verdict: Validated with Concern.**

The four findings from PR 1 (`bug.md`) are closed on win32, linux and darwin. Nothing loosened; all 35
`guard.test.js` tests pass. The regression test `guard-case.test.js` fails on main's guard (bug.md-1 on win32,
bug.md-2 on linux and darwin) and passes on the branch, 12 of 12.

Three gaps found beyond the bug, all older than this PR, open on main and on the branch; carried in `debt.md`:

| severity | where | gap |
|---|---|---|
| medium | guard.js:462-471, :524-530 | an exclusion pathspec counts whatever directory git runs from (`cd apps`, `git -C apps`, with `:/`) |
| low | guard.js:464-469, :201-213 | pathspec magic (`literal`, `attr:`) and global settings (`--literal-pathspecs`, `GIT_LITERAL_PATHSPECS`, `--glob-pathspecs`) change an exclusion's meaning |
| low | guard.js:511 | the wildcard check needs the literal text `.work/`; `.w*/*/n*` passes |

Concern: the notes.md rule is a denylist of spellings. CRITIC recommends an allowlist (one fixed git-read form at the
root) as the cleaner design.
