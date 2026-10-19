# F3.8 medical-hotlines — screen contract
Annex of spec.md c2-c7. Copy per ux-copy-he (gender-neutral). Referenced, not rewritten: the drawer, its other items and their order (F2.5).
## Hotlines — Route /medical-hotlines · Title (h1) "פנייה למוקד רפואי" · Landmarks `main`; one h1, no h2
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| disclaimer | paragraph | לא תחליף לטיפול רפואי. במצב חירום — 101 | verbatim (FR-MENU-002); below the h1, above the list; plain text, not a link (c3) |
| list | list | מוקדי רפואה | `ul`, five `li`, order of c1 |
| MDA | link | מד"א, 101 | `href="tel:101"`; first; visible text "מד"א" and "101" (c2) |
| Clalit | link | כללית — מוקד אחיות, N | N = the verified number; `href="tel:N"` (c1, c2) |
| Leumit | link | לאומית — מוקד אחיות, N | as above |
| Meuhedet | link | מאוחדת — מוקד אחיות, N | as above |
| Maccabi | link | מכבי — מוקד אחיות, N | as above |
| number | text | N | inside each link, `dir="ltr"`, so `*NNNN` reads correctly (c7) |
**DR-1 fallback row (spec Open DR-1, decided):** an HMO whose official site lists no nurse line carries its own label instead of "מוקד אחיות":
"<HMO> — " + what the official site calls that 24/7 medical or call-centre line, then ", N" (same role, href and number rules).
Each link: ≥ 44×44 px, visible focus, a phone icon `aria-hidden`; the whole row is the link. No `onClick`, no other control on the page (c4).
## Menu — changed: one new item (amends F2.5 c1)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| hotlines item | link | פנייה למוקד רפואי | after "תנאים ופרטיות", before "שאלות לשחזור סיסמה"; `aria-current="page"` on the route; closes the drawer, focus to h1 (c5) |
**States** empty: none (fixed list) · loading: none (no request) · error: none · success/status: none (a tap hands off to the phone; nothing is shown or saved).
**Other** axe 0 at 360 and 1280 px; one column (c7). No placeholder number is ever built (spec c1).
