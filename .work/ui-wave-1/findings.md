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

## Part b — `ui-wave-1/part-b` at 8133799 + TEST ENGINEER ef24cce — verdict: Validated with Concern

No critical or high finding. CI green; Edge 99/99; Chrome unproven locally (channel `chromium` not installed).

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | medium | apps/web/src/lib/cn.ts:12 | tailwind-merge not extended with the spacing tokens: `cn('px-5 px-screen-margin')` keeps both, so overrides fail silently in every component | extend `spacing` from the token source; unit test the override |
| 2 | medium | playwright.config.ts:17, ci.yml browser job | `chrome` project runs Chromium, not Chrome (NFR-QA-001); CI installs `chromium` | `channel: 'chrome'` and `playwright install --with-deps chrome msedge`, same commit (ORCHESTRATOR decided) |
| 3 | low | button.tsx:78-103 | double-submit guard holds only if `pending` is set synchronously | document the contract on the prop |
| 4 | low | button.tsx:50, 64-102 | (a) link with `aria-disabled` still fires · (b) `variant` ignored when `iconOnly` · (c) pending icon-only crowds loader and icon · (d) `aria-busy` poorly announced | guard (a); forbid or document (b); swap child for loader (c); document caller's live region (d) |
| 5 | low | tools/check-stories.mjs:27-45 | no negative proof; counts any `export const`; nested/`.ts` components unchecked | count story exports only; walk nested folders; TEST ENGINEER adds negative fixtures |
| 6 | low | tools/eslint-rules/copy-rules.mjs | gender-slash heuristic: `כן/לא` false positive; split literals bypass | accepted as heuristic backed by review → debt |
| 7 | low | package.json test:browser, ci.yml | `--pass-with-no-tests` now stale; a lost suite stays green | remove the flag and the comment |

Also from TEST ENGINEER: the `ui-tooltip--on-hover` story double-wraps a Tooltip (two `role=tooltip`), marked `test.fail` ·
spec gap: component APIs (exports, props) are not specified — SPEC adds an API line per component for parts c–f.

**Re-check (CRITIC, 573bad0): Validated.** Findings 1–5 and 7 fixed; 6 → `debt.md`. TEST ENGINEER's items (stale
`test.fail`, `check-stories` fixtures) resolved by TEST ENGINEER. `test:browser` 196/196 on real Chrome and Edge.
**Preview (ORCHESTRATOR, 11.10.2026): passed** — gallery built and served locally; Button primary/pending, icons,
skeleton at 375: palette and Rubik per `tokens.md`, loader at inline start, directional icons correct in RTL, skeleton
avatar on the start side; keyboard focus shows the ring and the icon button's tooltip opens on focus. Merged at f71a0ab.
**For SPEC, parts c–f:** add one API line per component (exports, props, the accessible-name prop) — TEST ENGINEER had
to learn the API from stories in part b.

## Part c — `ui-wave-1/part-c` at 82515f6 + a3b86f0 — verdict: Not Ready

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | high | apps/web/tests/ui/form-controls.test.tsx:146 | test file failed `tsc`, so `npm run ci` and the web build were red (Vitest does not typecheck) | spy typed as `FormFieldControl`; TEST ENGINEER now runs every CI step |
| 2 | high | shared/password-input.tsx:57 | in the RTL page the show/hide toggle sat on top of the LTR password text (padding on the wrong side) | `ps-14` on the LTR input; geometry test added |
| 3 | low | ui/select-input.tsx:52 | placeholder looked like a chosen value | muted while empty (state, since `has-[…]` is rejected by the lint) |
| 4 | low | ui/text-input.tsx:19 | TextInput accepted every native prop, `placeholder` and `className` included | exact props on all three controls (spec addendum) |
| 5 | low | e2e/touch.spec.ts:7 | 44×44 checked only on two story prefixes | generic over every story |
| 6 | low | shared/password-input.tsx:79 | "✓" read as "check mark"; unmet rules had no state word | ✓ aria-hidden + sr-only "(התקיים)" / "(עדיין לא)" |

**Re-check (CRITIC, d9fc3be): Validated.** Mutation probes that went undetected before (border token on PasswordInput,
`dir="ltr"` removed, padding on the wrong side) now fail tests. **Preview (ORCHESTRATOR): passed** after a story-copy fix
— the password rule read "8 characters" (VAL-003 is 10, no composition rules) and the select used undecided options
(now OP-004's parent set). Merged at a89e800.
**Process lesson:** TEST ENGINEER reported green from Vitest without the typecheck; ORCHESTRATOR now runs `npm run ci`
after every TEST ENGINEER commit, and TEST ENGINEER lists every CI step it ran.

## Part d — `ui-wave-1/part-d` at a4ef345 + tests — verdict: Validated with Concern

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | medium | shared/choice-card-group.tsx:68, shared/date-input.tsx | ChoiceCardGroup error was a destructive border only; no invalid state, no way to link the message; DateInput lacked describedby | `role="radiogroup"` + `aria-invalid` + `aria-describedby` prop; DateInput `aria-describedby` (spec addendum) |
| 2 | medium | ui/checkbox.tsx:21-30 | `aria-invalid={error ? true : undefined}` after `{...rest}` erased FormField's invalid state | declared aria props; `error` and `aria-invalid` combine |
| 3 | low | shared/inline-alert.stories.tsx | LongText copy implied a password-reset path (FR-AUTH-003 channel TBD) | neutral copy |
| 4 | low | e2e/touch.spec.ts:44-52 | inline-link exemption swallowed link rows and label + stand-alone link | text outside every a/button; parent must be `p` or a checkbox/radio `label` (wrapper spans looked through) |

**Re-check (CRITIC): Validated.** Mutation probes for 1, 2 and 4 failed the matching tests and were reverted. Earlier in
the part: inline links in the terms Checkbox exempted from target size per WCAG 2.5.8 (spec addendum). Merged at 43ee913.

## Part e — `ui-wave-1/part-e` at ef17eab + 5614c90 — verdict: Validated with Concern

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | medium | shared/menu-item.tsx:14-15 | a MenuItem with neither `href` nor `onClick` compiled and rendered a dead button | action branch requires `onClick`; "neither" type tests |
| 2 | medium | layout/auth-layout.stories.tsx:60; spec addendum | Login had no recovery entry point because the spec called FR-AUTH-003 TBD — it was decided on 11.10.2026 | "שכחתי סיסמה" link; Welcome lead text (FR-AUTH-001); spec corrected; the stale claim → `noise.md` |
| 3 | low | ui/avatar.tsx | initials by code point, not grapheme; not upper-cased; leading non-letters kept | `Intl.Segmenter`, letter-start words, `toLocaleUpperCase` |
| 4 | low | ui/avatar.stories.tsx:32 | size set through `className` | `size` prop; `className` for placement only on display/layout components (decision) |

Also: TEST ENGINEER's Finding 1 — Logo and illustrations accepted `aria-label` against the API → refused at compile time,
validated by TEST ENGINEER. The Registration illustration back to the approved R2 heart. **Re-check (CRITIC): Validated**,
probes on 1 and 3 caught. Merged at c83c65c.

## Part f — `ui-wave-1/part-f` at e5de9bb (1f3efa3 + 5e14dd2 + e5de9bb) — verdict: Validated with Concern

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| 1 | medium | layout/app-shell.tsx:57,64 · bottom-navigation.tsx:28 · styles/index.css | The TopBar (sticky top, 56px) and the BottomNavigation (sticky bottom, ~72px at 375) overlay scrolled content, and nothing sets `scroll-padding`, so a focused control can land fully under a bar (WCAG 2.2 SC 2.4.11; `accessibility` skill line 38) | `scroll-padding-block` (top = header height, bottom = bar height below 1024) on the scroll root, from tokens; Playwright test: Tab to a control near each fold and assert it is not covered |
| 2 | medium | ui/dialog.tsx:29-31 · layout/app-shell.tsx | Focus return depends on `document.activeElement` being the Hamburger when the drawer opens. In Safari (macOS, iOS) and Firefox on macOS a mouse or touch click does not focus a button, so the opener recorded is `body`, and on close focus is not returned (criterion 40). `menuButtonRef` exists on TopBar for this and AppShell does not use it | AppShell passes a ref to TopBar and gives it to the drawer as the return target (or the click handler sets the opener); a test where the opener is not focused at open |
| 3 | low | shared/bottom-navigation.tsx:33 | "At most one `current`" is a comment only: two items with `current` both render `aria-current="page"` | document it on the prop, or take `currentKey` (breaks the API line, so SPEC decides) |
| 4 | low | e2e/part-f.spec.ts:359-367, tests/ui/part-f.test.tsx:386 | Escape is tested only with focus on the panel; with the close control focused, the first Escape closes its Tooltip and the second closes the drawer, and no test pins that | add the test, so the behaviour is a decision and not an accident (see below) |

**Looked at, no finding**
- **Two Escapes with the close control focused: acceptable, not a defect.** Initial focus lands on the panel, so the common path (open, Escape) takes one. Once a keyboard user tabs to the close control, its Tooltip opens, and Escape dismissing that first is what WCAG 1.4.13 asks for ("dismissible without moving focus"). It is not a keyboard trap (2.1.2): Tab, the close control, Enter or Space all leave. Focus order (2.4.3) is not affected. Finding 4 only asks for a test.
- **DOM order, nav before main, bar at the bottom at 375: acceptable.** The skip link bypasses it; the order matches visual order at 1024, where keyboard use is common; at 375 the sequence (header, nav, content) is still meaningful (1.3.2). Moving the nav after `main` would only move the mismatch to 1024.
- **Skip link:** first Tab stop; parked by transform, so it stays in the accessibility tree; `z-dialog` above the sticky bars; Enter focuses `main` (`tabIndex=-1`); `main` is the only target. Landmarks: one `header`, `nav`, `main`; the drawer is a portaled dialog outside them. AppShell imports no auth, router or data code, and a test walks the transitive imports.
- **SideDrawer / `ui/dialog.tsx`:** trap, `aria-hidden` on the rest, scroll lock (Overlay is rendered, so Radix's lock applies), Escape, backdrop and close control all close it; the Tooltip layer (`z-popover` 40) is above the drawer (`z-drawer` 30) and receives pointer events as the top layer. Focus return to a focused Hamburger works (finding 2 is the unfocused case).
- **BottomNavigation:** `aria-current` only on the current item; heavier weight (`font-semibold`) plus a pill, so not colour alone; items are 56px high and at least 44 wide at 320 with five items; the rail is first in the DOM and `lg:flex-row` puts it at the inline-start (right) edge in RTL; `order-last` is visual only. The story decorator is a plain full-height frame and changes no component behaviour.
- **`tools/check-stories.mjs`:** `ui/dialog` in `NO_VISUAL` does not weaken the gate. It is one named file, the same pattern as `shared/logo-wordmark`, and the dialog's behaviour is exercised through the SideDrawer stories (Closed, Open) and the AppShell stories, both with axe. The four new components have their state counts in `STATES`. Cost to watch: a second consumer of `DrawerPanel` will not be forced to bring its own story.
- **Tests (5e14dd2):** they assert the criteria through roles, names, focus and geometry (bounding boxes in RTL, tab sequence, scroll lock, controlled `onOpenChange`, import walk), not the implementation. The exceptions are small: "differs by more than colour" compares class names (backed by the computed font-weight test in Playwright), and the reduced-motion test passes trivially because the drawer has no animation. Gaps are findings 1, 2 and 4.

**Open:** none for Afik. A decision that stays visible: the drawer is not closed on a menu-item activation (spec addendum, I1); AppShell will need a close-on-navigate hook then.

Done: reviewed `main...ui-wave-1/part-f` against spec criteria 17-20, 38-42, the Part f API lines and every addendum.
Artifact: `.work/ui-wave-1/findings.md`, section "Part f".
Findings: 2 medium (1 focus obscured by the sticky bars; 2 focus return when the opener is not focused), 2 low (3 two `current` items; 4 Escape test gap).
Next owner: BUILDER fixes 1 and 2 (3 and 4 at BUILDER's choice, 3 may need SPEC); CRITIC re-checks only these.
Verdict: **Validated with Concern.** Ready once 1 and 2 are fixed, which is cheap now (a few lines of CSS and one ref). If they are not fixed, the cost is that every page built on AppShell in I1 inherits an obscured-focus failure, and Safari users lose their place after the drawer.
