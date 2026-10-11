# UI wave 1 — tokens, gates, Storybook and the shared components for I1 (WORKPLAN 9.7)

**Gate 1: approved by ORCHESTRATOR, 11.10.2026** (working rules). Edits at the gate: DR-1 and DR-2 decided,
Q1–Q3 accepted, Button pending added to criterion 21. Recorded in `decisions.md`.

**Problem**        No I1 screen can be built consistently. The approved design (`docs/design/`, R1, R2) exists only as
documents and mockups, so every feature would re-invent buttons, fields and states, and nothing stops a physical
`ml-4`, a stray hex or a Radix import from leaking into screens.

**Requirements**   NFR-A11Y-001 · NFR-USAB-003 · NFR-USAB-004 · NFR-USE-001 (`06-non-functional.md`) · §4.1, §4.2
(`04-architecture.md`) · AC-005, AC-016 (`15-acceptance.md`) · VAL-003 (`09-validations.md`) · FR-AUTH-001,
FR-TOP-001, FR-MENU-001 (the screens the components serve) · design: `direction.md`, `tokens.md`, R2 mockups ·
decisions "UI library package", "Design consistency without a design agent", "Visual direction" (11.10.2026).
Criteria without an SRS ID trace to `tokens.md` / `direction.md` / R2, or are marked **[gap]**.

**Scope**          (tags: **U** unit test · **S** story, axe or Playwright on the built Storybook · **L** lint or CI ·
**P** Preview check by ORCHESTRATOR)

1. **Gates, first.** ESLint rules + CI, and a Vitest contrast test.
2. **Token source** `packages/shared/src/design-tokens/` → generated CSS (Tailwind 4 `@theme`) by
   `tools/build-design-tokens.js`; Rubik via `@fontsource-variable/rubik`; reduced-motion base rule; Radix
   `DirectionProvider` wrapped inside `components/ui`.
3. **Storybook** (R3 gallery): static build, addon-a11y, RTL/`he` decorator, one story per component state.
4. **Components** (layers: `ui` = shadcn/Radix wrappers, the only place Radix is imported · `shared` = SRS Shared UI
   Components · `layout` · `domain`). Logical names per SRS §4.2:

| Part | Component (SRS name) | Layer | Used by |
|---|---|---|---|
| b | Icon module (Lucide, stroke 1.75, + nest icon) | ui | all |
| b | Button | ui | all |
| b | Tooltip | ui | every icon button (NFR-USAB-004) |
| b | Skeleton | ui | RouteGuard loading |
| c | TextInput | ui | Login, step 1, step 2 |
| c | **FormField** † | shared | every field |
| c | PasswordInput | shared | Login, step 2 |
| c | SelectInput | ui | step 1 (parent and child sex) |
| d | DateInput (three fields) | shared | step 1 (child birth date) |
| d | ChoiceCardGroup (compact) | shared | step 1 (stage) |
| d | StepIndicator | shared | step 1, 2 |
| d | **Checkbox** † | ui | step 2 (terms) |
| d | **InlineAlert** † | shared | Login error (ERR-001) |
| e | **Logo** † (temporary wordmark, OP-022) and two SVG illustrations | shared | Welcome, Login, step 2 |
| e | **AuthLayout** † (pre-login screen frame) | layout | Welcome, Login, steps 1–2 |
| e | Avatar (initials only) | ui | BottomNavigation |
| e | MenuItem | shared | side menu |
| f | TopBar · BottomNavigation · SideDrawer | shared | protected shell |
| f | AppShell | layout | protected shell |

† not a row in SRS §4.2 — see **DR-1**. No `domain` component in wave 1.

**Out of scope** (deferred to later waves; near-misses a builder might assume)
- All Domain components (PostCard, JourneyContextCard, …) and the Feature-level ones (RegularRegistrationFlow,
  RouteGuard, SideMenuFeature — those are F1.2–F1.4).
- Shared UI not needed by I1: TextArea, Modal/Dialog, Badge, UnreadBadge, GlobalSearchInput, DropdownPanel,
  OverflowMenu, Toast (Sonner), EmptyState, ScrollToTopButton, ShareSheet, MediaUploader; the large ChoiceCardGroup
  variant (account type, I11); the calendar picker (react-day-picker); Avatar photos (I5).
- TopBar search, chat and bell (I7, I8): the TopBar offers an empty actions slot only.
- Validation (Zod), form state (React Hook Form), routing, data fetching, auth: no component imports them. Router,
  Query, RHF, Sonner and date-fns are approved but installed by the first feature that uses them, not here.
- Dark mode (not defined): no `dark:` and no dark token values. Chromatic. Final logo (OP-022). Final Hebrew copy of
  screens (stories use neutral placeholder copy from `ux-copy-he`). Changes to palette, font or layout.

**Data touched**   none. No tables, no stored media, no network call from any component. Authorization: not applicable
(no user data read or written).

**Risk flags**     none (matches `intake.md`). Path Standard. Triggers: Accessibility and Design consistency domains.

**Acceptance criteria**

*Gates (part a)*
1. **L** A fixture file per rule is rejected by lint with the rule's name: `ml-4`, `pr-2`, `left-0`, `text-right`,
   `border-l`, `rounded-tr-lg` (physical direction); `w-[13px]`, `bg-[#fff]`, `p-[1.5rem]` (arbitrary value);
   `#B5502C` and `#fff` in a `.ts`, `.tsx`, `.css` or `.svg` file under `apps/web/src` or `packages/shared/src`
   (hex) — except inside `packages/shared/src/design-tokens/`; `import … from "@radix-ui/react-dialog"` and from
   `"radix-ui"` outside `apps/web/src/components/ui` (Radix). The equivalent logical/token fixtures (`ms-4`, `pe-2`,
   `start-0`, `text-start`, `border-s`, `rounded-se-lg`, `bg-primary`, a Radix import inside `components/ui`) pass.
2. **L** The lint step is part of the CI `lint` job and fails the build on any of the above. The rule list for
   physical classes is taken from the `rtl-hebrew` skill and is stored once.
3. **U** `contrast.test.ts` computes the WCAG ratio for every pair in `tokens.md` "ניגודיות" (27 pairs) from the
   token source, and asserts each is at or above its threshold (4.5 text · 3 border, icon, ring). It also asserts
   the computed ratio is within ±0.01 of the ratio written in `tokens.md`.
4. **U** Negative proof: with `primary` replaced by `#D9704A` in a test copy of the tokens, the test fails and names
   `primary-foreground / primary`.
5. **U** The informational row `primary-soft / card` (1.20) is not asserted against a threshold.
6. **L** If any real pair fails or differs from `tokens.md`, BUILDER stops and files a finding; a token value is not
   changed by BUILDER (a design decision).

*Tokens and font (part a)*
7. **U** Every token name and value in `tokens.md` (colour, the nine type styles, spacing rhythm, radius, three
   shadows, motion durations and easing, z-index, breakpoints) exists in the source, with no extras.
   `border` is marked decorative; `input` is the field border.
8. **L** `node tools/build-design-tokens.js` is deterministic: after it runs, `git diff --exit-code` on the generated
   CSS is clean in CI. The generated CSS contains `--color-primary: #B5502C` inside `@theme`, and no `.dark` block.
9. **L** `packages/shared/src/design-tokens/` imports no DOM and no Node API (existing shared rule).
10. **L** Built CSS has `@font-face` for the hebrew and latin subsets of Rubik only (weight axis 300–900), the
    font-family stack ends `system-ui, sans-serif`, and the built CSS and HTML contain no `http(s)://` font URL.
11. **S** Under `prefers-reduced-motion: reduce` an element with a transition or animation has computed duration
    `0s` (Playwright `reducedMotion`).

*Storybook (part b onward)*
12. **L** `npm run build-storybook` exits 0 in CI and writes static files; addon-a11y is installed; no Chromatic.
13. **L** A CI script fails if any file in `components/{ui,shared,layout}` lacks a sibling `*.stories.tsx`, or a
    story file exports fewer stories than the states listed for that component below.
14. **S** For every story, axe-core (tags `wcag2a`, `wcag2aa`, `wcag22aa`) reports zero violations. Colour contrast
    is carried by criterion 3 (jsdom cannot compute it).
15. **S** Stories render with `dir="rtl"`, `lang="he"` and the Rubik font; the default viewport is 375 wide, and the
    shell stories also run at 1024.
16. **L** No string in `components/` or stories matches a Hebrew letter, `/`, a Hebrew letter (gender slash form,
    NFR-USAB-003), with `ו/או` allowed.

*Common to every component*
17. **U** Each interactive component is reached by Tab and activated by Enter or Space (Escape where it closes).
18. **S** Each primary touch action is at least 44×44 CSS px in the built story (Playwright bounding box); axe
    `target-size` passes for all.
19. **U** Every icon-only control requires an accessible name (type test: omitting it fails `tsc`), and shows a
    Tooltip with that name on hover and on focus.
20. **P** Focus ring is the 2px `ring` with 2px offset on keyboard focus only; directional icons (back, chevron)
    point correctly in RTL; no physical-direction layout artefacts.

*Components — states each story must show; assertions*
21. **Button (U/S):** variants primary · soft · text; sizes default · lg; block; icon-only; disabled. Default
    `type="button"`. Renders as a link element when given a link target (for Welcome CTAs). Disabled is inert.
    **Pending** (DR-2): the label stays; a small loader icon renders at the inline start; `aria-busy="true"`; the
    button stays focusable and is not `disabled`; activation while pending does not call the handler (no double
    submit); under reduced motion the icon does not spin. Story: pending.
22. **Tooltip (U):** appears on focus and hover, closes on Escape and blur, stays while hovered (WCAG 1.4.13).
23. **Skeleton (U/S):** `aria-hidden`; shimmer absent under reduced motion (criterion 11).
24. **Icon module (U):** every exported icon renders `stroke-width="1.75"` and `aria-hidden="true"`.
25. **TextInput (U):** states empty · filled · error · disabled. Error sets `aria-invalid="true"`. Its border uses the
    `input` token, not `border`. `dir="ltr"` prop (email) keeps text aligned to start.
26. **FormField (U):** label above the field, never a placeholder as label; `for`/`id` linked; hint and error ids
    in `aria-describedby`; the optional mark "(לא חובה)" renders as text; the error message has an icon and text.
27. **PasswordInput (U):** the toggle flips `type` between `password` and `text` and `aria-pressed`; paste is not
    blocked (WCAG 3.3.8); `autocomplete` passes through; rules supplied by the caller render as "✓ text" when met
    and plain text when not — met state is not colour alone. Empty rules array renders none.
28. **SelectInput (U):** states placeholder "בחירה" (value `""`) · selected · error; options come from props;
    keyboard selection emits the option value; zero options renders the placeholder only.
29. **DateInput (U):** three fields named יום · חודש · שנה inside a fieldset with a legend; numeric `inputMode`;
    emits `{day, month, year}` as typed strings; states empty · filled · error. It does not validate ranges (Zod,
    F1.3).
30. **ChoiceCardGroup (U/S):** compact variant, single choice, radio semantics inside a fieldset with a legend;
    arrow keys move selection; the selected card shows ✓ mark, 2px `primary` border and `primary-strong` text, so
    selection is not pastel alone; states unselected · selected · focus · error; one option selected at most.
31. **StepIndicator (U):** `(1,2)` renders text "שלב 1 מתוך 2" and a bar with `aria-hidden`; `(2,2)` full; `x<1`,
    `x>y` or `y<1` throws `RangeError`.
32. **Checkbox (U):** label may contain links; states unchecked · checked · error · required; toggles by Space.
33. **InlineAlert (U):** error variant has `role="alert"`, an icon with `aria-hidden`, and the caller's text; it is
    not colour alone.
34. **Logo (U):** link or static; accessible name "Nestly"; sizes default · big. The wordmark lives in one file so
    OP-022 replaces it in one place. Illustrations are decorative (`aria-hidden`) and use token variables, no hex,
    no baby, pregnancy or family imagery (`direction.md`).
35. **AuthLayout (U/S):** centred column; back-button slot, form body and bottom actions slot; at 375 the actions
    stay reachable without a horizontal scroll.
36. **Avatar (U):** initials from the first letter of the first two words ("נועה רז" → "נר"); one word → one
    letter; empty name → generic person icon; decorative when a name is shown beside it, named otherwise.
37. **MenuItem (U):** with a link target renders a link; with an action renders a button; `disabled` is announced
    (`aria-disabled`) and not activatable; height at least 44.
38. **TopBar (U/S):** renders a `header` landmark with Hamburger (name "פתיחת התפריט" + Tooltip) and Logo; with no
    actions it renders nothing else (no search, chat or bell); an actions slot accepts caller nodes.
39. **BottomNavigation (U/S):** `nav` named "ניווט ראשי"; items from props; exactly one `aria-current="page"` for the
    current item, and the current item also differs in weight, not colour alone; stories with 3 items (AC-005) and
    5 items. At width 375 the bar's bottom edge meets the viewport bottom; at 1024 (NFR-USE-001) the same items
    render as a vertical rail at the inline-start edge and the bottom bar is hidden (Playwright bounding boxes in RTL).
40. **SideDrawer (U):** opens from the inline-start edge on trigger; has role dialog with a name; focus moves in and
    is trapped; Escape, backdrop click and the close control close it and return focus to the trigger; page scroll
    locks while open; closed by default.
41. **AppShell (U/S):** exactly one `main`, one `header`, one `nav`; the first Tab stop is a skip link (WCAG 2.4.1)
    that moves focus to `main`; content column centred from 1024; the drawer is closed on load; children render in
    `main`. It imports no auth, router or data code (RouteGuard wraps it).
42. **L** CI is green on typecheck, lint, tests, `build-storybook` and `npm audit`; the web app build has the same
    fonts and tokens as Storybook.
43. **P** ORCHESTRATOR opens the static gallery and compares Welcome-, Login-, step 1/2- and shell-shaped
    compositions to `r2-screens.html` and `r2-desktop.html`: palette, Rubik, spacing, one primary action per
    screen, RTL order of the TopBar (Hamburger at the right edge).

**Open**
- **DR-1 — decided at Gate 1 (ORCHESTRATOR, 11.10.2026):** the five units (FormField, Checkbox, InlineAlert, Logo,
  AuthLayout) are added to SRS §4.2 in version 2.11. Parts c–e are unblocked.
- **DR-2 — decided at Gate 1 (ORCHESTRATOR, 11.10.2026):** Button gets a pending state in part b (criterion 21).
- **Q1–Q3: the stated assumptions are accepted at Gate 1.**
- **Q1 (QUESTION):** the "no arbitrary values" rule vs shadcn output, which uses `data-[state=…]`, `aria-[…]` and
  `[&_svg]` variants. → **assumed if unanswered:** arbitrary *values* (`w-[13px]`) are rejected everywhere;
  `data-`/`aria-` state variants are allowed everywhere; `[&…]` selector variants only inside `components/ui`.
- **Q2 (QUESTION):** SelectInput native `<select>` (as drawn in R2) or Radix Select. → **assumed:** native, because the
  R2 mockup shows it and it is the more accessible control on mobile.
- **Q3 (QUESTION):** story screenshots (Playwright) are non-blocking per the Design consistency domain. → **assumed:**
  TEST ENGINEER adds them in part f, not earlier.

**Size estimate**  ~2,400 lines of diff in total, **far over 400, so it is split into six parts** on this one
spec, run in order (rule 5), each with CI, CRITIC and TEST ENGINEER on its own diff:

| Part | Content | Criteria | ~Lines |
|---|---|---|---|
| a | gates, token source, generator, font, base CSS, direction wrapper (lint and tokens may split if over 400) | 1–11, 7–10 | 450 |
| b | Storybook + CI script, icons, Button, Tooltip, Skeleton | 12–24 | 400 |
| c | TextInput, FormField, PasswordInput, SelectInput | 25–28 | 400 |
| d | DateInput, ChoiceCardGroup, StepIndicator, Checkbox, InlineAlert | 29–33 | 450 |
| e | Logo + illustrations, AuthLayout, Avatar, MenuItem | 34–37 | 350 |
| f | TopBar, BottomNavigation, SideDrawer, AppShell, final Preview | 38–43 | 450 |

Suggested Preview points: after b (the gallery builds and the tokens look right) and after f (full gallery). Criteria
17–20 apply to every part. Order matters: a precedes everything (hard requirement of the intake); f must finish
before F1.2.
