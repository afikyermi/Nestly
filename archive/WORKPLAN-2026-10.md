# ארכיון תוכנית העבודה — 2026-10

הועבר מ-`WORKPLAN-HE.md` ב-13.10.2026 (סשן ההרזיה, שלב 3). כלשונו, בלי עריכה. ב-WORKPLAN נשארים רק הפתוח והאחרון שהסתיים.

---

## מבלוק "איפה אנחנו עומדים" (נכון ל-12.10)

- **✅ CI ב-GitHub תוקן (PR 1):** כל 22 ההרצות האדומות נכשלו על אותו טסט יחיד ב-guard ‏(`guard.test.js:245`, ‏`NOTES~1.MD`). ‏`fold()` מנמיך אותיות רק ב-Windows, וה-runner הוא Linux. התיקון: ‏`/i` ב-`guard.js:509`. לא נמצא שום טסט אחר שנכשל רק ב-GitHub. **כלל קבוע (`workflow.md` 1.7, ‏`decisions.md`):** אין מיזוג ל-main בלי CI ירוק ב-GitHub. הרצה מקומית לא מספיקה. אני פותח PR בעצמי עם `gh`.
- **✅ פער האותיות ב-guard תוקן (PR 2, ‏`.work/guard-notes-case/`):** ארבעת הממצאים של CRITIC מ-PR 1 נסגרו ב-Windows, ‏Linux ו-macOS. ‏CRITIC מצא שלושה פערים ישנים נוספים באותו כלל (אחד medium), והם ב-`debt.md`.

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
| **D7** | ה-Initiative הראשון | **נסגר ב-11.10:** 15 Initiatives, ו-I1 עד I9 הם ה-MVP. המפה בחלק 8. נשמר התנאי: CI ו-hook לפני הפיצ'ר הראשון | ✅ |
| **D8** | תיקון רשומת הבדיקות | **1** — הוחלפה ברשומה נכונה לפי NFR-QA-001 | ✅ |

### נקודות המשך — נסגרו (SRS 2.4, 2.5)

| # | מה הוחלט |
|---|---|
| **OP-019** | שבעת כללי הפוסט האנונימי — לפי ההמלצה |
| **OP-020** | Professional רואה פרופיל בדיוק כמו Regular non-Friend. NFR-PRIV-005 הובהר. BR-037 ללא שינוי |
| **D5.א בולט 2** | הגנה מפני שליפה גורפת של משתמשים: NFR-SEC-006, BR-063, VAL-037, ERR-032, AC-078 |
| **OP-020, עדכון (SRS 2.5)** | **Journey Summary:** ל-non-Friend מוצגים מספר ילדים, גילאים (ב-Open בלבד) ו"בהריון" בלי פרטים. אם אין ילדים ואין הריון, מוצג משפט הומוריסטי על תכנון. "תכנון" לא מוצג כסטטוס. **OP-021 נסגר (SRS 2.10):** "עוד אין כאן ילדים, אז הקפה עדיין מגיע חם ☕". מתאר את ההווה, ניטרלי מגדרית, מוצג כברירת מחדל, ואפשר להסתיר אותו בהגדרות הפרטיות ✅ |


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


## חלק 7 — CI ו-hook ✅

| # | משימה |
|---|---|
| 7.0 | **שלד ה-monorepo** (npm workspaces). **כבר הוחלט:** `apps/web` (React, Vite ו-TS) · `apps/server` (Node.js, TS ו-Fastify, בשכבות route ← service ← repository) · `packages/shared` (Zod, טיפוסים וקבועים) · `apps/mobile` רק בעתיד. **הוחלט ב-11.10:** התיקיות בתוך כל app לפי השכבות של §4.2, וטסטים מחוץ ל-`src`. השמות באנגלית, לפי השמות הלוגיים ב-SRS, ובלי מזהי SRS בשמות קבצים (`decisions.md`, ‏"Repository layout and naming"). ✅ **נבנה ב-11.10:** שלושת ה-workspaces, ‏`GET /api/health`, ומתאם Vercel ב-`apps/server/api/`. ‏typecheck, טסטים ו-build עוברים. ~~**לבדוק ב-Preview הראשון:** הניתוב של `vercel.json` לפונקציה~~ ✅ אומת ב-11.10 (‏deploy ‏`3d6152b`). **הייבוא של `@nestly/shared` מתוך הפונקציה עדיין פתוח:** השרת עוד לא מייבא אותו, ולכן אין מה לבדוק. נבדק בפעם הראשונה שהשרת מייבא ממנו. אם הוא נכשל, בונים את shared ל-JS או מאגדים (bundle) את הפונקציה |
| 7.1 | ✅ **נבנה ב-11.10, ‏CRITIC: Validated with Concern** (3 low ב-`debt.md`). ‏ESLint עם כל הכללים, הגבולות והתקרות · ‏`npm run ci` · ‏`.github/workflows/ci.yml`. בדיקות המסד נכנסות עם המיגרציה הראשונה.<br>**CI.**<br>**בסיס:** typecheck (`strict`) · טסטים · lint (typescript-eslint, תלות dev הכרחית) · ביקורת תלויות.<br>**גרסת TypeScript (החלטת אפיק, 11.10):** אם typescript-eslint לא תומך ב-TypeScript 7, יורדים לגרסה העדכנית של TypeScript 6. **בפועל:** typescript-eslint תומך רק עד 6.1, ולכן ירדנו ל-6.0.3.<br>**כיבוי כללים בהערות (`eslint-disable`): חסום** (‏`noInlineConfig`, החלטת אפיק 11.10). כלל משתנה רק ב-`eslint.config.mjs`.<br>**הגנת ענף על `main`: לא עכשיו.** מחליטים כשעוברים לענף לכל פיצ'ר (החלטת אפיק 11.10).<br>**כללי TS:** איסור `any`, `@ts-ignore`, `@ts-nocheck` ו-`@ts-expect-error` · הגבלת `as`.<br>**תקרות גודל:** Page, Feature ו-Component 600 · hook 300 · service 400 · utility 300 · route בשרת 200 · service בשרת 400 · repository 400.<br>**גבולות import:** Feature לא מייבא Feature · Shared UI לא מייבא features או services · הלוגיקה ב-web בלי react-dom, window או document · shared לא מייבא מ-apps, ובלי DOM ובלי API של Node · web לא מייבא מ-server.<br>**בדיקות מסד:** לכל טבלה יש מדיניות RLS ו-FORCE RLS · אף טבלה לא בבעלות `app_server` · כל view מוגדר `security_invoker` · טסט pgTAP ששאילתה בלי זהות נכשלת · הטסטים רצים בתפקיד `app_server` |
| 7.2 | ✅ **נבנה ב-11.10, ‏CRITIC: Validated** (אחרי שני סבבים: Not Ready, ואז Validated with Concern). ‏`.claude/hooks/guard.js` עם 21 טסטים (`npm run test:tools`). **שתי שכבות:** hook ב-`settings.json` לכולם, שמזהה את הסוכן לפי `agent_type` ומפעיל גם את כללי התפקיד שלו, ו-hook בהגדרת כל סוכן. החסימה נרשמת ב-`incidents.md` פעם אחת. **נוסף על ההחלטה:** force push נחסם גם בצורות שכלל ה-deny לא תופס, ו-commit עם סוד בשינויים נחסם. הפערים שנשארו נרשמו ב-`debt.md`. ה-hook של security-guidance לא נבדק: הוא לא מותקן.<br>**hooks.** PreToolUse, והאות ל-`incidents.md`.<br>**לכולם:** חסימה של `git add -A` ו-`git add .`.<br>**לפי סוכן:** hooks בתוך הגדרת הסוכן, עם סקריפט אחד `.claude/hooks/guard.js`. הסקריפט נסגר כשמשהו משתבש: שגיאה מחזירה exit 2.<br>• **CRITIC:** לא קורא `notes.md`.<br>• **TEST ENGINEER:** לא קורא `apps/*/src` (הטסטים יושבים מחוץ ל-`src`, לפי 7.0), ולא את `notes.md`. החסימה חלה בכל כלי: Read, Grep, Glob, git (diff, show, log -p, blame), ופקודות Bash שמזכירות את הנתיבים (cat, less, head, type ודומות). מותר לו לקרוא את `packages/shared`, החוזה.<br>• **BUILDER:** לא כותב קבצי טסטים: `apps/*/tests`, ‏`packages/shared/tests`, ‏`e2e/` ו-`supabase/tests`.<br>**לבדיקה:** ה-hook של security-guidance. קוראים את הקוד שלו לפני שמפעילים |
| 7.3 | ✅ **הושלם ב-11.10.** ‏T2 עד T7 עברו על nestly-preview, וגם P1 עד P4. ה-Data API כבוי בשני הפרויקטים. **T6:** ב-`db-production` רק אתה מאשר, רק מ-`main`, ואין עקיפה למנהלים. ‏`db-preview` בלי הגבלות. **נשאר לפיצ'ר הראשון (I1):** ה-workflow של המיגרציות, מחרוזות החיבור של `app_owner` בשתי הסביבות (אתה מזין), ה-bootstrap של התפקידים ב-prod (אתה מריץ), וחיבור אחד ל-pooler לכל מופע של פונקציה (הגדרה בקוד). ההחלטות ב-`decisions.md`.<br>**חלק ה-hook בוצע ב-11.10:** נבדק בבידוד (טסטים שמזרימים JSON לסקריפט), ואחרי ההפעלה בבדיקה חיה לכל תפקיד. נמצא שה-hooks בהגדרות הסוכנים נטענו באיחור, ולכן נוספה השכבה ב-`settings.json`. **בדיקות התשתית שלמטה עדיין פתוחות.**<br>**בדיקת ה-hook בסביבה מבודדת לפני הפעלה**, כדי שלא ישבור את הסביבה. בודקים גם אם אפשר לחסום עריכת טסטים של TEST ENGINEER על ידי BUILDER. **במקביל, בדיקות תשתית:**<br>• גרסת Postgres: 16 ומעלה, לטובת `WITH INHERIT FALSE, SET TRUE`. אחרת NOINHERIT.<br>• ה-pooler מקבל תפקיד מותאם.<br>• ~~ב-Supabase מופעלים מפתחות JWT אסימטריים~~ ✅ ECC P-256 בשני הפרויקטים (11.10)<br>• ~~בחירת ספריית אימות JWT~~: הוחלט `jose` (`decisions.md`)<br>• **נתיב המיגרציות:** החיבור הישיר ל-Supabase הוא IPv6 בלבד, ו-CI אולי לא מגיע אליו. DATA ARCHITECT מחליט בין ה-pooler במצב session לבין תוסף IPv4, וזה עשוי לשנות את כלל 5.<br>• ה-pooler מקבל חיבור אחד מכל מופע של פונקציה (מגבלה של 200 לקוחות ב-Free) |
| 7.4 | ✅ **הוקם ואומת ב-11.10.** ‏`SUPABASE_URL` ו-`SUPABASE_JWKS_URL` הוגדרו ב-Vercel, עם ערך נפרד ל-Production (nestly-prod) ול-Preview (nestly-preview). שני ה-JWKS מחזירים מפתח ES256 אחד (P-256), בלי חלק פרטי. **בכוונה לא הוגדרו:** סיסמת המסד ו-`DATABASE_URL` (מחכים לתפקיד `app_server`), ומפתח service_role או secret (לעולם לא). **נשאר לבדוק:** Preview לענף, עם ענף הפיצ׳ר הראשון ב-9.7.<br>**hosting וסביבת Preview.** ✅ **הוחלט ב-11.10, שיטה C:**<br>• **האתר והשרת ב-Vercel, בפרויקט אחד:** האתר סטטי, והשרת (Fastify) רץ כ-Vercel Functions באזור fra1 (פרנקפורט). Hobby לפיתוח בלבד. Pro ‏($20 לחודש) לפני הבטא.<br>• **המסד:** Supabase Free, ‏Central EU (פרנקפורט). פרויקט אחד לייצור ואחד ל-Preview.<br>• **משימות רקע** כ-`app_jobs`, בנפרד מהשרת: pg_cron במסד, ופרויקט Vercel נפרד למשימות קוד.<br>• **Preview לכל פיצ'ר:** ענף ב-Vercel, עם האתר וה-API יחד, ופרויקט ה-Preview המשותף ב-Supabase.<br>• **תנאים:** מוני rate limit במסד · ניטור שגיאות חיצוני לפני הבטא · HEIC ב-M2 · חיבור אחד ל-pooler לכל מופע.<br>• **repo:** ‏`github.com/afikyermi/Nestly`, ציבורי (החלטה מ-11.10).<br>• **חלופה שנדחתה:** A, שרת שרץ תמיד ב-Railway. הפירוט ב-`decisions.md`, ‏"Hosting"<br>🔄 **ההקמה, 11.10:** אפיק פתח את nestly-prod ואת nestly-preview ב-Supabase (פרנקפורט), ופרויקט Vercel שמחובר ל-repo. ה-deploy הראשון נכשל, כי Vercel מזהה פונקציות רק ב-`api/` שבשורש. התיקון: ‏`api/index.ts` בשורש, שרק מייצא את המתאם מ-`apps/server/api`. ‏`api/package.json` מגדיר ESM בתחום הזה בלבד, כי שורש ה-repo נשאר CommonJS בשביל `guard.js`. ✅ **אומת ב-deploy של `3d6152b`:** האתר ב-`https://nestly-blue.vercel.app`, ‏`/api/health` מחזיר `{"status":"ok"}`, ונתיב לא קיים טוען את ה-SPA. הפונקציה רצה ב-fra1 (‏`x-vercel-id: fra1::fra1`). **סיבת הכישלון הראשון:** הפרויקט נוצר כ-"Vercel Drop" ולא היה מחובר ל-GitHub. אפיק חיבר אותו, ועכשיו כל push ל-main מפעיל deploy. מפתחות JWT אסימטריים (ECC P-256) מופעלים בשני פרויקטי Supabase |

**הערה, לא החלטה: Storage.** נשאר TBD עד פיצ'ר המדיה. כיוון שאפיק רוצה לבחון אז: Cloudflare R2, עם buckets פרטיים, presigned URLs מהשרת וניקוי EXIF ו-GPS.


## החלטות ארכיטקטורה ✅ (11.10.2026)

ההחלטות של אפיק ("מאשר, החלטה שלי"). הפירוט ב-`decisions.md`, וההשפעה על המוצר ב-SRS 2.7.

| # | מה הוחלט | איפה |
|---|---|---|
| 0 | **כלל 0 נפתח:** כל קוד המוצר ב-TypeScript, כולל web, server ו-shared. `strict`, בלי `any` ובלי הערות השתקה. Web תחילה ו-React Native רק אחרי אישור: **ללא שינוי** | `CLAUDE.md`, `conventions.md` |
| 1 | **שרת Node.js ב-TypeScript על Fastify,** בשכבות route ← service ← repository. מחליף את Edge Functions. **נפרס כ-Vercel Functions** (7.4, שיטה C) | `conventions.md` |
| 2 | **monorepo עם npm workspaces** | `conventions.md` |
| 3 | **Supabase:** Postgres, המסד היחיד, ו-Auth. ה-Data API כבוי. Storage TBD (M1). **Realtime:** polling ב-MVP, ואחר כך Supabase Realtime כאות בלבד (7.4) | SRS §12, §13 |
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


## מערכת skills — שלב א
| שלב | מה | מצב |
|---|---|---|
| **א** | **כלי תהליך:** `/where`, `/feature`, `/bugfix`, `/gate`, `synthesize`, `/wrap-up`, `/decision` · **משימות:** `/srs-update`, `/srs-export` · **משותף:** `srs-lookup` · **מקצועי:** `rtl-hebrew`, `accessibility`, `security-craft`, `ux-copy-he` · שדות `skills:` בהגדרות הסוכנים · `intake.md` ב-workflow 1.3 · NFR-USAB-003 | ✅ |


---

# הועבר מ-WORKPLAN ב-13.10.2026 (הכרעת אפיק: ממערכת למוצר)

**4.11 נסגר בלי רענון** (הקבצים ב-archive/) · **6.1 Threat Modeling, skills שלב ב ו-7.2 security-guidance נדחו לרטרו אחרי I1.**

## בלוק המצב כפי שהיה ב-13.10

**עודכן:** 13.10.2026 · **גרסת SRS:** 2.11

- **🔄 סשן תחזוקה: הרזיית מערך הסוכנים** (הכרעתך מ-13.10, ‏`decisions.md`; ‏`.work/agent-slim/`). שבעה שלבים, PR לכל שלב. **שלב 0 ✅** (PR 7): מדידה, ‏`node tools/measure-context.mjs`. ‏ORCHESTRATOR קורא 163.9K ו-BUILDER 150.0K בכל הפעלה, ו-decisions.md (91.3K) הוא הרוב. **שלב 1 ✅** (PR 8, ‏squash): ‏guard.js ‏835 שורות. ל-CRITIC אין Bash, ‏TEST ENGINEER מריץ טסט אחד, ‏guard-loader.js חוזר לגרסה של main אם הטעינה נכשלת, והחסימות נרשמות ביומן מקומי. ‏CRITIC על opus: ‏Validated with Concern אחרי Not Ready אחד. ‏PR 6 נסגר והמידע שלו הועבר. **שלב 2 ✅** (`.work/agent-slim/stage2-insights.md`): שישה דפוסים, ושורת "Git and shell" ב-conventions (‏CRITIC: ‏Validated). **שלב 3 ✅:**
  - **decisions.md** 91.3K→10.0K: אינדקס של 62 החלטות בתוקף ו-9 שהוחלפו. הרשומות המלאות ב-`decisions/2026-09.md` וב-`decisions/2026-10.md`, כלשונן, 985 מתוך 985 שורות.
  - **WORKPLAN** 37.2K→17.8K: החלקים הסגורים ב-`archive/WORKPLAN-2026-10.md`, והפתוח מתוכם נאסף ל"פתוח מחלקים שנסגרו".
  - **commits ו-push** לפי הכרעתך: ב-CLAUDE.md, ב-`/decision`, ב-`/wrap-up` וב-workflow.
  - **כפילויות CLAUDE.md מול workflow.md:** טבלת המסלולים וסוגי ההודעות נמצאים עכשיו במקום אחד. נוהל עריכת ה-SRS עבר ל-`.claude/rules/srs-editing.md`.
  - **BUILDER** קורא את data-model.md רק במשימת נתונים.
  - **מדידה:** ‏ORCHESTRATOR ‏163.9K→64.0K, ‏BUILDER ‏150.0K→51.2K.
  - **ממצא ל-open-questions.md:** קובץ סטטוס שני (10.3K), שלא נגענו בו לפי הכרעתך. הרענון שלו הוא 4.11.
- **שלב 4 ✅** (`.work/agent-slim/stage4-agents.md`): לא נמצאו בהגדרות הסוכנים ובסקילים כפילויות להסרה, מעבר לזו שהוסרה בשלב 3. הכפילויות שנשארו הוכנסו בכוונה ב-11.10. התיאורים של CRITIC ו-TEST ENGINEER חודדו, ואף סקיל לא נמחק. שלוש סתירות ישנות מול כללי העבודה מחכות להכרעתך.
- **שלב 5 ✅:** ‏`npm run check:budgets` רץ ב-CI (ב-job ‏lint). התקציבים ב-`tools/line-budgets.json`: לכל קובץ שנקרא תמיד יש תקציב בגודלו הנוכחי ועוד כ-15%. קבצי קוד עד 400 שורות, טסטים עד 800, ו-`apps/*/src` נשאר תחת ESLint. ‏guard.js חריג מתועד (900). ‏30 טסטים. ‏CRITIC: ‏Validated, וארבעה ממצאים קלים: אחד תוקן ושלושה ב-debt.
- **שלב 6 ✅** (`.work/agent-slim/stage6-verification.md`): טבלה של 23 כללים, ולכל אחד איפה הוא עכשיו. ‏CRITIC על opus: לא אבד אף כלל, והציון Validated with Concern. תוקנו שני ממצאים בינוניים: טבלת incidents עדיין אמרה "every block", ושלושה פריטים פתוחים מ-7.1 ו-7.2 (שער ה-RLS ב-CI, הגנת ענף, security-guidance) לא הועברו. נוספו לפתוח. גם ארבעה ממצאים קלים טופלו. **מדידה מול שלב 0:** ‏ORCHESTRATOR 163.9K→65.9K ‏(‎−60%), ‏BUILDER 150.0K→51.2K ‏(‎−66%), ושאר התפקידים +1% עד +5%.
- **✅ סשן ההרזיה נסגר** (`.work/agent-slim/result.md`). גם `guard-allowlist` נסגר: הוחלף בשלב 1 (`.work/guard-allowlist/result.md`).
- **הכרעותיך מ-13.10 על הפתוחים** (`decisions.md`): ‏(1) כלל ה-`.env` ב-guard יבדוק רק ארגומנטים שהם נתיב ויעדי הפניה. בעבודה: `.work/guard-env-paths/`, במסלול bug-fix עם CRITIC על opus. אם יחזור Not Ready, השינוי לא ימוזג ויירשם ב-debt · ‏(2) שלוש הסתירות יושרו: DATA ARCHITECT 1.2, ‏workflow 1.10, ‏`/wrap-up` 1.2 · ‏(3) F5: ‏`/wrap-up` מעביר את יומן החסימות ל-`.claude/logs/archive/<date>-<slug>/` בסוף כל משימה.
- **🔄 הבא: I1** (`.work/_initiatives/I1-accounts-access.md`), במסלול Elevated. שער ה-RLS ב-CI נכנס עם המיגרציה הראשונה. **עוצרים לפני Gate 1, ו-`spec.md` נשלח אליך.**

- **מצב:** חלק 7 הושלם (7.0 עד 7.4). מחלק 9 הושלמו 9.1 עד 9.6. 9.7, יחידת הרכיבים, הושלמה: ששת החלקים a עד f מוזגו, כל אחד עבר CRITIC ו-TEST ENGINEER, וה-Preview של הגלריה עבר (12.10). **כללי העבודה מ-11.10:** אני עובר את Gate 1, ‏Gate 2 וה-Preview, ומחליט את מה שלא שמור לך. כל החלטה נרשמת ב-`decisions.md`. השמורים לך: סודות, prod, החלטות בלתי הפיכות או שינוי מהותי ב-SRS, ונקודות של משפט, קטינים או כסף (`CLAUDE.md`, ‏"Decision authority").
- **✅ ההכנות ל-I1 הושלמו (PR 4, ‏`.work/i1-prep/`):** התפקידים `app_owner`, ‏`app_server` ו-`app_jobs` קיימים ב-preview וב-prod (בדיקה: 3 שורות `ok` בשניהם). הסוד `APP_OWNER_DATABASE_URL` נמצא ב-`db-preview` וב-`db-production`, ו-`db-check` עבר בשתי הסביבות. ‏Vercel בונה רק את `main` וענפים עם PR פתוח.
- **המשימה הבאה:** ‏**I1** (`.work/_initiatives/I1-accounts-access.md`). לפניו, באותו סשן: תיקון כלל ה-`.env` ב-guard.
- **Preview:**
  - האתר: [nestly-blue.vercel.app](https://nestly-blue.vercel.app). ‏`/api/health` עובד, ועוד אין מסך מוצר.
  - **גלריית הרכיבים** מקומית בלבד: `npm run build-storybook` ואז `npm run serve:storybook`, בכתובת `http://127.0.0.1:6007`.
  - **Supabase בפרנקפורט:** פרויקט prod הוא `cihugbwafnaujsqabgyp`, ופרויקט preview הוא `xmihorrkegrdlbhpktny`. ה-Data API כבוי בשניהם. הפרויקטים הישנים באסיה חסומים.
- **ממתין לך (סודות ופעולות):**
  1. **קובץ יומן מקומי ישן:** ‏`nestly/.live/events.jsonl` מכיל טקסט מפרומפטים, והוא לא נכנס ל-git. מחיקה היא פעולה הרסנית, ולכן ההחלטה שלך. אחרי שהוא נמחק, אפשר להסיר גם את השורה `.live/` מ-`.gitignore`.
  2. **מחיקת ענפים מרוחקים שמוזגו** (ה-guard חוסם את זה לסוכנים): ‏`ui-wave-1/part-a` עד `part-e` ו-`chore/i1-prep`. הפקודה בהודעת הסיום של 12.10.
  3. **ב-I1, כשיידרש:** מחרוזת החיבור של `app_server` ל-Vercel (‏`DATABASE_URL`, ‏transaction pooler, פורט 6543). הסיסמה כבר קיימת אצלך.
- **ממתין להכרעה שלך:** אין. שלוש הנקודות הוכרעו ב-13.10 (למעלה).
- **לקחים מהשיחה:** בזיכרון (`orchestration-lessons`) וב-`noise.md`.
  - לבדוק את ה-SRS לפני שמעבירים הלאה שמשהו "TBD" (הטעות עם FR-AUTH-003).
  - להריץ CI מלא אחרי כל commit של TEST ENGINEER.
  - להריץ סוכנים בזה אחר זה, לא במקביל על אותו עץ.
  - כל שינוי ב-guard עובר CRITIC על opus.
- **פתוח, בלי הכרעה נדרשת עכשיו:**
  - 4.11 ו-6.1 (Threat Modeling).
  - לבדוק אחרי יום עמוס אם בניות ש-Vercel דילג עליהן עדיין נספרות במגבלה היומית. אם כן, עוברים ל-`git.deploymentEnabled`.
  - החלטות המדיה M1 עד M6: לפני I5.
  - **תזכורת: לתכנן תקציב לביקורת משפטית של תנאי השימוש ומדיניות הפרטיות, לפני I9.**
- **החלטות:**
  - ההכרעות מסומנות בחלקים למטה.
  - הרשומה המלאה, כולל ההחלטות מ-12.9, נמצאת ב-`decisions.md`.
  - הנקודות הפתוחות במוצר נמצאות ב-`docs/srs/appendix-b-open-points.md`.
- **עדכון:** בסוף כל שלב מעדכנים את המצב בטבלת החלק ואת הבלוק הזה.


## חלק 4 — יישור הקבצים ועדכון הסוכנים 🔄

| # | משימה | מצב |
|---|---|---|
| 4.11 | רענון `open-questions.md` · `docs/overview-HE.md` · `docs/coverage-audit-HE.md` | ⬜ |

## חלק 6 — סגירת פערי כיסוי 🔄

| # | משימה | תלוי ב |
|---|---|---|
| 6.1 | Domains ב-`workflow.md`: Accessibility (לפי D6) · Threat Modeling | ✅ Accessibility · Threat Modeling — ⬜ (סיכון השליפה הגורפת כבר מכוסה ב-NFR-SEC-006) |
| 6.2 | אינווריאנט שלמות ה-Audit: טסט ונקודת ביקורת | ✅ נקודת ביקורת (G1, G2). הטסטים ייכתבו עם כל פיצ'ר ניהולי |
| 6.3 | פגיעויות בתלויות. נבנה בתוך CI, שלב 7.1 | — |

## מערכת skills 🔄 (11.10.2026)

ההחלטה של אפיק: "מאשר את כל ההמלצות". הפירוט ב-`decisions.md`, והכללים ב-`learning.md` §6.

| שלב | מה | מצב |
|---|---|---|
| **ב** | **אחרי 7.0:** `react-web`, `fastify-api`, `drizzle-postgres`, `testing-craft` ו-`shared-contracts`, עם הגרסאות שננעלו · `rls-tests`, אחרי שיש הרצת pgTAP ב-CI (7.1) · טעינה מראש: `testing-craft` ו-`rls-tests` ל-TEST ENGINEER, `rls-tests` ו-`drizzle-postgres` ל-DATA ARCHITECT · ה-hooks (7.2) · **בדיקה ב-7.3:** האם skill עם `paths` נטען בתוך subagent | ⬜ |
| **ג** | **אחרי הפיצ'ר הראשון:** דוגמאות שמפנות לקוד אמיתי · `/srs-coverage` | ⬜ |

**לא נוצרו, בכוונה:**
- `agent-protocol`: פורמט ההחזרה נכנס ל-`CLAUDE.md`.
- `tbd-protocol`: הכלל כבר כתוב בחמש הגדרות.
- `db-identity`: העובדות נמצאות ב-`data-model.md`.

