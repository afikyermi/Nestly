# F3.9 hide-post — screen contract
Annex of spec.md c8-c13; follows `docs/design/direction.md` "דפוסי אינטראקציה". Copy per ux-copy-he (gender-neutral). Referenced, not
rewritten: the feed-status region (F3.2), "הפוסט אינו זמין", "הפוסט המקורי כבר לא זמין", F3.1's delete dialog texts and "הפוסט נמחק".
**One menu (Gate 1 amendments, ORCHESTRATOR 19.10):** names are F3.7's (`.work/report/screen.md` lines 6–8); F3.9 builds it on every card,
F3.7 adds "דיווח על הפוסט".
## Feed — Route /feed · h1 "הפיד" (unchanged) · changed: the card
Tab order per card: like, comments (still a link to `/posts/:id#comments` in I3; in-card comments are a later I3 UX-polish part), time link, "⋯".
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| more (post) | button | פעולות נוספות לפוסט | "⋯" icon `aria-hidden`; `aria-haspopup="menu"`, `aria-expanded`; on **every** card; tooltip = the name (c8) |
| menu | menu | פעולות נוספות | arrows move; Esc, outside click or Back closes (Back stays in the feed); focus back on its button (c8) |
| edit | menuitem | עריכת הפוסט | `isMine` true only; opens `/posts/:id` with its edit form open (c13) |
| delete | menuitem | מחיקת הפוסט | `isMine` true only; opens the confirmation (c13) |
| hide | menuitem | הסתרת הפוסט | `isMine` false only (incl. the viewer's own anonymous card); pending: disabled, one request (c9) |
| confirm | alertdialog | למחוק את הפוסט? | F3.1's: description "המחיקה מיידית ולצמיתות"; initial focus "ביטול"; Esc / Back = cancel, focus to "⋯" (c13) |
| dialog confirm | button | מחיקת הפוסט | pending "מוחקים", one request (c13) |
| placeholder | article | פוסט מוסתר | replaces the card in place, same `aria-posinset`; text "הפוסט הוסתר. הוא לא יוצג לך שוב." (c9) |
| undo | button | ביטול ההסתרה | inside the placeholder; focus lands here after a hide; pending "מבטלים", one request (c9) |
**Status** (polite, the existing feed-status region)
- hidden: "הפוסט הוסתר" · undone: "הפוסט מוצג שוב" (focus on the restored card's "⋯")
- hide failure: "ההסתרה לא הצליחה. אפשר לנסות שוב" (card unchanged, focus on "⋯")
- hide 404: "הפוסט אינו זמין" (card removed; focus on the next card's first control, else the h1)
- hide 409 own post (e.g. the viewer's own anonymous card): "אי אפשר להסתיר פוסט שכתבת" (card unchanged, focus on "⋯"; c11)
- undo failure: "לא הצלחנו לבטל את ההסתרה. אפשר לנסות שוב" (placeholder stays, focus on undo)
- deleted: "הפוסט נמחק" (card removed, user stays in the feed; focus as hide 404) · delete failure: "המחיקה לא הצליחה. אפשר לנסות שוב"
  inside the dialog, `role=alert`, dialog stays (c13)
**States** placeholder lives only while the feed screen stays mounted; leaving, reload or back-restore shows the list without hidden or
deleted cards and without a placeholder (c10, c13). Share cards: the share's own menu acts on the share only (c12).
**Other** axe 0 at 375 px: menu open, placeholder, delete dialog; "⋯", items and undo ≥ 44×44 px, visible focus (c12). Professional: no new
control (no feed). Post page `/posts/:id`: unchanged in F3.9 (its own "עריכה"/"מחיקה" stay; F3.7 adds its menu there).
