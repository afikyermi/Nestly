# ux-polish-b — screen contract
Annex of spec.md c1–c12; follows docs/design/direction.md "דפוסי אינטראקציה". Copy per ux-copy-he. **No new text.**
Referenced, not rewritten: F3.1's edit form and texts, "הפוסט עודכן", F3.1's ERR-004 save text, "הפוסט אינו זמין", the F3.7/F3.9
"⋯" names, every dialog's and sheet's texts as built.
## Feed — Route /feed · h1 "הפיד" (unchanged) · changed: own card edit, to-top
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| edit | menuitem | עריכת הפוסט | own named card only; opens the form inside the card, no navigation (c1) |
| edit form | form | עריכת פוסט | replaces body + action row; header stays; F3.1 fields; focus on the text box (c1) |
| save | button | שמירה | pending "שומרים", one request (c2) |
| cancel | button | ביטול | no request; focus on the card's "⋯" (c2) |
| to top | button | חזרה למעלה | icon-only at 1024 px: tooltip "חזרה למעלה" on hover and focus; text at 1280 px (c9) |
**Status** (feed region) saved "הפוסט עודכן", focus "⋯" · 404 "הפוסט אינו זמין", card removed · failure: role=alert in the
form with F3.1's save text, text kept (c2).
## Post page — Route /posts/:id · h1 "פוסט" (unchanged) · changed: the author's actions
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| more (post) | button | פעולות נוספות לפוסט | now for `isMine` too, same place as F3.7's; the visible "עריכה" and "מחיקה" are removed (c3) |
| edit | menuitem | עריכת הפוסט | own post, anonymous included; not on a share; opens the existing in-place form (c3) |
| delete | menuitem | מחיקת הפוסט | own post or share; F3.1's dialog, outcome as built (c3) |
Focus after edit save or cancel, and after a cancelled delete: the post's "⋯".
## Windows — every screen
**Confirmations** (c4, c5, c11): Back or a press on the backdrop = "ביטול"; while pending nothing closes the dialog.
| Screen | Dialog (alertdialog) name | Focus after cancel |
|---|---|---|
| /feed | למחוק את הפוסט? | the card's "⋯" |
| /posts/:id | למחוק את הפוסט? | the post's "⋯" |
| /posts/:id (cards: ux-polish-a) | למחוק את התגובה? | the comment's "⋯" |
| /u/:id | להסיר את {name} מהחברים? | its "הסרה" button |
| /friends | להסיר את {name} מהחברים? | that row's "הסרה" |
| /profile, "המסע שלי" | להסיר את {name}? · לסיים את מסלול ההריון? · מסלול 'מתכננים' יסתיים ויימחק | its opener |
**Sheets and side menu** (c6): "דיווח על …", "שיתוף בפיד", "שיתוף קישור", "שיתוף Nestly", the side menu "תפריט": Back, Esc and
an outside press close them; focus as built (side menu: "פתיחת התפריט"); a pending send keeps its sheet.
**Menus** (c7, c8): one press on another "⋯" opens it; "פיד" on /feed with a menu open adds no history entry.
**States** no new state, text, loading or error.
**Other** axe 0 at 375 px and 1024 px; new or moved controls ≥44×44 px, visible focus (c12).
