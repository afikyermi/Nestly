# F3.5 share-in-feed — screen contract
Annex of spec.md c9-12. Copy per ux-copy-he (gender-neutral). Only new or changed controls. Referenced, not rewritten: "כולם", "חברים בלבד",
the composer counter texts and too-long message (F3.1b, with "הפוסט" as written there), ERR-004 texts, "נסו שוב", "הפוסט המקורי כבר לא זמין" (F3.2b),
F3.1b delete dialog and "הפוסט נמחק", "הפוסט אינו זמין", "מהקהילה". Interaction: docs/design/direction.md "דפוסי אינטראקציה" (Afik 19.10).
## Feed — Route /feed · h1 "הפיד" (unchanged) · changed: the card action row
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| share in feed | button | שיתוף בפיד | icon + tooltip with the same text (NFR-USAB-004); after "תגובות"; only when `shareTargetOf` ≠ null, never disabled (c9) |
Tab order per card: like, comments, share in feed, (F3.6: share link), time link. "תגובות" still links to the post page in I3 (in-card comments: I3 UX-polish part).
## Share window — F3.7's primitive over /feed or /posts/:id (bottom sheet below 1024 px, small window from 1024 px)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| window | dialog | שיתוף בפיד | aria-modal, focus trap; closes on Back, Esc, outside click; page does not scroll or navigate; initial focus on the text box (c10) |
| original | blockquote | the original's body | its author name (or "מהקהילה" when null), audience, time; no link inside the window (c10) |
| text | textbox | הטקסט שלכם (לא חובה) | dir=rtl; max 2,000 code points; invalid: aria-invalid + aria-describedby to field-message |
| counter | status | composer counter texts | polite, at 100 left or fewer (c10) |
| audience | radiogroup | מי יראה את השיתוף | "כולם" / "חברים בלבד"; preselected from the composer's stored choice (1א) |
| submit | button | שיתוף | pending "משתפים", disabled, one request (c10) |
| cancel | button | ביטול | closes, no request; focus back on the opener (c10) |
**Status** (polite, page level) success "השיתוף פורסם"; focus on the "שיתוף בפיד" button that opened the window; on /feed the new share card is at the top of the list at once (c11).
**Errors** (role=alert inside the window, text kept): not_shareable "אי אפשר לשתף את הפוסט הזה" (ERR-034, no reason, no retry) · network/5xx
"השיתוף לא פורסם. אפשר לנסות שוב" + "נסו שוב" · 403 not_allowed: window closes, page alert with the ERR-004 text (c11).
## Post page — Route /posts/:id · h1 "פוסט" (unchanged) · new: the share view
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| sharer header | text | the sharer's name (or "מהקהילה") | as the post header (c12) |
| sharer text | paragraph | the sharer text | absent when null; plain text, dir=auto |
| original | blockquote | the original's body | header, audience, time (c12) |
| to original | link | לפוסט המקורי | href /posts/:originalId; only when available (c12) |
| unavailable | paragraph | הפוסט המקורי כבר לא זמין | replaces the quote and the link; no original content (c12, AC-081) |
| share in feed | button | שיתוף בפיד | as the card; targets the original (c9) |
| delete | button | מחיקה | sharer only, F3.1b dialog and status unchanged; no "עריכה" on a share (c8, c12) |
**Other** axe 0 at 375 px and 1280 px on the window and the share view; new controls ≥44×44 px, visible focus. Professional: no new control.
**Open (defaults)** 1) Reversed at Gate 1 (19.10): the new share is inserted at the top of the loaded feed at once (direction.md "פוסט שפורסם מופיע
מיד בראש הפיד"). 2) Deleting a share keeps F3.1b's texts ("הפוסט נמחק"): a share is the sharer's post.
