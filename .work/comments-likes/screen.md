# F3.3 comments-likes — screen contract
Annex of spec.md c13-20. Copy per ux-copy-he (gender-neutral). Referenced, not rewritten: ERR-004 retry texts, "נסו שוב", "חזרה לפיד", "מהקהילה", "אנונימי", "הפוסט אינו זמין", "המחיקה לא הצליחה. אפשר לנסות שוב". Only new or changed controls. New term (unreserved): "השבה" = Reply.
## Feed — Route /feed · h1 "הפיד" (unchanged) · changed: the card (amends F3.2b "zero buttons", "time is the only link")
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| like | button | לייק · לייק, N (N ≥ 1) | `aria-pressed` true when liked; count ±1 at once; quick double click = one request (c13) |
| comments | link | תגובות · תגובות, N | href /posts/:id#comments; lands on heading "תגובות", focused (c13, c14) |
Both after the body, inside the article; share and anonymous cards too (a share's counts are its own). Tab order: like, comments, time link.
**Status** like failure: "הלייק לא נשמר. אפשר לנסות שוב" (ERR-004), polite, state reverted. After back, the restored card shows the new state (c14).
## Post page — Route /posts/:id · h1 "פוסט" (unchanged) · new region below the post
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| region | region | תגובות | h2 "תגובות" id=comments, `tabindex=-1`: the focus target (c14, c18) |
| post like | button | לייק · לייק, N | as the card; top of the region (c15) |
| thread | list | רשימת התגובות | `ul`; replies in a nested `ul` named "השבות" (c15) |
| comment | listitem | the author name · המחבר · מהקהילה | aria-labelledby on the author element; no avatar, no link (c15, c16) |
| author name | text | `author.name`, else "מהקהילה" | nothing else decides it (c15) |
| author label | text | המחבר | only `byAuthor` without `author`; no name, avatar, link in DOM, props, test ids (c16) |
| time | text | date and time, `<time datetime>` | not a link |
| body | paragraph | the comment text | plain text, line breaks kept, `dir="auto"`; `<script>` as text |
| comment like | button | לייק · לייק, N | as the card (c15) |
| reply | button | השבה | top-level only; opens the reply box, focus to its textbox (c15, c17) |
| more replies | button | הצגת עוד השבות | after a comment's replies, only while `replyCount` exceeds those loaded; pending "טוענים"; new replies append, focus stays on the button, or on the first new reply when the button disappears (c15, c19) |
| delete | button | מחיקה | only when `isMine` (c16, c18) |
| form | form | כתיבת תגובה · כתיבת השבה | below the thread; the same form for a reply (c17) |
| text | textbox | כתיבת תגובה · כתיבת השבה | visible label, dir=rtl; invalid: aria-invalid + aria-describedby to field-message |
| counter | status | נותרו N תווים · נותר תו אחד · לא נותרו תווים · התגובה ארוכה ב-N תווים מהמותר | at 100 left or fewer, polite; max 1,000 code points |
| send | button | שליחה | pending "שולחים", disabled, one request |
| reply cancel | button | ביטול | closes the reply box, text dropped, focus back on "השבה" |
| more | button | עוד תגובות | only with `nextCursor`; pending "טוענים" (c19) |
| confirm | alertdialog | למחוק את התגובה? | description "המחיקה מיידית ולצמיתות"; a top-level adds "גם ההשבות אליה יימחקו"; Esc = cancel (c18) |
| dialog cancel | button | ביטול | initial focus |
| dialog confirm | button | מחיקת התגובה | pending "מוחקים" |
**States** loading "טוענים את התגובות" · empty "עוד אין תגובות. אפשר לכתוב את התגובה הראשונה", form stays (c19) · post 404 unchanged, no thread.
**Field messages** blank "יש לכתוב משהו לפני השליחה" (focus on box) · long "התגובה ארוכה מדי. אפשר לקצר אותה עד 1,000 תווים" (c17).
**Status** (polite) send "התגובה נוספה" · delete "התגובה נמחקה", focus on the heading · like failure as above.
**Errors** thread load: inline-alert "לא הצלחנו לטעון את התגובות. אפשר לנסות שוב" + "נסו שוב".
· more: list kept, alert after the last comment + "נסו שוב" (same cursor). · send: "התגובה לא נשלחה. אפשר לנסות שוב", text kept.
· more replies: replies kept, alert under that comment's replies "לא הצלחנו לטעון את ההשבות. אפשר לנסות שוב" + "נסו שוב"; 404 (parent gone): the comment's block shows "התגובה אינה זמינה".
· delete: dialog stays, "המחיקה לא הצליחה. אפשר לנסות שוב".
**Other** axe 0 at 375 px; like, reply, delete, comments link ≥44×44 px, visible focus (c20). Professional: no new control.
**Open (default none)** If question 7 opens names to everyone: a line under the textbox "השם שלכם יוצג לכל מי שיכול לראות את התגובה" (copy only).
