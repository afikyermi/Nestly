# professional-posting — screen contract
Annex of spec.md c8-c13. Copy per ux-copy-he (impersonal, gender-neutral). One new text: "הפוסט יוצג לכולם" (D3).
Everything else is referenced: feed-composer screen.md, F3.1b, F3.2b, F3.3, ERR-004, "מהקהילה". No "בעל מקצוע"
anywhere; the I11 tag "יועץ · <תחום>" is not built here. direction.md "דפוסי אינטראקציה" followed: writing in place,
always-open field.

## Feed — Route /feed · h1 "הפיד" · Landmarks main, form "כתיבת פוסט" (Professional; only what differs from feed-composer)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| composer | form | כתיבת פוסט | same place and behaviour as feed-composer; aria-describedby = the fixed line (c8) |
| text | textbox | מה תרצו לשתף? | as feed-composer (c8) |
| fixed line | text | הפוסט יוצג לכולם | in place of the audience group; shown when the options are revealed (c8, D3) |
| submit | button | פרסום | as feed-composer; sends audience "everyone", stageTag null, no isAnonymous (c9) |
| anonymous, audience, tag, name notice | — | — | never in the DOM for a Professional (c8; FR-FEED-005, DR-2, D2, DR-3) |
| new card | article | מהקהילה | header text for a Professional's post (DR-3 ⭐); audience "כולם" (c9) |
**States** checking: as feed-composer · error: the F3.1b alert (ERR-004) · success: "הפוסט פורסם", new card first (c9)
· DR-1 ⭐: the list as for a Regular, no placeholder; cards with "לייק" and "תגובות" (c12). Without DR-1: the
placeholder stays below the form.

## Own post page — Route /posts/:id · h1 "פוסט" (unchanged)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| edit, delete | button | עריכה · מחיקה | author only (isMine), as F3.1b (c11) |
| fixed line | text | הפוסט יוצג לכולם | edit form only, in place of the audience group; no tag group (c11) |
Audience label "מי יראה את הפוסט: כולם"; no tag line.

## Comment thread (DR-1 only) — on /posts/:id
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| name notice | — | — | absent for a Professional writer (DR-3); comment and reply composers otherwise as F3.3/F3.4 (c12) |
A Professional's comment shows "מהקהילה" (author.name null).

**Other** axe 0 at 375 and 1024; "פרסום" ≥44×44 px (c13). /posts/new → /feed, focus on "מה תרצו לשתף?" (c10).
