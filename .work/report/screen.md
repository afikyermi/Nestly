# F3.7 report — screen contract
Annex of spec.md c9-15. Copy per ux-copy-he (gender-neutral). Referenced, not rewritten: ERR-004/ERR-038 texts, "נסו שוב", "חזרה לפיד", counter pattern of F3.3. Only new controls.
## Entry points (feed card, post page, comment, profile)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| more (post) | button | פעולות נוספות לפוסט | aria-haspopup=menu, aria-expanded; card: last in tab order; post page: by the post (c9) |
| more (comment) | button | פעולות נוספות לתגובה | not when `isMine`; replies too (c9) |
| menu | menu | פעולות נוספות | arrows, Esc closes, focus back to its button (c15) |
| report item | menuitem | דיווח על הפוסט · דיווח על התגובה | opens the window (c9, c10) |
| profile report | button | דיווח על הפרופיל | `/u/:id` loaded states only, quiet style, below the actions (c9) |
## Window (over the current route)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| window | dialog | דיווח על פוסט · דיווח על תגובה · דיווח על פרופיל | aria-modal; h2 = name; backdrop blur 4px, page inert (c10) |
| intro | paragraph | הדיווח מגיע רק לצוות Nestly, ולא נשלחת עליו הודעה לאף אחד | aria-describedby of the dialog |
| reasons | radiogroup | סיבת הדיווח | visible legend "מה הבעיה?"; none checked (c11) |
| radios 1-8 | radio | תוכן שמסכן ילד · הטרדה או בריונות · תוכן מיני, אלים או מסית · חשיפת פרטים אישיים · מידע רפואי מסוכן או מטעה · התחזות · ספאם או פרסום לא קשור · אחר | this order; keys child_safety … other; first gets focus (c10, c11) |
| spam hint | text | כולל פוסט פרסומי בלי שיתוף ידע | under radio 7, its aria-describedby |
| details | textbox | פרטים נוספים | multiline, dir=auto; hint "לא חובה. בבחירת 'אחר' צריך לכתוב מה הבעיה" (c11) |
| counter | status | as F3.3, max 1,000; over: "הטקסט ארוך ב-N תווים מהמותר" (one: "בתו אחד") | from 100 left, polite |
| rules | link | כללי הקהילה (נפתח בכרטיסייה חדשה) | /community-rules, target=_blank rel=noopener (c11) |
| send | button | שליחת הדיווח | pending name "שולחים", disabled, one request (c12) |
| cancel | button | ביטול | closes, no request, focus to opener (c10) |
**Field messages** no reason "יש לבחור סיבה" (focus to first radio) · other, empty "בבחירת 'אחר' יש לכתוב מה הבעיה" · long "הטקסט ארוך מדי. אפשר לקצר אותו עד 1,000 תווים" · NUL: F3.3's text (c12).
**States** loading: none (no fetch) · error (network/5xx): role=alert in the window "הדיווח לא נשלח. אפשר לנסות שוב" (ERR-004), input kept, send again (c13) · 401: ERR-038 flow.
**Success/status** (polite region of the page; window closes; c13)
- post, 201: "הדיווח נשלח. הפוסט לא יוצג לכם יותר"; feed: card removed, focus to the next card (else the h1); post page: the post replaced by that paragraph + "חזרה לפיד", focus to it.
- comment or profile, 201: "הדיווח נשלח. הצוות יבדוק אותו"; focus to the opener.
- 409: "כבר דיווחתם על זה. הצוות יבדוק את הדיווח" (a post card is removed as above).
- 404: "אי אפשר לדווח על זה. ייתכן שהתוכן כבר לא זמין"; focus to the opener, or the h1 if it is gone.
## Community rules — Route /community-rules · h1 "כללי הקהילה" · Landmarks main
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| menu item | link | כללי הקהילה | side menu, after Friends (c14) |
| rules | list (ol) | כללי הקהילה | 8 items, BR-075 wording; each item a bold title + sentence (c14) |
| rule 2 link | link | מוקדי רפואה | only once F3.8 is merged; else plain text (c14) |
| closing line | paragraph | הפרת כלל מובילה להסרת התוכן ולצעדי אכיפה | BR-075 last line |
**States** static: no loading, empty or error state; no request (c14). **Other** axe 0 at 375 px and desktop; targets ≥ 44×44 px (c15).
