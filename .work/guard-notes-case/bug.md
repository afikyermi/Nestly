# Bug — the guard's notes.md rule for CRITIC depends on letter case and platform

**Path:** bug fix · **Risk flags:** none of CLAUDE.md's product flags. It is a guardrail change, so CRITIC reviews on opus
(lesson: every guard change goes through CRITIC on opus). **Size:** Light-sized, but a bug fix never skips the failing test.
**Source:** CRITIC's review of PR 1 (12.10.2026), recorded in `debt.md` (two lines, "PR 1 guard fix (CI)").

## Expected behaviour

The agent team's approved rule: CRITIC never reads `.work/<slug>/notes.md`, the builder's own account
(`.claude/workflow.md`, "Artifacts per feature"; the 7.2 guard, `decisions.md`). The guard
(`.claude/hooks/guard.js`, role `critic`) enforces it. Required:

1. **A git exclusion pathspec counts only if git honours it.** git matches pathspecs case-sensitively, even with
   `core.ignorecase=true`. So `-- . ':(exclude).WORK/*/notes.md'` or `':(exclude).work/*/NOTES.MD'` does **not**
   exclude `.work/f/notes.md`, and a CRITIC git read that relies on it (e.g. `git diff main -- . ':(exclude).WORK/*/notes.md'`)
   must be **blocked**, on every platform. The exact-case forms that are allowed today stay allowed.
2. **Case never opens a path to notes.md, on any platform** (macOS file systems are case-insensitive by default). For
   role `critic`, each of these must be **blocked** on win32, linux and darwin alike:
   - Bash: `cat .WORK/f/*` (a wildcard under `.work/` in any case)
   - Bash: `cd .WORK/f && cat *` (cd into `.work/` in any case)
   - Grep: `{ "pattern": "x", "path": ".WORK" }` with no glob or type (a search reaching `.work/` in any case)
3. Nothing the guard allows today in exact case becomes blocked, apart from the cases above.

## Actual behaviour

- 1: on win32, the guard lowercases the exclusion before matching it, so the uppercase forms are accepted and git
  prints notes.md (CRITIC reproduced it in a throwaway repo).
- 2: on linux/darwin, the three cases are allowed. The guard lowercases paths only when `process.platform === 'win32'`.

## How to reproduce (the guard's interface; no need to read its code)

- Run `node .claude/hooks/guard.js critic`, with a JSON payload on stdin:
  `{"tool_name": "Bash", "tool_input": {"command": "…"}, "cwd": "<root>"}`, and the env `CLAUDE_PROJECT_DIR=<root>`.
  Exit **2** = blocked, **0** = allowed. A block caused by the guard failing on its own error says `guard error` on
  stderr; that is not a valid block.
- `<root>` must be a throwaway directory containing an `incidents.md` (blocked calls are logged there), never the real
  project. The existing harness in `.claude/hooks/guard.test.js` (functions `run`, `blocks`, `allows`) does this.
- To check a platform other than the host's, preload a module that overrides `process.platform` before the guard
  loads, e.g. `node --require <preload.js> guard.js critic`, where the preload runs
  `Object.defineProperty(process, 'platform', { value: process.env.FORCE_PLATFORM })`. Cases must run under
  `win32`, `linux` and `darwin` on any host, so CI on Linux checks the Windows behaviour too.

## Escape

`escapes.md`, 12.10.2026: should have been caught by CRITIC at 7.2.
