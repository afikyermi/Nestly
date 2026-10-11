# findings — UI wave 1

Saved by ORCHESTRATOR from CRITIC's return (the harness refused CRITIC's own write to this path).

## Part a — `ui-wave-1/part-a` at e16db41 — verdict: Validated with Concern

No critical or high finding. CI green; token values, contrast rows, generator determinism and built fonts verified by
CRITIC's own scripts.

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | medium | tools/build-design-tokens.js:30 → tokens.generated.css:5 | only `--color-*` is reset; Tailwind's default type, radius, shadow, easing, weight and breakpoint scales stay usable (`text-xs`, `font-bold`, `shadow-lg`, `xl:`) and no gate fires | reset `--text-* --font-weight-* --radius-* --shadow-* --ease-* --breakpoint-*` to `initial`; define weight tokens for 400/500/600 |
| 2 | medium | tools/eslint-rules/design-rules.mjs:158 | physical direction unchecked in `style={{}}` objects and `.css`; class list misses `float-`, `clear-`, `scroll-m/p l/r`, `origin-`, `object-`, `bg-left/right`, `space-x-`, `translate-x-` | check style keys and `textAlign/float/clear` values, CSS properties in the text processor, extend PHYSICAL_CLASS (stored once) |
| 3 | medium | packages/shared/tests, tools/ | no tests for criteria 1, 3–5, 7, 11 in the diff; untracked `tools/_probe.mjs` | TEST ENGINEER's tests land in this part and run in `npm test`; scratch file not committed |
| 4 | low | design-rules.mjs:27-31, :55 | rules scan every string literal: `'right-click'`, `'pl-PL'`, `'#add'` reported | track; restrict to class contexts if friction appears |
| 5 | low | design-rules.mjs:55 | `rgb()`/`hsl()`/`oklch()` and named colours not caught in inline style or CSS | extend the colour regex outside the token source |
| 6 | low | .nvmrc, package.json engines | generator needs Node ≥ 22.18 (type stripping); `22` / `>=22` allow older | engines `>=22.18`, `.nvmrc` 22.18+ |
| 7 | low | apps/web/src/styles/fonts.css:9,18 | font files addressed by a relative path into root node_modules | use the package specifier `@fontsource-variable/rubik/files/…` |
| 8 | low | design-rules.mjs `[&…]` exemption; eslint.config.mjs:283-290 | exemption matches `/components/ui/` anywhere; Radix rule misses `.storybook/` and tests; raw re-exports from ui not prevented | anchor on `apps/web/src/components/ui/`; add `.storybook` to the rule; CRITIC checks re-exports in b–f |

Notes: `bg-(--var)` shorthand allowed (references variables) · the shadow `bar` copies `#F1E6DD` from `border` (drift
risk, low) · DirectionProvider and index.html both set `rtl` (low, acceptable).

**Re-check (CRITIC, 37b0c5d): Validated.** Findings 1, 2, 3, 5, 6, 7, 8 fixed. Finding 4 → `debt.md`. Residual, not a
finding: the style-key check applies to literal objects inside a JSX `style` attribute only (`const st = {…}` passes).
Carried to part b: put `.storybook` in a tsconfig (its lint currently fails on parse), and check `components/ui` for raw
Radix re-exports. TEST ENGINEER's high finding (ESLint plugin collision on `features/**`) fixed and validated by TEST
ENGINEER. Merged to main at 7189684.
