# dev-speed — guard change (D): TEST ENGINEER reads source and checks its own test files

**Status** Approved by Afik, 15.10.2026 ("מאשר את A עד F", the development-speed review; `decisions/2026-10.md` 2026-10-15
"Development speed"). This is the one guard change of that decision; the guard is otherwise frozen until F1.8 merges.

**Problem** TEST ENGINEER writes tests without seeing the code it tests: ~10 test-fix rounds in F1.3, ~7 CI rounds lost to
test mechanics in F1.4, 79 reader blocks, and a relay loop in which ORCHESTRATOR runs typecheck and lint on the test files
and messages the errors back. `interface.md` (BUILDER's 100–160-line sheet of names and seams) exists only to work around
the fence.

**Scope** `.claude/hooks/guard.js` and its tests only. Nothing in the product changes.

**Out of scope** CRITIC's rules (no shell, never `notes.md`, writes only findings) · TEST ENGINEER's Write limits (test
files and `.work/<slug>/*.md`; never package.json, tsconfig, tool configs, notes.md) · the env-file, secret, prod and
force-push rules · BUILDER's rules · escalation and the block log.

**Risk flags** none (an agent-team guardrail). CRITIC on opus reviews it (standing rule for guard changes).

## Acceptance criteria

1. 🟡 **Reading source is allowed.** For role `test-engineer`, `Read`, `Grep` and `Glob` of any path inside the project root
   are allowed, including `apps/*/src` and `apps/*/api` — the `NO_IMPL` and "searches only where app source is out of
   reach" refusals are removed, together with the symlink-into-source cases that exist only for them.
2. 🟡 **notes.md stays out of reach.** Every existing `notes.md` refusal for `test-engineer` holds unchanged: `Read` of
   `.work/<slug>/notes.md` in any letter case, a symlink that resolves to it, `Grep` on it, and a `Grep` that reaches
   `.work/` without a glob or type that excludes it. Paths outside the project root stay blocked (`OUTSIDE`).
3. 🟡 **Typecheck and lint on its own files.** TEST ENGINEER's Bash allowlist gains two runners, under the same form rules
   (plain characters, no shell syntax, `--name=value` flags only, project root as cwd):
   - `npx tsc -p <path>` — the operand after `-p` is one existing `tsconfig*.json` inside the project (relative, no `..`),
     for example `apps/web/tsconfig.json`; optional flag `--noEmit`; nothing else.
   - `npx eslint <files…>` — explicit, existing `*.test.*` / `*.spec.*` files inside the project (the same operand rule as
     vitest); optional flags `--max-warnings=0`, `--no-color`.
   `npx tsc` with no `-p`, `-p` with a non-tsconfig path or a path outside the root, `npx eslint` on a non-test file, and
   any other flag are refused with the usual message, which now names the two new forms.
4. 🟡 **Test runs unchanged.** `npx vitest run`, `npx playwright test` and `node --test` keep their exact rules, including
   "explicit existing test files, not under `apps/*/src` or `apps/*/api`".
5. 🟡 **Size.** `guard.js` stays within its 900-line budget (`npm run check:budgets`); every guard test file passes
   (`node --test .claude/hooks/guard.test.js .claude/hooks/guard-env.test.js .claude/hooks/guard-case.test.js
   .claude/hooks/guard-readers.test.js .claude/hooks/guard-loader.test.js`).

**Tests** TEST ENGINEER edits `.claude/hooks/guard-readers.test.js` and `.claude/hooks/guard.test.js`: the source-reading
cases flip from `blocks` to `allows`; the escalation cases that used a source read as their blocked example use a
`notes.md` read instead; new cases for criterion 3 (allowed and refused forms). Written before the guard changes, so the
flipped and new cases fail on the current guard and pass after BUILDER's change.

**Size estimate** ~60 lines of diff in guard.js (net ≤ +6), ~80 in the tests.
