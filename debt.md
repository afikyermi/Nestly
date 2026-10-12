# Debt

Every `Validated with Concern` verdict from CRITIC, and every neighbouring bug BUILDER reported in
`notes.md` and did not fix (`.work/` is history, not a source of truth, so a report left there is lost).

Shipped deliberately, with a known cost. Read monthly, not per feature.

```
YYYY-MM-DD | <feature> | <the concern> | cost if ignored: <what happens later> | file:line
```

A neighbouring bug uses the same line, with `observed in <feature>` in place of the feature. Fixing it is
a bug-fix path of its own (`.claude/workflow.md`).

---

An entry leaves this file in one of two ways:

- **paid** — fixed. Note the date and the feature that fixed it.
- **accepted permanently** — a deliberate decision that this is how it stays. Move it to
  `decisions.md`, because at that point it is no longer debt, it is the design.

An entry that sits here for months without either is a decision nobody made. That is the failure
mode this file exists to expose.

---

2026-10-11 | 7.1 CI | GitHub Actions pinned to the mutable `@v4` tags, not commit SHAs — SHAs could not be verified offline | cost if ignored: a moved tag runs third-party code in a public repo's CI | .github/workflows/ci.yml
2026-10-11 | 7.1 CI | `.mts` and `.cts` files match no lint block, so they escape every lint gate | cost if ignored: an unusual extension carries `any`, DOM use or a boundary breach past CI | eslint.config.mjs:140
2026-10-11 | 7.1 CI | aliasing a global (`const g = globalThis; g.window`) escapes the portability rule; lint cannot follow it without data-flow analysis | cost if ignored: web logic touches the DOM and breaks React Native portability; left to CRITIC review | eslint.config.mjs
2026-10-11 | 7.2 hooks | the guard is lexical: dynamic names (`$(echo n)otes.md`, variable expansion such as `git $x -A`) and `const g = globalThis`-style indirection are not followed | cost if ignored: a deliberate agent can still reach a blocked path; CRITIC review and CI stay behind it | .claude/hooks/guard.js
2026-10-11 | 7.2 hooks | the secret scan has no escape hatch: a public sample token in a test fixture (e.g. jwt.io's) blocks the commit | cost if ignored: a test fixture needs a hand-made token, or Afik commits it by hand | .claude/hooks/guard.js
2026-10-11 | 7.2 hooks | snapshot updates via `pnpm`/`yarn` or a custom script (`npm run test:update`) are not caught; `git log --remerge-diff` is not treated as a patch | cost if ignored: BUILDER could update TEST ENGINEER's snapshots through a script named otherwise | .claude/hooks/guard.js
2026-10-11 | 7.2 hooks | TEST ENGINEER false positives: argument text naming apps/<app>/src blocks even in a commit message, and `apps/*/tests` globs block | cost if ignored: an occasional retry with an explicit app path | .claude/hooks/guard.js
2026-10-11 | observed in 7.1 and 7.2 | `npm run ci` fails intermittently on the first run after a pause; suspected the server health test timing out on a cold start (5s); CRITIC could not reproduce it in 6 runs | cost if ignored: a red CI on main with no code cause; a timeout for that test is TEST ENGINEER's call | apps/server/tests/health.test.ts
2026-10-11 | UI wave 1 part a | the design lint rules scan every string literal, so ordinary words ('right-click', 'pl-PL', '#add') are reported as classes or colours (CRITIC finding 4) | cost if ignored: builders reach for workarounds; inline disables are blocked, so friction lands as reworded strings — restrict to class contexts if it appears | tools/eslint-rules/design-rules.mjs
2026-10-11 | UI wave 1 part a | the physical-direction style check sees only literal objects inside a JSX `style` attribute; a style object built elsewhere passes | cost if ignored: an RTL break through a shared style constant; CRITIC review covers it | tools/eslint-rules/design-rules.mjs
2026-10-11 | UI wave 1 part b | the gender-slash lint is a heuristic: legitimate Hebrew pairs such as "כן/לא" are flagged, and split literals or templates bypass it (CRITIC finding 6) | cost if ignored: occasional reworded strings; a bypassed slash form reaches users unless CRITIC catches it | tools/eslint-rules/copy-rules.mjs
2026-10-12 | observed in UI wave 1 parts c and e | Edge-only Playwright context errors ("Target crashed", "browserContext.close: Test ended") in single full runs; they pass on rerun and did not recur in TEST ENGINEER's clean runs | cost if ignored: a flaky browser job on CI that trains people to rerun red; a third occurrence opens a look at worker count or Edge's channel | playwright.config.ts
2026-10-12 | guard (TEST ENGINEER rule) | the guard reads shell text, not shell semantics: `X=a; cat ${X}pps/web/src/a.ts`, `cat "$X"pps/…` and `cat $(printf apps)/…` still reach app source for TEST ENGINEER (as before the change) | cost if ignored: a deliberate agent can read the implementation; the TEST ENGINEER rule stays a fence, with CRITIC behind it | .claude/hooks/guard.js
