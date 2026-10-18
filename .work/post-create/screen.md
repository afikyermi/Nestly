# F3.1b — screen contract
Annex of spec.md c14-18 + Afik 6ב. Copy per ux-copy-he (gender-neutral); spec strings verbatim; failure texts = ERR-004. Tag labels = STAGE_LABELS (child-fields.ts).
## Feed page — Route /feed · Title (h1) "פיד" · Landmarks main (existing screen; only the new control)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| write post | link | כתיבת פוסט | Regular only, href /posts/new (c14). Professional: absent. No anonymous control anywhere |
**States** loading "בודקים אם אפשר לכתוב פוסט" (no link yet) · success: status "הפוסט נמחק" after a delete (c18)
## Composer — Route /posts/new · Title (h1) "כתיבת פוסט" · Landmarks main, form (name "כתיבת פוסט")
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| text | textbox | מה תרצו לשתף? | visible label, dir=rtl; invalid: aria-invalid + aria-describedby to field-message (c16) |
| counter | status | נותרו N תווים · נותר תו אחד · לא נותרו תווים · הפוסט ארוך ב-N תווים מהמותר | rendered only at 100 left or fewer, polite; max 2,000 code points (c16) |
| name notice | text | השם שלכם יוצג לכל מי שיכול לראות את הפוסט | Afik 6ב, always visible, referenced by the form's aria-describedby |
| audience | radiogroup | מי יראה את הפוסט | c15 |
| audience option | radio | כולם | checked by default, or when the stored value is missing or invalid |
| audience option | radio | חברים בלבד | checked when remembered (localStorage per user id) |
| stage tag | radiogroup | תגית (לא חובה) | described by the hint "התגית תוצג לקוראים" (c16) |
| tag option | radio | בלי תגית | default, sends stageTag null |
| tag options | radio | מתכננים · בהריון · יש לנו ילד או ילדה | JOURNEY_STAGES order: planning, pregnant, has_child |
| submit | button | פרסום | pending: name "מפרסמים", disabled, one request on double click |
**States** empty or spaces: submit shows "יש לכתוב משהו לפני הפרסום" as field-message, focus on textbox · too long: "הפוסט ארוך מדי. אפשר לקצר אותו עד 2,000 תווים" · loading: "בודקים אם אפשר לכתוב פוסט"
**Errors** 403, 5xx, network: role=alert (inline-alert) "הפרסום לא הצליח. אפשר לנסות שוב" (ERR-004), no detail, text and choices kept, localStorage untouched
**Other** Professional: no form, "הפעולה אינה זמינה" · success: go to /posts/:id with status "הפוסט פורסם"
## Own-post page — Route /posts/:id · Title (h1) "פוסט" · Landmarks main
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| status | status | הפוסט פורסם | only right after publishing (c17); "הפוסט עודכן" after an edit |
| text | paragraph | the post text | dir=rtl, line breaks kept |
| audience label | text | מי יראה את הפוסט: כולם / חברים בלבד | c17 |
| tag label | text | תגית: מתכננים / בהריון / יש לנו ילד או ילדה | absent when stageTag is null |
| back | link | חזרה לפיד | href /feed (also in the 404 state) |
| edit | button | עריכה | author only (isMine); others see neither edit nor delete (c18) |
| delete | button | מחיקה | author only; opens the dialog |
| edit form | form | עריכת פוסט | composer reused, prefilled, no name notice; textbox, radiogroups, radios keep their names |
| edit submit | button | שמירה | pending name "שומרים"; replaces "פרסום" |
| edit cancel | button | ביטול | closes the form, nothing saved |
| confirm dialog | alertdialog | למחוק את הפוסט? | description "המחיקה מיידית ולצמיתות"; Esc = cancel |
| dialog cancel | button | ביטול | initial focus |
| dialog confirm | button | מחיקת הפוסט | pending "מוחקים"; on 204 go to /feed with status "הפוסט נמחק" |
**States** loading "טוענים את הפוסט" · 404 (missing, deleted, hidden, stranger: one text) "הפוסט אינו זמין" + link "חזרה לפיד", no post data
**Errors** load 5xx "לא הצלחנו לטעון את הפוסט. אפשר לנסות שוב" (ERR-004) + button "נסו שוב" · save failure alert "השמירה לא הצליחה. אפשר לנסות שוב", text kept
**Delete failure** dialog stays, alert "המחיקה לא הצליחה. אפשר לנסות שוב"

**Gate 1 (ORCHESTRATOR, 18.10):** screen.md approved with spec.md; the edit-form empty-body text stays as drafted.
**ORCHESTRATOR 18.10 (F3.1b build):** Professional detection via GET /api/profile 404 no_profile (no account-type signal exists); the composer still opens on a failed check and the DB refuses with 403.
