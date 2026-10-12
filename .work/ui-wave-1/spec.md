# UI wave 1 — tokens, gates, Storybook and the shared components for I1 (WORKPLAN 9.7)

**Revised after part b: API lines added (ORCHESTRATOR request); criteria unchanged.** Only the **API** section
(after criterion 43) is new. Reason: `findings.md` → Part b, last lines.

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

**API** (contract for tests; derived from criteria 21–41 and the R2 mockups. Paths are under
`apps/web/src/components/`; every component is a named export, no default export; props marked `?` are optional, all
others required; every component also accepts `className?: string`, and form controls the native attributes of their
element (`id`, `name`, `disabled`, `autoComplete`, …) unless a line says otherwise. Events are `on*` props. Tests
import only what is listed here.)

*Part b, for reference (built, merged):* `ui/button.tsx` → `Button`: `variant` (`primary|soft|text`), `size`
(`default|lg`), `block`, `pending`, `href`, `disabled`, plus `iconOnly` with required `label`; `variant` is forbidden
when `iconOnly` is set · `ui/tooltip.tsx` → `Tooltip {label, children}` · `ui/skeleton.tsx` → `Skeleton` ·
`ui/icons.tsx` → the icons, exported as `*Icon` · `lib/cn.ts` → `cn`.

*Part c*
- **TextInput** — `ui/text-input.tsx` → `TextInput`. Props: `value?: string`, `defaultValue?: string`,
  `type?: 'text'|'email'|'tel'` (default `text`), `error?: boolean` (sets `aria-invalid`), `dir?: 'ltr'` (criterion 25),
  `disabled?`, `id?`, `name?`, `autoComplete?`. Accessible name: none of its own; it comes from FormField (`id`) or
  `aria-label?: string`. Events: `onChange`, `onBlur`. Slots: none.
- **FormField** — `shared/form-field.tsx` → `FormField`. Props: `label: string`, `htmlFor?: string` (generated when
  absent and passed to the child), `hint?: string`, `error?: string`, `optional?: boolean` (renders "(לא חובה)"),
  `children: (control: {id, 'aria-describedby', 'aria-invalid'}) => ReactNode` (a render prop, so TextInput,
  PasswordInput, SelectInput and Checkbox get the ids and the invalid state). Name: `label`. Events: none. Slots:
  `children`.
- **PasswordInput** — `shared/password-input.tsx` → `PasswordInput`. Props: `value?: string`, `defaultValue?: string`,
  `autoComplete?: 'current-password'|'new-password'`, `error?: boolean`, `rules?: {id: string; text: string;
  met: boolean}[]` (default `[]`), `toggleLabel: string` (accessible name of the show/hide toggle, which carries
  `aria-pressed`), `disabled?`, `id?`, `name?`. Events: `onChange`, `onBlur`. Slots: none. Paste is never blocked.
- **SelectInput** — `ui/select-input.tsx` → `SelectInput` (native `<select>`, Q2). Props: `options: {value: string;
  label: string}[]`, `value?: string` (`""` = placeholder), `placeholder: string` ("בחירה", supplied by the caller),
  `error?: boolean`, `disabled?`, `id?`, `name?`. Name: from FormField, or `aria-label?`. Events:
  `onChange(value: string)`. Slots: none.

*Part d*
- **DateInput** — `shared/date-input.tsx` → `DateInput`, and `type DateParts = {day: string; month: string; year:
  string}` (exported). Props: `value?: DateParts`, `legend: string` (the fieldset legend), `error?: boolean`,
  `disabled?`, `idPrefix?: string`. The three field names יום · חודש · שנה are fixed. Events: `onChange(value:
  DateParts)`. Slots: none.
- **ChoiceCardGroup** — `shared/choice-card-group.tsx` → `ChoiceCardGroup` (compact only). Props: `legend: string`,
  `name: string` (radio group name), `options: {value: string; label: string; description?: string}[]`,
  `value?: string | null`, `error?: boolean`, `disabled?`. Events: `onChange(value: string)`. Slots: none.
- **StepIndicator** — `shared/step-indicator.tsx` → `StepIndicator`. Props: `current: number`, `total: number`
  (criterion 31's `(x, y)` = `current`, `total`; invalid values throw `RangeError`). Renders "שלב {current} מתוך
  {total}". Events and slots: none.
- **Checkbox** — `ui/checkbox.tsx` → `Checkbox`. Props: `checked?: boolean`, `defaultChecked?: boolean`,
  `required?: boolean`, `error?: boolean`, `disabled?`, `id?`, `name?`, `children: ReactNode` (the label; may contain
  links). Name: `children`, or `aria-label?`. Events: `onCheckedChange(checked: boolean)`. Slots: `children`.
- **InlineAlert** — `shared/inline-alert.tsx` → `InlineAlert`. Props: `variant?: 'error'` (default and only value),
  `children: ReactNode` (the text). Name: its text. Events: none. Slots: `children`.

*Part e*
- **Logo** — `shared/logo.tsx` → `Logo`; the wordmark lives in `shared/logo-wordmark.tsx` (the single replacement point,
  OP-022). Props: `size?: 'default'|'big'`, `href?: string` (a link when set, static otherwise). Accessible name
  "Nestly" (fixed, no prop). Events: none (native link). Slots: none.
- **Illustrations** — `shared/illustrations.tsx` → `WelcomeIllustration`, `RegistrationIllustration` (the names are a
  naming choice for review, not a requirement). Props: `className?` only. Always `aria-hidden="true"`; no accessible name.
- **AuthLayout** — `layout/auth-layout.tsx` → `AuthLayout`. Props: `children: ReactNode` (form body), `back?:
  ReactNode`, `actions?: ReactNode`. Slots: `back` (back button), `children`, `actions` (bottom). Events: none. No
  landmark of its own (the page supplies `main`).
- **Avatar** — `ui/avatar.tsx` → `Avatar`. Props: `name?: string` (empty or absent → person icon), `decorative?:
  boolean` (true when the name is shown beside it), `label?: string` (accessible name when not decorative and `name` is
  empty). Accessible name: `name` when not decorative, else `label`. Events and slots: none.
- **MenuItem** — `shared/menu-item.tsx` → `MenuItem`. Props: `children: ReactNode` (label), `icon?: ReactNode`,
  `href?: string` (renders a link), `onClick?: () => void` (renders a button; `href` and `onClick` are mutually
  exclusive), `disabled?: boolean` (`aria-disabled`, not activatable). Name: `children`. Events: `onClick`. Slots:
  `icon`, `children`.

*Part f*
- **TopBar** — `shared/top-bar.tsx` → `TopBar`. Props: `onMenuClick: () => void`, `menuLabel: string` (the Hamburger
  name, "פתיחת התפריט"), `menuButtonRef?: Ref<HTMLButtonElement>`, `actions?: ReactNode`. Renders `header`, the
  Hamburger (icon-only Button + Tooltip) and Logo. Events: `onMenuClick`. Slots: `actions`.
- **BottomNavigation** — `shared/bottom-navigation.tsx` → `BottomNavigation`. Props: `items: {key: string; label:
  string; href: string; icon: ReactNode; current?: boolean}[]` (at most one `current`), `label: string` (name of the
  `nav`, "ניווט ראשי"). Events: native link activation, no handler prop. Slots: none (each item's `icon` is a node).
  Bar below 1024, vertical rail at the inline-start edge from 1024.
- **SideDrawer** — `shared/side-drawer.tsx` → `SideDrawer`. Props: `open: boolean`, `onOpenChange(open: boolean)`,
  `title: string` (the dialog name), `closeLabel: string` (name of the close control), `children: ReactNode`.
  Controlled; focus returns to the previously focused element (the Hamburger) on close. Events: `onOpenChange`.
  Slots: `children`.
- **AppShell** — `layout/app-shell.tsx` → `AppShell`. Props: `children: ReactNode`, `navItems:
  BottomNavigation['items']`, `navLabel: string`, `menuLabel: string`, `drawerTitle: string`, `drawerCloseLabel:
  string`, `skipLinkLabel: string`, `menu: ReactNode` (drawer body, e.g. MenuItems), `topBarActions?: ReactNode`.
  Owns the drawer's open state. Events: none. Slots: `children` (inside `main`), `menu`, `topBarActions`.

Reading choices: the fixed Hebrew names in criteria 38–39 and the skip-link text are passed as props, so copy lives
with the caller and criterion 16 stays checkable; FormField uses a render prop so the control gets its ids without
cloning; SideDrawer is controlled because AppShell must also own the Hamburger. A behaviour a test needs that this
section does not state is a finding for SPEC, not a guess.

**Addendum after part c (ORCHESTRATOR, 11.10.2026):** so FormField's render-prop output can be spread into the control,
TextInput, PasswordInput and SelectInput also accept `aria-invalid?` and `aria-describedby?`; PasswordInput and
SelectInput also accept `aria-label?`. When both `error` and `aria-invalid` are given, `error` wins.

**Addendum after the part-c review (ORCHESTRATOR, 11.10.2026):**
- The three controls accept exactly the props in this section and the addendum above — no `className`, no
  `placeholder` on TextInput, no other native input props. Width and spacing come from FormField and the layout.
- PasswordInput: the show/hide toggle never overlaps the text. The input's reserved padding is on the side where the
  toggle sits, in an RTL page with an LTR (`dir="ltr"`) password field.
- PasswordInput rules (criterion 27): the "✓" glyph is `aria-hidden`; each rule carries visually hidden status text
  — "(התקיים)" when met, "(עדיין לא)" when not — so the state is announced, not only drawn.
- SelectInput: while the empty placeholder option is selected, the shown text is `muted-foreground`; any real choice
  shows `foreground`.

**Addendum after part d (ORCHESTRATOR, 12.10.2026) — criterion 18:** a link that sits inline inside a sentence (for
example the terms and privacy links in the Checkbox label) is exempt from the 44×44 and 24×24 target size, as WCAG
2.5.8's inline exception allows. The exemption covers an `a[href]` whose computed `display` is `inline` and whose
parent element also contains text outside the link. Every other control keeps the 44×44 check. "Text outside the
link" means text outside every `a` and `button` in that parent — a row of links with separators is not a sentence.
**Narrowed (ORCHESTRATOR, 12.10.2026):** the parent must also be a `p`, or a `label` that labels a checkbox or radio.
A field label or a `div` with a stand-alone link next to it (`<div>סיסמה <a>שכחתי</a></div>`) is not exempt.
Wrapper `span`s between the link and that container are looked through (the Checkbox wraps its label text in one).

**Addendum after the part-d review (ORCHESTRATOR, 12.10.2026) — errors are announced, not only drawn:**
- ChoiceCardGroup: the fieldset carries `role="radiogroup"`; when `error` is set it carries `aria-invalid="true"`. New
  optional prop `aria-describedby?` goes on the fieldset, so the caller links its error message.
- DateInput: new optional prop `aria-describedby?` on the fieldset; with `error`, each of the three fields keeps
  `aria-invalid="true"`.
- Checkbox: accepts `aria-invalid?` and `aria-describedby?` (as the part-c controls do). `error` and `aria-invalid`
  combine — either one marks it invalid; neither overrides the other.
- Story copy follows decided requirements only: a story never implies a flow the SRS leaves open (e.g. password
  reset while its channel is TBD).

**Addendum during part e (ORCHESTRATOR, 12.10.2026) — gaps raised by TEST ENGINEER:**
- MenuItem takes exactly one of `href` or `onClick`; neither fails `tsc`, as both do.
- Avatar, not decorative, with an empty `name` and no `label`, is treated as decorative (`aria-hidden`) — never an
  unnamed image.
- A disabled MenuItem link keeps its `href`, stays focusable (`aria-disabled="true"`), and its activation is cancelled
  — the same as a disabled Button link. A disabled MenuItem button stays focusable too.

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
