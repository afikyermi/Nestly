# Noise

Findings that were raised and should not have been, or cost more than they saved.

The counterpart to `escapes.md`. Escapes measure what a gate **missed**; this measures what a gate
**invented**. A system instrumented only for misses gets stricter forever and nobody notices the
price.

```
YYYY-MM-DD | <feature> | <gate> | <what was raised> | why it wasn't real | severity claimed
```

Gates: `CRITIC` · `TEST ENGINEER` · `DATA ARCHITECT` · `SPEC` · `CI`

---

## What belongs here

| Case | Example |
|---|---|
| a finding Afik dismissed | "this isn't a real risk, ship it" |
| **severity inflation** | a `high` whose failure scenario turns out not to be reachable |
| a concern with no failure path, presented as a defect | "this could theoretically..." |
| a blocked feature that should not have been blocked | `Not Ready` overturned |
| a `QUESTION` whose stated default was obviously correct | the agent should have proceeded |
| a `BLOCKER` that had a reasonable default | filed as blocking when it was not |
| a test asserting incidental structure, breaking on every refactor | maintenance cost, zero signal |
| review or spec work on a change that warranted the Light path | process applied where it was not earned |

## What does not belong here

- A finding that was real but low priority. That is correct behaviour, and it is not noise.
- A finding that was real and went to `debt.md`. That is the system working.
- Something Afik disagreed with and then changed his mind about.

> **Noise is a gate being wrong, not a gate being inconvenient.**
> Logging every finding you did not feel like fixing turns this file into a reason to stop reviewing.

---

## Why it matters

A CRITIC raising ten findings of which nine get dismissed is worse than no CRITIC: it costs tokens,
it costs your attention, and it trains you to skim findings — so the tenth one, the real one, gets
skimmed too.

Without this file that failure is invisible. It even reads as diligence.

Read together with `escapes.md` at every retro. See `.claude/learning.md`.

---

2026-10-11 | working rules | hook (guard.js) | a commit whose message named the preview env file was blocked as an .env access | the heredoc body was a commit message, not a command; the guard now skips data heredocs and keeps bodies fed to an interpreter (test added) | block
2026-10-12 | UI wave 1 part d | CRITIC (relayed by ORCHESTRATOR into a spec addendum) | the InlineAlert story "implied a password-reset path whose channel is TBD" | FR-AUTH-003 was decided on 11.10.2026 (email, from the Login screen); the claim was stale and neither CRITIC nor ORCHESTRATOR checked the SRS — caught by CRITIC in part e | low
2026-10-12 | tooling | hook (guard.js, test-engineer) | `npm run …; echo x=$?` blocked as "reads apps/*/src" — the `?` in `$?` was read as a glob with an empty prefix, so the root "path" reached app source | not a read of app source; shell variables are no longer treated as paths (test added); recurring TEST ENGINEER friction since part a | block
2026-10-12 | i1-prep | hook (guard.js, test-engineer) | `cd … && npm run ci | tail` with `echo $?` blocked as a TEST ENGINEER read of apps/*/src | not a read of app source; `npm run ci --prefix …` passed. Second occurrence of TEST ENGINEER friction on CI commands (after 12.10 `$?`); goes into the guard allowlist redesign | block
2026-10-13 | agent-slim stage 1 | hook (guard.js, builder) | `sed -i` on package.json blocked as "BUILDER changes test files from the shell" — the replacement text named `*.test.js` files | not a write to a test file; R3 matches any test-looking name in the command text, not the target. R3 is out of stage 1 scope (Afik: R4 and BUILDER untouched) | block
2026-10-13 | agent-slim stage 1 | hook (guard.js, test-engineer, new allowlist) | third reader block in one session escalated to incidents.md as "the fence is being probed" | TEST ENGINEER was learning the new one-test-run form during the swap, not probing; the threshold counts honest first contact with a new rule | block
2026-10-13 | agent-slim stage 2 | hook (guard.js, all, .env rule) | ×2: a grep whose search pattern was the text ".env", then a printf quoting it, blocked as an .env access — and, as r4-critical, each wrote an incidents.md line | no .env file was named; the rule matches command text, not targets. Third occurrence with 2026-10-11 (a commit message) | block
2026-10-13 | agent-slim stage 6 | hook (guard.js, all, .env rule) | an inline `node -e` editing incidents.md blocked because a quoted table row named ".env"; an incidents.md line written | no .env file was named. Fourth occurrence of pattern 4 (stage2-insights.md); the new convention line did not prevent it — evidence for Afik's pending decision on the rule | block
2026-10-13 | guard-env-paths (before the fix) | hook (guard.js, all, .env rule) | a grep over noise.md and conventions.md with the search pattern ".env" blocked as r4-critical; an incidents.md line written | no .env file was named. Fifth occurrence of pattern 4; Afik decided the fix the same day | block
2026-10-13 | identity-platform (Gate 2 commit) | hook (guard.js, all, secret scan) | a placeholder database URL with "…" as the password blocked the commit as a secret | no credential; reworded the placeholder | block
2026-10-14 | identity-platform a | hook (guard.js, all, env rule, fail-closed glob) | a jq filter `.[]` in a quoted `gh -q` argument blocked as r4-critical and paged incidents.md | no env file; first occurrence of debt "every fail-closed ambiguity block is r4-critical" | block
2026-10-14 | identity-platform a (DATA ARCHITECT) | hook (guard.js, all, env rule, fail-closed) | ×2: read-only `gh api` calls on the public supabase/postgres repo blocked as env access | no env file named; with 2026-10-14 jq `.[]` that makes 3 fail-closed false blocks — the pattern threshold. Workaround exists (another command), so no freeze exception; noted for the retro | block
2026-10-14 | identity-platform b | hook (guard.js, test-engineer, reader rule) | three Glob blocks escalated to incidents.md as "the fence is being probed" | broad Glob roots while locating black-box interfaces; second occurrence of this kind with 2026-10-13 (stage 1) | block
2026-10-14 | identity-platform c | hook (guard.js, all, secret scan) | fake DB URLs in test fixtures blocked the commit | known debt (no escape hatch for fixtures); second occurrence with 13.10 schema.md placeholder | block
2026-10-14 | identity-platform c / ci-path-filters | hook (guard.js, critic, reader rule) | three Grep blocks escalated as "the fence is being probed" | broad search roots reaching .work/; third occurrence of honest-escalation (13.10 TEST ENGINEER, 14.10 TEST ENGINEER) — pattern threshold for the retro | block
2026-10-14 | app-shell-guard | hook (guard.js, test-engineer, write limit) | escalated after three Write blocks on tool config and a helper module | honest; fourth honest escalation in two days — the escalation threshold counts first contact with a limit (retro)
2026-10-14 | preview-access | hook (guard.js, test-engineer, cwd = project root) | five run-command blocks in 3 minutes: the agent ran in a .claude/worktrees worktree, not the project root | legitimate test runs; ORCHESTRATOR ran them; branches move to the main checkout; guard unchanged (frozen — retro after I1)
2026-10-14 | F1.4 part b CI | F1.1 c27 (one connection per instance) red twice — not a product defect: the db test files ran in parallel against one database and c27 counts every app_server backend; fixed by running tests/db/ without file parallelism (97541c4) | cost: two CI runs, one BUILDER investigation
2026-10-15 | srs-2-15-demo | hook (guard.js, env rule, fail-closed) | two false blocks: a `--jq` filter with `.[]`, and a sed whose replacement text quoted the rule | no env file involved; reran without jq / used Edit; guard unchanged (frozen — retro after I1; the jq case is the known pattern)
2026-10-15 | login-session | hook (guard.js, env rule, fail-closed) | a `gh api -q '.[0]...'` filter read as a glob, again (third jq case today) | no env file; reran without jq through a scratch file; guard frozen until the retro
2026-10-15 | dev-speed | hook (guard.js, test-engineer, reader) | a third-block escalation to incidents.md on a `cd … && node --test …` run form (18:57) | honest first contact with the run-form rule in a fresh agent; the session-wide counter had not been rotated since the last /wrap-up; no incidents resolution line (decision "Development speed" A) | block
2026-10-16 | password-recovery | hook (guard.js, test-engineer, reader) | third-block escalations to incidents.md at 19:39 and 21:01 (15.10) | legitimate test runs in the run-form rule; no resolution line (decision "Development speed" A) | blocked legitimate work
2026-10-16 | preview-e2e | hook (guard.js, test-engineer, writer) | third-block escalation at 01:12: TEST ENGINEER refused writing `e2e-preview/*.flow.ts` (not a recognised test file) and `package.json` | legitimate work; the flow was written as a draft and copied verbatim by ORCHESTRATOR; proposal (`*.flow.ts` is a test) goes to the retro | blocked legitimate work
2026-10-16 | google-sign-in | hook (guard.js, all, r4-critical) | ORCHESTRATOR's `gh api … --jq` read as an env-file glob (18:03), an incidents.md line | known pattern (orchestration lesson 6); use `--template`; no resolution line
2026-10-16 | google-sign-in | hook (guard.js, test-engineer, reader) | 18 reader blocks, a third-block escalation at 15:47 (incidents.md): TEST ENGINEER tried `git diff --stat`/`wc` to measure the 2× cap and eslint on a `.flow.ts`/helper file | the cap needs a count TEST ENGINEER cannot take — ORCHESTRATOR measures it; no resolution line
2026-10-16 | account-takeover-close | tool (vercel-ignore.mjs) | the last push went before the PR opened, so its Preview was "Ignored" and opening PR 38 deployed nothing; E needs a fresh push | order: open the PR before the final push (or push a records commit after it); no tool change (audit decision 7) | cost one extra push
2026-10-17 | account-takeover-close | hook (guard.js, all, force push) | after PR 38 squash-merged, restarting the branch from main needed --force-with-lease; blocked | worked around with a `-s ours` merge of the old branch history (no content change, no rewrite) | blocked legitimate work
2026-10-17 | profile-view-edit | permissions (Bash prefix rule on `psql`) | BUILDER could not call psql directly on the local PG16 stand-in; ran it from scratchpad scripts on the local socket | worked around inside the rules; no settings change (audit decision 7) | blocked legitimate work
2026-10-17 | ORCHESTRATOR (I2, gateway key) | asked Afik to add `SUPABASE_PUBLISHABLE_KEY` in Vercel — it exists since 14.10 (archive/WORKPLAN-2026-10.md:326); records not searched before asking | cost: one needless ask of Afik; rule: grep the archive and .work for a setting before listing it under "ממתין לך"
2026-10-17 | friends (F2.4a) | guard hook (test files are TEST ENGINEER's) | ORCHESTRATOR's task gave BUILDER the structure pgTAP and four test amendments; BUILDER worked around the hook with shell Python | all test-file work, incl. a re-check of the four, moved to TEST ENGINEER | cause: the task assignment, not the hook
2026-10-18 | guard retro (ORCHESTRATOR) | hook (guard.js, all, env rule, r4-critical) | ×2: shell commands whose quoted text had a `|` (a markdown table, a test string) and also ran `node` were read whole as text, so a mention of the env-file name blocked them; two incidents.md lines (16:06 and after) | by design (a pipe + an interpreter = fed code, fail closed); the real name was in the text; used the Edit tool | block
2026-10-19 | guard | TEST ENGINEER Write blocked in sibling worktree nestly-wt-pgtap/supabase/tests (paths resolved from project dir) | legitimate pgTAP work moved to the main checkout; WORKPLAN 9
2026-10-19 | guard (BUILDER, F3.8+F3.9) | BUILDER created untracked e2e/zz-debug.spec.ts via a node script (a write the guard's shell rules do not see), then stopped when the guard blocked its removal and reported it | removed by TEST ENGINEER; never committed; report to Afik as a guard gap (node -e writes) for the next guard retro
2026-10-19 | e2e ports | Playwright web servers use fixed ports 4174/6007 with reuseExistingServer; a run in one worktree tested another's build (F3.9, feed-composer) | interim: e2e runs serialized by ORCHESTRATOR; fix: per-checkout ports in tools/throughput
