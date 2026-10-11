---
name: rtl-hebrew
description: Right-to-left Hebrew craft for the web app — logical Tailwind utilities (ms-/me-, not ml-/mr-), direction, mixed Hebrew/English/number text, dates, numbers and currency for Israel. Use when building or reviewing any UI under apps/web.
user-invocable: false
paths:
  - "apps/web/**"
---

# rtl-hebrew — a Hebrew interface that reads right

**Version:** 1.1 · market: Israel (SRS §11, OP-001). The stack is Tailwind 4 (WORKPLAN 7.0); the logical
utilities below are native there. From 9.7 a CI lint rejects the physical ones (Forbidden 1).

**Not here:** what a field accepts — formats such as phone numbers and dates are VAL items in SRS §9. This skill
covers display and layout. Copy wording is in `ux-copy-he`.

## Patterns

**Direction is set once, at the root.** Components inherit it and never hardcode it.

```tsx
// index.html: <html lang="he" dir="rtl">
<div className="flex items-center gap-2 ps-4 pe-2">            {/* logical padding */}
  <Avatar className="me-2" />                                    {/* margin toward the end */}
  <span className="text-start truncate">{name}</span>
  <ChevronLeft className="ms-auto rtl:rotate-180" aria-hidden /> {/* directional icon mirrors */}
</div>
```

**Mixed content is isolated.** User text can be in any language; LTR fragments inside Hebrew get their own
direction.

```tsx
<p dir="auto">{post.body}</p>                                   {/* user-generated text */}
<span>נשלח אל <bdi>{email}</bdi></span>                          {/* email, URL, code, handle */}
<input type="email" dir="ltr" className="text-start" />        {/* LTR input inside an RTL form */}
```

**Dates and numbers go through `Intl`, with locale and time zone.** Store in UTC, display in Israel time.

```ts
const dateFmt = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' });
const rel = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });   // "לפני 3 שעות"
const ils = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' });
```

**Icons:** mirror only icons that point sideways (back, next, chevrons). An arrow that points up, such as
"back to top", does not mirror.
Never mirror logos, media controls, checkmarks or clocks. The icon set is Lucide (`design-system`).

**The layout mirrors with the direction.** The desktop navigation rail sits at the start side (right), the
drawer opens from the start side, and a toast or the "back to top" button anchors to `end-`/`start-`, never
`left-`/`right-`.

## Forbidden

1. `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l/r`, `border-l/r` for
   layout. Use `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`/`rounded-s/e`/`border-s/e`
2. `dir="rtl"` on a component, or `direction` in inline styles
3. Hebrew and an LTR fragment (number, email, URL) concatenated with no isolation
4. `toLocaleDateString()` or `toLocaleString()` without a locale and `timeZone`
5. Storing local time instead of UTC
6. Mirroring a non-directional icon
7. A display format invented here when the SRS defines a VAL item for it
8. Tests that assume left-to-right positions

## Done when

A grep of the diff finds no physical direction utility · every user-text container has `dir="auto"` or
isolation · every displayed date or number goes through `Intl` with `he-IL`.

## References

[Tailwind — logical properties](https://tailwindcss.com/docs/padding) · [MDN — dir](https://developer.mozilla.org/docs/Web/HTML/Global_attributes/dir)
· [MDN — bdi](https://developer.mozilla.org/docs/Web/HTML/Element/bdi) · [MDN — Intl](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl)

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
- 1.1 — 2026-10-11 — aligned with the approved design (WORKPLAN 9.6): Tailwind 4, the CI lint from 9.7, the rail
  and drawer on the start side, Lucide. Patterns only; the forbidden list is unchanged. Provisional until 5 features.
