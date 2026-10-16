# תוכנית עבודה — Nestly

**מסמך חי.** מתעדכן בסוף כל שלב, באותו commit.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⏸️ נדחה בהכרעה · ⬜ לא התחיל

**חוק עבודה:** כללי העבודה מ-11.10 (`CLAUDE.md`, "Decision authority"): אני מחליט את מה שלא שמור לך ורושם.
**חוק סנכרון:** כל שינוי במערכת מתעדכן ב-SRS. המנגנון נקבע ב-D1.

---

## איפה אנחנו עומדים

**עודכן:** 17.10.2026 · **גרסת SRS:** 2.18 · **מצב:** בניית מוצר. מערך הסוכנים קפוא עד שמוזג F1.8, **בלי חריגים** (הכרעתך מ-15.10, "מהירות הפיתוח", `decisions.md`).

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
- **ממתין להכרעה שלך:** אין. שבע השאלות על הכרעות I3–I5 נסגרו כברירת המחדל (16.10, "הכול כברירת המחדל"; ‏`decisions.md`).
- **ממתין לך (סודות ופעולות):**
  0. **‏E — הסודות (נמסרו לך 16.10 בלילה; לא צריך הגדרה ב-Supabase):** ‏environment ‏`preview-e2e` (בלי reviewers, בלי הגבלת ענפים) ובו `PREVIEW_SUPABASE_SECRET_KEY` (ה-secret key של nestly-preview) ו-`PREVIEW_DB_ADMIN_URL` (‏nestly-preview, משתמש `postgres`, ‏Session pooler 5432). ‏`PREVIEW_TEST_EMAIL`/`PREVIEW_TEST_PASSWORD` מיותרים, אפשר למחוק אחרי ש-E ירוק.
  0א. **בוקר 17.10 — רשימת "רק אתה" מהלילה:**
     1. ✅ **DR-E1 — מחיקת משתמשי הבדיקה: מוזג** (‏PR 33, ‏`6627502`, ‏17.10). ה-environment ‏`preview-e2e` מוגבל ל-main (אומת ב-API). נשאר אצלך: למחוק את `PREVIEW_SUPABASE_SECRET_KEY` (לא בשימוש), ואחרי ריצה ירוקה של המחיקה גם את `PREVIEW_TEST_EMAIL`/`PREVIEW_TEST_PASSWORD`.
     2. **‏`PREVIEW_SUPABASE_SECRET_KEY` מיותר** — ‏DATA ARCHITECT בחר במחיקה ב-SQL. אם הזנת אותו, אפשר למחוק אותו מ-`preview-e2e`.
     3. ✅ **זיהוי `*.flow.ts` ב-guard** — אישרת חריג להקפאה (17.10, ‏`decisions.md`), ייבנה עם F1.8.
     4. ✅ **‏migrate ל-production של F1.6** — אישרת, ‏db-production ירוק (ריצה 38860446921, 17.10).
  1. **קובץ יומן מקומי ישן** `.live/events.jsonl` (טקסט מפרומפטים, לא ב-git): מחיקה היא שלך. אחריה אפשר להסיר את `.live/` מ-`.gitignore`.
  2. **מחיקת ענפים מרוחקים שמוזגו:** ‏`ui-wave-1/part-a` עד `part-e`, ‏`chore/i1-prep`, ‏`chore/guard-env-paths` (מוזג), ‏`chore/preview-access` (הוחלף ב-`-v2` אחרי rebase), ‏`chore/records-after-f12` (מוזג).
  3. ✅ **ב-F1.8: Google Cloud והסודות — הוגדרו אצלך (17.10).** בתחילת F1.8 אבדוק מה חסר (למשל Redirect URLs ב-Supabase › Authentication › URL Configuration) ואנחה אותך.
  4. ✅ **worktrees ישנים** — נמחקו (15.10, אתה; ‏`git worktree list` מציג רק את התיקייה הראשית). ה-concern מ-PR 30 סגור — לרשום ב-`debt.md` ב-wrap-up.
  5. ✅ **חשבון בדיקה ל-E** — נרשמת ב-nestly-preview; repository secrets ב-GitHub: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD` (אם CRITIC יקבע environment אחר — לומר לך). שים לב: החשבון נרשם לפני F1.6, ולכן בכניסה הראשונה הוא יוחזק במסך השאלות.
  6. ✅ **‏baselines של F1.6** — ‏`update-baselines` רץ (38787338192), שישה PNG ב-`e2e/__screenshots__/` (נבדקו בעין). אישרת לי להריץ ולהוריד בעצמי גם בהמשך.
- **פתוח, בלי הכרעה עכשיו:** הערות GitHub בריצת migrate (15.10): ‏`actions/checkout@v4` ו-`setup-node@v4` רצים על Node 20 שיוצא משימוש — לעדכן גרסאות (יחד עם נעילת SHA שב-debt, low 7); ‏`ubuntu-latest` עובר ל-Ubuntu 26 ב-19.10 — לבדוק את ריצת ה-CI הראשונה אחריו (התקנת Chrome/Edge ו-Supabase CLI) · החלטות המדיה M1–M6 לפני I5 · תקציב לביקורת משפטית לפני I9 · אם בניות ש-Vercel דילג עליהן נספרות במגבלה, עוברים ל-`git.deploymentEnabled`.
- **התקדמות מוצר (שורה לכל סשן):**
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
  0. **מסלול ראשי עכשיו — F1.8, סשן חדש.** ‏F1.6 ו-E מוזגו (‏PR 31, ‏`c0d34d7`, ‏17.10; ‏`.work/password-recovery/result.md`, ‏`.work/preview-e2e/result.md`). **עם F1.8, ובלי שום שינוי נוסף ב-guard:** ‏TEST ENGINEER רשאי לכתוב `e2e-preview/*.flow.ts` (חריג שאישרת, ‏`decisions.md` 17.10), עם טסט ל-guard ו-CRITIC על opus. ‏F1.8 מוסיף קובץ flow משלו ל-`e2e-preview/`, ו-Gate 3 עובר מ-`preview-e2e`. ‏E הושלם (‏PR 33): כל Preview נבדק ומשתמשי הבדיקה נמחקים ב-`preview-e2e-cleanup`. בתחילת F1.8 — לבדוק שריצות המחיקה ירוקות (סיכום הריצה: נמחקו / נשארו). ‏Google Cloud ו-Supabase הוגדרו אצלך (17.10, "שינויים בדפדפן"); בתחילת הסשן — בדיקה מה חסר, למשל Redirect URLs. **משימות נפרדות שנותרו מ-PR 26:** צילומי baseline לשאר המסכים (והסרת בלוק Q3 ב-`e2e/part-f.spec.ts`); הצעת איחוד כפילויות (בלי מחיקה לפני אישורך).
  1. **איפה עומדים:** ‏I1: ‏F1.1–F1.4 מוזגו (‏F1.4: ‏PR 25, ‏`0cdd5fa`, ‏migrate ב-production ירוק). ‏PR שיפור הבדיקות מוזג (‏PR 26, ‏`02842b0`). ‏SRS ‏2.15. ‏Production: ‏[nestly-blue.vercel.app](https://nestly-blue.vercel.app). מערך הסוכנים קפוא עד סוף I1, מלבד החריגים שאישרת (האצה, כלל ההמתנה, שיפור הבדיקות).
  2. **הבא בתור:** ‏F1.6 (בסשן שלו), ‏E (PR 2: ‏Preview E2E ב-CI, ‏migrate אוטומטי על preview), ‏F1.8, ואחריהם I2 לפי חלק 8 — **סשן חדש לכל פיצ'ר.** תוכנית ההצגה (חלק 10) רצה במקביל רק במה שלא תלוי בקוד.
  3. ✅ **בוצע ב-`chore/dev-speed`:** ‏`tools/critic-diff.mjs` בלי package-lock, קובצי הסטטוס והיומנים בשורש, ‏`decisions/`, ‏`archive/` ו-`.claude/logs`.
  3א. ✅ **בוצע ב-PR 26 (15.10).** **אחרי מיזוג F1.4, לפני F1.5 — שיפור הבדיקות** (הכרעתך מ-14.10, חריג להקפאה, `decisions.md`): ‏PR אחד שמעדכן את `test-engineer.md`, ‏`spec.md` (הסוכן) ו-`workflow.md` עם changelog: עומק לפי סוג קריטריון (🔴/🎨/🟡), שכבה אחת לכל התנהגות, ‏Chrome בלבד ב-PR (מחשב וטלפון) ו-Edge לפני production, צילומי מסך חוסמים, תקרה רכה של פי 2, בלי בדיקות חדשות לכלים. ‏CRITIC בודק לפני מיזוג. אחריו, כמשימות נפרדות: (1) צילומי baseline לכל המסכים הקיימים; (2) הצעת איחוד כפילויות (part-d/e/f ו-form-controls ב-vitest מול e2e) — בלי מחיקה לפני אישורך.
  4. **פתוח אצלך:** הפריטים 1–3 ב"ממתין לך". אימתת ב-14.10: ‏Git Fork Protection פועל, ל-`db-production` יש reviewer חובה וכלל main-only, ו-Node ב-Vercel הוא 22.x.
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

## חלק 8 — בניית המוצר: Initiatives 🔄 (D7 נסגר ב-11.10.2026)

**איפה כל דבר:**
- **המצב:** רק כאן.
- **ההיקף המאושר של כל Initiative:** ב-`.work/_initiatives/`. קובץ נכתב כשה-Initiative מאושר.
- **ההכרעה:** `decisions.md`, ברשומה "D7 closed".
- **ה-MVP:** ייכנס ל-SRS §2.5 במנה 2.9.

**התנאים לכל פיצ'ר:**
- אין פיצ'ר לפני 7 ו-9.7 (שער ה-RLS נבנה ב-F1.1; ‏7.2 security-guidance נדחה לרטרו).
- המסלול נקבע לכל **חלק** לפי דגלי הסיכון (הכרעתך 15.10, "מהירות הפיתוח"): חלק שנוגע ב-auth, RLS, schema או נתונים אישיים — Elevated; חלק מסך — Standard (‏CRITIC על sonnet, בלי DATA ARCHITECT), **ועדיין** צילומי מסך, סריקת נגישות, מקלדת, טלפון ומחשב. עד שתי ביקורות לפיצ'ר.
- החלטה פתוחה שחוסמת Initiative מוגשת לפני שה-Initiative נפתח.

| # | Initiative | MVP | פיצ'רים | תלוי ב | חוסם לפני פתיחה | קובץ | מצב |
|---|---|---|---|---|---|---|---|
| I1 | חשבונות וגישה (Regular) | ✅ | 7 | 7, 9.7 | — (הוחלט) | [I1-accounts-access.md](.work/_initiatives/I1-accounts-access.md) | 🔄 F1.1–F1.5 מוזגו (15.10); הבא F1.6, ואחריו F1.8 |
| I2 | פרופיל, פרטיות ו-Friends | ✅ | 5 | I1 | — (OP-021 נסגר) | — | ⬜ |
| I3 | פיד קהילתי, כולל שיתוף פנימי וחיצוני | ✅ | 8 | I2 | כללי קהילה · `algorithm.md` | — | ⬜ |
| I4 | בטיחות וניהול, ליבה | ✅ | 5 | I3 | סיבות דיווח · משכי השעיה | — | ⬜ |
| I5 | מדיה: תמונות בפוסטים ותמונת פרופיל | ✅ | 4 | I2, I3, I4 | M1–M6 | — | ⬜ |
| I6 | בית ומעקב | ✅ | 6 | I2 | OP-003 · OP-008 · שדות מחזור וביוץ (תוכן המדריכים הוחלט: BR-070, ‏FR-ADMIN-012) | — | ⬜ |
| I7 | התראות וחיפוש | ✅ | 4 | I2, I3 | ספי rate limit · רשימת אירועים | — | ⬜ |
| I8 | שיחות ו-Support | ✅ | 5 | I2, I4, I7 | נושאי פנייה | — | ⬜ |
| I9 | מוכנות להשקה | ✅ | 5 (+CAPTCHA) | I1–I8 | Retention · ביקורת משפטית **ותקציב** (מדיניות הפרטיות כוללת את תשובות שאלות השחזור, F1.6) · OP-017 · יעדי NFR · רשימת מוזמנים | — | ⬜ |
| I10 | קבוצות | — | 5 | I3, I4, I7 | קטגוריות · Highlights | — | ⬜ |
| I11 | בעלי מקצוע ושירותים | — | 10 | I8, I3, I5 | OP-005 · OP-010 · OP-016 · קטגוריות · מיקום (הדירוג הוחלט: BR-072) | — | ⬜ |
| I12 | Marketplace | — | 5 | I5, I8 | OP-012 · קופונים | — | ⬜ |
| I13 | מונטיזציה | — | 5 | I11, I12 | חשבוניות (תשלום מדומה, NFR-SEC-007; מחירון זמני, OP-030) | — | ⬜ |
| I14 | צוות Moderators | — | 4 | I4 | קהל היעד של הודעות מערכת · היקף ANALYTICS_VIEW | — | ⬜ |
| I15 | התאמה אישית ו-Intelligence | — | 5 | I3, I9 | Retention של אירועים · משקולות | — | ⬜ |

**כיסוי:**
- כל 83 ה-FR וכל 44 המסכים משויכים. ה-FR, ה-AC, ה-PG והישויות של כל Initiative נמצאים ב-[roadmap.md](.work/_initiatives/roadmap.md), רישום מאושר בלי סטטוס.
- כ-79 פיצ'רים, מהם 47 ב-MVP. השיתוף הוסיף שני פיצ'רים ל-I3 (תוספת 1 ב-`roadmap.md`).
- `escapes.md` ו-`noise.md` מתחילים לצבור רישומים מהיחידה הראשונה, 9.7.
