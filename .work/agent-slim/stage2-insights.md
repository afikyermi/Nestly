# Stage 2 — patterns in incidents, noise, escapes, debt (3+ occurrences)

2026-10-13. Sources: `incidents.md`, `archive/incidents-blocks-2026-10.md` (113 block lines), `noise.md` (8),
`escapes.md` (3), `debt.md` (28). A pattern needs three or more occurrences (`CLAUDE.md` → Learning).

| # | Pattern | Count | Lesson | What changes |
|---|---|---|---|---|
| 1 | Guard rules on shell text lose to new spellings | debt 7 · escapes 2 · PR 6 Not Ready ×2 | a lexical guard cannot win against a shell; take the shell away instead | **Done in stage 1:** CRITIC has no Bash, TEST ENGINEER Bash is one test run; debt lines paid |
| 2 | Readers try the protected file honestly, the hook blocks | CRITIC→notes ≈43 · TEST ENGINEER→src ≈24 (some lines are aggregates; CRITIC counted 52 and 22 lines mentioning them) | instructions alone did not stop the attempts while the tools allowed them | **Done in stage 1** (tools removed). Measure at the next `/wrap-up` from `blocks.jsonl` |
| 3 | `git add` and `git commit` in one command | ≈16 blocks (ORCHESTRATOR, BUILDER; 14 single lines, the rest inside aggregates) | the rule exists only in the hook's message; no instruction names it | **Stage 2:** one line in `.claude/knowledge/conventions.md` → Git (rule moves into knowledge, meaning unchanged) |
| 4 | Rules that match command **text**, not the **target**, block legitimate work | noise 5: `.env` ×3 (commit message, grep pattern, printf), R3 `sed -i` ×1, TEST ENGINEER `$?` ×2 (readers fixed in stage 1) | a block on text costs a retry and, for r4-critical, a false incidents line | **For Afik** — R4 and BUILDER are frozen by his decision: make the `.env` rule judge path arguments and redirect targets only, not search patterns or quoted text. Until then: write such text with the Edit tool, not the shell (conventions line) |
| 5 | Heuristic lint rules over- and under-match | debt 5 (design strings, physical-direction, gender-slash, `.mts`, `globalThis` alias) | lint heuristics are a fence; no noise or escape from them yet | none — carried in `debt.md`, read at the retro |
| 6 | Log-only commits | 40 of 148 commits (27%) in 4 days | every commit and push costs CI and a Vercel deploy from the Hobby quota | **Stage 3** (Afik, 13.10): log lines ride with the next work commit; push only for CI, end of stage, end of session |

Below the threshold (information, not a mandate): CI red on main (1 escape, already fixed by workflow 1.7) · flaky
tests (cold-start health check, Edge contexts: 2) · escalation counting honest first contact with a new rule (1, noise).
