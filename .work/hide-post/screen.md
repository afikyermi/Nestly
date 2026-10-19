# F3.9 hide-post — screen contract
Annex of spec.md c8-c12. Copy per ux-copy-he (gender-neutral). Referenced, not rewritten: the feed-status region (F3.2), "הפוסט אינו זמין"
(`POST_UNAVAILABLE_TEXT`), "הפוסט המקורי כבר לא זמין", "נסו שוב" is not used (a retry is the same control again). Only new or changed controls.
**One menu (Gate 1 amendment, ORCHESTRATOR 19.10):** the button and menu are F3.7's (`.work/report/screen.md` lines 6–8); F3.8+F3.9 build
before F3.7, so F3.9 builds them and F3.7 adds "דיווח על הפוסט" to the same menu.
## Feed — Route /feed · h1 "הפיד" (unchanged) · changed: the card (adds one control after F3.3's like, comments, time link)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| more (post) | button | פעולות נוספות לפוסט | icon (three dots, `aria-hidden`); `aria-haspopup="menu"`, `aria-expanded`; card: last in tab order; in F3.9 on every card with `isMine` false, the viewer's own anonymous card included; tooltip = the name (c8) |
| menu | menu | פעולות נוספות | arrow keys move, Esc / outside click closes, focus back on its button (c8) |
| hide | menuitem | הסתרת הפוסט | first item (F3.7 adds "דיווח על הפוסט" after it); pending: the item disabled, one request (c9) |
| placeholder | article | פוסט מוסתר | replaces the card in place, same `aria-posinset`; text "הפוסט הוסתר. הוא לא יוצג לך שוב." (c9) |
| undo | button | ביטול ההסתרה | inside the placeholder; focus lands here after a hide; pending "מבטלים", one request (c9) |
**Status** (polite, the existing feed-status region)
- hidden: "הפוסט הוסתר" · undone: "הפוסט מוצג שוב" (focus on the restored card's "פעולות נוספות לפוסט")
- hide failure: "ההסתרה לא הצליחה. אפשר לנסות שוב" (card unchanged, focus on the more button)
- hide 404: "הפוסט אינו זמין" (card removed; focus on the next card's first control, else the h1)
- hide 409 own post (e.g. the viewer's own anonymous card): "אי אפשר להסתיר פוסט שכתבת" (card unchanged, focus on the more button; c11)
- undo failure: "לא הצלחנו לבטל את ההסתרה. אפשר לנסות שוב" (placeholder stays, focus on undo)
**States** placeholder lives only while the feed screen stays mounted; leaving, reload or back-restore shows the list without the card and
without a placeholder (c10). Share cards: the share's own menu acts on the share only (c12).
**Other** axe 0 at 375 px, menu open and with a placeholder; more button, item and undo ≥ 44×44 px, visible focus (c12). Professional: no
new control (no feed). Post page `/posts/:id`: unchanged in F3.9 (F3.7 adds its button there; spec Q3).
