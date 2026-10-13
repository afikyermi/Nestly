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
