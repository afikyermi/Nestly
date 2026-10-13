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
