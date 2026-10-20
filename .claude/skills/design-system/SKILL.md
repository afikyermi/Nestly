---
name: design-system
description: Nestly's visual system in code — semantic tokens only, the shared components in components/ui|layout|shared|domain, states, one primary action, quiet signals, icons and motion. Use when building or reviewing any UI under apps/web.
user-invocable: false
paths:
  - "apps/web/**"
  - "packages/shared/src/design-tokens/**"
---

# design-system — one product, one look

**Version:** 1.0 · the approved sources, not restated here:
- **What each screen holds:** SRS §4.2, §7.
- **How it looks and why:** `docs/design/direction.md` (principles, Facebook patterns, tone, imagery, motion,
  states, layout).
- **The values:** `docs/design/tokens.md` — the spec. Code source from 9.7: `packages/shared/src/design-tokens/`;
  if the two disagree, the code is fixed or the spec changes by a recorded decision.

Accessibility is `accessibility`, direction and dates are `rtl-hebrew`, wording is `ux-copy-he`.

## Patterns

**Only semantic tokens.** A colour, radius, shadow, size or duration comes from a token name, never a value.

```tsx
<article className="rounded-lg bg-card p-4 text-card-foreground shadow-card md:p-5">
  <p className="text-body text-foreground">{body}</p>
  <time className="text-caption text-muted-foreground tabular-nums">{when}</time>
</article>
```

**Reuse before you build.** Look in `components/ui` (shadcn primitives), `components/shared` and
`components/domain` first (SCOUT can answer "does this exist"). A new reusable piece goes to the right layer
(SRS §4.2, `.claude/knowledge/conventions.md` → Component architecture); a second component with the same
structure is a prop, not a copy.

**Radix only through `components/ui`.** Features and shared components import the wrapped primitive, so focus,
RTL and tokens are fixed in one place.

**One primary action** per card and per screen (`primary`, filled). Secondary actions go under "⋯". The post
card's action row is the one recorded exception (direction.md, principle 2).

**Quiet signals.** A counter is `badge` / `badge-foreground`, "9+" above nine, no red, no pulse. Selection is
never pastel alone: add `primary-strong` text, weight 600 or a ✓ (tokens.md, the contrast rules).

**Soft structure.** Cards have `shadow-card` and no border. An input keeps a visible `border-input` (3:1). The
decorative `border` token never identifies a control.

**States are designed, not left to default** — the table in direction.md → "מצבים":
- loading → a skeleton on `muted`, never a centred spinner
- empty → a small illustration, why it is empty, one next step
- error → inline, with "ניסיון חוזר", text from the ERR catalog
- a submit button is not disabled; show the errors instead

**Icons:** Lucide, `strokeWidth={1.75}`, sized by token. Decorative icons are `aria-hidden`.

**Motion:** `duration-fast|base|slow` with the standard easing, and nothing moves under
`motion-reduce:` / `prefers-reduced-motion`.

**Layers:** z-index only from the token scale (`sticky`, `scrolltop`, `drawer`, `popover`, `toast`, `dialog`).

**Layout:** mobile-first at 375. At `lg` (1024) the bottom navigation becomes the start-side rail, around the
centred column (R1).

## Forbidden

1. A hex, `rgb()` or named colour outside the tokens source
2. An arbitrary Tailwind value (`p-[13px]`, `text-[#…]`, `z-[999]`)
3. Importing `@radix-ui/*` outside `components/ui`
4. A second component with the same structure as an existing one, differing only in what it triggers
5. Two filled primary buttons in one card or screen
6. Pastel as the only signal of a state
7. A red or pulsing counter, or urgency styling for a notification
8. A border used to identify a control other than `border-input`
9. A centred spinner as a loading state, or a disabled submit button
10. A dark-mode variant (`dark:`) — dark mode is not defined (decision of 11.10.2026)

## Done when

- No forbidden item in the diff. From 9.7 the lint catches 1–3 in CI; the rest are CRITIC's design-consistency
  check.
- Every changed component renders its states (default, hover, focus, selected, error, loading, empty where they
  apply) in a Storybook story.
- Nothing new duplicates a component that already exists.

## Changelog
- 1.0 — 2026-10-11 — created (WORKPLAN 9.6; decision "Design consistency without a design agent", Afik). The
  forbidden list is CRITIC's design-consistency check, counted once in its budget. Provisional until 5 features.
