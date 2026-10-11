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
