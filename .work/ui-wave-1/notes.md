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

# Part c — TextInput, FormField, PasswordInput, SelectInput

Branch `ui-wave-1/part-c`. Criteria 25-28 and the common 17-20. Built to the spec's API section.

**Approach.** `ui/text-input.tsx` also exports `inputStyles` (the shared field box: `border-input`, `min-h-12`, `aria-invalid:` 2px
`destructive` border, disabled surface), reused by PasswordInput and SelectInput. FormField is a render prop giving `{id,
aria-describedby, aria-invalid}`; label above, hint, error with `AlertIcon` + text and `role="alert"`. PasswordInput wraps a
native input and an icon-only `Button` (so the Tooltip comes with it) with `aria-pressed`; rules render in a `ul` linked by
`aria-describedby`; a met rule's text is `✓ text`. SelectInput is a native `<select>` with the placeholder as first option
(value `""`), a chevron icon (`pointer-events-none`), `onChange(value)`. Four stories files; `STATES` has four new rows.

**Decisions.**
- Controls accept `aria-invalid` and `aria-describedby` (so the FormField control can be spread in), and `error` wins over
  `aria-invalid` when both are given. These are additions to the listed props, needed for the render prop to work.
- `aria-invalid?: boolean | undefined` because `exactOptionalPropertyTypes` rejects the render prop's `undefined` otherwise.
- PasswordInput forces `dir="ltr"` with `text-start` (passwords are LTR content); the toggle sits at the inline end.
- SelectInput without `value` is uncontrolled (`defaultValue=""`); with `value` it is controlled by the caller.
- "(לא חובה)" is a constant in FormField, as criterion 26 fixes the text; labels, hints, errors, `toggleLabel`, placeholder are props.

**Deviations.** None from the API; the additions above are the only extras.

**Deliberately not done.** No test files. No Zod, no form state. No custom select popup. No muted placeholder colour in the
select (a native select cannot know it is empty without state).

**Uncertain.** (1) A met password rule reads "✓ text" to a screen reader as "check mark text": conveys "met", slightly noisy.
(2) FormField's `role="alert"` on the error announces when it appears; a page that renders several errors at once announces
them all. (3) One Edge run crashed a Button keyboard test (`Target crashed`); the rerun was 340/340.

**Preview path.** `npm run build-storybook`, `npm run serve:storybook`, open `http://127.0.0.1:6007/`: ui/TextInput (5),
shared/FormField (4), shared/PasswordInput (5), ui/SelectInput (4). Check: 48px height, brown-grey field border, red 2px
border plus icon and text on error, eye toggle at the left edge (inline end in RTL) flips the text, email text at the left,
chevron at the left of the select. Not working yet: no DateInput, Checkbox or screen composition (part d onward).

**Evidence.** 25: stories empty/filled/error/disabled/email; `aria-invalid` from `error`; `border-input`, never `border-border`.
26: `label htmlFor` = `id`, `aria-describedby` = hint id + error id, error is icon + text. 27: toggle switches `type` and
`aria-pressed`; no paste handler; `autoComplete` typed `current-password|new-password`; empty `rules` renders no list.
28: placeholder option value `""`, `onChange(event.target.value)`, zero options renders only the placeholder. 14/18: axe and
target-size pass on all 18 new stories, Chrome and Edge. `npm run ci` green; `test:browser` 340/340 on the second run.
17/19/20: native elements (Tab, Enter/Space), the toggle's Tooltip via icon-only Button, the global focus ring; not asserted by me.

**Neighbouring.** None new.

### Part c, review round (CRITIC Not Ready; spec addendum fc807a9)
- HIGH toggle overlap: the input is `dir="ltr"`, so `ps-14` is its left padding, the side where the toggle sits (RTL `end-0.5`).
  Measured at 375 on `shared-passwordinput--filled`, Chrome: input x 16-359, toggle x 18-62, padding-left 56px, so the text starts at
  x 73 (was about 30). No intersection.
- TextInput is now an explicit interface with exactly the API props (+ addendum aria props); PasswordInput and SelectInput lost `className`;
  the TextInput story lost `placeholder`. SelectInput keeps the required `placeholder` prop (it is in the API).
- Rules: "✓ " in an `aria-hidden` span; each rule has an `sr-only` " (התקיים)" or " (עדיין לא)". The lint accepts `sr-only`.
- SelectInput muted text: `has-[option[value=""]:checked]:text-muted-foreground` is REJECTED by `nestly/no-arbitrary-value`. I did not
  weaken the rule. Instead the component keeps whether the value is empty (`value ?? own state`) and adds `text-muted-foreground`.
  Measured computed colour: placeholder rgb(107, 90, 81) (muted-foreground), selected rgb(59, 47, 42) (foreground).
- Red outside my files: `tests/ui/form-controls.test.tsx(146)` fails `tsc` (FormFieldControl vs Record<string, unknown>), and test
  `[27] a met rule shows ...` line 327 expects the unmet text to equal "ספרה אחת" exactly, which the addendum's hidden "(עדיין לא)" breaks.
  Both are TEST ENGINEER's. `npm run ci` therefore stops at typecheck.

## Part d — DateInput, ChoiceCardGroup, StepIndicator, Checkbox, InlineAlert (`ui-wave-1/part-d`)

**Approach.** Five components with exactly the props of the API section (no `className`), one story file each, rows added to
`STATES`. DateInput and Checkbox use native inputs; ChoiceCardGroup uses native radios (visually hidden, `peer`) with the card as
their label.

**Decisions.**
- DateInput RTL order: DOM order day, month, year, so the day is at the right edge and the year at the left, as the R2 mockup
  (`.date3`, יום first) draws it in RTL. The year field is twice as wide (`grid-cols-4`, `col-span-2`): the mockup's 1.4fr is an
  arbitrary value the lint rejects. Fields are `type="text"` with `inputMode="numeric"`, `autoComplete="off"`, no `maxLength` (no range
  or length rule here). Visible labels יום · חודש · שנה are the accessible names. Fieldset is a plain `group` with the legend.
- ChoiceCardGroup: arrows are handled in `onKeyDown` (not left to the browser) so jsdom and every browser behave the same: Down and
  Up next/previous, Right is previous in RTL (next in LTR), Left the reverse, wrapping at the ends. Direction is read from the nearest
  `[dir]`, then the document. One tab stop (selected card, else the first). Error: destructive border on unselected cards, no
  `aria-invalid` (not allowed on a radio); the error message text belongs to the caller. The group is controlled only (`value`).
- StepIndicator also throws on non-integers and NaN (a finer reading of "invalid input").
- Checkbox: native input; the whole label row is the touch target (min 44 high), the box is 24. `error` is a thicker destructive
  outline on the box (`aria-invalid`), the message text is the caller's. No `aria-describedby`, since the API lists none.
- Story copy: stage options from FR-REG-002 (מתכננים / בהריון / יש לנו ילד או ילדה); DateInput legend "תאריך לידה"; Checkbox label
  "אישור תנאי השימוש ומדיניות הפרטיות" (FR-REG-004); InlineAlert "פרטי ההתחברות שגויים" is ERR-001's name, the wording itself being undecided
  (the mockup's text is marked as a proposal).

**Deviations.** None.

**Deliberately not done.** No tests. No range validation. No large ChoiceCardGroup variant. No error text inside the group or Checkbox.

**Uncertain.** (1) jsdom has no layout; the RTL decision in ChoiceCardGroup relies on a `dir` attribute, not on computed style.
(2) The Checkbox error is an outline plus caller text, which is thin if a caller forgets the text.

**FINDING for SPEC.** `e2e/touch.spec.ts` (criterion 18) fails on the 5 Checkbox stories x 2 browsers (10 tests): the inline links in
the label measure 18 high (תנאי השימוש 79x18, מדיניות הפרטיות 100x18). They are inline links in running text, which WCAG 2.5.8 exempts.
The test was not edited. SPEC should exempt `a` inside running text (e.g. inside a `label` or `p`), or say how. Everything else passes.

**Preview path.** `npm run build-storybook`, `npm run serve:storybook`: shared/DateInput (4), shared/ChoiceCardGroup (5), shared/StepIndicator (2),
ui/Checkbox (5), shared/InlineAlert (2). Check: day field at the right edge; selected card has check mark, 2px terracotta border and dark
terracotta text; click a card, Tab into the group, arrows move the selection (Right goes to the previous card); filled bar segments start
at the right; the two links in the Checkbox label are focusable. Not yet: no screen composition.

**Evidence (criteria).** 29: three labelled numeric fields in a fieldset+legend, emits strings, 4 stories. 30: radio in fieldset+legend, arrows
verified in Chrome RTL (below), check mark + `border-primary` 2px + `text-primary-strong` on selected, 5 stories. 31: text "שלב {n} מתוך {m}", bar
`aria-hidden`, `RangeError`. 32: native checkbox (Space), 5 stories. 33: `role="alert"`, `aria-hidden` icon, caller's text. 14/18: axe
passes on all new stories; touch passes except the Checkbox link finding above. `npm run ci` green; `test:browser` 684 passed, 10 failed (the finding).

**RTL geometry (Chrome, 375 wide, measured).** DateInput inputs x: day 279-359, month 192-271, year 16-184 (all 48 high, no overlap, gap 8).
Choice cards x 16-359, check mark 319-343 (inline start edge, right) at every card. StepIndicator segments: filled 191-359, empty 16-185.
Checkbox box 335-359 (right edge), label links 205-285 and 97-198, row 44 high. InlineAlert icon 321-345 (right), text 150-311.
ChoiceCardGroup keys, RTL: from card 1 ArrowRight goes to card 3 (previous, wraps); from card 3, two ArrowLeft reach card 2.

**Neighbouring.** None new. (`incidents.md` was modified in the working tree by something other than this part; not committed.)

### Part d, review round (spec addendum bab53a7)
- ChoiceCardGroup: `role="radiogroup"` on the fieldset, `aria-invalid` when `error`, optional `aria-describedby`. Roving tabindex and the
  arrow handler live on the radio inputs and are unaffected.
- DateInput: optional `aria-describedby` on the fieldset; the three fields keep `aria-invalid`.
- Checkbox: `aria-invalid`/`aria-describedby` accepted; invalid = `error || aria-invalid`. The outline comes from `aria-invalid:` so it shows for both.
- InlineAlert LongText story: neutral text, no reset flow.

## Part e — Logo, illustrations, AuthLayout, Avatar, MenuItem (`ui-wave-1/part-e`)

**Approach.** Built to the API section of the spec; `className?` only where the API lists or implies it (Logo, Illustrations, Avatar, MenuItem; AuthLayout takes none).
Five new story files and `STATES` rows (logo 4, illustrations 2, auth-layout 3, avatar 5, menu-item 4); `shared/logo-wordmark` is in `NO_VISUAL` of `check-stories`, since it
is drawn only inside Logo's stories.

**Decisions.**
- Logo: the link renders `<a aria-label="Nestly">`, the static one `<span role="img" aria-label="Nestly">`; the wordmark inside is `aria-hidden`. The wordmark
  (`logo-wordmark.tsx`) is the nest icon from the icon module plus the word, sized by `text-h3` / `text-display`. The link is `min-h-11 min-w-11`.
- Illustrations: both use `fill-*` / `stroke-*` token classes, no hex. The welcome one is the R2 nest with two eggs and a sprig; the sprig stroke is `success`
  (the mockup's `#5E7F58` is not a token). The registration one differs from the mockup: two leaves replace the heart, to keep to "nest, leaves, soft shapes".
- Avatar: with no name to announce (decorative, or no name and no `label`) the span is `aria-hidden` rather than an unnamed `role="img"`. Default size `size-10`
  (mockup 40); the BottomNavigation's small one passes `size-6` through `className`.
- MenuItem: a disabled link keeps its `href`, sets `aria-disabled` and prevents the click (the same contract as Button, part b); it stays focusable.
  `href` and `onClick` are a union type, so passing both fails `tsc`.
- AuthLayout: `max-w-md` column, `px-5`, `min-h-dvh`, actions at the bottom edge in flow (not sticky), as in the mockup; the back slot is pulled `-ms-2` so
  the glyph aligns with the text edge (mockup `.form-top`).
- Story copy: Welcome heading "הצטרפות ל-Nestly" (the SRS names the screen so; no lead paragraph, the mockup marks it a draft); Login has no forgot-password
  link (FR-AUTH-003 channel TBD) and no error text; the password rule is VAL-003's 10 characters; MenuItem labels are the FR-MENU-001 destinations.

**Deviations.** None from the API. The two illustrations are not pixel copies of the mockup (above).

**Deliberately not done.** No test files. No photos in Avatar. No sticky actions bar. No `size` prop on Avatar (not in the API).

**Uncertain.** (1) The static Logo as `role="img"` is a choice; a test may look for plain text instead (the text "Nestly" is still in the DOM, `aria-hidden`).
(2) Avatar's `aria-hidden` fallback when it has neither name nor label is my reading of "named otherwise".

**Preview path.** `npm run build-storybook`, `npm run serve:storybook`: layout/AuthLayout (Welcome, Login, Registration step), shared/Logo (4), shared/Illustrations (2),
ui/Avatar (5), shared/MenuItem (5 stories, 4 counted). Check at 375: logo and nest at the right of the word, illustration centred, the two actions at the bottom
edge full width, back arrow at the right, no horizontal scroll. Not yet: no real pages (F1.2), no shell (part f).

**Evidence (criteria, built Storybook, Chrome).** 34: link/static, name "Nestly", two sizes, svg `aria-hidden="true"`, classes only `fill-*`/`stroke-*`, lint clean (no hex).
35: scrollWidth = clientWidth = 375 on all three stories; actions at y 674-788 within an 812 viewport. 36: `initialsOf` splits on whitespace, two words, first code point.
37: link, button, `aria-disabled`, `min-h-12` (measured 48). 14/18: axe and target-size pass on all new stories (Chrome and Edge). `npm run ci` green; `test:browser` 1006 passed.
17/19/20: native a/button, global focus ring; not asserted by me.

**RTL geometry (Chrome, 375 wide, measured).** Welcome: logo 107-268 (nest icon 224-264 at the right, word 111-218), illustration 78-298, h1 71-304, actions 20-355 x 52 high.
Login: fields 20-355 x 48, password toggle 22-66 (left, inline end), actions 20-355. Registration step: back 319-363 (right edge, 44x44), step bar 20-355, terms checkbox 331-355 (right).
Logo link 44 high (103x44 / 161x44). MenuItem rows 16-359 x 48, icon 323-347 at the right (inline start). Avatar 40x40 at 319-359.

**Neighbouring.** None new.

### Part e, review round (spec addendum after the part-e review, 96e4771)
1. Logo and the illustrations declare `'aria-label'?: never` (JSX does not type-check undeclared hyphenated attributes, so this is how the prop is refused). The two `ui-types` tests pass.
2. MenuItem action branch: `onClick: () => void` is required; `<MenuItem>x</MenuItem>` fails `tsc`. The `Stacked` story got `args` for the union type.
3. Login composition: "שכחתי סיסמה" is a text Button link under the password field (measured x 20-118, 98x44, at the inline end = left in RTL); the TBD comment is replaced.
4. Welcome composition: lead paragraph "קהילה חמה להורים ולהורים לעתיד, במקום אחד." as marked placeholder wording (gender-neutral, no exclamation).
5. Avatar: `size?: 'sm'|'md'` (`size-10 text-label` / `size-6 text-caption`, icon `size-5` / `size-4`); initials = first grapheme (`Intl.Segmenter`) of the first two words starting with a letter, `toLocaleUpperCase('he')`. Small story uses `size="sm"` (measured 24x24). `as const` is used on the size map only.
6. The only size override passed through `className` was the Avatar Small story; removed. No other story passes `className`.
7. Registration illustration: the R2 heart (`fill-primary opacity-85`); the Welcome sprig keeps `success`.

Evidence: `npm run ci` green (tools tests 171 pass, web 224, shared 75). `test:browser`: 1082 passed, 4 Edge-only failures in the full run ("browserContext.close: Test ended" / crashed context: password-input disabled touch, button reduced motion, avatar anonymous render, menu-item disabled touch); the same four pass on rerun (14 passed). No existing test broke because of the addendum.
