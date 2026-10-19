# feed-composer — screen contract
Annex of spec.md c1-12. Copy per ux-copy-he. No new text: every string below already exists and is referenced, not
rewritten (F3.1b, F3.4, F3.2b screen.md; ERR-004). Only new or changed controls. direction.md "דפוסי אינטראקציה" followed;
no deviation.

## Feed — Route /feed · Title (h1) "הפיד" (unchanged) · Landmarks main; the open composer is a named form
Order: h1 · feed-status region · composer (collapsed button or open form) · list. Empty feed: the composer sits
inside the empty state as its single action, after its text.
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| write post | button | כתיבת פוסט | collapsed state; replaces the F3.1b link; Regular only, after the check says allowed; ≥44×44; full width, soft card look, not a textbox (c1, D1) |
| composer | form | כתיבת פוסט | replaces the button in the same place; aria-describedby = the name notice or the anonymous notice (F3.4); no dialog, no h1 (c2) |
| text | textbox | מה תרצו לשתף? | as F3.1b; gets focus on expand (c2, D6) |
| anonymous, audience, tag, counter, notices | as F3.4/F3.1b | unchanged names and texts | same order and behaviour; F3.1 c15, c16, F3.4 c11, c16 (c3) |
| submit | button | פרסום | pending "מפרסמים", disabled (c3) |
| cancel | button | ביטול | after "פרסום", secondary look; collapses, keeps the composition; focus back to "כתיבת פוסט"; inert while pending (c4) |
| new card | article | the author element, as F3.2b | first in role=feed, aria-posinset 1; named: own full name, else "מהקהילה"; anonymous: "אנונימי"; receives focus after a success (c7, c8) |

**States**
- collapsed: the button only · open: the form, cards below unchanged, URL /feed, no history entry (c2)
- checking right: no button, feed-status "בודקים אם אפשר לכתוב פוסט" (existing) · Professional or unknown: no button
- pending: "מפרסמים"; Esc and "ביטול" do nothing (c4)
- success: form collapses and resets; status "הפוסט פורסם" (existing PUBLISHED_STATUS) in feed-status, visible, once,
  not after Back or reload; the new card first (c7-c9)
- error: role=alert inside the form "הפרסום לא הצליח. אפשר לנסות שוב" (ERR-004), focus on it, text and choices kept (c10)
- validation: F3.1b texts and focus, unchanged (c3)

**Keyboard and pointer**
- Enter or Space on "כתיבת פוסט" opens; Esc anywhere in the form = "ביטול"; a click outside does nothing (c4)
- Back: not captured; leaves /feed as today; the composition is kept in memory and returns on the next open (c5, D5)
- reload or closing the tab with non-blank text: the browser's own leave prompt, no text of ours (c6)

**Route /posts/new** — no screen. History replace to /feed, composer open, focus on "מה תרצו לשתף?". Guest: login.
Professional: /feed placeholder (no form, no "כתיבת פוסט") (c11).

**Motion** expand/collapse ≤250 ms; under prefers-reduced-motion it switches at once (c12).

**Removed** the composer page (h1 "כתיבת פוסט", its title, its Professional text "הפעולה אינה זמינה" there) and the
"הפוסט פורסם" status on /posts/:id.
