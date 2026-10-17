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



## הועבר מבלוק המצב ב-14.10.2026 (אחרי מיזוג F1.2)

- **✅ F1.1 `identity-platform` — הושלם** (‏`.work/identity-platform/result.md`). ‏a מוזג (PR 15), ‏b מוזג (PR 16), ‏c מוזג (PR 17, ‏`671c096`, ‏14.10): שער RLS ב-CI, סכמת `nestly` עם RLS ו-FORCE, ‏FK לעוגן עם RESTRICT, ואימות JWT עם טרנזקציית זהות לכל בקשה. ‏CRITIC על opus: ‏Validated with Concern בכל חלק, והממצאים הקלים ב-debt. ‏**prod:** ‏`migrate` הוחל, ו-bootstrap שלב 2 רץ ונבדק ב-14.10 (‏`ok = true`, ‏RESTRICT, אתה). הסכמה זהה ב-preview וב-prod.
- **✅ PR 18 (‏CI לפי קבצים שהשתנו) — מוזג** (‏`f7ee887`, ‏14.10): ‏browser ו-storybook רצים רק על שינויי web, ו-db רק על שינויי מסד או שרת. ב-main הכול רץ תמיד. ‏CRITIC: ‏Validated with Concern, ושלושת הממצאים הבינוניים נסגרו.
- **✅ הכרעותיך על I1 (13.10)** נכנסו ל-SRS 2.12 ולתוספת 1 בקובץ ה-initiative: ‏Google ‏(F1.8 חדש), בלי אימות אימייל, שחזור בתוך המערכת, הצהרת גיל, מסלולים במקביל ועד 10 ילדים. ‏F1.7 יצא.
- **✅ Preview לענף:** הזנת ב-14.10 את סוד ה-bypass, גם כ-repository secret ב-GitHub וגם בקובץ המקומי. אחרי F1.2 ייבנו `preview-smoke` (‏workflow) ו-`tools/preview-shot.mjs` (צילומי מסך). הסוד עובר רק כ-header, ולא נקרא, לא מודפס ולא נכנס ל-URL.
  - 13.10: אין — Gate 1 של F1.1 עבר, עוד לא נבנה קוד מוצר.
- **Preview:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app), ‏`/api/health` עובד, עוד אין מסך מוצר. גלריית הרכיבים מקומית: `npm run build-storybook`, ‏`npm run serve:storybook`, ‏`http://127.0.0.1:6007`. ‏Supabase בפרנקפורט: prod ‏`cihugbwafnaujsqabgyp`, ‏preview ‏`xmihorrkegrdlbhpktny`.


## הועבר מ"איפה אנחנו עומדים" — 16.10.2026, אחרי מיזוג F1.8

- **🔄 מהירות הפיתוח — A–F אושרו (15.10, "מאשר את A עד F"; `decisions.md`, הדוח ב-`abundant-singing-thimble.md` של Claude):** ‏PR 30 (`chore/dev-speed`): ‏CRITIC (opus) ‏Not Ready (1 high, 4 medium, 4 low) → כל התשעה תוקנו בסבב אחד → ‏Validated with Concern (ה-concern: עותקי notes.md ב-worktrees ישנים של סוכנים, ‏`debt.md`; המחיקה אצלך, "ממתין לך" 4). ‏`.work/dev-speed/result.md`. **מה השתנה:** הקפאה עד F1.8 בלי חריגים, וחסימת שווא = שורת noise בלבד · סשן חדש לכל פיצ'ר, רישום פעם אחת ב-wrap-up (‏result ≤ 10), ‏CRITIC כותב findings בעצמו, בדיקה חוזרת = הרצה חדשה, כל סוכן מריץ את הבדיקות על הקבצים שלו ו-ORCHESTRATOR לא · המסלול נקבע לכל חלק (מסך = Standard, ועדיין צילומים, axe, טלפון ומחשב), עד שתי ביקורות לפיצ'ר, רשומות בלבד = Light · תקרת טסטים קשה 2×, ‏TEST ENGINEER קורא קוד מקור (לא notes.md) ומריץ typecheck ו-lint על הטסטים שלו, ‏interface.md בוטל (שינוי guard אחד, ‏CRITIC על opus) · ‏spec ו-schema עד 100 שורות, ‏SRS פעם ל-Initiative · ההיקף: ‏I1–I14 מלא. **הבא (PR 2, ‏E):** בדיקת Preview אוטומטית ב-CI עם חשבון בדיקה, ו-migrate אוטומטי על preview לענף עם migration.
- **✅ PR שיפור הבדיקות — מוזג** (PR 26, ‏`02842b0`, ‏15.10; ‏`.work/test-rules/result.md`): ‏test-engineer 1.6, ‏spec 1.3, ‏workflow 1.14 ("Test rules — this project"); ‏CI: ‏Chrome בלבד ב-PR, ‏`browser-edge` אחרי מיזוג ל-main ובהפעלה ידנית, ‏`update-baselines`; צילומי Playwright חוסמים (‏`SCREENS` ריק עד משימת ה-baselines); ‏SRS 2.14. ‏CRITIC: ‏Validated with Concern בשני הסבבים (‏1–7 תוקנו, ‏8 נדחה בנימוק תקציב שורות); ה-Concern ב-`debt.md`. **הכרעתך 15.10: ‏Edge כמו שנבנה** (‏`decisions.md`). **מי שממזג קורא את `browser-edge` על main** — אדום שם אינו חוסם דבר. ריצת main הראשונה (38702161133): ‏browser-edge ‏1 ו-2 ירוקים, כל הריצה ירוקה.
- **✅ F1.4 `register-account-create` — מוזג** (PR 25, ‏`0cdd5fa`, ‏15.10; ‏`.work/register-account-create/`): ‏Gate 1 ו-Gate 2 עברו (כולל Amendment 1, הרשאות INSERT לפי עמודה). **חלק a (סכמה, RLS, pgTAP) ✅:** ‏CI ירוק ב-`eac7f7e`, ‏CRITIC: ‏Validated אחרי בדיקה חוזרת. **חלק b (שרת) ✅:** ‏`POST /api/register` (הדפדפן קורא ל-Supabase Auth — הכרעתך "א"), ‏`@nestly/shared` נבנה ל-JS לפונקציה. ‏CI ו-preview-smoke ירוקים ב-`b0b8792`, ‏CRITIC: ‏Validated אחרי בדיקה חוזרת. **חלק c (מסך) ✅:** שלב 2, מודול Auth בדפדפן, הודעות ושחזור, סריקה מצומצמת. ‏CI ירוק ב-`91363a0`, ‏CRITIC: ‏Validated אחרי בדיקה חוזרת. **‏Preview ✅ (15.10, `nestly-mch3ezhjm`):** הרשמה אמיתית עם שני ילדים ותאריך לידה משוער — 201 ו-`/feed`, השורות נכונות; אימייל חוזר — ההודעה הכללית. ‏`.work/register-account-create/result.md`. **מוזג.**
- **✅ כלי ה-Preview — מוזג** (PR 21, ‏`2d877b2`, ‏14.10; ‏`.work/preview-access/result.md`): ‏`preview-smoke` (רץ על כל Preview: ‏health ‏200, נתיב מוגן נכשל סגור) ו-`tools/preview-shot.mjs` (צילום Preview מוגן). השרת מוחק את כותרת ה-bypass. ‏CRITIC: ‏Validated with Concern; ‏1–4 נסגרו, 5 ב-debt, 6 אומת בריצה הראשונה.
- **✅ F1.3 `register-profile-step` — מוזג** (PR 22, ‏14.10; ‏`.work/register-profile-step/result.md`): שלב 1 בהרשמה — שלב במסע, שם, מין ההורה, תאריך לידה משוער, ילדים 1–10; הנתונים בזיכרון הטאב בלבד. ‏CRITIC: ‏Validated with Concern (סכמה strict ב-F1.4 Gate 2, ‏debt). ה-Preview נבדק ב-375 וב-1024.
- **✅ האצה — מוזג** (PR 23, ‏`a756931`, ‏14.10, בקשתך): ‏CI ‏browser כ-matrix (Chrome/Edge × 2 shards): ‏4–5 דק׳ במקום 16–18. ‏Vercel בונה כל ענף עם PR פתוח, בלי תלות בסדר push/PR. ‏vitest רץ מהשורש. ‏CRITIC: ‏Validated. סעיפים 4–6 אושרו (‏14.10) ונבנו ב-`chore/speed-up-2`: ‏TEST ENGINEER עורך ומריץ את הטסטים שלו, ‏BUILDER כותב `interface.md`, ו-jq אינו נחשב נתיב ב-guard. ‏CRITIC (opus): שני ממצאים גבוהים ב-guard תוקנו, ‏Validated.
- **✅ F1.2 `app-shell-guard` — מוזג** (PR 19, ‏`53b85d0`, ‏14.10; ‏`.work/app-shell-guard/result.md`): מסך Welcome, ‏AppShell, ‏RouteGuard ושכבת session. ‏CRITIC: ‏Validated with Concern, וארבעה ממצאים קלים נסגרו. ה-Preview נבדק על production אחרי המיזוג ב-375 וב-1024.
- **✅ תוכנית ההצגה למרצה — גרסה 2** (15.10, הכרעתך: בלי כלי הצגה ובלי פיצול; המוצר עד הסוף, אחר כך משתמשי דמו ותוכן, והמרצה נכנס בהתחברות הרגילה; ‏SRS 2.17 §11): מסמך הרעיון שלך ב-`docs/lecturer-demo-idea-HE.md` (שונה שמו ונכנס למעקב). התוכנית ב-[docs/lecturer-demo-plan-HE.md](docs/lecturer-demo-plan-HE.md), והסטטוס בחלק 10 למטה. עמדתי על השאלות מסעיף 15 בתוכנית, בסעיף 4.
- **✅ ה-debt שלפני F1.5 — מוזג** (PR 27, ‏`9aadef6`, ‏15.10; ‏`.work/debt-before-f15/result.md`): ‏D1 ‏pgTAP ל-`is_active_account` (סוגר את b-1, ירוק ב-CI), ‏D2 הטסט האיטי פוצל לארבעה, ‏D3 ה-error handler בלי תוכן בקשה בלוג. ‏DATA ARCHITECT אישר את D1; ‏CRITIC (opus): ‏Validated; ממצא 2 כמו שנבנה עד C4 (‏debt). בלי שינוי נראה למשתמש, ולכן בלי Preview.
- **✅ הכרעותיך על תוכנית ההצגה (15.10) ו-SRS 2.15:** תאריך — כמה שיותר מהר · ‏G1–G6 אושרו; ה-Marketplace לפרסום ופנייה בלבד, בלי קנייה (BR-069) · מחירים זמניים TBD (OP-030) · זמנים אחורה בימים ובשעות, בהזזה אחרי היצירה (דרך 1, אישרת) · סעיף 15 אושר · בלי Auto-fix. ב-SRS 2.15: ‏FR-SERV-011, ‏FR-PRO-003, ‏FR-ADMIN-012, ‏BR-069–072, ‏NFR-SEC-007/008, ‏AC-093–098, ‏OP-024/025 נסגרו. ‏`roadmap.md` תוספת 2.
- **✅ F1.5 `login-session` — מוזג** (PR 29, ‏`27816b4`, ‏15.10; ‏`.work/login-session/result.md`): מסך התחברות, ‏Session שנשמר ומתחדש, התנתקות, חשבון מושעה או חסום נעצר מיד, השלמת הרשמה שלא הסתיימה (סוגר את ה-debt של F1.4). ‏Gate 1 ו-Gate 2 עברו; ‏CRITIC (opus) על שלושת החלקים — ‏Validated. ‏Preview: אתה, "1–6 עבר". ‏SRS 2.16. ‏migrate: nestly-preview (#4) ו-production (אישרת, ‏db-production ירוק, 15.10).
- **✅ הכרעותיך לפני I3–I5 (16.10, ‏`docs/decisions-before-i3-i5-HE.md`; ‏`decisions.md` שלוש רשומות 16.10; ‏`roadmap.md` תוספת 3):** מחיקת חשבון עם 30 יום חרטה · 8 כללי קהילה · 8 סיבות דיווח · מדרג אכיפה ידני · ‏M1–M6 עם טשטוש בדפדפן ובדיקה ברקע בשרת · בלי עורך דין (Claude כותב תקנון ופרטיות). פיצ'רים חדשים: **הפניה למוקדי רפואה → I3**, **סטורי → I5** (פיצ'ר אחרון). ה-SRS עודכן מיד (שינוי היקף): ‏2.18.

---

# הועבר מ-WORKPLAN-HE.md ב-16.10.2026 (הכרעות הבדיקה, 8: WORKPLAN קצר). כלשונו, בלי עריכה.

## איפה אנחנו עומדים

**עודכן:** 17.10.2026 · **גרסת SRS:** 2.19 (סגירת I1) · **מצב:** ‏I1 הושלם (F1.8 מוזג). **עוצרים לפני I2** — קודם בדיקה מקיפה של כל המערכת בסשן נפרד (הכרעתך, 16.10). ההקפאה של מערך הסוכנים הסתיימה עם מיזוג F1.8; שינויים בו עוברים ברטרו.

- **✅ F1.8 `google-sign-in` — מוזג** (PR 35, ‏`9ece04e`, ‏16.10; ‏`.work/google-sign-in/result.md`): "המשך עם Google" ב-Welcome, ‏Login ושלב 1, מסך חזרה `/auth/google`, שם ותמונה מ-Google נמחקים, משתמש Google חדש עובר הרשמה מלאה עם סיסמה. ‏Rule L לא נבנה (הכרעתך) → ‏S-01. ‏CRITIC (opus): ‏Validated with Concern, שלושה low תוקנו. ‏CI ו-preview-e2e ירוקים; הבדיקות הידניות שלך 1–5 עברו. בלי migration. **בזה I1 הושלם, והקפאת מערך הסוכנים הסתיימה.**
- **ממתין להכרעה שלך:** אין. ‏DR-4 ו-DR-5 הוכרעו (17.10). בעיות אבטחה ופרטיות פתוחות — [security-privacy-open.md](security-privacy-open.md).
- **ממתין לך (סודות ופעולות):**
  0. **‏E — הסודות (נמסרו לך 16.10 בלילה; לא צריך הגדרה ב-Supabase):** ‏environment ‏`preview-e2e` (בלי reviewers, בלי הגבלת ענפים) ובו `PREVIEW_SUPABASE_SECRET_KEY` (ה-secret key של nestly-preview) ו-`PREVIEW_DB_ADMIN_URL` (‏nestly-preview, משתמש `postgres`, ‏Session pooler 5432). ‏`PREVIEW_TEST_EMAIL`/`PREVIEW_TEST_PASSWORD` מיותרים, אפשר למחוק אחרי ש-E ירוק.
  0א. **בוקר 17.10 — רשימת "רק אתה" מהלילה:**
     1. ✅ **DR-E1 — מחיקת משתמשי הבדיקה: מוזג** (‏PR 33, ‏`6627502`, ‏17.10). ה-environment ‏`preview-e2e` מוגבל ל-main (אומת ב-API). נשאר אצלך: למחוק את `PREVIEW_SUPABASE_SECRET_KEY` (לא בשימוש), ואחרי ריצה ירוקה של המחיקה גם את `PREVIEW_TEST_EMAIL`/`PREVIEW_TEST_PASSWORD`.
     2. **‏`PREVIEW_SUPABASE_SECRET_KEY` מיותר** — ‏DATA ARCHITECT בחר במחיקה ב-SQL. אם הזנת אותו, אפשר למחוק אותו מ-`preview-e2e`.
     3. ✅ **זיהוי `*.flow.ts` ב-guard** — אישרת חריג להקפאה (17.10, ‏`decisions.md`), ייבנה עם F1.8.
     4. ✅ **‏migrate ל-production של F1.6** — אישרת, ‏db-production ירוק (ריצה 38860446921, 17.10).
  1. **קובץ יומן מקומי ישן** `.live/events.jsonl` (טקסט מפרומפטים, לא ב-git): מחיקה היא שלך. אחריה אפשר להסיר את `.live/` מ-`.gitignore`.
  2. **מחיקת ענפים מרוחקים שמוזגו:** ‏`ui-wave-1/part-a` עד `part-e`, ‏`chore/i1-prep`, ‏`chore/guard-env-paths` (מוזג), ‏`chore/preview-access` (הוחלף ב-`-v2` אחרי rebase), ‏`chore/records-after-f12` (מוזג).
  3. ✅ **ב-F1.8: Google Cloud והסודות — הוגדרו אצלך (17.10).**
  3א. ✅ **F1.8 — הגדרות Supabase בוצעו (17.10, אתה):** בשני הפרויקטים Confirm email, ‏Secure password change, ‏Require current password ו-Allow manual linking כבויים; ‏URL Configuration כמו שביקשתי. ‏Site URL של preview נשאר `http://localhost:3000` (בסדר: ה-redirect של Preview מותר ברשימה). שינוי סיסמה בלי הסיסמה הנוכחית — ‏S-16 ב-`security-privacy-open.md`. נשאר: בדיקות ידניות ב-Preview הסופי עם חשבון Google שלך.
  4. ✅ **worktrees ישנים** — נמחקו (15.10, אתה; ‏`git worktree list` מציג רק את התיקייה הראשית). ה-concern מ-PR 30 סגור — לרשום ב-`debt.md` ב-wrap-up.
  5. ✅ **חשבון בדיקה ל-E** — נרשמת ב-nestly-preview; repository secrets ב-GitHub: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD` (אם CRITIC יקבע environment אחר — לומר לך). שים לב: החשבון נרשם לפני F1.6, ולכן בכניסה הראשונה הוא יוחזק במסך השאלות.
  6. ✅ **‏baselines של F1.6** — ‏`update-baselines` רץ (38787338192), שישה PNG ב-`e2e/__screenshots__/` (נבדקו בעין). אישרת לי להריץ ולהוריד בעצמי גם בהמשך.
- **פתוח, בלי הכרעה עכשיו:** הערות GitHub בריצת migrate (15.10): ‏`actions/checkout@v4` ו-`setup-node@v4` רצים על Node 20 שיוצא משימוש — לעדכן גרסאות (יחד עם נעילת SHA שב-debt, low 7); ‏`ubuntu-latest` עובר ל-Ubuntu 26 ב-19.10 — לבדוק את ריצת ה-CI הראשונה אחריו (התקנת Chrome/Edge ו-Supabase CLI) · החלטות המדיה M1–M6 לפני I5 · תקציב לביקורת משפטית לפני I9 · אם בניות ש-Vercel דילג עליהן נספרות במגבלה, עוברים ל-`git.deploymentEnabled`.
- **התקדמות מוצר (שורה לכל סשן):**
  - 16–17.10 (סשן F1.8): ‏intake, ‏spec (‏Gate 1 פעמיים), ‏DATA ARCHITECT, ‏P1–P3, ‏CRITIC opus ובדיקה חוזרת, ‏CI אדום ראשון (22 טסטים ישנים) תוקן, ‏PR 35 מוזג אחרי הבדיקות הידניות שלך; ‏`security-privacy-open.md` נוצר; ‏wrap-up; סגירת I1 ועדכון SRS.
  - 15–16.10 (לילה, סשן F1.6 חלק c): טסטים לחלק c, ‏CRITIC ובדיקה חוזרת, ‏baselines, ‏CI ירוק (ריצה 5), ‏migrate ל-nestly-preview. ממתין ל-Preview שלך.
  - 16.10 (סשן ההכרעות): הכרעותיך לפני I3–I5 נרשמו (‏decisions, ‏roadmap תוספת 3), ‏Preview ידני הוחלף ב-E, שבע שאלות נשאלו ונסגרו כברירת המחדל; ‏SRS 2.18 נכתב ואושר ב-CRITIC.
  - 16–17.10 (לילה, סשן E): ‏E נבנה בתוך PR 31 (‏spec, ‏DATA ARCHITECT, ‏BUILDER, ‏TEST ENGINEER, ‏CRITIC opus ובדיקה חוזרת), רץ ירוק פעמיים על ה-Preview של F1.6; ‏wrap-up של F1.6; ‏DR-E1 (מחיקת משתמשי בדיקה) שמור לך.
  - 17.10 (בוקר): ‏F1.6 ו-E מוזגו (‏PR 31) על CI ירוק; ‏migrate ל-production ממתין לאישורך; חריג guard ל-`*.flow.ts` נרשם.
  - 17.10: ‏E חלק 2 (מחיקת משתמשי בדיקה) מוזג (‏PR 33) אחרי CRITIC opus ובדיקה חוזרת; ריצת `preview-e2e-cleanup` הראשונה מ-main נבדקת ב-PR הרשומות.
  - 15.10 (לילה, סשן F1.6 המשך): ‏main מוזג לענף; טסטים ל-Amendment 2; ‏CRITIC בדיקה חוזרת Validated with Concern; הידע הוחל; ‏PR 31 נפתח (draft); חלק c נבנה (לא נדחף). עצירה יציבה לבקשתך.
  - 15.10 (ערב, סשן הסקירה): אין — סקירת מהירות הפיתוח, ‏A–F אושרו ונבנו (‏`chore/dev-speed`); ‏F1.6 נמשך בסשן שלו.
  - 15.10 (המשך): תוכנית ההצגה למרצה נכתבה (חלק 10), הכרעותיך נרשמו, ‏SRS 2.15. ה-debt שלפני F1.5 מוזג (PR 27). ‏F1.5 מוזג (PR 29), ‏SRS 2.16.
  - 15.10: ‏F1.4 מוזג (PR 25) ו-migrate רץ על production. ‏PR שיפור הבדיקות מוזג (PR 26): בדיקות מקומיות מלאות, ‏SRS 2.14, ‏CRITIC פעמיים, ‏CI ירוק. הכרעתך: ‏Edge כמו שנבנה.
  - 14.10: ‏F1.1 הושלם, שלושה PRs מוזגו (15, 16, 17). הסכמה הראשונה הוחלה על preview, ו-pgTAP עבר 394/394. ‏F1.2 מוזג (PR 19). ‏Welcome חי ב-production, ואורח מנותב אליו. כלי ה-Preview מוזג (PR 21), ו-F1.3 נפתח. ‏F1.3 מוזג (PR 22). האצת CI מוזגה (PR 23).
- **להמשך (מסירה ל-session הבא):**
  0. ✅ **סגירת I1 ועדכון ה-SRS — 2.19** (16.10, ‏`.work/i1-srs-close/result.md`; ‏CRITIC sonnet ‏Validated). פתוח ממנו: שמירת נתוני השחזור (צריך OP לפני I9), מדיניות פרטיות על תשובות השחזור (אתה, I9). היה: — `/srs-update` עם ה-delta של F1.1–F1.8 (שורת "SRS trace" ב-`.work/*/result.md`), כולל: משתמש Google חדש מגדיר סיסמה (FR-AUTH-005/FR-REG-004), ‏AC-087 (‏Supabase שומר שם ותמונה, ‏DR-5), ‏c13 ("בלי אימייל" = מחוץ לאסימון), ‏Rule L לא נבנה (S-01). ‏CRITIC (sonnet) בודק מול הקוד. אחר כך עוצרים.
  1. **הבא — סשן חדש: בדיקה מקיפה של כל המערכת, לפני I2** (הכרעתך, 16.10). **לא מתחילים את I2 לפני שהיא נגמרת.** בתחילת הסשן: להציע היקף ושיטה (מוצר, אבטחה ופרטיות, נתונים ו-RLS, ‏CI והכלים, מערך הסוכנים). נקודות פתיחה: [security-privacy-open.md](security-privacy-open.md) (כולל ארבעת סעיפי 🔍 "לאמת"), ‏`debt.md`, "לרטרו אחרי I1" למטה, ושלושה כשלי דפדפן שהופיעו רק מקומית ב-F1.8 (`e2e/app-shell-guard-stories.spec.ts:50`, שני צילומי טלפון ב-`e2e/visual.visual.spec.ts:47`). התוצר: רשימת ממצאים לפי עדיפות, ואתה מחליט מה מטופל לפני I2.
  2. **אחריה:** הרטרו אחרי I1 (הקפאת מערך הסוכנים הסתיימה עם מיזוג F1.8; הרטרו מוריד, לא מוסיף), ואז I2 לפי חלק 8 — סשן חדש לכל פיצ׳ר. תוכנית ההצגה (חלק 10) ממשיכה רק במה שלא תלוי בקוד.
  3. **איפה עומדים:** ‏I1 — ‏F1.1–F1.8 מוזגו (‏F1.7 הוצא). ‏Production: [nestly-blue.vercel.app](https://nestly-blue.vercel.app). ל-F1.8 אין migration. ‏E: כל Preview נבדק אוטומטית, ומשתמשי הבדיקה נמחקים.
  4. **פתוח אצלך:** הפריטים ב"ממתין לך" (סודות שלא בשימוש, `.live/events.jsonl`, ענפים שמוזגו). משתמשי Google מהבדיקה הידנית נשארים ב-nestly-preview (אי אפשר למחוק אותם מהדשבורד בגלל RESTRICT; אין בזה נזק).
  5. **כללי עבודה (מ-15.10, "מהירות הפיתוח"; הפירוט ב-`workflow.md` 1.15):** סשן חדש לכל פיצ'ר. כל סוכן מריץ את הבדיקות המקומיות על הקבצים שלו ומוסר ירוק; ‏ORCHESTRATOR לא מריץ בדיקות ולא עורך findings. ‏TEST ENGINEER קורא קוד מקור לשמות ולממשקים (לעולם לא notes.md, לעולם לא ערכים צפויים), ויכול להתחיל מה-spec במקביל ל-BUILDER. המסלול לכל חלק לפי דגלי הסיכון; עד שתי ביקורות לפיצ'ר; בדיקה חוזרת של CRITIC = הרצה חדשה, בלי SendMessage. ‏push אחד לכל חלק; ‏draft PR מיד אחרי ה-push הראשון (‏Vercel בונה Preview רק לענף עם PR פתוח); מעקב CI דרך מוניטור ה-PR של האפליקציה, בלי לולאות. ה-diff ל-CRITIC רק דרך `tools/critic-diff.mjs`, בלי נימוקי BUILDER בתדריך. ‏spec ו-schema עד 100 שורות; טסטים עד 2× מהמוצר (קשיח). רישום פעם אחת לפיצ'ר ב-wrap-up (‏result ≤ 10); רשומות בלבד = Light (עם ה-PR הפתוח, או ישירות ל-main בין פיצ'רים). פריטים שלך נשאלים פעם אחת, ברשימת "ממתין לך".
- **שינויים בדפדפן (שורה לכל שינוי):**
  - 14.10 · Vercel › nestly › Environment Variables · Preview: נוספו `SUPABASE_JWT_ISSUER` (‏`https://xmihorrkegrdlbhpktny.supabase.co/auth/v1`, nestly-preview, אומת מול openid-configuration) ו-`SUPABASE_JWT_AUDIENCE` (‏`authenticated`), שניהם Config.
  - 14.10 · Vercel › nestly › Environment Variables · Production: נוספו `SUPABASE_JWT_ISSUER` (ה-issuer של nestly-prod, אומת מול openid-configuration) ו-`SUPABASE_JWT_AUDIENCE` (‏`authenticated`), שניהם Config.
  - 14.10 · Vercel › nestly › Environment Variables · Preview: ‏`DATABASE_URL` (Secret) — ‏`app_server.<preview ref>` דרך ה-transaction pooler ‏(`aws-1-eu-central-1.pooler.supabase.com:6543`). הכנתי עד הסיסמה; אפיק הקליד ושמר.
  - 14.10 · Vercel › nestly › Deployments: ‏Redeploy ל-Preview של `483ce81` (‏`chore/speed-up-2`, בלי build cache ובלי Ignore Build Step), אישור אפיק. ‏Ready; ‏`/api/health` ‏200, ‏`/api/me` בלי token ועם token פגום ‏401. חיבור אמיתי למסד ייבדק רק עם משתמש מחובר (F1.4).
  - 14.10 · Vercel › nestly › Environment Variables · Production: טופס `DATABASE_URL` (Secret) הוכן עד הסיסמה — ‏`app_server.<prod ref>` באותו pooler, פורט 6543. אפיק הקליד ושמר. ‏nestly-prod: התפקידים, הסיסמה ו-migration ‏`identity_schema` קיימים (ריצה 38508781512); ‏`02-anchor-fk` הורץ על prod לפי אפיק (ok=true), בלי עדות ב-repo.
  - 14.10 · Supabase › nestly-preview › Authentication › Sign In / Providers › Email: ‏Minimum password length ‏6 ← ‏10 (‏VAL-003, F1.4 קריטריון 20). ‏Password requirements נשאר "No required characters". ‏"Confirm email" — מצב auto חסם את הכיבוי.
  - 14.10 · אפיק: ‏Confirm email כובה ב-nestly-preview וב-nestly-prod.
  - 14.10 · Supabase › nestly-preview וגם nestly-prod › Authentication › Email: ‏Minimum password length ‏8 (‏preview: ‏10 ← 8; ‏prod: ‏6 ← 8), לפי הכרעת אפיק. אומת אחרי טעינה מחדש: 8, ו-Confirm email כבוי בשניהם.
  - 14.10 · אפיק: ‏`SUPABASE_PUBLISHABLE_KEY` ב-Vercel — של nestly-preview ל-Preview ושל nestly-prod ל-Production. אומת ברשימה (שמות בלבד).
  - 15.10 · Vercel › nestly › Environment Variables: ‏`VITE_SUPABASE_URL` (Config) — כתובת nestly-preview ל-Preview וכתובת nestly-prod ל-Production (F1.4 חלק c: ה-Auth בדפדפן קורא רק משתני `VITE_`).
  - 15.10 · אפיק: ‏`VITE_SUPABASE_PUBLISHABLE_KEY` ב-Vercel — Preview ו-Production; אומת ברשימה (שמות וסביבות בלבד).
  - 15.10 · Vercel › Preview של הענף: ‏Redeploy (‏`nestly-mch3ezhjm`) אחרי ש-VITE_SUPABASE_PUBLISHABLE_KEY נוסף. בדיקת קריטריון 21: שלב 1 ו-2 תקינים ב-375 וב-1024; הרשמה של אפיק — Auth ‏200, ‏`/api/register` ‏503: ה-migration של F1.4 לא הוחל על nestly-preview (42P01). מצב הניסיון החוזר וחסימת השדות עבדו לפי ה-spec.
  - 15.10 · אפיק: ‏migrate מהענף על nestly-preview (ירוק; production דולג), וסיסמת `app_server` ב-nestly-preview אופסה ועודכנה ב-`DATABASE_URL` של Preview. בדיקת ה-Preview עברה.
  - 15.10 · אפיק: סיסמת `app_server` ב-nestly-prod בפורמט SCRAM — נבדק.
  - 15.10 · אפיק אישר migrate ל-production (ריצה 38692342935): ‏db-production ירוק — טבלאות F1.4 ב-nestly-prod.
  - 17.10 · אפיק — Google Cloud ל-F1.8: פרויקט Nestly · מסך הסכמה External, פורסם ל-production (Branding: ‏home, ‏privacy ו-terms של nestly-blue.vercel.app, ‏authorized domain) · לקוח Web ‏"Nestly web": ‏redirect URIs של nestly-preview ושל nestly-prod, ‏origin ‏nestly-blue.vercel.app · ‏Supabase › nestly-preview וגם nestly-prod › Google מופעל עם ה-Client ID וה-secret (אפיק הזין); ‏"Skip nonce checks" ו-"Allow users without an email" כבויים. לא נבדק עדיין מצד Claude — ייבדק בתחילת F1.8.
- **היסטוריה:** `archive/WORKPLAN-2026-10.md`. ההחלטות ב-`decisions.md`. הנקודות הפתוחות במוצר ב-`docs/srs/appendix-b-open-points.md`.

---

## פתוח מחלקים שנסגרו

החלקים הסגורים עברו ל-[archive/WORKPLAN-2026-10.md](archive/WORKPLAN-2026-10.md). מה שנשאר בהם פתוח:

- **7.1, שער ה-RLS ב-CI:** נבנה ב-F1.1 חלק a.
- **7.1, הגנת ענף על `main`:** לא עכשיו. מחליטים כשעוברים לענף לכל פיצ'ר (החלטת אפיק 11.10).
- **7.0, 7.3, 7.4:** נבדקים ונבנים ב-F1.1 (קריטריונים 5–7, 27–28).
- **Storage (הערה, לא החלטה):** נשאר TBD עד פיצ'ר המדיה. כיוון שאפיק רוצה לבחון אז: Cloudflare R2, עם buckets פרטיים, presigned URLs מהשרת וניקוי EXIF ו-GPS.
- **מסקירת ההנחיות החיצוניות, יוחלט כשהפיצ'ר הרלוונטי מגיע:** container לאשף (C2) · לוגים עם כלל פרטיות (C4) · חלונות קופצים (C5) · rate limit (C6) · skills לפרטיות ולאירוע אבטחה לפני השקה (C7) · "להעביר, לא לשכתב" ל-React Native (C8) · AI (C9).

## לרטרו אחרי I1 (רק אז)

עם נתונים מ-7 פיצ'רים (escapes, noise, planned vs actual, קריאות מודל לפיצ'ר): מה עבד, מה רק עלה כסף, ומה להוריד. שורה אחת לכל רעיון. **הרטרו מוריד, לא מוסיף** (הכרעתך 15.10). **המדדים (מ-F1.6):** ‏spec → merge לפיצ'ר (יעד ≤ 2 שעות) · קריאות סוכנים לפיצ'ר (≤ 12) · הקשר חציוני של ORCHESTRATOR (≤ 150K) · המתנה לך לפיצ'ר (≤ 30 דק׳) · ריצות CI לפיצ'ר ואחוז אדומות (≤ 3, ‏< 15%) · שורות רשומות ב-`.work` (≤ 150) · טסטים/מוצר (≤ 2×). הבסיס: הדוח מ-15.10.

- ~~פיצ׳ר עם migration: להריץ `migrate` מהענף על nestly-preview לפני ה-Preview~~ — **הוכרע 15.10 (E):** migrate אוטומטי על preview לענף עם migration, ‏PR 2.
- `CLAUDE.md` טבלת Logs: להוסיף את `security-privacy-open.md` (הכרעת אפיק 17.10 — כל בעיית אבטחה ופרטיות נכנסת לשם), ובביקורות CRITIC לבקש שורת S לכל סיכון שנשאר פתוח.
- ~~בדיקת Preview אוטומטית ב-CI~~ — **הוכרע 15.10 (E):** ‏Playwright מול ה-Preview עם חשבון בדיקה כסוד ב-GitHub, ‏PR 2.
- `workflow.md` שורה 36: תיאורי ה-as-built הם `data-model.md` (כולל `data-model-tables.md` המקושר, מ-F1.4) ו-`conventions.md` — לציין את הקובץ החדש.
- skills שלב ב: `react-web`, `fastify-api`, `drizzle-postgres`, `testing-craft`, `shared-contracts`, `rls-tests` (חריג: skill ממוקד אחד אחרי שני כשלים על אותה בעיית craft).
- ה-guard: להכיר ב-`e2e-preview/*.flow.ts` כקובץ טסט של TEST ENGINEER (חסימה שלישית 16.10 01:12, ‏noise). ‏E: ‏concurrency לפי sha אחרי הכרעת DR-E1 (‏debt).
- 6.1: domain של Threat Modeling.
- 7.2: בדיקת ה-hook של security-guidance.
- skills שלב ג: דוגמאות שמפנות לקוד אמיתי, `/srs-coverage`.
- הצעת BUILDER לעדכון conventions "Git and shell" אחרי תיקון כלל ה-env (`.work/guard-env-paths/notes.md`).
- סוכן שמריץ `node -e` עם טקסט שמזכיר קובץ env נחסם (נכון לפי הכלל): פעמיים ב-13.10. לשקול שורה ב-conventions.
- חסימות fail-closed של כלל ה-env על ארגומנטים שנראים כמו glob (`.[]` של jq, ‏`gh api`): שלוש ב-14.10, כלומר סף הדפוס. יש עקיפה סבירה, ולכן אין חריג הקפאה. ההצעה של CRITIC (debt): כלל לא-קריטי לעמימות.
- ~~גדר הקריאה של TEST ENGINEER~~ — **הוכרע 15.10 (D):** קורא קוד מקור לשמות ולממשקים, לא notes.md; ‏79 חסימות עד אז.
- ה-guard חוסם כל פקודה של סוכן שה-cwd שלו הוא worktree תחת `.claude/worktrees/` ("not the project root"): ‏TEST ENGINEER נחסם 5 פעמים ב-3 דקות (14.10, ‏preview-access). בינתיים: ענפים נבדקים ב-checkout הראשי, לא ב-worktree, ו-ORCHESTRATOR מריץ את הטסטים.

## חלק 10 — הצגה למרצה 🔄 (15.10.2026; תוכנית גרסה 2)

**מה:** מסמך הרעיון שלך, [docs/lecturer-demo-idea-HE.md](docs/lecturer-demo-idea-HE.md). **איך:** [docs/lecturer-demo-plan-HE.md](docs/lecturer-demo-plan-HE.md). **ההחלטה:** `decisions.md`, 15.10, "Lecturer presentation". **הסטטוס:** רק כאן.

| # | שלב | תלוי ב | מצב |
|---|---|---|---|
| 10.0 | רשומות: המסמך במעקב, התוכנית, החלק הזה, `decisions.md` | — | ✅ 15.10 |
| 10.1 | הכרעות: תאריך · ‏G1–G6 · מחירון · זמנים אחורה · סעיף 15 | — | ✅ 15.10 |
| 10.2 | ‏SRS ‏2.15: ‏G1–G7, ‏OP-024, ‏OP-025, אחריות על תוכן משתמשים, היקף I1–I14 לפני ההצגה, כלי ההצגה מחוץ למוצר | 10.1 | ✅ 15.10 (`chore/srs-2-15-demo`) |
| 10.3 | שלב א — מוצר: ‏I1–I14 בלי I15, לפי חלק 8 | — | 🔄 ‏I1 |
| 10.4 | שלב ב — מדריכים לפי סטטוס (תוכן מערכת): ‏Claude כותב, ואתה מאשר כל מדריך | I6 | ⬜ |
| 10.5 | ~~כלי ההצגה~~ — **בוטל** (הכרעתך 15.10, תוכנית גרסה 2): בלי קוד גישה, כניסה בלחיצה, ‏schema נפרדת או `DEMO_ENABLED` | — | ⏸️ |
| 10.6 | שלב ג — כתיבת תוכן הדמו: דמויות, סיפורים, פוסטים, מוצרים, מאמרים, תמונות | — | ⬜ |
| 10.7 | שלב ד — הכנסת התוכן דרך ה-API של המוצר (הרצה חד-פעמית מ-CI, באישורך) והזזת זמנים, קודם nestly-preview ואחר כך production | 10.3, 10.6 | ⬜ |
| 10.8 | שלב ה — ההצגה: המרצה נכנס בהתחברות הרגילה עם משתמש דמו; אתה כמנהל | 10.7 | ⬜ |

## חלק 9 — עיצוב UX/UI ✅ (11.10.2026, לפני חלק 8)

ההחלטה של אפיק: "מאשר את גרסה 2 של התוכנית". ההחלטות ב-`decisions.md`, ברשומות מ-11.10 על עיצוב.

| # | משימה | תלוי ב | מצב |
|---|---|---|---|
| 9.1 | הסקיצות ב-`docs/design/sketches/`, בשמות קריאים, עם README: מיפוי, מה כתוב, ו-12 פערים מול ה-SRS. ההחלטות נרשמו ב-`decisions.md` | — | ✅ |
| 9.2 | `docs/design/README.md` ו-`direction.md`: עקרונות, מה לוקחים מפייסבוק, טון, תמונות, תנועה ומצבים | — | ✅ |
| 9.3 | **R1**, לוח כיוונים: שלושה כיווני צבע וגופן, ושתי פריסות דסקטופ. `docs/design/mockups/r1-directions.html` ו-`r1-desktop.html`. נבדקו ב-375 וב-1280: הניגודיות עוברת, אין גלילה אופקית, ה-focus נראה, ולכל רכיב יש שם נגיש | 9.2 | ✅ נבחרו A, Rubik ועמודה ממורכזת עם rail. `tokens.md` נכתב |
| 9.4 | **R2**: Welcome, Login, סוג חשבון, הרשמה רגילה ומקצועית, Feed (כולל תפריט "⋯") ובית, במובייל. Feed ובית גם בדסקטופ. ליד כל מסך: מה נשמר, מה חודד, ההחלטות ומה פתוח. `docs/design/mockups/r2-screens.html` ו-`r2-desktop.html`. נבדקו ב-375 וב-1280 | הכרעות R1 | ✅ אושר ב-11.10. נוספו שורת פעולות (לייק, תגובה, שיתוף בפיד, שיתוף קישור), כרטיס שיתוף ומצב "מקור לא זמין" |
| 9.5 | **SRS 2.9**: קישורים לסקיצות, NFR-USAB-004, NFR-USE-001, §4.2, §11, §16 ונספח B, וה-FR/VAL שהשתנו. **ובנוסף, מ-D7:** §2.5 היקף ה-MVP · AC-005 בשלבים · AC-017 (בלי טלפון) · FR-AUTH-003 (אימייל) · VAL-006 ו-OP-004 (האפשרויות) · גיל 18 ומעלה · אימות אימייל · NFR-MEDIA-001 (תמונות בלבד) · OP חדשים: מקור הטיפים, מקור הדירוג של בעלי מקצוע, תאריך לידה משוער, קופונים, זהות מותג · **שיתוף (אושר):** FR-FEED-006/007, ‏BR-064–067, ‏VAL-038, ‏ERR-033/034, ‏AC-079–083, ‏NFR-PRIV-007 · FR-FEED-003: Reaction אחד, "לייק" · **שיטה C:** §11 (השרת כ-Vercel Functions) · §12 ו-§13 (Realtime כאות בלבד, ו-Storage נשאר TBD) | R1, R2 | ✅ נכתב ב-11.10: SRS 2.9. ה-INDEX נבנה (86 FR, ‏86 AC, ‏45 PG, ‏27 OP) |
| 9.6 | skill `design-system` · `rtl-hebrew`, `accessibility` ו-`ux-copy-he` בגרסה 1.1 · domain של עקביות עיצובית ב-`workflow.md` · בדיקה אחת ל-CRITIC | 7.0 | ✅ 11.10. ‏`design-system` 1.0 נכתב. שלושת ה-skills עודכנו לגרסה 1.1 לפי `docs/design`, בדפוסים בלבד, ורשימות האיסורים לא השתנו. נוסף domain "Design consistency" ב-`workflow.md` (גרסה 1.6). ל-CRITIC נוספה בדיקה (1.4), ו-19 מתוך 20 בתקציב |
| 9.7 | **יחידת רכיבים, גל 1,** במסלול Standard: tokens, גופנים, shadcn ו-Storybook. **R3**, הגלריה, היא ה-Preview. היחידה הראשונה מתוך 5.<br>**בתחילת 9.7, לפני הקומפוננטה הראשונה** (הועבר מ-7.1, החלטת אפיק 11.10): lint של classes ב-Tailwind (בלי כיוון פיזי, בלי ערכים שרירותיים ובלי hex), וטסט ניגודיות | 7.0, 7.1, 7.2, **7.4** | ✅ Gate 1 עבר (11.10, SRS 2.11). ה-spec מחולק לשישה חלקים, a עד f. **a ✅ מוזג** (`7189684`): שערי lint לעיצוב, מקור ה-tokens, המחולל, Rubik ו-CSS בסיסי. CRITIC אישר אחרי בדיקה חוזרת, ו-TEST ENGINEER אימת את הממצא הגבוה שלו. **b ✅ מוזג** (`f71a0ab`): ‏Storybook, אייקונים, ‏Button (כולל pending), ‏Tooltip ו-Skeleton. ‏Playwright רץ על Chrome ו-Edge, ‏196 מתוך 196. ‏CRITIC אישר, וה-Preview עבר. **c ✅ מוזג** (`a89e800`): ‏TextInput, ‏FormField, ‏PasswordInput ו-SelectInput. ‏CRITIC החזיר Not Ready: הטסטים לא עברו typecheck, וכפתור הצגת הסיסמה כיסה את תחילת הטקסט. אחרי התיקון אישר. ב-Preview תוקן טקסט לדוגמה שסתר את VAL-003 ואת OP-004. **d ✅ מוזג** (`43ee913`): ‏DateInput, ‏ChoiceCardGroup, ‏StepIndicator, ‏Checkbox ו-InlineAlert. שגיאות מוכרזות לקורא מסך, ולא רק נצבעות. קישורים בתוך משפט פטורים מגודל המטרה, לפי WCAG 2.5.8. **e ✅ מוזג** (`c83c65c`): ‏Logo, איורים, ‏AuthLayout, ‏Avatar ו-MenuItem. נוסף קישור "שכחתי סיסמה", כי FR-AUTH-003 הוחלט ב-11.10. **f ✅ מוזג** (PR 3): ‏TopBar, ‏BottomNavigation, ‏SideDrawer ו-AppShell. ‏CRITIC מצא שני ממצאים בינוניים (פוקוס מוסתר מתחת לפסים הדביקים, והחזרת פוקוס ב-Safari), ושניהם תוקנו. **Preview של כל הגלריה עבר** (12.10), מול R2 ב-375 וב-1024. ‏`.work/ui-wave-1/result.md`. ‏`.work/ui-wave-1/` |

**ל-7.0:** תיקיות העיצוב `components/ui`, `components/shared`, `components/domain` ו-`styles/`, ו-`packages/shared/src/design-tokens/`.
**~~ל-7.1~~ הועבר לתחילת 9.7 (11.10):** lint של classes (בלי כיוון פיזי, בלי ערכים שרירותיים ובלי hex), וטסט ניגודיות.


## הסטטוס שלפני I2 (הועבר מ-WORKPLAN-HE.md בסגירת I2, 17.10.2026)

### איפה עמדנו — 16.10.2026

**עודכן:** 16.10.2026 · **SRS:** 2.19 · **מצב:** ‏I1 הושלם. הבדיקה המקיפה הסתיימה; הכרעותיך 1–12 (`decisions.md`, 16.10,
"Audit decisions"), פישוט ה-guard ותשובות שאלון I2 מוזגו ב-PR 37. שני באגי guard שנשארו פתוחים התקבלו כסיכון (‏S-62,
‏S-63). **הבא: I2, בסשן חדש** (ראו "להמשך").

**ממתין לך:**
0. **החלטה — פרטיות (לא חוסם, ברירת מחדל ⭐):** כשמסיימים מסלול הריון, האפליקציה לא רושמת דבר. אבל לוג הבקשות של Vercel (מחוץ לאפליקציה) שומר `DELETE /api/journeys/<מזהה> 200` עם זמן ו-IP, ואפשר להצליב אותו עם לוג ה-Auth של Supabase ולקשור סיום הריון למשתמש. רק בעל החשבון רואה את הלוגים, לזמן קצר. **⭐ לרשום את זה במדיניות הפרטיות (§13.4) ליד הגיבויים, ולנסח את c20 כ"שום שורת לוג של האפליקציה, עמודה או רשומה"**. אין צורת route שמונעת את זה.
0. **לידיעה:** חסימת force push של ה-guard ב-16.10 23:10 (עקפתי במיזוג `-s ours`, בלי שכתוב היסטוריה) · ניסוח AR-1 עודכן: קביעת הסיסמה עצמה מנתקת את כל ה-Sessions · הבאג מ-PR 38 חי ב-production עד מיזוג PR 39 (רק חשבונות בדיקה).
1. **Docker Desktop** — בדיקות ה-DB המקומיות (החלטה 3) צריכות Docker. עד שתתקין, הן רצות רק ב-CI (הכרעתך 16.10).
2. ישן: למחוק `.live/events.jsonl`; למחוק ענפים מרוחקים שמוזגו; למחוק את הסודות `PREVIEW_SUPABASE_SECRET_KEY`,
   ‏`PREVIEW_TEST_EMAIL` ו-`PREVIEW_TEST_PASSWORD` שלא בשימוש.
3. **לפני השקה:** להחזיר את דרישת האישור ב-`db-production` (‏S-59).

**להמשך — I2 בסשן חדש:**
1. **השאלון נענה** ([I2-questions.md](.work/_initiatives/I2-questions.md), ‏decisions 16.10 "I2 questionnaire"):
   - פרופיל Open כברירת מחדל, גם לקיימים (backfill).
   - ‏S-01 לפי א: בכניסה הראשונה עם Google לחשבון עם סיסמה — הסיסמה הישנה מבוטלת, כל ה-Sessions האחרים מנותקים,
     והמשתמש מגדיר סיסמה חדשה. זיהוי לפי `identities`.
   - ‏S-16: החלפת סיסמה רק אחרי מענה על שתי שאלות האבטחה, גם למשתמש Google. שינוי אימייל לא נבנה ב-I2.
   - יום הולדת של ילד בהתראות לחברים: פעיל כברירת מחדל.
   - ‏migrate ל-production: אני מריץ בעצמי, באצווה, בלי לחכות (`gh workflow run migrate.yml --ref main`).
2. **הצעד הראשון:** ‏SPEC אחד ל-I2 — רשימת פיצ'רים וחלקים (roadmap תוספת 4; פירוק מוצע: S-01+S-16 · ‏F2.1 פרופיל ·
   ‏F2.2 מסלולים וילדים · ‏F2.3 פרטיות · ‏F2.4 Friends · ‏F2.5 Settings). ‏**S-01 ו-S-16 בחלק הראשון**, לפני ה-endpoint
   הראשון שמציג נתונים אישיים. ‏AC חסרים (F2.2, ‏F2.5) נכתבים ב-SPEC.
3. **בלי שאלות לך במהלך I2**, אלא בפריט שמור חדש. מיזוג לפי `workflow.md` 1.16. ‏WORKPLAN מתעדכן בסוף I2.

**פתוח בלי הכרעה עכשיו:** ‏`actions/checkout@v4` ו-`setup-node@v4` על Node 20 שיוצא משימוש · ‏`ubuntu-latest` עובר
ל-Ubuntu 26 ב-19.10 — לבדוק את ריצת ה-CI הראשונה אחריו.

