# notes — medical-hotlines (F3.8)

**Approach**  `MEDICAL_HOTLINES` (packages/shared/src/constants/medical-hotlines.ts) is the only home of names/numbers; the page
(apps/web/src/pages/medical-hotlines/) maps it to `tel:` links (no onClick, no request, no storage); `PATHS.medicalHotlines` is
protected; menu item between "תנאים ופרטיות" and "שאלות לשחזור סיסמה".
**Decisions**  `href` is `tel:` + the number exactly (`tel:*2700`, nothing encoded: spec c2). List in shared (portable to Native). Link name "<label>, <number>"; number in its own `dir="ltr"` span. The h1 has
`data-initial-focus` (the drawer returns focus there) and is focused on in-app arrival only; a direct load keeps the skip link first.
FocusOnNavigation now ignores an overlay's own history entry (F3.9); it still focuses `main` on every real navigation.
**Deviations**  none left (the first build shipped MDA only; the four HMO rows followed once verified).
**Deliberately not done**  PG-049 rule-2 link (Q1: owner part adds it; the path is in PATHS). Hours: all five are 24/7 (Q3).
**Sources** (verified by ORCHESTRATOR on the official sites, 19.10.2026; this agent's fetch was refused by permissions)
- מד"א 101: SRS FR-MENU-002 (Afik 16.10) and spec c1.
- כללית *2700, nurse line 24/7: https://www.clalit.co.il/he/info/Pages/nurse_center.aspx
- לאומית *507, "מוקד ייעוץ רפואי/אחיות" 24/7: https://www.leumit.co.il/heb/remotemedicalservices/remotemed/emergencyconsults/ ,
  https://www.leumit.co.il/contact-us/ — a nurse line, so screen.md's label "לאומית — מוקד אחיות".
- מאוחדת *3833: no nurse line on the official contact page → DR-1 label "מאוחדת — מוקד טלפוני 24/7":
  https://www.meuhedet.co.il/מידע-ללקוח/יצירת-קשר-מאוחדת/
- מכבי *3555, nurse line 24/7: https://www.maccabi4u.co.il/eligibilites/4650/
**Evidence**  typecheck, lint, check:budgets, check:stories green. Web unit: 1104/1105; the one failure is
tests/app/access-decision.test.ts "[F1.2 c6] the protected routes are exactly …", which lists PATHS exactly — FINDING to TEST ENGINEER
(c6 adds a path; that list must gain it). Known gap: no unit/e2e of the page from me (TEST ENGINEER).
**Neighbouring**  none.
