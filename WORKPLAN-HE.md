# תוכנית עבודה — Nestly

**מסמך חי.** מתעדכן בסוף כל שלב, באותו commit.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⏸️ נדחה בהכרעה · ⬜ לא התחיל

**חוק עבודה:** כללי העבודה מ-11.10 (`CLAUDE.md`, "Decision authority"): אני מחליט את מה שלא שמור לך ורושם.
**חוק סנכרון:** כל שינוי במערכת מתעדכן ב-SRS. המנגנון נקבע ב-D1.

---

## איפה אנחנו עומדים

**עודכן:** 15.10.2026 · **גרסת SRS:** 2.14 · **מצב:** בניית מוצר. מערך הסוכנים קפוא עד ש-I1 ממוזג (הכרעתך מ-13.10, `decisions.md`).

- **✅ PR שיפור הבדיקות — מוזג** (PR 26, ‏`02842b0`, ‏15.10; ‏`.work/test-rules/result.md`): ‏test-engineer 1.6, ‏spec 1.3, ‏workflow 1.14 ("Test rules — this project"); ‏CI: ‏Chrome בלבד ב-PR, ‏`browser-edge` אחרי מיזוג ל-main ובהפעלה ידנית, ‏`update-baselines`; צילומי Playwright חוסמים (‏`SCREENS` ריק עד משימת ה-baselines); ‏SRS 2.14. ‏CRITIC: ‏Validated with Concern בשני הסבבים (‏1–7 תוקנו, ‏8 נדחה בנימוק תקציב שורות); ה-Concern ב-`debt.md`. **הכרעתך 15.10: ‏Edge כמו שנבנה** (‏`decisions.md`). **מי שממזג קורא את `browser-edge` על main** — אדום שם אינו חוסם דבר. ריצת main הראשונה (38702161133): ‏browser-edge ‏1 ו-2 ירוקים, כל הריצה ירוקה.
- **✅ F1.4 `register-account-create` — מוזג** (PR 25, ‏`0cdd5fa`, ‏15.10; ‏`.work/register-account-create/`): ‏Gate 1 ו-Gate 2 עברו (כולל Amendment 1, הרשאות INSERT לפי עמודה). **חלק a (סכמה, RLS, pgTAP) ✅:** ‏CI ירוק ב-`eac7f7e`, ‏CRITIC: ‏Validated אחרי בדיקה חוזרת. **חלק b (שרת) ✅:** ‏`POST /api/register` (הדפדפן קורא ל-Supabase Auth — הכרעתך "א"), ‏`@nestly/shared` נבנה ל-JS לפונקציה. ‏CI ו-preview-smoke ירוקים ב-`b0b8792`, ‏CRITIC: ‏Validated אחרי בדיקה חוזרת. **חלק c (מסך) ✅:** שלב 2, מודול Auth בדפדפן, הודעות ושחזור, סריקה מצומצמת. ‏CI ירוק ב-`91363a0`, ‏CRITIC: ‏Validated אחרי בדיקה חוזרת. **‏Preview ✅ (15.10, `nestly-mch3ezhjm`):** הרשמה אמיתית עם שני ילדים ותאריך לידה משוער — 201 ו-`/feed`, השורות נכונות; אימייל חוזר — ההודעה הכללית. ‏`.work/register-account-create/result.md`. **מוזג.**
- **✅ כלי ה-Preview — מוזג** (PR 21, ‏`2d877b2`, ‏14.10; ‏`.work/preview-access/result.md`): ‏`preview-smoke` (רץ על כל Preview: ‏health ‏200, נתיב מוגן נכשל סגור) ו-`tools/preview-shot.mjs` (צילום Preview מוגן). השרת מוחק את כותרת ה-bypass. ‏CRITIC: ‏Validated with Concern; ‏1–4 נסגרו, 5 ב-debt, 6 אומת בריצה הראשונה.
- **✅ F1.3 `register-profile-step` — מוזג** (PR 22, ‏14.10; ‏`.work/register-profile-step/result.md`): שלב 1 בהרשמה — שלב במסע, שם, מין ההורה, תאריך לידה משוער, ילדים 1–10; הנתונים בזיכרון הטאב בלבד. ‏CRITIC: ‏Validated with Concern (סכמה strict ב-F1.4 Gate 2, ‏debt). ה-Preview נבדק ב-375 וב-1024.
- **✅ האצה — מוזג** (PR 23, ‏`a756931`, ‏14.10, בקשתך): ‏CI ‏browser כ-matrix (Chrome/Edge × 2 shards): ‏4–5 דק׳ במקום 16–18. ‏Vercel בונה כל ענף עם PR פתוח, בלי תלות בסדר push/PR. ‏vitest רץ מהשורש. ‏CRITIC: ‏Validated. סעיפים 4–6 אושרו (‏14.10) ונבנו ב-`chore/speed-up-2`: ‏TEST ENGINEER עורך ומריץ את הטסטים שלו, ‏BUILDER כותב `interface.md`, ו-jq אינו נחשב נתיב ב-guard. ‏CRITIC (opus): שני ממצאים גבוהים ב-guard תוקנו, ‏Validated.
- **✅ F1.2 `app-shell-guard` — מוזג** (PR 19, ‏`53b85d0`, ‏14.10; ‏`.work/app-shell-guard/result.md`): מסך Welcome, ‏AppShell, ‏RouteGuard ושכבת session. ‏CRITIC: ‏Validated with Concern, וארבעה ממצאים קלים נסגרו. ה-Preview נבדק על production אחרי המיזוג ב-375 וב-1024.
- **✅ תוכנית ההצגה למרצה — נכתבה** (15.10, בקשתך): מסמך הרעיון שלך ב-`docs/lecturer-demo-idea-HE.md` (שונה שמו ונכנס למעקב). התוכנית ב-[docs/lecturer-demo-plan-HE.md](docs/lecturer-demo-plan-HE.md), והסטטוס בחלק 10 למטה. עמדתי על השאלות מסעיף 15 בתוכנית, בסעיף 4.
- **ממתין להכרעה שלך** (פירוט בתוכנית, סעיף 5; עד שתענה, ממשיכים ב-I1 וב-I2–I5):
  1. **תאריך ההצגה.** ההיקף הוא כ-75 פיצ'רים, כלומר לפחות 2.5–3 חודשים.
  2. **G1–G6**, פיצ'רים שאינם ב-SRS: "קנייה" במרקטפלייס = פנייה וצ'אט · ביקורות ליועצים אחרי פנייה (OP-025) · מאמרים של יועצים · ניהול מדריכים באדמין (OP-024) · ‏CAPTCHA ‏Turnstile ב-I9 · תשלום מדומה דרך ממשק. לאשר את ההמלצות, או לשנות פריט.
  3. **מחירון** לקידום ולחסות: אתה קובע, או מחירים זמניים שמסומנים TBD.
  4. **זמנים אחורה** לתוכן הדמו: הזזה אחרי היצירה (מומלץ) · יצירה הדרגתית · הכול מאותו יום.
  5. **סעיף 15:** לאשר את העמדות (מודרטור נפרד דרכך · תוכן הדמו גלוי לכולם · קוד הצגה · הנפח מספיק · מקורות ואישור שלך).
- **ממתין לך (סודות ופעולות):**
  1. **קובץ יומן מקומי ישן** `.live/events.jsonl` (טקסט מפרומפטים, לא ב-git): מחיקה היא שלך. אחריה אפשר להסיר את `.live/` מ-`.gitignore`.
  2. **מחיקת ענפים מרוחקים שמוזגו:** ‏`ui-wave-1/part-a` עד `part-e`, ‏`chore/i1-prep`, ‏`chore/guard-env-paths` (מוזג), ‏`chore/preview-access` (הוחלף ב-`-v2` אחרי rebase), ‏`chore/records-after-f12` (מוזג).
  3. **ב-F1.8:** הגדרת Google Cloud והסודות — אנחה אותך צעד-צעד.
- **פתוח, בלי הכרעה עכשיו:** החלטות המדיה M1–M6 לפני I5 · תקציב לביקורת משפטית לפני I9 · אם בניות ש-Vercel דילג עליהן נספרות במגבלה, עוברים ל-`git.deploymentEnabled`.
- **התקדמות מוצר (שורה לכל סשן):**
  - 15.10 (המשך): תוכנית ההצגה למרצה נכתבה (חלק 10). חמש הכרעות ממתינות לך.
  - 15.10: ‏F1.4 מוזג (PR 25) ו-migrate רץ על production. ‏PR שיפור הבדיקות מוזג (PR 26): בדיקות מקומיות מלאות, ‏SRS 2.14, ‏CRITIC פעמיים, ‏CI ירוק. הכרעתך: ‏Edge כמו שנבנה.
  - 14.10: ‏F1.1 הושלם, שלושה PRs מוזגו (15, 16, 17). הסכמה הראשונה הוחלה על preview, ו-pgTAP עבר 394/394. ‏F1.2 מוזג (PR 19). ‏Welcome חי ב-production, ואורח מנותב אליו. כלי ה-Preview מוזג (PR 21), ו-F1.3 נפתח. ‏F1.3 מוזג (PR 22). האצת CI מוזגה (PR 23).
- **להמשך (מסירה ל-session הבא):**
  0. **מסלול ראשי עכשיו — ה-debt שלפני F1.5: 🔄 ענף `chore/debt-before-f15`** (‏`.work/debt-before-f15/`): ‏D1 טסט pgTAP ל-`is_active_account` (סוגר את b-1), ‏D2 הטסט האיטי פוצל לארבעה (כשנייה כל אחד), ‏D3 ה-error handler רושם ללוג רק status, ‏code ו-name. בדיקות מקומיות ירוקות; ‏DATA ARCHITECT אישר את D1; ‏CRITIC (opus): ‏Validated, ממצא נמוך 1 תוקן ואומת, ממצא 2 כמו שנבנה עד C4 (‏debt). ‏pgTAP רץ לראשונה ב-CI. כולל את הרשומות שחיכו (ענף הרשומות ותוכנית ההצגה). **הבא:** ‏CI ירוק → מיזוג → ‏F1.5 (‏login-session): ‏intake ו-spec לפי הכללים החדשים (סוג לכל קריטריון, שכבה אחת, ‏Chrome ב-PR). **משימות נפרדות שנותרו מ-PR 26:** צילומי baseline לכל המסכים (‏`SCREENS` + ‏PNG מ-`update-baselines`, והסרת בלוק Q3 ב-`e2e/part-f.spec.ts`); הצעת איחוד כפילויות (בלי מחיקה לפני אישורך); בדיקת Preview אוטומטית ב-CI.
  1. **איפה עומדים:** ‏I1: ‏F1.1–F1.4 מוזגו (‏F1.4: ‏PR 25, ‏`0cdd5fa`, ‏migrate ב-production ירוק). ‏PR שיפור הבדיקות מוזג (‏PR 26, ‏`02842b0`). ‏SRS ‏2.14. ‏Production: ‏[nestly-blue.vercel.app](https://nestly-blue.vercel.app). מערך הסוכנים קפוא עד סוף I1, מלבד החריגים שאישרת (האצה, כלל ההמתנה, שיפור הבדיקות).
  2. **הבא בתור:** אחרי PR שיפור הבדיקות — ‏F1.5 (‏login-session): ‏intake ו-spec לפי הכללים החדשים (סוג לכל קריטריון). ב-F1.5 נסגרים ה-debt של המשתמש היתום (Q2/Q8/500) וה-debt שמסומן "חייב לפני F1.5".
  3. **בדרך:** שינוי קטן ב-`tools/critic-diff.mjs` (בלי package-lock, ‏noise, ‏incidents ו-.claude/logs) נכנס עם הפיצ'ר הבא. לפני F1.5: ‏PR אחד שסוגר את ה-debt שמסומן "חייב לפני F1.5", כמו הבדיקה של `is_active_account`.
  3א. ✅ **בוצע ב-PR 26 (15.10).** **אחרי מיזוג F1.4, לפני F1.5 — שיפור הבדיקות** (הכרעתך מ-14.10, חריג להקפאה, `decisions.md`): ‏PR אחד שמעדכן את `test-engineer.md`, ‏`spec.md` (הסוכן) ו-`workflow.md` עם changelog: עומק לפי סוג קריטריון (🔴/🎨/🟡), שכבה אחת לכל התנהגות, ‏Chrome בלבד ב-PR (מחשב וטלפון) ו-Edge לפני production, צילומי מסך חוסמים, תקרה רכה של פי 2, בלי בדיקות חדשות לכלים. ‏CRITIC בודק לפני מיזוג. אחריו, כמשימות נפרדות: (1) צילומי baseline לכל המסכים הקיימים; (2) הצעת איחוד כפילויות (part-d/e/f ו-form-controls ב-vitest מול e2e) — בלי מחיקה לפני אישורך.
  4. **פתוח אצלך:** הפריטים 1–3 ב"ממתין לך". אימתת ב-14.10: ‏Git Fork Protection פועל, ל-`db-production` יש reviewer חובה וכלל main-only, ו-Node ב-Vercel הוא 22.x.
  5. **כללי עבודה:** בדיקות מקומיות בין שלבים, ‏push אחד לכל חלק. ‏draft PR נפתח מיד אחרי ה-push הראשון של הענף, כי Vercel בונה Preview רק לענף עם PR פתוח. ה-diff ל-CRITIC רק דרך `tools/critic-diff.mjs`, ובלי נימוקי BUILDER בתדריך (‏incidents ‏14.10). ‏spec עד כ-150 שורות, וטסט אחד או שניים לכל קריטריון.
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

עם נתונים מ-7 פיצ'רים (escapes, noise, planned vs actual, קריאות מודל לפיצ'ר): מה עבד, מה רק עלה כסף, ומה להוריד. שורה אחת לכל רעיון.

- פיצ׳ר עם migration: להריץ `migrate` מהענף על nestly-preview לפני ה-Preview (שכחנו ב-F1.4; מצב auto חוסם את ORCHESTRATOR מלהפעיל אותו).
- בדיקת Preview אוטומטית ב-CI (‏Playwright מול ה-Preview, חשבון בדיקה אקראי ב-nestly-preview) — ORCHESTRATOR אינו רשאי ליצור חשבון או להקליד סיסמה מחוץ ל-localhost; מוצע ל-PR שיפור הבדיקות.
- `workflow.md` שורה 36: תיאורי ה-as-built הם `data-model.md` (כולל `data-model-tables.md` המקושר, מ-F1.4) ו-`conventions.md` — לציין את הקובץ החדש.
- skills שלב ב: `react-web`, `fastify-api`, `drizzle-postgres`, `testing-craft`, `shared-contracts`, `rls-tests` (חריג: skill ממוקד אחד אחרי שני כשלים על אותה בעיית craft).
- 6.1: domain של Threat Modeling.
- 7.2: בדיקת ה-hook של security-guidance.
- skills שלב ג: דוגמאות שמפנות לקוד אמיתי, `/srs-coverage`.
- הצעת BUILDER לעדכון conventions "Git and shell" אחרי תיקון כלל ה-env (`.work/guard-env-paths/notes.md`).
- סוכן שמריץ `node -e` עם טקסט שמזכיר קובץ env נחסם (נכון לפי הכלל): פעמיים ב-13.10. לשקול שורה ב-conventions.
- חסימות fail-closed של כלל ה-env על ארגומנטים שנראים כמו glob (`.[]` של jq, ‏`gh api`): שלוש ב-14.10, כלומר סף הדפוס. יש עקיפה סבירה, ולכן אין חריג הקפאה. ההצעה של CRITIC (debt): כלל לא-קריטי לעמימות.
- גדר הקריאה של TEST ENGINEER: ‏21 חסימות ב-F1.1, ועקיפה דרך טסטי סריקה ב-F1.2. לבחון לתת לו לקרוא טיפוסים וממשקים מיוצאים במקום חסימה גורפת (הכרעתך מ-14.10).
- ה-guard חוסם כל פקודה של סוכן שה-cwd שלו הוא worktree תחת `.claude/worktrees/` ("not the project root"): ‏TEST ENGINEER נחסם 5 פעמים ב-3 דקות (14.10, ‏preview-access). בינתיים: ענפים נבדקים ב-checkout הראשי, לא ב-worktree, ו-ORCHESTRATOR מריץ את הטסטים.

## חלק 10 — הצגה למרצה 🔄 (15.10.2026)

**מה:** מסמך הרעיון שלך, [docs/lecturer-demo-idea-HE.md](docs/lecturer-demo-idea-HE.md). **איך:** [docs/lecturer-demo-plan-HE.md](docs/lecturer-demo-plan-HE.md). **ההחלטה:** `decisions.md`, 15.10, "Lecturer presentation". **הסטטוס:** רק כאן.

| # | שלב | תלוי ב | מצב |
|---|---|---|---|
| 10.0 | רשומות: המסמך במעקב, התוכנית, החלק הזה, `decisions.md` | — | ✅ 15.10 |
| 10.1 | הכרעות: תאריך · ‏G1–G6 · מחירון · זמנים אחורה · סעיף 15 | — | ⏳ אצלך |
| 10.2 | ‏SRS ‏2.15: ‏G1–G7, ‏OP-024, ‏OP-025, אחריות על תוכן משתמשים, היקף I1–I14 לפני ההצגה, כלי ההצגה מחוץ למוצר | 10.1 | ⬜ |
| 10.3 | שלב א — מוצר: ‏I1–I14 בלי I15, לפי חלק 8 | — | 🔄 ‏I1 |
| 10.4 | מדריכים לפי סטטוס (תוכן מערכת): ‏Claude כותב, ואתה מאשר כל מדריך | I6, 10.2 | ⬜ |
| 10.5 | שלב ב — כלי ההצגה: spec, ‏Gate 2, ‏CRITIC על opus | 10.2; מתחיל אחרי I8 | ⬜ |
| 10.6 | שלב ג — תוכן הדמו: דמויות, סיפורים, פוסטים, מוצרים, תמונות | 10.5 | ⬜ |
| 10.7 | שלב ד — הכנסה ל-nestly-preview, חזרה גנרלית בכל תפקיד, ואחר כך production (באישורך) | 10.3, 10.6 | ⬜ |
| 10.8 | שלב ה — איפוס, הצגה, איפוס | 10.7 | ⬜ |

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
- כל פיצ'ר עובר במסלול Elevated.
- החלטה פתוחה שחוסמת Initiative מוגשת לפני שה-Initiative נפתח.

| # | Initiative | MVP | פיצ'רים | תלוי ב | חוסם לפני פתיחה | קובץ | מצב |
|---|---|---|---|---|---|---|---|
| I1 | חשבונות וגישה (Regular) | ✅ | 7 | 7, 9.7 | — (הוחלט) | [I1-accounts-access.md](.work/_initiatives/I1-accounts-access.md) | 🔄 F1.1: ‏Gate 1 עבר (13.10), חלק a בבנייה |
| I2 | פרופיל, פרטיות ו-Friends | ✅ | 5 | I1 | — (OP-021 נסגר) | — | ⬜ |
| I3 | פיד קהילתי, כולל שיתוף פנימי וחיצוני | ✅ | 8 | I2 | כללי קהילה · `algorithm.md` | — | ⬜ |
| I4 | בטיחות וניהול, ליבה | ✅ | 5 | I3 | סיבות דיווח · משכי השעיה | — | ⬜ |
| I5 | מדיה: תמונות בפוסטים ותמונת פרופיל | ✅ | 4 | I2, I3, I4 | M1–M6 | — | ⬜ |
| I6 | בית ומעקב | ✅ | 5 | I2 | OP-003 · OP-008 · שדות מחזור וביוץ · תוכן הטיפים | — | ⬜ |
| I7 | התראות וחיפוש | ✅ | 4 | I2, I3 | ספי rate limit · רשימת אירועים | — | ⬜ |
| I8 | שיחות ו-Support | ✅ | 5 | I2, I4, I7 | נושאי פנייה | — | ⬜ |
| I9 | מוכנות להשקה | ✅ | 4 | I1–I8 | Retention · ביקורת משפטית **ותקציב** · OP-017 · יעדי NFR · רשימת מוזמנים | — | ⬜ |
| I10 | קבוצות | — | 5 | I3, I4, I7 | קטגוריות · Highlights | — | ⬜ |
| I11 | בעלי מקצוע ושירותים | — | 8 | I8, I3, I5 | OP-005 · OP-010 · OP-016 · קטגוריות · מקור הדירוג · מיקום | — | ⬜ |
| I12 | Marketplace | — | 5 | I5, I8 | OP-012 · קופונים | — | ⬜ |
| I13 | מונטיזציה | — | 5 | I11, I12 | ספק סליקה · מחירון · חשבוניות | — | ⬜ |
| I14 | צוות Moderators | — | 4 | I4 | קהל היעד של הודעות מערכת · היקף ANALYTICS_VIEW | — | ⬜ |
| I15 | התאמה אישית ו-Intelligence | — | 5 | I3, I9 | Retention של אירועים · משקולות | — | ⬜ |

**כיסוי:**
- כל 83 ה-FR וכל 44 המסכים משויכים. ה-FR, ה-AC, ה-PG והישויות של כל Initiative נמצאים ב-[roadmap.md](.work/_initiatives/roadmap.md), רישום מאושר בלי סטטוס.
- כ-79 פיצ'רים, מהם 47 ב-MVP. השיתוף הוסיף שני פיצ'רים ל-I3 (תוספת 1 ב-`roadmap.md`).
- `escapes.md` ו-`noise.md` מתחילים לצבור רישומים מהיחידה הראשונה, 9.7.
