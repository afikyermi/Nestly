# notes — medical-hotlines (F3.8)

**Approach**  `MEDICAL_HOTLINES` (packages/shared/src/constants/medical-hotlines.ts) is the only home of names/numbers; the page
(apps/web/src/pages/medical-hotlines/) maps it to `tel:` links (no onClick, no request, no storage); `PATHS.medicalHotlines` is
protected; menu item between "תנאים ופרטיות" and "שאלות לשחזור סיסמה".
**Decisions**  List in shared (portable to Native). Link name "<label>, <number>"; number in its own `dir="ltr"` span. The h1 has
`data-initial-focus` (the drawer returns focus there) and is focused on in-app arrival only; a direct load keeps the skip link first.
FocusOnNavigation now ignores an overlay's own history entry (F3.9); it still focuses `main` on every real navigation.
**Deviations**  The list holds MDA only (see Uncertain): c1 (five entries) is not met in this build.
**Deliberately not done**  PG-049 rule-2 link (Q1: owner part adds it; the path is in PATHS). Opening hours (Q3: none verified).
**Uncertain**  BLOCKER, numbers. MDA 101: source = SRS FR-MENU-002 (Afik 16.10) and spec c1, 19.10.2026; not re-checked on mdais.org.
Clalit, Leumit, Meuhedet, Maccabi: NOT VERIFIED. Fetching the official sites from this agent was refused by the permission system
(19.10.2026), and spec c1 forbids memory or search snippets, so the four rows are not built. To finish: someone with web access opens
each HMO's official site, records URL + date + the nurse-line name (DR-1 label if none), and adds one line per HMO to the array.
**Evidence**  typecheck, lint, check:budgets, check:stories green. Web unit: 1104/1105; the one failure is
tests/app/access-decision.test.ts "[F1.2 c6] the protected routes are exactly …", which lists PATHS exactly — FINDING to TEST ENGINEER
(c6 adds a path; that list must gain it). Known gap: no unit/e2e of the page from me (TEST ENGINEER).
**Neighbouring**  none.
