# F3.4 anonymous-post — screen contract
Annex of spec.md c11-16. Copy per ux-copy-he (gender-neutral plural). Referenced, not rewritten: "אנונימי" (ANONYMOUS_AUTHOR_LABEL),
"המחבר", "מהקהילה", F3.1b composer and post-page texts, ERR-004 texts, "השם שלכם יוצג לכל מי שיכול לראות את הפוסט" (6ב).
Only new or changed controls.
## Composer — Route /posts/new · h1 "כתיבת פוסט" (unchanged)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| anonymous | checkbox | פרסום אנונימי | after the textbox, before the audience; unchecked on every open, never stored; focus stays on toggle (c11, c16) |
| anonymous notice | text | ⭐ השם שלכם לא יוצג לאף אחד בקהילה. צוות Nestly יכול לראות מי כתב, רק לבטיחות ואכיפה | only while checked; replaces the 6ב name notice in the form's aria-describedby (c11; Gate 1 decision 2: ⭐ text pending Afik) |
| audience | radiogroup | מי יראה את הפוסט | removed from the DOM while checked; the earlier choice returns on uncheck (c11) |
Submit while checked sends `isAnonymous:true, audience:"everyone"`; the stored audience choice is not written.
**Errors** 422 `audience_not_allowed` or any failure: the F3.1b alert (ERR-004), text and choices kept.
## Post page — Route /posts/:id · h1 "פוסט" (unchanged) · anonymous post only
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| author header | text | אנונימי | before the text, every reader; no name, avatar, link; no author data in DOM, props, test ids (c12) |
| own note | text | פרסמתם את הפוסט הזה באופן אנונימי. רק אתם רואים את ההודעה הזו | `isMine` only, after the header (c12) |
| edit, delete | button | עריכה · מחיקה | `isMine` only, as F3.1b (c12) |
| fixed line | text | הפוסט אנונימי ומוצג לכולם. אי אפשר לשנות את זה | edit form only, in place of the audience group; no checkbox (c13) |
Audience label stays "מי יראה את הפוסט: כולם". Save failure (422 included): the F3.1b save alert.
## Comment thread — on /posts/:id (amends F3.3 screen.md "Open" line, now copy)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| name notice | text | השם שלכם יוצג לכל מי שיכול לראות את התגובה | under the comment and the reply textbox, by aria-describedby; every Regular writer except below (c14) |
| author notice | text | בפוסט הזה התגובות שלכם מוצגות תחת "המחבר", בלי השם שלכם | in place of the name notice, only for the real author of an anonymous post (`isAnonymous` and `isMine`) (c14) |
Comment names unchanged: `author.name ?? "מהקהילה"`; "המחבר" only for `byAuthor` without `author` (F3.3 c15, c16). After Q7 a
stranger's view shows the full name (c15).
**Other** axe 0 at 375 px; checkbox ≥44×44 px with visible focus (c16). Professional: no new control.
