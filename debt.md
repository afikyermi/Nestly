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
