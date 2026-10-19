# feed-composer — screen contract
Annex of spec.md c1-12 (amended 19.10: always-open field, Afik item 15). Copy per ux-copy-he. No new text: every
string below already exists and is referenced, not rewritten (F3.1b, F3.4, F3.2b screen.md; ERR-004). Only new or
changed controls. Follows the "כתיבה" row of direction.md "דפוסי אינטראקציה" (updated 19.10) with no deviation.

## Feed — Route /feed · Title (h1) "הפיד" (unchanged) · Landmarks main, form "כתיבת פוסט"
Order: h1 · feed-status region · form (one fixed place, never remounted) · list or empty state. Empty feed: the
empty state keeps its illustration and text, and has no action of its own.
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| composer | form | כתיבת פוסט | always present for a Regular once the check says allowed; no button opens it; aria-describedby = name or anonymous notice while shown (c1, D1) |
| text | textbox | מה תרצו לשתף? | as F3.1b; always visible; dir=rtl; field border 3:1 (c1) |
| anonymous, notices, audience, tag, counter | as F3.4/F3.1b | unchanged names and texts | revealed after the textbox while focus is in the form or text is non-blank; F3.4 order (c2, c3) |
| submit | button | פרסום | always visible, after the options; ≥44×44; pending "מפרסמים", disabled (c3, c12) |
| new card | article | the author element, as F3.2b | first in role=feed, aria-posinset 1; named: own full name, else "מהקהילה"; anonymous: "אנונימי"; focused after a success (c7, c8) |
No "ביטול", no "כתיבת פוסט" button or link, no dialog.

**States**
- idle: textbox + "פרסום" · engaged: the options shown, cards below unchanged, URL /feed, no history entry (c2)
- checking right: no form, feed-status "בודקים אם אפשר לכתוב פוסט" (existing) · Professional or unknown: no form
- pending: "מפרסמים" (c3)
- success: the form resets and goes idle; status "הפוסט פורסם" (existing) in feed-status, visible, once, not after
  Back or reload; the new card first, focused (c7-c9)
- error: role=alert inside the form "הפרסום לא הצליח. אפשר לנסות שוב" (ERR-004), focus on it, text and choices kept (c10)
- validation: F3.1b texts and focus, unchanged (c3)

**Keyboard and pointer**
- Tab or a click into the textbox reveals the options; Esc does nothing to the composition (c4)
- Back: not captured; leaves /feed; the text is kept in memory and shown on return (c5, D5)
- reload or closing the tab with non-blank text: the browser's own leave prompt, no text of ours (c6)

**Route /posts/new** — no screen. History replace to /feed, focus on "מה תרצו לשתף?". Guest: login. Professional:
/feed placeholder (until `professional-posting`) (c11).

**Motion** the reveal ≤250 ms; under prefers-reduced-motion it appears at once (c12).

**Removed** the composer page (h1 "כתיבת פוסט", its title, its Professional text) and the "הפוסט פורסם" status on
/posts/:id.
