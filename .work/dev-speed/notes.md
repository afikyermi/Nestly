# notes — dev-speed (guard change D)

**Approach**
- guard.js, checkReadPath: removed the NO_IMPL Read refusal, the "searches only where app source is out of reach"
  refusal and `reachesAppImpl` (it served only that refusal). A Glob now returns null for both roles (it lists names only);
  that is what CRITIC already had, and before this change TEST ENGINEER's Glob had no check except the one removed. The notes.md
  Read/Grep refusals, the `.work/` Grep rule and OUTSIDE are unchanged. `isAppImpl` stays for the Write limit and the Bash runner.
- checkTestEngineerBash: two new RUNNERS entries, `tsc` (head `npx tsc`, flag `--noEmit`, `project: true`) and
  `eslint` (head `npx eslint`, flags `--max-warnings=0`, `--no-color`). Only a runner with `project` reads `-p` and takes the
  next token as its value; for the others `-p` is still an unknown flag and is refused. tsc needs exactly one `-p` and no
  file operands. The project must be relative, have no `..`, be an existing file named `tsconfig*.json` (case-insensitive),
  resolve inside the root, and not resolve to a notes file. eslint files use the same operand rule as vitest (shared `plain` helper).
- BASH_FORMS names the two new forms and their flags. The header comment (lines 13–14) is updated.
- critic-diff.mjs: the `LOGS` set (root package-lock.json, WORKPLAN-HE.md and the five root logs) plus a prefix regex for
  `decisions/`, `archive/` and `.claude/logs/`, placed in `kept` before the `.work` filter. The usage comment is updated.

**Decisions**
- The message for a test file that resolves into app source now reads "does not run files under apps/*/src…". The old
  wording "does not read" is no longer true for Read.
- These exclusions match exact, case-sensitive paths at the repository root only. A nested `package-lock.json` is kept.
- If a branch changes only excluded files, `kept` is empty and the tool exits 1 ("no reviewable files"). That fails closed, as before.

**Deviations** none.

**Uncertain**
- One TEST ENGINEER case fails: guard-readers.test.js:202, `allows Grep {path: ROOT, glob: 'apps/**/src/**'}`. A Grep from
  the root reaches `.work/`, and `grepExcludesNotes` judges a glob by its last segment too (`**` can match notes.md), so the
  unchanged `.work/` rule blocks it. Before this change the removed source rule blocked the same call first, so nothing ever
  tested it against the `.work/` rule. Making it pass would mean loosening the `.work/` rule, which spec criterion 2 keeps
  unchanged. I did not do that. Reported as a FINDING.

**Preview path** none (agent-team guardrail). Check: the five guard test files, critic-diff.test.mjs, check:budgets, lint.

**Neighbouring** none.

## Fix round (CRITIC medium 2, low 3, low 4 / Amendment 1)
- guard.js: unused `te` removed. tsc runner carries `required: '--noEmit'`; the form without it is refused. A `-p` path with a
  `node_modules` or `.claude` segment at any depth (either relBoth form, so a symlink cannot hide it) is refused. BASH_FORMS says so. 891 lines.
- critic-diff.mjs: when package-lock.json is in the change set, review.diff ends with the summary block (+N/-M from `--numstat`,
  then every changed "version"/"resolved"/"integrity" line verbatim). Only the exact file headers (`--- a/…`, `+++ b/…`, `/dev/null`)
  are skipped, so a content line is never dropped for starting with `---`. A failure computing it falls into the existing fail-closed catch.
- Uncertain: a branch that changes only package-lock.json still exits 1 ("no reviewable files"), so it gets no summary, only a failed run.
