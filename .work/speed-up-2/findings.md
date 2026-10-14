# findings — speed-up-2 (guard jq exemption + speed-up 4–5 docs), CRITIC (opus), 14.10.2026

(Written by ORCHESTRATOR from CRITIC's return.)

verdict: Not Ready — 2 high · 1 medium · 2 low

1 (high) guard.js:326-335 jqProgram — `-f`/`--from-file` (or a short cluster with f) AFTER the first positional still
  makes that positional the program file; the loop exempts it before seeing -f, so `jq <env-file> -f …` loads the env
  file as the program and the compile error prints a KEY=value line. Fix: scan the whole segment (up to `--`) for
  from-file mode first; if present, exempt nothing. Tests with -f / a cluster containing f after the positional.
2 (high) guard.js:376-389 — the exemption stays on when the command pipes into an interpreter (`fed`), and the exempt
  word also skips the text scan: `jq -nr '"cat <env-file>"' | sh` passes (it was blocked before). Fix: exemption off
  when `fed` too (`subst || fed`), or mentionsEnv on the exempt word when fed. stillBlocked test.
3 (low) guard.js:347-348 — the exempt program word is never scanned as text (jq import/include, future file builtins).
  Fix: run mentionsEnv on the exempted program text (costs no legitimate use).
4 (medium) test-engineer.md / workflow.md step 8 — "run until they pass" with Edit, without saying a criterion's
  assertion is never weakened to match the code. Fix: Edit fixes mechanics (selectors, seams, setup); a test failing
  against its criterion is a finding and stays failing.
5 (low) builder.md / workflow.md — interface.md's facts-only rule is checked by no one, and TEST ENGINEER can edit it.
  Fix: ORCHESTRATOR checks interface.md against the rule before step 8, or add it to review.diff.

Checked, no finding: -rf/-nf/-f.env/--from-file= first; --arg/--argjson/--slurpfile/--rawfile words checked; gh glued
-q fails closed; --input/--template not exempt; $(/backtick on the raw command; Windows re-parse; bash -c outer token;
TEST ENGINEER Edit limited to test and .work paths; docs consistent otherwise.

## ORCHESTRATOR (14.10)
- 1, 2, 3 → BUILDER (guard), TEST ENGINEER (tests), CRITIC re-check.
- 4 → ORCHESTRATOR (docs). 5 → ORCHESTRATOR (docs: ORCHESTRATOR checks interface.md before step 8; TEST ENGINEER does
  not edit it) + debt.md (a guard rule that blocks TEST ENGINEER writing interface.md, at the retro).
