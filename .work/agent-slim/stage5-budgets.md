# spec — stage 5: line budgets in CI

2026-10-13 · Standard path (tooling; no risk flag; over Light size) · Afik's plan, stage 5 (`decisions.md` index,
"Agent-system slimming").

**Problem**        files every agent reads grow unchecked (decisions.md reached 91K before stage 3), and code outside
                   the ESLint size caps has no cap at all (guard.js reached 1337 lines on PR 6). Nothing fails when it
                   happens.
**Requirements**   none in the SRS — agent-team tooling.
**Scope**          a budget config, a check script, its wiring into `npm run ci` and the CI `lint` job.
**Out of scope**   changing any ESLint `max-lines` cap · shrinking any file to fit (a file over budget today gets an
                   exception or a budget at its size, never an edit) · counting bytes or tokens · checking files that
                   are not tracked by git.
**Data touched**   none.
**Risk flags**     none.

## What to build

- **`tools/line-budgets.json`**
  - `alwaysRead`: `{ "<path>": <max lines> }` — files loaded or read on every run by some role
    (`node tools/measure-context.mjs` is the map). Initial budgets = current lines + ~15%, rounded up to 10:
    `CLAUDE.md` 380 · `.claude/workflow.md` 330 · `decisions.md` 220 · `WORKPLAN-HE.md` 200 ·
    `.claude/agents/algorithm-data.md` 150 · `builder.md` 200 · `critic.md` 230 · `data-architect.md` 140 ·
    `scout.md` 100 · `spec.md` 170 · `test-engineer.md` 180 · `.claude/knowledge/conventions.md` 220 ·
    `data-model.md` 260 · `srs-review-points.md` 100 · `ai-ml-readiness.md` 90 ·
    `.claude/skills/srs-lookup/SKILL.md` 50 · `.claude/skills/security-craft/SKILL.md` 100 ·
    `.claude/rules/srs-editing.md` 30.
  - `code`: `max` 400 · `testMax` 800 for a file whose name matches `*.test.*` or `*.spec.*` · `exclude` globs:
    `apps/*/src/**` (governed by ESLint `max-lines` in `eslint.config.mjs`) · `exceptions`:
    `{ "<path>": { "max": <n>, "reason": "<why>" } }` — initially `.claude/hooks/guard.js`: max 900, reason "835 lines
    after stage 1; size accepted by Afik 2026-10-13; split not pursued".
  - Extensions checked: `.js .mjs .cjs .ts .tsx .mts .cts`.
- **`tools/check-budgets.mjs`** — `node tools/check-budgets.mjs [--config <path>] [--root <dir>]`; defaults
  `tools/line-budgets.json` and the current directory. Lists code files with `git ls-files` in the root. Prints one
  line per violation and exits 1 if there is any; otherwise prints a one-line summary and exits 0.
- **`package.json`**: script `check:budgets`; added to `ci` (after `lint`) and to `test:tools` for its test file.
- **`.github/workflows/ci.yml`**: a `npm run check:budgets` step in the `lint` job.

## Acceptance criteria

1. Every listed file within budget and every code file within its cap → exit 0, and the output contains `budgets: ok`.
2. An `alwaysRead` file over its budget → exit 1; the output line names the path, its line count and the budget.
3. An `alwaysRead` file that does not exist → exit 1, naming the path and "missing".
4. A tracked non-test code file over `max` that is not excluded or excepted → exit 1, naming path, lines and cap.
5. A tracked test file (`x.test.ts`, `y.spec.mjs`) at `testMax` lines passes; at `testMax + 1` fails.
6. A tracked file under `apps/<any>/src/` over `max` is not reported.
7. An exception raises the cap for that one file only: within its `max` passes, over it fails; another file of the same
   size without an exception fails.
8. An exception for a file that is not tracked, or whose lines are within the default cap → exit 1, "stale exception".
9. An untracked code file over the cap is not reported.
10. Line count: the number of `\n` characters, plus one if the file does not end with `\n`; an empty file is 0.
11. A config that is missing, not valid JSON, or lacks `alwaysRead` or `code.max` → exit 1 (never 0), with a message.
12. On this repository, `npm run check:budgets` exits 0.

**Size estimate**  ~120 lines of script + config, tests separate.
