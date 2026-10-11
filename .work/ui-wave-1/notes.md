# notes — UI wave 1, part a (gates, tokens, generator, font, base CSS, direction wrapper)

Branch `ui-wave-1/part-a`. Criteria 1–11. Parts b–f not started.

**Approach**
- Token source `packages/shared/src/design-tokens/`: `tokens.ts` (plain data, no imports, so the generator can load it
  with Node type stripping), `contrast-pairs.ts` (the 28 rows of tokens.md: 27 thresholded + 1 informational, with the
  documented ratio), `contrast.ts` (WCAG maths; `computeContrast(palette?, pairs?)` takes a palette so a test can pass a
  modified copy), `index.ts`. Exported from the `@nestly/shared` index.
- `tools/build-design-tokens.js` (CommonJS, no dependencies) writes `apps/web/src/styles/tokens.generated.css`
  (`@theme`, plus `@utility duration-*` and `z-*` because Tailwind has no theme namespace for them). Committed.
- `npm run tokens:check` = generate + `git diff --exit-code` on the generated file. In `npm run ci` and in the CI `lint` job.
- Rubik: `@fontsource-variable/rubik`; `styles/fonts.css` declares only the hebrew and latin `@font-face`
  (the package's own `wght.css` also carries arabic, cyrillic, latin-ext). Built CSS: 2 `@font-face`, 2 bundled woff2.
- `styles/index.css`: imports, `html` font/background/colour, 2px ring `:focus-visible`, and the unlayered
  `prefers-reduced-motion` rule (`0s !important`).
- `components/ui/direction-provider.tsx` wraps Radix `Direction.Provider dir="rtl"`; `main.tsx` uses it.
- Lint: `tools/eslint-rules/design-rules.mjs` (one plugin): `nestly/no-physical-direction`, `nestly/no-arbitrary-value`,
  `nestly/no-hex`, `nestly/no-radix-outside-ui`. The physical-class regex is exported once (`PHYSICAL_CLASS`).
  `.css` and `.svg` are linted through a processor (`nestly/text`) that hands the file to the hex rule as one string.
  Rules cover `apps/web/src` (hex: also `packages/shared/src`); tests are outside, so fixtures there do not trip them.

**Decisions**
- `radix-ui` (the unified package, what shadcn now generates) added to `apps/web` for the DirectionProvider; it is in
  the pre-approved package. `@fontsource-variable/rubik` likewise. Nothing else installed.
- Spacing rhythm tokens are named `card-padding`, `card-padding-lg`, `card-gap`, `section-gap`, `section-gap-lg`,
  `screen-margin` (tokens.md gives values, not names).
- `--color-*: initial` in `@theme`: Tailwind's default palette is removed, so `bg-red-500` does not exist, only tokens.
- Colour roles: `colorRoles = { border: 'decorative', input: 'field-border' }`.
- Q1 implemented as assumed: `data-`/`aria-` (also `group-`/`peer-`) variants allowed; `[&…]` only in `components/ui`;
  other bracket variants (`min-[300px]:`) are treated as arbitrary values.

**Deviations**
- Criterion 1 says hex is rejected "except inside `design-tokens/`". The generated `tokens.generated.css` necessarily holds
  hex (`--color-primary: #B5502C`, criterion 8), so it is also exempt. One extra exempt file, nothing else.
- Criterion 3 asks for `contrast.test.ts` and 4 and 5 for its cases; criterion 7 a token-completeness test. I cannot write
  test files (guard hook): see the requests below. The criteria remain open until TEST ENGINEER delivers them.

**Deliberately not done**
- No test files, no fixtures files left in the repo (the lint rules were proved with temporary files, then deleted).
- Criterion 11 (Playwright reduced motion) and the built-CSS font check are TEST ENGINEER's; the CSS rule exists.
- No `dark:` and no dark values. No Storybook (part b). `@utility` for z-index/duration only; no Tailwind plugin.

**Uncertain**
- `fonts.css` reaches the package by a relative path `../../../../node_modules/@fontsource-variable/rubik/files/…`.
  It builds and bundles, but it assumes hoisted node_modules at the repo root (true for npm workspaces here). Part b's
  Storybook must use the same file.
- `tokens:check` passes vacuously until the generated file is committed (it is, in this commit). From then on it is real.
- The generator needs Node type stripping (default from Node 22.18; CI uses `.nvmrc` = 22, latest 22.x). Local Node 24 prints
  an ExperimentalWarning-free run. If CI's Node 22 were older than 22.18 it would fail: easy to see, not silent.
- `npm run ci` failed once on the first run in `apps/server` vitest (1 test failed, no detail captured because the run
  was parallel with the slow web suite), then passed twice, and passed alone and on a stash of my changes. Looks like
  load flakiness; not caused by this change as far as I can tell.
- Line/column of CSS/SVG hex findings are computed from the file text and should be right; checked on a 2-line fixture.

**Contrast: computed by my own check vs tokens.md** (all 27 thresholded pairs pass; largest deviation 0.0049; the
informational pair is 1.2009, not asserted)

| pair | computed | tokens.md |
|---|---|---|
| foreground / background | 12.2762 | 12.28 |
| foreground / card | 12.9151 | 12.92 |
| foreground / muted | 11.4336 | 11.43 |
| muted-foreground / background | 6.2253 | 6.23 |
| muted-foreground / card | 6.5493 | 6.55 |
| muted-foreground / muted | 5.7980 | 5.80 |
| primary-foreground / primary | 5.0620 | 5.06 |
| primary-foreground / primary-strong | 7.2944 | 7.29 |
| primary-strong / background | 6.9335 | 6.93 |
| primary-strong / card | 7.2944 | 7.29 |
| primary-strong / primary-soft | 6.0741 | 6.07 |
| foreground / primary-soft | 10.7545 | 10.75 |
| foreground / accent-soft | 10.8004 | 10.80 |
| primary-strong / accent-soft | 6.1000 | 6.10 |
| destructive / card | 6.5365 | 6.54 |
| destructive / background | 6.2131 | 6.21 |
| destructive / destructive-soft | 5.6611 | 5.66 |
| primary-foreground / destructive | 6.5365 | 6.54 |
| success / card | 6.3537 | 6.35 |
| success / success-soft | 5.4476 | 5.45 |
| warning / card | 6.3292 | 6.33 |
| warning / warning-soft | 5.6057 | 5.61 |
| input / card | 3.4741 | 3.47 |
| input / background | 3.3023 | 3.30 |
| ring / card | 5.0620 | 5.06 |
| ring / background | 4.8115 | 4.81 |
| ring / primary-soft | 4.2151 | 4.22 |
| primary-soft / card (info) | 1.2009 | 1.20 |

**Requests for TEST ENGINEER** (I may not write under `tests/` or `*.test.*`)

1. `packages/shared/tests/contrast.test.ts` (criteria 3–5). Import `computeContrast`, `contrastPairs`, `colors` from
   `../src/design-tokens/index`.
   - For each result with `pair.threshold !== null`: `ratio >= threshold`, and `Math.abs(ratio - pair.documented) <= 0.01`.
     Assert `contrastPairs.length === 28` and 27 of them have a threshold.
   - Negative proof (4): `computeContrast({ ...colors, primary: '#D9704A' })`; the entries for `ring` pairs do not matter, but
     there is no `primary-foreground / primary` failure unless a pair uses `primary`. Note: no pair has `primary` as the
     background except `primary-foreground / primary`, which does fail (about 3.5). Assert that this pair's ratio is below
     4.5 and that the failure message built from `result.name` is `primary-foreground / primary`.
   - (5) the entry `primary-soft / card` has `threshold === null` and the test never asserts a threshold for it.
   - Also compare `documented` to the real rows of `docs/design/tokens.md` if you want the table itself pinned: it is the
     spec; the source copy is mine.
2. `packages/shared/tests/design-tokens.test.ts` (criterion 7). Assert the exact key sets and values of `colors` (27 names),
   `typeStyles` (the nine, with size/line/weight from tokens.md), `spacingBase` 4 and `spacingRhythm` (card 16/20, gap 12,
   section 24/32, margin 16), `radius` (8/12/16/24/9999), `shadows` (three strings as in tokens.md), `motion` (150/200/300,
   `cubic-bezier(.2, 0, 0, 1)`), `zIndex` (0,10,20,30,40,50,60), `breakpoints` (640/768/1024), `colorRoles` (border
   decorative, input field-border). Exact key lists, so an extra token fails.
3. Lint fixtures (criterion 1), one test file e.g. `tools/eslint-rules/design-rules.test.mjs` (add it to `test:tools`) or
   `apps/web/tests/lint-design.test.ts`, using `new ESLint({ cwd: <repo root> })` and `lintText(code, { filePath })`:
   - filePath `apps/web/src/features/x/x.tsx`: strings `ml-4`, `pr-2`, `left-0`, `text-right`, `border-l`, `rounded-tr-lg`
     each give a `nestly/no-physical-direction` message; `ms-4`, `pe-2`, `start-0`, `text-start`, `border-s`,
     `rounded-se-lg`, `bg-primary` give none. Also `md:pl-3` and `-ml-2` (variant and negative prefix) fail.
   - `w-[13px]`, `bg-[#fff]`, `p-[1.5rem]` give `nestly/no-arbitrary-value`; `data-[state=open]:bg-muted` and
     `aria-[invalid=true]:border-destructive` give none; `[&_svg]:size-4` fails outside `components/ui` and passes at
     `apps/web/src/components/ui/x.tsx`.
   - `const c = '#B5502C'` and `'#fff'` in `.ts`, `.tsx` under `apps/web/src` and `packages/shared/src` give
     `nestly/no-hex`; the same in `packages/shared/src/design-tokens/x.ts` gives none. For `.css` and `.svg`
     (`apps/web/src/styles/x.css`, `apps/web/src/assets/x.svg`) lint the text with that filePath; expect `nestly/no-hex`
     (the processor is applied by the config). `var(--color-primary)` passes.
   - `import { Dialog } from '@radix-ui/react-dialog'` and `import { Tabs } from 'radix-ui'` give
     `nestly/no-radix-outside-ui` at `apps/web/src/features/x/x.tsx`, none at `apps/web/src/components/ui/x.tsx`.
   - A fixture with a physical class must not appear in repo files under `apps/web/src`: only in test strings.
4. Built-CSS check (criterion 10): after `vite build`, `dist/assets/*.css` has exactly two `@font-face` for
   `Rubik Variable` (hebrew, latin), `font-weight: 300 900`, and no `url(http` / `src: url(https?://`. Do not grep the
   bare `https?://`: Tailwind's banner comment contains `https://tailwindcss.com`. `--font-sans` ends `system-ui, sans-serif`.
   `dist/index.html` has no `http(s)://` font URL.
5. Criterion 11 (Playwright, `reducedMotion: 'reduce'`): an element with `transition: opacity 1s` has computed
   `transition-duration` `0s`; same for `animation-duration`. Run on the built app or a page importing `styles/index.css`.
6. Generator determinism (criterion 8): run `node tools/build-design-tokens.js` twice, bytes equal; output contains
   `--color-primary: #B5502C` inside `@theme {` and no `.dark`.
7. Criterion 9: already enforced by the existing `packages/shared` lint block; the new files lint clean. No test needed.

**Preview path**
Nothing user-visible in part a. To see it: `npm run dev -w @nestly/web`, open the page: the "Nestly" heading is in Rubik
(DevTools, Computed, rendered font "Rubik Variable"), background is cream `#FFF8F2`, text `#3B2F2A`; Tab to nothing yet.
Known not to work yet: no components, no Storybook gallery (part b).

**Neighbouring**
- `apps/server` vitest failed once under the parallel `npm run ci` (see Uncertain); worth watching, may be a timeout.
- `.gitkeep` files remain in `components/shared`, `components/layout`, `components/domain`, `assets` (removed only where a
  real file now sits).

---
## Round 2 (after CRITIC and TEST ENGINEER on part a)

- **HIGH, plugin name clash.** `eslint.config.mjs` builds one `nestly` plugin object (boundaries rule + design rules +
  the `text` processor) and uses it in every block. Proved with a temporary file under `apps/web/src/features/`: it
  lints, and reports `no-radix-outside-ui`, physical classes and so on. File deleted.
- **Finding 1.** The generator resets `--color-* --font-* --text-* --font-weight-* --radius-* --shadow-* --ease-*
  --breakpoint-*`. New source export `fontWeights` (normal 400, medium 500, semibold 600), generated as
  `--font-weight-*`. `--font-*` is reset too (Tailwind's serif and mono stacks), which was not asked for. Proof: a
  temporary file with `text-xs font-bold shadow-lg rounded-2xl xl:p-4 ease-in bg-red-500` generated no CSS for any of
  them; `text-body font-semibold shadow-card rounded-lg lg:p-4` did. Note for TEST ENGINEER: the token-completeness
  test (criterion 7) must now allow `fontWeights`, a new export.
- **Finding 2.** `PHYSICAL_CLASS` (still stored once) adds float-, clear-, scroll-m/p l/r, origin-, object-, bg- left/right
  positions and translate-x-. `space-x-` is left alone, as instructed (Tailwind 4 uses logical margin). New: style keys
  in a JSX `style` attribute (marginLeft, paddingRight, borderLeftWidth, left, right, corner radii) and the values
  `left`/`right` of `textAlign`, `float`, `clear`; CSS declarations in `.css`/`.svg` through the processor (margin-left,
  padding-right, left:, right:, border-*-left, text-align/float/clear). Keys named `left` outside a `style` attribute are
  not flagged. `rtl-hebrew` skill updated to 1.2.
- **LOW 5.** Colour functions (`rgb( hsl( hwb( lab( lch( oklab( oklch( color-mix( color(`) count as hex, same exemptions.
  The message text now says "literal colour".
- **LOW 6.** `engines.node` `>=22.18`, `.nvmrc` `22.18`, lockfile root entry updated.
- **LOW 7.** `fonts.css` uses `@fontsource-variable/rubik/files/…`; the build still bundles exactly the two woff2.
- **LOW 8.** The `[&…]` exemption is anchored on `apps/web/src/components/ui/`; the Radix rule also covers
  `apps/web/.storybook/**/*.{ts,tsx}` (config checked with `calculateConfigForFile`; that folder is in no tsconfig yet,
  part b must add it).
- Finding 4 is debt, not fixed. `tools/_probe.mjs` was not mine and does not exist in my tree.

---
## Part b — Storybook, Playwright set-up, icons, Button, Tooltip, Skeleton (branch `ui-wave-1/part-b`)

**Approach.** Storybook 10 (`@storybook/react-vite`, addon-a11y) in `apps/web/.storybook/`, stories next to each
component. `components/ui/`: `icons.tsx`, `button.tsx`, `tooltip.tsx`, `skeleton.tsx`, each with a `*.stories.tsx`; helper
`lib/cn.ts`. The story gate is `tools/check-stories.mjs` (`npm run check:stories`, in `npm run ci` and the CI lint job).
Playwright: root `playwright.config.ts`, `tsconfig.playwright.json`, `tools/serve-static.mjs`, scripts `test:browser`
and `serve:storybook`, CI jobs `storybook` and `browser`. The suite directory `e2e/` does not exist yet (BUILDER cannot
create it); Playwright with `--pass-with-no-tests` exits 0 without it. TEST ENGINEER creates `e2e/`.

**Decisions**
- **Versions added (approved package):** storybook, @storybook/react-vite, @storybook/addon-a11y 10.6.1 · lucide-react
  1.55.0 · class-variance-authority 0.7.1 · clsx 2.1.1 · tailwind-merge 3.7.0 (web); @playwright/test 1.64.0 (root).
  `npm audit --audit-level=high`: 0 vulnerabilities. No `serve` package: a 48-line `tools/serve-static.mjs` instead
  (path-traversal guarded, 127.0.0.1 only).
- **Button API.** `iconOnly` is a discriminated union: `iconOnly: true` requires `label: string` (tsc fails without it,
  checked with a temporary file). The icon-only button wraps itself in a Tooltip with that label. `href` selects an `<a>`;
  without it a `<button type="button">`. Pending: `aria-busy`, a loader first in the DOM (inline start), not `disabled`,
  `onClick` is not called and the default is prevented (also for the link). A link has no `disabled` prop (type-level).
- **`cn` extends tailwind-merge with our token names** (text-label, shadow-card, z-popover, duration-fast, ease-standard),
  read from `@nestly/shared`. Without it `text-label text-primary` drops one of the two.
- **Icons.** Wrapper factory over Lucide: `strokeWidth` 1.75, `aria-hidden="true"`, default `size-6`; `size` and
  `strokeWidth` are not props. 15 icons (what the wave-1 screens in R2 use). Nest mark via `createLucideIcon` from the R2
  `i-nest` paths. Directional: `ArrowBackIcon` and `ChevronForwardIcon` (`rtl:-scale-x-100`).
- **Tooltip** has its own Radix Provider per instance; hover delay is Radix's default (700 ms), not invented by me.
- **Skeleton** uses Tailwind's `animate-pulse` with `motion-safe:`: no moving highlight, and no animation at all under
  reduced motion.
- **`no-gender-slash` lint rule (criterion 16)** in `tools/eslint-rules/copy-rules.mjs`, merged into the one `nestly`
  plugin; applies to `components/**` and `.storybook/**` (strings, template text, JSX text). `ו/או` allowed.
- `.storybook` is in the web tsconfig as `.storybook/*.ts` and `*.tsx` (a bare `.storybook` entry is not picked up). ESLint
  now ignores `storybook-static`, `playwright-report`, `test-results`.
- `check:stories` is added to `npm run ci`; `build-storybook` and `test:browser` are separate CI jobs, as asked.

**Deviations.** Criterion 13 counts: button 9 (primary, soft, text, lg, block, icon-only, disabled, pending, as link),
icons 1, tooltip 2, skeleton 2. The spec says "states listed" and lists no count for these, so the numbers are mine; they
live in `STATES` in the script and each later part adds its rows. The root script is named `test:browser` (not `e2e`):
the hook treats names containing e2e like test paths.

**Deliberately not done.** No test files (TEST ENGINEER). No `@axe-core/playwright`: not in the approved package; `axe-core`
is installed through addon-a11y. TEST ENGINEER decides whether to use axe-core directly or ask for the wrapper.
No lint rule against raw Radix re-exports from `components/ui` (CRITIC checks; none exist: `ui/` re-exports nothing).
No dark mode, no Chromatic, no screenshots (Q3, part f).

**Uncertain.** (1) The a11y addon parameter `test: 'error'` only has effect with the Vitest addon, which is not installed;
criterion 14 is Playwright's. (2) Storybook's default 375 viewport is a manager-UI toolbar global; opening `iframe.html`
directly uses the Playwright viewport, so tests must set 375 and 1024 themselves. (3) `edge` needs the `msedge` channel;
verified Chromium only locally. (4) The Storybook build prints chunk-size and plugin-timing warnings; it exits 0.

**Preview path (ORCHESTRATOR).** `npm run build-storybook`, then `npm run serve:storybook` and open
`http://127.0.0.1:6007/`. Sidebar: ui/Button (9 stories: primary, soft, text, large, block, icon only, disabled, pending,
as link), ui/Tooltip (hover; the focus story opens it at load), ui/Skeleton, ui/Icons (All, Directional). Check: Rubik,
terracotta primary, right-to-left, the loader at the right of "שליחה" in Pending, the back arrow pointing right, the
tooltip on hover and on Tab. Not working yet: no form, shell or screen compositions (parts c-f).

**Neighbouring.** The hook-written `incidents.md` line (BUILDER blocked from `mkdir e2e`) is uncommitted on purpose.

**Evidence without test files** (probe scripts in the scratchpad, Chromium, built Storybook, not committed):
12 build exits 0, `storybook-static/` written, addon-a11y in `main.ts`, no Chromatic · 13 removing `tooltip.stories.tsx`
makes the script exit 1 · 14 axe (wcag2a/aa/22aa, plus colour-contrast and target-size) 0 violations on all 15 stories ·
15 `dir=rtl`, `lang=he`, computed font `"Rubik Variable", system-ui, sans-serif` on every story · 16 the rule rejects
`מלא/י` and `את/ה`, accepts `ו/או` · 18 targets 79x44, 145x44, 44x44 (text variant, after `min-w-11`), 93x52, 343x44, 44x44
icon-only · 19 tsc "Property 'label' is missing" without a label; tooltip "פתיחת התפריט" on hover, "שמירה" on focus,
none after Escape · 21 pending: `aria-busy=true`, not disabled, loader svg present · 23 skeleton under reduced motion
`animation-name none`, duration `0s`; `aria-hidden` in source · 24 the story DOM shows `stroke-width="1.75"` and
`aria-hidden="true"` on the loader icon (same wrapper for all). Not asserted by me: 11, 17, 20 (tests by TEST ENGINEER).

### Part b, review round (CRITIC findings 1-7)
1. `cn.ts` extends the tailwind-merge `spacing` theme from `spacingRhythm`; `cn('px-5 px-screen-margin')` returns `px-screen-margin`
   (checked by running it; `text-label text-primary` and `p-card-padding p-4` also behave).
2. `chrome` project uses `channel: 'chrome'`; CI installs `chrome msedge`. `npm run test:browser`: 194 passed on real Chrome and Edge,
   2 "expected to fail, but passed" (the `test.fail` on `ui-tooltip--on-hover`, TEST ENGINEER removes the mark).
3-4. Button: `pending` JSDoc holds the contract (synchronous set or own guard; caller's live region). A link with
   `aria-disabled` true/"true" prevents the click. `variant` is `undefined` in the `iconOnly` type branch. Pending icon-only shows the loader instead of its icon.
5. `check-stories.mjs` counts `export const X: Story|StoryObj` only, walks nested folders, checks `.ts` too. Negative proofs run by hand: a `.ts`
   component without stories, a nested `shared/n/y.tsx`, and a stories file with one story plus a helper export all fail.
6. Gender-slash heuristic: left as is (debt).
7. `--pass-with-no-tests` and the stale CI comment removed.
8. `OnHover` story uses a plain button as the trigger, so one tooltip opens.
