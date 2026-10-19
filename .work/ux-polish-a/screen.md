# ux-polish-a — screen contract
Annex of spec.md c1–c12; follows docs/design/direction.md "דפוסי אינטראקציה". Copy per ux-copy-he. Referenced, not rewritten:
every F3.3 thread, composer, counter, field-message, delete, like and error text; F3.4's name and "המחבר" notices; F3.7's comment
"⋯" and report texts; "נסו שוב", "הפוסט אינו זמין", "מהקהילה", "המחבר". **One new text:** "הצגת עוד תגובות" (direction.md "הצגת עוד").
## Feed — Route /feed · h1 "הפיד" (unchanged) · changed: the card
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| comments | button (was a link) | תגובות · תגובות, N | focus to the card's field; no navigation (c9) |
| comment list | list | רשימת התגובות | inside the article, after the action row; ≤2 items until expanded; no region landmark (c1) |
| comment | listitem | as F3.3: the name · המחבר · מהקהילה | time, body (`dir=auto`), "⋯", like, "השבה" (top-level) in CommentItem's order (c1, c6–c9) |
| comment more | button | פעולות נוספות לתגובה | F3.7: own "מחיקה", others "דיווח על התגובה" (c7) |
| more comments | button | הצגת עוד תגובות | while comments remain; pending "טוענים"; focus to the first new comment (c2) |
| more replies | button | הצגת עוד השבות | as F3.3; the first press shows the comment's inline replies (c2) |
| reply form | form (no name) | — | not a landmark: no aria-label/labelledby on the `<form>` (axe landmark-unique, ≥2 cards) (c5, c12) |
| reply text | textbox | כתיבת השבה | under its comment, in the card; F3.3's box and "ביטול" (c5) |
| field form | form (no name) | — | not a landmark: no aria-label/labelledby on the `<form>` (axe landmark-unique, ≥2 cards) (c4, c12) |
| field | textbox | כתיבת תגובה | last in the card; F3.4 notice by aria-describedby; counter as F3.3 (c4, c6) |
| send | button | שליחה | pending "שולחים", one request (c4) |
**States** (inside the card; c3) count 0: the field only, no empty sentence · loading: two skeleton lines, sr-only "טוענים את
התגובות" · error: inline-alert "לא הצלחנו לטעון את התגובות. אפשר לנסות שוב" + "נסו שוב" · next page error: "לא הצלחנו לטעון עוד
תגובות. אפשר לנסות שוב" + "נסו שוב" · 404: "הפוסט אינו זמין", no field · anonymous card before `isMine` is known: no field (c6).
Anonymous card whose `GET /posts/:id` read fails: no field; the load-failure inline-alert above (ERR-004, as F3.3) + "נסו שוב" (c6).
**Status** (the feed's polite region) "התגובה נוספה" · "התגובה נמחקה" · like failure and report outcomes as F3.3/F3.7.
**Focus** after send: the field · after a delete: the card's "תגובות" · after a report or a cancelled dialog: the comment's "⋯".
**Tab order per card** like, comments, share in feed, share link, time link, card "⋯", each shown comment ("⋯", like, "השבה",
as the post page's CommentItem), "הצגת עוד תגובות", field, "שליחה" (c9).
**Other** axe 0 at 375 px and 1024 px; new controls ≥44×44 px, visible focus (c12). A card without the like control: no comment
area. The post page: unchanged.
**Amendment (ORCHESTRATOR, Gate 1 screen items):** unnamed card form · in-comment Tab order "⋯", like, "השבה" · failed anonymous read: no field, load-failure text + "נסו שוב".
**Amendment 2 (ORCHESTRATOR):** the in-card reply `<form>` is unnamed too (not a landmark); its textbox keeps "כתיבת השבה".
