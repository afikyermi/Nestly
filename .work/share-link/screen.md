# F3.6 share-link — screen contract
Annex of spec.md c3-5, c8, c10-12. Copy per ux-copy-he (gender-neutral). Only new or changed controls. Referenced, not rewritten:
"הפוסט אינו זמין", "חזרה לפיד" (F3.1b), the Login screen (unchanged; it only carries returnTo), ERR-004 texts.
Interaction: docs/design/direction.md "דפוסי אינטראקציה" (Afik 19.10).
## Feed card and post page — /feed, /posts/:id · changed: the action row
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| share link | button | שיתוף קישור | icon + tooltip with the same text (NFR-USAB-004); after "שיתוף בפיד"; only when `postLinkOf` ≠ null, never disabled (c3) |
Tab order per card: like, comments, share in feed, share link, time link. "תגובות" still links to the post page in I3 (in-card comments: I3 UX-polish part).
## ShareSheet — F3.7's primitive over the current page (bottom sheet below 1024 px, small window from 1024 px)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| window | dialog | שיתוף קישור · שיתוף Nestly (site link) | aria-modal, focus trap; closes on Back, Esc, outside click; page does not scroll or navigate; initial focus on the first option (c4, c12) |
| WhatsApp | link | וואטסאפ | href per spec c2; target=_blank, rel="noopener noreferrer"; name adds "(נפתח בחלון חדש)" visually hidden |
| email | link | אימייל | mailto per spec c2 |
| copy | button | העתקת קישור | writes the URL to the clipboard (c5) |
| more | button | אפשרויות נוספות | only when navigator.share exists; opens the device share sheet (c4) |
| link field | textbox (read-only) | הקישור | shown only after a copy failure, URL selected, dir=ltr (c5) |
| close | button | סגירה | focus back on the opener (c4) |
**Status** (polite, inside the window) copy success "הקישור הועתק".
**Errors** copy failure (role=alert): "לא הצלחנו להעתיק. אפשר להעתיק את הקישור מהשדה" + the link field · device share cancelled: nothing ·
device share failed otherwise: the same copy-failure state (c5).
## Side menu — existing drawer · new item
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| share Nestly | button | שיתוף Nestly | opens the ShareSheet with the site link (c11); Regular and Professional alike (no post data); focus returns to the menu button |
## Preview texts (static HTML, spec c7) — not on screen
- `/posts/*`: og:title "פוסט ב-Nestly" · og:description "כדי לקרוא את הפוסט צריך להתחבר ל-Nestly" · robots noindex.
- `/`: og:title "Nestly" · og:description "קהילה להורים ולהורים לעתיד".
- WhatsApp/device text: "פוסט ב-Nestly" (post) · "Nestly" (site), followed by the URL.
## Opening a link
Guest → Login (unchanged screen) → after sign-in `/posts/:id` with the post (c8). Signed-in, not permitted or missing → the existing
"הפוסט אינו זמין" + "חזרה לפיד" (c10). No new page, no new text.
**Other** axe 0 at 375 px and 1280 px; options ≥44×44 px, visible focus (c12).
**Open (defaults)** 1) Site link in the menu for Professional too: it carries no post data (unreserved). 2) The sheet lists options in the order above.
