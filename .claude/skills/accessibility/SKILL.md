---
name: accessibility
description: WCAG 2.2 AA craft for the web app — semantic HTML, labels and errors, keyboard and focus, dialogs and overlays, target size, contrast, live regions. Use when building or reviewing any UI under apps/web.
user-invocable: false
paths:
  - "apps/web/**"
---

# accessibility — WCAG 2.2 AA in practice

**Version:** 1.0 · the requirement: SRS NFR-A11Y-001. Who checks what, and when: `.claude/workflow.md` → "Domains"
→ Accessibility. The binding constraints: `.claude/knowledge/conventions.md` → Accessibility. This skill is how to
build it.

## Patterns

**Native elements first.** A `<button>` needs no role, tabindex or key handler.

```tsx
<button type="button" onClick={onSave}>שמירה</button>          {/* not <div onClick> */}
```

**Every input has a label, and its error is connected.**

```tsx
<label htmlFor="due">תאריך לידה משוער</label>
<input id="due" aria-invalid={!!error} aria-describedby={error ? 'due-error' : undefined} />
{error && <p id="due-error" role="alert">{error}</p>}
```

**Dialogs and overlays** (Modal, DropdownPanel, SideDrawer — SRS §4.2):
- A modal has `role="dialog"`, `aria-modal="true"` and a label.
- Focus moves into the overlay on open, is trapped inside, and returns to its trigger on close.
- Escape closes it. A non-modal dropdown also closes on an outside click.
- The background is `inert`. The overlay is portaled, so a parent's overflow never clips it and the z-order is right.

**Focus is always visible and never hidden.** Use `focus-visible:` rings. `outline-none` is only allowed with a
visible replacement. A sticky header or banner must not cover the focused element (2.4.11).

**Size and alternatives:**
- Pointer targets are at least 24×24 CSS px (2.5.8).
- Anything done by dragging has a single-pointer alternative (2.5.7).

**Async status is announced.** A save confirmation or a load error goes to an `aria-live="polite"` region.

**Authentication** (3.3.8): allow paste into password fields, and never require a cognitive puzzle.

**Avoid asking twice** (3.3.7): data the user already entered in the same flow is pre-filled, not re-asked.

**Keyboard in RTL:** in horizontal menus and tabs, the arrow keys follow the visual direction. Right moves to
the previous item.

## Forbidden

1. A clickable `div` or `span` instead of a `button` or link
2. An input with a placeholder and no label
3. `outline-none` with no visible focus replacement
4. A dialog without a focus trap, Escape and focus return
5. An icon-only button with no accessible name
6. Information carried by colour alone
7. A target smaller than 24×24 CSS px
8. `tabindex` greater than 0
9. Status messages that appear only visually
10. Disabling zoom (`user-scalable=no`)

## Done when

- A keyboard-only walk of every changed screen completes the flow.
- axe, inside the Playwright test, reports no violations.
- Every input and icon button has an accessible name.

## References

[WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
· [What's new in 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Includes the overlay checklist (C5). Provisional until 5
  features.
