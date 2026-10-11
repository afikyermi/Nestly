# תוכנית עבודה — חידוד מערך הסוכנים לפי SRS v2.2

**מסמך חי.** מתעדכן בסוף כל שלב, באותו commit.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⏸️ נדחה בהכרעה · ⬜ לא התחיל

**חוק עבודה:** ההכרעות שלך. אני מציג אופציות וממליץ.
**חוק סנכרון:** כל שינוי במערכת מתעדכן ב-SRS. המנגנון נקבע ב-D1.

---

## איפה אנחנו עומדים

**עודכן:** 11.10.2026 · **גרסת SRS:** 2.8

- **מצב:** צוות הסוכנים וה-SRS מוכנים. עוד לא נכתבה שורת קוד. ב-11.10 הארכיטקטורה עודכנה: TypeScript, שרת Node.js משלנו, monorepo, Supabase למסד ול-Auth, ו-Drizzle. נוספה מערכת skills, שלב א: כלי תהליך, משימות SRS ו-skills מקצועיים. לפני הפיצ'ר הראשון צריך את חלק 7, CI ו-hook, ואת חלק 9, עיצוב UX/UI. מחלק 9 בוצעו 9.1 עד 9.3: הסקיצות ב-`docs/design/sketches/`, ההחלטות ב-`decisions.md`, מסמך הכיוון `docs/design/direction.md`, ו-R1 ב-`docs/design/mockups/`. ב-R1 נבחרו כיוון A, Rubik ועמודה ממורכזת עם rail, וה-tokens נמצאים ב-`docs/design/tokens.md`. R2, חמשת המסכים, מוכן לאישור.
- **המשימה הבאה:** האישור שלך ל-R2 ושם ה-Reaction, ואחריהם 9.5 (SRS 2.9). במקביל 7.0. ב-7.0 אני מכין אופציות לתיקיות שבתוך כל app, כולל תיקיות העיצוב, ולמוסכמות השמות, ואתה בוחר. 7.0 חוסם את 7.1.
- **אחריה:** 9.4 ו-9.5, ובמקביל 7.1, 7.2 ו-7.3. אחר כך 9.6 ו-9.7. חלק 8 תלוי ב-D7.
- **ממתין להכרעה שלך:**
  - OP-021: הנוסח של משפט התכנון, והאם אפשר להסתיר אותו.
  - 7.0: התיקיות בתוך כל app, ומוסכמות השמות.
  - חלק 9: **R2 מוכן לאישור** (`docs/design/mockups/r2-screens.html`, `r2-desktop.html`) · שם ה-Reaction (החלטה 12). ההמלצה: "חיבוק".
  - ספריית אימות JWT (`jose`, או `@fastify/jwt` עם JWKS): תעלה בחלק 7.
  - D7: ⏸️ נדחה.
- **פתוח, בלי הכרעה נדרשת עכשיו:** 4.11 ו-6.1 (Threat Modeling).
- **החלטות:**
  - ההכרעות מסומנות בחלקים למטה.
  - הרשומה המלאה, כולל ההחלטות מ-12.9, נמצאת ב-`decisions.md`.
  - הנקודות הפתוחות במוצר נמצאות ב-`docs/srs/appendix-b-open-points.md`.
- **עדכון:** בסוף כל שלב מעדכנים את המצב בטבלת החלק ואת הבלוק הזה.

---

## חלק 0 — הכנה ✅

| # | משימה | מצב |
|---|---|---|
| 0.1 | העתקת ה-SRS לתיקיית הפרויקט. *מאז הומר ל-markdown תחת `docs/srs/`, וה-Word נמצא ב-`docs/srs/archive/`* | ✅ |
| 0.2 | המרה מלאה לטקסט, עם כותרות, רשימות וטבלאות | ✅ |
| 0.3 | אימות שלמות ההמרה: 316 פסקאות, 122 טבלאות, ואין תוכן מוסתר | ✅ |

## חלק 1 — לימוד המסמך ✅

| # | משימה | מצב |
|---|---|---|
| 1.1 | קריאה מלאה: 18 פרקים ו-4 נספחים | ✅ |
| 1.2 | מפת מערכת: משתמשים, עולמות, אלגוריתמים, דאטה, היקף | ✅ ב-`docs/srs-analysis-HE.md`, חלק 1 |
| 1.3 | מה השתנה ממה שהנחנו, ומה נסגר מתוך שש ההכרעות החוסמות | ✅ חלק 2 |
| 1.4 | פגמים ב-SRS (8, מאומתים) | ✅ חלק 5 |

## חלק 2 — ניתוח השלכות על מערך הסוכנים ✅

| # | משימה | מצב |
|---|---|---|
| 2.1 | השפעה על כל אחד משבעת הסוכנים | ✅ חלק 3.2 |
| 2.2 | Necessity Test לסוכן ALGORITHM & DATA | ✅ חלק 3.3 |
| 2.3 | מצב סוכן AI/ML מול ה-SRS | ✅ חלק 3.4 |
| 2.4 | פערי הכיסוי מול ה-SRS | ✅ חלק 4 |
| 2.5 | קבצים אצלנו שלא מסונכרנים עם ה-SRS | ✅ חלק 6 |

## חלק 3 — הכרעות ✅ (10.10.2026)

| # | הכרעה | מה הוחלט | מצב |
|---|---|---|---|
| **D1** | כללי עדכון ה-SRS | markdown תחת `docs/srs/` הוא המקור · **היקף 1:** מוצר והחלטות טכניות ב-SRS, צוות הסוכנים ב-`decisions.md`, ועדכון לפי מבנה המסמך הקיים · **גרסאות 1:** גרסה משנית לכל קבוצת שינויים עם טבלת היסטוריה · **ייצוא Word מלא לפי בקשה** | ✅ |
| **D2** | סוכן ALGORITHM & DATA | **A** — מחזיק כללים, הערכה וביקורת. BUILDER כותב קוד | ✅ |
| **D3** | סוכן AI/ML | **1** — רדום, עם תנאי כניסה. כל רעיון והחלטת AI נרשמים במקום הרלוונטי ב-SRS | ✅ |
| **D4** | כלי QA ל-Web | לפי ההמלצה: Vitest + RTL · Playwright · axe-core · pgTAP · npm audit | ✅ |
| **D5** | פגמי ה-SRS | **א:** פרופיל ציבורי בסיסי = שם, תמונה, מספר ילדים/הריון/תכנון, Friends ו-Friends משותפים, שליחת הודעה. Open = הכול חוץ מנתוני Tracker · **ב:** OP-013–015 הושלמו על ידי אפיק · **ג:** פוסט אנונימי — כן · **ד:** איחוד השורה הכפולה | ✅ · OP-019 ו-OP-020 נסגרו (למטה) |
| **D6** | נגישות | **WCAG 2.2 AA** ל-Web. רמת ה-React Native תוגדר בתכנית המעבר | ✅ |
| **D7** | ה-Initiative הראשון | **נדחה.** תוכנית מסודרת בהמשך. נשמר התנאי: CI ו-hook לפני הפיצ'ר הראשון | ⏸️ |
| **D8** | תיקון רשומת הבדיקות | **1** — הוחלפה ברשומה נכונה לפי NFR-QA-001 | ✅ |

### נקודות המשך — נסגרו (SRS 2.4, 2.5)

| # | מה הוחלט |
|---|---|
| **OP-019** | שבעת כללי הפוסט האנונימי — לפי ההמלצה |
| **OP-020** | Professional רואה פרופיל בדיוק כמו Regular non-Friend. NFR-PRIV-005 הובהר. BR-037 ללא שינוי |
| **D5.א בולט 2** | הגנה מפני שליפה גורפת של משתמשים: NFR-SEC-006, BR-063, VAL-037, ERR-032, AC-078 |
| **OP-020, עדכון (SRS 2.5)** | **Journey Summary:** ל-non-Friend מוצגים מספר ילדים, גילאים (ב-Open בלבד) ו"בהריון" בלי פרטים. אם אין ילדים ואין הריון, מוצג משפט הומוריסטי על תכנון. "תכנון" לא מוצג כסטטוס. הנוסח פתוח: **OP-021** ⏳ |

## חלק 4 — יישור הקבצים ועדכון הסוכנים 🔄

| # | משימה | מצב |
|---|---|---|
| 4.1 | תיקון רשומת הבדיקות ב-`decisions.md`, שורת הבדיקות ב-`conventions.md` וב-`CLAUDE.md`, והבהרת כלל 0 | ✅ |
| 4.2 | **SPEC 1.1:** חיתוך ה-SRS, ציטוט מזהים, איסור למלא TBD, סימון התנהגות שלא ב-SRS, וקריטריון הרשאה | ✅ |
| 4.3 | **ORCHESTRATOR (`CLAUDE.md`):** סעיף "Product requirements — the SRS" | ✅ |
| 4.4 | **סוכן ALGORITHM & DATA** — `.claude/agents/algorithm-data.md`, שלב 5b בצינור, סוקר במקביל ל-CRITIC, תקציב 12 | ✅ |
| 4.5 | תנאי כניסה לסוכן AI/ML ומפת מיקומי AI ב-SRS — `.claude/knowledge/ai-ml-readiness.md` | ✅ |
| 4.6 | `conventions.md`: אילוצי הקומפוננטות מ-§4, Web ואחריו React Native, נגישות | ✅ |
| 4.7 | `data-model.md`: מפת ה-SRS לתכנון הסכמה. 13 שכבות הרשאה ל-RLS, עובדות שמשפיעות על הטבלאות, ונקודות פתוחות שחוסמות. מפנה ל-SRS ולא מעתיק. 66 מזהים אומתו | ✅ |
| 4.8 | `srs-review-points.md`: 32 אינווריאנטים שכל ריוויו בודק, לכל אחד מי בודק וחומרה. מחובר לשלב 9. 88 מזהים אומתו | ✅ |
| 4.9 | כלי ה-QA ב-`conventions.md`. ההגדרה של TEST ENGINEER נשארת גנרית, לפי כלל 3 | ✅ |
| 4.10 | `workflow.md`: מזהים ב-`spec.md`, עקבות SRS ב-`result.md`, ושלב 14 — עדכון ה-SRS | ✅ |
| 4.11 | רענון `open-questions.md` · `docs/overview-HE.md` · `docs/coverage-audit-HE.md` | ⬜ |

## חלק 5 — עדכון ה-SRS ✅

| # | משימה | מצב |
|---|---|---|
| 5.1 | המרה ל-markdown, פיצול לפי סעיפים, `INDEX.md`, וה-Word בארכיון. אומת: כל שורה נכתבה פעם אחת | ✅ |
| 5.2 | ייבוא עדכון ה-Word של אפיק (OP-013–015, ערוצי Notification) ותיקון פגמי D5 | ✅ |
| 5.3 | סנכרון הכרעות: OP-001 ישראל · DB ב-§13 · כלי QA ב-OP-018 · WCAG 2.2 ב-NFR-A11Y-001 | ✅ |
| 5.4 | גרסה 2.3 וטבלת היסטוריית שינויים | ✅ |
| 5.5 | **ייצוא SRS מלא ל-Word** (D1): `node tools/export-srs-docx.js`. אומת ב-round-trip: כל הטקסט, כל הטבלאות, מימין לשמאל | ✅ |
| 5.6 | `tools/build-srs-index.js` — האינדקס נבנה מה-markdown | ✅ |
| 5.7 | גרסה 2.4: כללי פוסט אנונימי, צפייה של Professional בפרופיל, הגנה מפני שליפה גורפת | ✅ |
| 5.8 | גרסה 2.5: Journey Summary. OP-021 נפתח | ✅ |
| 5.9 | גרסה 2.6: §4.1 (בידוד Features, שכבת לוגיקה בלי Web, אכיפה אוטומטית) · §11 (Vite) | ✅ |
| 5.10 | גרסה 2.7: §11 (TypeScript, שרת Node.js, monorepo) · §12 (Supabase Auth) · §13 (גישה דרך השרת עם Drizzle, זהות בכל טרנזקציה, Audit באותה טרנזקציה) | ✅ |
| 5.11 | גרסה 2.8: NFR-USAB-003, עברית בניסוח ניטרלי מגדרית | ✅ |

## חלק 6 — סגירת פערי כיסוי 🔄

| # | משימה | תלוי ב |
|---|---|---|
| 6.1 | Domains ב-`workflow.md`: Accessibility (לפי D6) · Threat Modeling | ✅ Accessibility · Threat Modeling — ⬜ (סיכון השליפה הגורפת כבר מכוסה ב-NFR-SEC-006) |
| 6.2 | אינווריאנט שלמות ה-Audit: טסט ונקודת ביקורת | ✅ נקודת ביקורת (G1, G2). הטסטים ייכתבו עם כל פיצ'ר ניהולי |
| 6.3 | פגיעויות בתלויות. נבנה בתוך CI, שלב 7.1 | — |

## חלק 7 — CI ו-hook (אושר 12.9, עוד לא נבנה) ⬜

| # | משימה |
|---|---|
| 7.0 | **שלד ה-monorepo** (npm workspaces). **כבר הוחלט:** `apps/web` (React, Vite ו-TS) · `apps/server` (Node.js, TS ו-Fastify, בשכבות route ← service ← repository) · `packages/shared` (Zod, טיפוסים וקבועים) · `apps/mobile` רק בעתיד. **להחלטה שלך:** התיקיות בתוך כל app, לפי השכבות של §4.2 ב-web, ומוסכמות השמות ⏳ |
| 7.1 | **CI.**<br>**בסיס:** typecheck (`strict`) · טסטים · lint (typescript-eslint, תלות dev הכרחית) · ביקורת תלויות.<br>**כללי TS:** איסור `any`, `@ts-ignore`, `@ts-nocheck` ו-`@ts-expect-error` · הגבלת `as`.<br>**תקרות גודל:** Page, Feature ו-Component 600 · hook 300 · service 400 · utility 300 · route בשרת 200 · service בשרת 400 · repository 400.<br>**גבולות import:** Feature לא מייבא Feature · Shared UI לא מייבא features או services · הלוגיקה ב-web בלי react-dom, window או document · shared לא מייבא מ-apps, ובלי DOM ובלי API של Node · web לא מייבא מ-server.<br>**בדיקות מסד:** לכל טבלה יש מדיניות RLS ו-FORCE RLS · אף טבלה לא בבעלות `app_server` · כל view מוגדר `security_invoker` · טסט pgTAP ששאילתה בלי זהות נכשלת · הטסטים רצים בתפקיד `app_server` |
| 7.2 | **hooks.** PreToolUse, והאות ל-`incidents.md`.<br>**לכולם:** חסימה של `git add -A` ו-`git add .`.<br>**לפי סוכן:** hooks בתוך הגדרת הסוכן, עם סקריפט אחד `.claude/hooks/guard.js`. הסקריפט נסגר כשמשהו משתבש: שגיאה מחזירה exit 2.<br>• **CRITIC:** לא קורא `notes.md`.<br>• **TEST ENGINEER:** לא קורא `apps/*/src`, חוץ מקבצי טסטים, ולא את `notes.md`. החסימה חלה בכל כלי: Read, Grep, Glob, git (diff, show, log -p, blame), ופקודות Bash שמזכירות את הנתיבים (cat, less, head, type ודומות). מותר לו לקרוא את `packages/shared`, החוזה.<br>• **BUILDER:** לא כותב קבצי טסטים.<br>**לבדיקה:** ה-hook של security-guidance. קוראים את הקוד שלו לפני שמפעילים |
| 7.3 | **בדיקת ה-hook בסביבה מבודדת לפני הפעלה**, כדי שלא ישבור את הסביבה. בודקים גם אם אפשר לחסום עריכת טסטים של TEST ENGINEER על ידי BUILDER. **במקביל, בדיקות תשתית:**<br>• גרסת Postgres: 16 ומעלה, לטובת `WITH INHERIT FALSE, SET TRUE`. אחרת NOINHERIT.<br>• ה-pooler מקבל תפקיד מותאם.<br>• ב-Supabase מופעלים מפתחות JWT אסימטריים.<br>• בחירת ספריית אימות JWT |

**הערה, לא החלטה: Storage.** נשאר TBD עד פיצ'ר המדיה. כיוון שאפיק רוצה לבחון אז: Cloudflare R2, עם buckets פרטיים, presigned URLs מהשרת וניקוי EXIF ו-GPS.

## החלטות ארכיטקטורה ✅ (11.10.2026)

ההחלטות של אפיק ("מאשר, החלטה שלי"). הפירוט ב-`decisions.md`, וההשפעה על המוצר ב-SRS 2.7.

| # | מה הוחלט | איפה |
|---|---|---|
| 0 | **כלל 0 נפתח:** כל קוד המוצר ב-TypeScript, כולל web, server ו-shared. `strict`, בלי `any` ובלי הערות השתקה. Web תחילה ו-React Native רק אחרי אישור: **ללא שינוי** | `CLAUDE.md`, `conventions.md` |
| 1 | **שרת Node.js ב-TypeScript על Fastify,** בשכבות route ← service ← repository. מחליף את Edge Functions | `conventions.md` |
| 2 | **monorepo עם npm workspaces** | `conventions.md` |
| 3 | **Supabase:** Postgres, המסד היחיד, ו-Auth. ה-Data API כבוי. Storage ו-Realtime TBD | SRS §12, §13 |
| 4 | **Drizzle דרך `app_server`,** עם זהות בכל טרנזקציה. RLS נשאר מקור האמת | `data-model.md` (20 כללים) |
| 5 | **Audit בטריגר במסד, באותה טרנזקציה.** קריאות רגישות עוברות דרך פונקציה עם Audit. המחבר האנונימי בטבלה נפרדת | `data-model.md` |
| 6 | **Zod ב-`packages/shared`** | `conventions.md` |
| 7 | **עקיבות:** מזהי FR/AC בשמות הטסטים ושורת `Implements:` ב-commit | `workflow.md` 1.2 |
| 8 | **`settings.json` ללא שינוי.** ה-Pending על JSDoc נסגר | `decisions.md` |

**מהשוואת הסוכנים מול ה-SRS, בוצע:**
- כלל "פריט פתוח לא ממולא" ב-BUILDER, ב-CRITIC וב-DATA ARCHITECT.
- descriptions שתואמים את מסלול הבאג.
- Not Ready מ-CRITIC או מ-ALGORITHM & DATA חוסם.
- תבנית pgTAP לכל Permission Key.
- NFR-ALG-001 וספי NFR-SEC-006 בכללי הביקורת.
- הנחיה להשתמש ב-SCOUT ולא בסוכני החיפוש המובנים.
- ספירה מדויקת של בדיקות CRITIC.
- ה-glossary ו-`database-decision-HE.md` עודכנו.

## סקירת הנחיות הנדסיות חיצוניות ✅ (10.10.2026)

הניתוח המלא: `docs/engineering-guidelines-review-HE.md`. ההחלטה: "בצע לפי המלצות".

| # | מה | מצב |
|---|---|---|
| A1 | **מסלול תיקון באג.** טסט שנכשל קודם, ונכתב בלי לראות את הקוד | ✅ workflow 1.1 · TEST ENGINEER 1.1 |
| A2, A3, A6, A7 | **BUILDER:** קוד שהוחלף נמחק · קריאה מלאה של מה שמשנים · לא נוגע בטסטים ולא בולע שגיאות · מסלול לבדיקה ב-Preview | ✅ BUILDER 1.1 · CRITIC 1.1 |
| A4 | **6 כללי פלטפורמה ל-Supabase**, בהם: אין service_role בקוד המוצר ו-SECURITY DEFINER רק באישור | ✅ `data-model.md` |
| A5 | **שגיאה גולמית לא מוצגת למשתמש** | ✅ `conventions.md` |
| A8, A9 | **באג סמוך נרשם ב-`debt.md`** · **ראיות ב-`result.md`** | ✅ |
| H3 | **SRS 2.6 §4.1:** בידוד Features · שכבת לוגיקה בלי Web · אכיפה אוטומטית | ✅ |
| H4 | **Vite + React SPA.** SRS §11, `decisions.md`, glossary תוקן | ✅ |

**יוחלט כשהפיצ'ר הרלוונטי מגיע:**
- container לאשף (C2)
- ~~ולידציה כמודול אחד, ו-Zod (C3)~~ — הוחלט ב-11.10: Zod ב-`packages/shared`
- לוגים עם כלל פרטיות (C4)
- חלונות קופצים (C5)
- rate limit (C6)
- skills לפרטיות ולאירוע אבטחה לפני השקה (C7)
- "להעביר, לא לשכתב" ל-React Native (C8)
- AI (C9)

## מערכת skills 🔄 (11.10.2026)

ההחלטה של אפיק: "מאשר את כל ההמלצות". הפירוט ב-`decisions.md`, והכללים ב-`learning.md` §6.

| שלב | מה | מצב |
|---|---|---|
| **א** | **כלי תהליך:** `/where`, `/feature`, `/bugfix`, `/gate`, `synthesize`, `/wrap-up`, `/decision` · **משימות:** `/srs-update`, `/srs-export` · **משותף:** `srs-lookup` · **מקצועי:** `rtl-hebrew`, `accessibility`, `security-craft`, `ux-copy-he` · שדות `skills:` בהגדרות הסוכנים · `intake.md` ב-workflow 1.3 · NFR-USAB-003 | ✅ |
| **ב** | **אחרי 7.0:** `react-web`, `fastify-api`, `drizzle-postgres`, `testing-craft` ו-`shared-contracts`, עם הגרסאות שננעלו · `rls-tests`, אחרי שיש הרצת pgTAP ב-CI (7.1) · טעינה מראש: `testing-craft` ו-`rls-tests` ל-TEST ENGINEER, `rls-tests` ו-`drizzle-postgres` ל-DATA ARCHITECT · ה-hooks (7.2) · **בדיקה ב-7.3:** האם skill עם `paths` נטען בתוך subagent | ⬜ |
| **ג** | **אחרי הפיצ'ר הראשון:** דוגמאות שמפנות לקוד אמיתי · `/srs-coverage` | ⬜ |

**לא נוצרו, בכוונה:**
- `agent-protocol`: פורמט ההחזרה נכנס ל-`CLAUDE.md`.
- `tbd-protocol`: הכלל כבר כתוב בחמש הגדרות.
- `db-identity`: העובדות נמצאות ב-`data-model.md`.

## חלק 9 — עיצוב UX/UI 🔄 (11.10.2026, לפני חלק 8)

ההחלטה של אפיק: "מאשר את גרסה 2 של התוכנית". ההחלטות ב-`decisions.md`, ברשומות מ-11.10 על עיצוב.

| # | משימה | תלוי ב | מצב |
|---|---|---|---|
| 9.1 | הסקיצות ב-`docs/design/sketches/`, בשמות קריאים, עם README: מיפוי, מה כתוב, ו-12 פערים מול ה-SRS. ההחלטות נרשמו ב-`decisions.md` | — | ✅ |
| 9.2 | `docs/design/README.md` ו-`direction.md`: עקרונות, מה לוקחים מפייסבוק, טון, תמונות, תנועה ומצבים | — | ✅ |
| 9.3 | **R1**, לוח כיוונים: שלושה כיווני צבע וגופן, ושתי פריסות דסקטופ. `docs/design/mockups/r1-directions.html` ו-`r1-desktop.html`. נבדקו ב-375 וב-1280: הניגודיות עוברת, אין גלילה אופקית, ה-focus נראה, ולכל רכיב יש שם נגיש | 9.2 | ✅ נבחרו A, Rubik ועמודה ממורכזת עם rail. `tokens.md` נכתב |
| 9.4 | **R2**: Welcome, Login, סוג חשבון, הרשמה רגילה ומקצועית, Feed (כולל תפריט "⋯") ובית, במובייל. Feed ובית גם בדסקטופ. ליד כל מסך: מה נשמר, מה חודד, ההחלטות ומה פתוח. `docs/design/mockups/r2-screens.html` ו-`r2-desktop.html`. נבדקו ב-375 וב-1280 | הכרעות R1 | ✅ ממתין לאישור |
| 9.5 | **SRS 2.9**: קישורים לסקיצות, NFR-USAB-004, NFR-USE-001, §4.2, §11, §16 ונספח B, וה-FR/VAL שהשתנו | R1, R2 | ⬜ |
| 9.6 | skill `design-system` · `rtl-hebrew`, `accessibility` ו-`ux-copy-he` בגרסה 1.1 · domain של עקביות עיצובית ב-`workflow.md` · בדיקה אחת ל-CRITIC | 7.0 | ⬜ |
| 9.7 | **יחידת רכיבים, גל 1,** במסלול Standard: tokens, גופנים, shadcn ו-Storybook. **R3**, הגלריה, היא ה-Preview. היחידה הראשונה מתוך 5 | 7.0, 7.1, 7.2 | ⬜ |

**ל-7.0:** תיקיות העיצוב `components/ui`, `components/shared`, `components/domain` ו-`styles/`, ו-`packages/shared/src/design-tokens/`.
**ל-7.1:** lint של classes (בלי כיוון פיזי, בלי ערכים שרירותיים ובלי hex), וטסט ניגודיות.

## חלק 8 — Initiative ראשון ופיצ'ר ראשון ⬜

| # | משימה | תלוי ב |
|---|---|---|
| 8.1 | קובץ Initiative | D7 |
| 8.2 | SPEC לפיצ'ר הראשון, עם מזהים מה-SRS | 4.2 |
| 8.3 | הרצת הלופ ורישום ב-`escapes.md` וב-`noise.md` | 7 |
