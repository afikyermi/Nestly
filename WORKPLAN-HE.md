# תוכנית עבודה — Nestly

**סטטוס קצר בלבד.** הכללים: `CLAUDE.md`. ההחלטות ומפת ה-Initiatives: `decisions-in-force.md`. המוצר: `docs/srs/`.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⬜ לא התחיל

## מטרה ותאריכים
- **26.10:** כל ה-SRS בנוי (I4–I14 ו-I9; ‏I15 אחרי ההשקה). **27.10:** המרצה בודק.
- **24.10 בחצות:** אין פיצ'ר חדש. **25–26.10:** חבילת הטסטים המלאה, ‏Edge וטסטי התמונות ורענון baselines, תיקון באגים (הרשימה למטה), משתמשי דמו ותוכן דמו דרך המוצר (`docs/lecturer-demo-plan-HE.md`), בדיקת SRS מול קוד, טבלת סטטוס FR ב-`17-traceability.md`, ייצוא Word.

## איפה אנחנו עומדים
**עודכן:** 22.10.2026, לילה · **SRS:** 2.36 על main (2.38 ב-#168, ‏2.39 ב-#174) · **Production:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app)
- **מוזג 20–21.10:** ‏#126 (I4) · ‏#119 (I6) · ‏#121 (I7) · ‏#136/#138 (I8) · ‏#130 (I5) · ‏#137/#139 (I14) · ‏#141/#145 (I10) · ‏#146/#148 (I11) · ‏#142 · ‏#147 · ‏#151/#162 (§9, §10) · ‏#152/#156/#158 (I12) · ‏#153/#155 (השלמות I11) · ‏#154 · ‏#157/#161 (השלמת I14 א') · ‏#160 (migration ‏I13) · ‏#164 (brief, ‏done-check, כללי SRS) · ‏#165 (תיקוני ביקורת #161) · ‏#166 (SRS 2.36: הוסרו Mention/Tag ו-Not Interested) · ‏#170 (Storybook 10.6.3, ‏advisory קריטי) · ‏#172/#173 (רשומות, ‏skills) · ‏#167 (migration באגי ביקורת, ‏definer ימי הולדת) · ‏#169 (migration השלמת I14 ב', ‏definer הסתרה).
- **migrate הצליח (preview, production):** ‏I8 ‏39507325686 · ‏I14 ‏39512483014 · ‏I10 ‏39535119509 · ‏I11 ‏39541622275 · ‏I12 ‏39566261400 · ‏השלמות I11 ‏39572527445 · ‏השלמת I14 ‏39619674702 · ‏I13 ‏39624013035 · ‏#167 ‏39681111309 · ‏#169 (נשלח 22.10 בלילה).
- **Preview אמיתי:** ‏70/70 אחרי #161 (39628326965). flow הצוות — רק כחשבון קהילה.

| # | Initiative | מצב |
|---|---|---|
| I1–I8 · I10 · I11 | | ✅ (השלמות I10/I11 לפי §11 — ⬜) |
| I12 | Marketplace | ✅; ⬜ השלמה ב' (§10.5–10.6) |
| I14 | צוות Moderators | ✅; השלמה א' ✅ חוץ מ-flow צוות; 🔄 השלמה ב': ‏#169 ✅, קוד ב-#174 |
| I13 | מונטיזציה | 🔄 בונה A: ‏#171 לפי §11.1–11.6, ואז `build/i13-code` |
| באגי ביקורת SRS (C) | | ‏#167 ✅; 🔄 ‏#168 (done-check: BLOCK, בתיקון) |
| I9 | מוכנות להשקה | ⬜ |

### ענפים ו-PR פתוחים (22.10, לילה)
- **#168** `fix/srs-audit-bugs` (קוד, ‏SRS 2.38): ירוק; ‏done-check BLOCK — חסרים: טסט web ל-SearchResults, ‏flows ב-Preview (חיפוש מוצא Professional, ‏Settings של Professional, יום הולדת מצד ה-Friend), ‏Moderator עם ANALYTICS_VIEW, תפריט הצוות, ‏Settings של Professional, שורות 17, כותרת גרסה. בונה B מתקן; אחר כך Chrome מלא + done-check חוזר.
- **#174** `build/i14b-code` (קוד השלמת I14 ב', ‏SRS → 2.39): בתיקון מ-main אחרי #169. ‏done-check: חסר החלק של הצוות ב-flow (ממתין לך 1). אחריו: PR migration קטן ל-FR-ADMIN-012 (בלי תאריך בדיקת מקורות) ו-migration שמוריד את `child_tracker_trends` של 30/90/365.
- **#171** `build/i13-usage-schema` → pgTAP 104, לפי §11; ‏`build/i13-code` (WIP) — בונה A.
- **#178** `build/i10c-schema` (השלמת I10 ג', migration בלבד, pgTAP 106): ירוק. ‏`build/i10c-code` (קוד, ‏SRS 2.41) — אחרי migrate.
- **#109** טיוטה, אחרי 27.10.

## המשך מכאן
**לסשן הבא:** עד 2 בונים על Opus במקביל (עד 24.10), כל אחד ב-worktree; ‏brief לפני כל Initiative, ‏done-check לפני מיזוג קוד. ה-briefs ב-`.work/briefs/` (I13, ‏I14-B) — לעדכן ל-§11.
1. ✅ ‏#167 → migrate → #169 → migrate (22.10 בלילה).
2. **#168:** תיקון פערי done-check, הרצת Chrome מלאה, ‏done-check, מיזוג; ‏preview-e2e.
3. **השלמת I14 ב':** ‏#174 ירוק → done-check → מיזוג (אחרי #168, ‏SRS 2.39).
4. **I13:** ‏#171 לפי §11.1–11.6 (pgTAP 104), ואז `build/i13-code`.
5. **השלמת I10** (§11.13–11.17): 🔄 #178 ירוק, הקוד ב-`build/i10c-code` · **השלמת I11** (§11.10, ‏§11.18–11.22) · **השלמת I12 ב'** (§10.5–10.6).
6. **I9** אחרון: job יומי אחד לכל המחיקות של §13.4 (נושאי חיפוש 30 יום, תוכן מוחזק, התראות 90 יום, מוני קצב שפגו, Audit/אבטחה/שחזור 12 חודשים, דיווחים שטופלו 12 חודשים, אירועי שימוש, פירוט קידומים 12 חודשים) — כולל שתי פונקציות ה-purge הקיימות ו-`purge_usage_events()` · ‏logger לשרת (באג 4) עם Sentry.
7. **24.10 (מרווח) — flows חסרים ב-e2e-preview:** פוסט+תגובה+לייק (משתמש אחר רואה) · העלאת תמונה אמיתית והבדיקה עוברת · סטורי שמשתמש אחר רואה · צ'אט בין שניים · קבוצה (יצירה, הצטרפות, פוסט) · דיווח ← החלטת צוות ← אכיפה · הצעת עזרה ← אישור ← ביקורת · פנייה למוכר ב-Marketplace · שמירת רשומת מעקב · ימי הולדת, חיפוש Professional, ‏Settings של Professional. **24.10 בחצות:** אין פיצ'ר חדש.
8. **25–26.10, יישור SRS:** הסרת טקסט HOW (auth, פיד, חיפוש, NFR-SEC-009/010) · עדכון להחלטות (BR-074, ‏OP-042, ‏OP-044, ‏Marketplace, תקופות FR-ADMIN-015) · טבלת הסטטוס ב-17 · §2.5 · Turnstile/Sentry — לא "מוגדר" לפני שיש קוד · AC-125 לפי התפריט · SENSITIVE_DATA_FULL_ACCESS מול §9 · FR-MOD-003 "בלי גלישה חופשית" מול §9.
**כלל:** פיצ'ר גמור רק אחרי שה-flow הראשי שלו עובר מול Preview אמיתי. **לפני כל מיזוג:** main ירוק; קבצים משותפים — הרצת Chrome מלאה. **סדר migrations:** ‏#167 ✅, ‏#169 ✅, ‏`20261023600000` (#171, ‏pgTAP 104), ואז FR-ADMIN-012.
**שעה 20:00:** משימה מתוזמנת יומית (19:52) עד 26.10; סיכום בוקר 22.10 ב-06:15.
**תחזית:** ‏22.10 #167–#169, השלמת I14 ב', ‏I13 · ‏23.10 השלמות I10/I11/I12 ב' ו-I9 · ‏24.10 מרווח ו-flows · ‏25–26.10 בדיקות, באגים, דמו, יישור SRS. בסיכון: כמות ההשלמות מ-§11.

## ממתין לך
**הוכרע 21.10 (לילה):** שני ה-definers אושרו (§12) ומוזגו (#167, ‏#169).
1. **Moderator לבדיקה ב-Preview (§10.1), חוסם את החלק של הצוות ב-flow של #174:** ה-cleanup לא יכול למחוק משתמש צוות שעשה פעולה (Audit Log append-only, הקישור ל-actor הוא RESTRICT), וה-workflow של הבדיקות בלי environment (DR-E1). ⭐ צעד אחד ב-job עם environment ‏`preview-e2e` שיוצר את ה-Moderator, וה-cleanup מוחק את רשומות ה-Audit שלו ב-Preview בלבד (ה-trigger כבוי בטרנזקציה אחת). חלופות: ‏SET NULL בקישור (משנה גם Production) · ‏Moderator קבוע ב-Preview.
2. **ימי הולדת (#167/#168):** הפרופיל לא מציג שם ילד לאף אחד (FR-PRIV-001), ולכן כל Friend מקבל "יום הולדת לילד או לילדה של <הורה>". שם לא נשמר בהתראה. ⭐ להשאיר; כדי להציג שם צריך החלטה ש-Friend רואה שמות ילדים בפרופיל. · "לילד/ה" → "לילד או לילדה" (NFR-USAB-003 אוסר לוכסן) · זמן ההתראה = זמן המסירה (לא חושף תאריך לידה). לאשר. · **חוויה:** ההתראה נוצרת רק כשה-Friend פותח את מסך ההתראות (חלון 7 ימים, OP-059) — ⭐ ליצור גם בטעינת הפעמון · התראה שנמסרה נשארת גם אחרי כיבוי המתג/חסימה — ⭐ להסתיר (I9 או 25–26.10). · ‏OP-061 (analytics) עדיין פתוח.
3. **השלמת I14 ב' (#174), נבנו לפי ⭐:** ‏OP-062 — הכותב והמדווחים לא רואים שינוי בהסתרה (**חוויה:** הפוסט "נעלם" בשקט; הצעה: "התוכן בבדיקה" לכותב) · ‏OP-063 — מוסתר אוטומטית מיד אחרי ילדים בתור · ‏OP-064 — דיווח תגובה בלי קישור לפוסט. **חוויה:** מדווח לא יודע מה יצא (הצעה: "הדיווח טופל") · כותב שתוכנו נמחק לא מקבל הסבר (הצעה: "הפוסט הוסר לפי כלל X") · 10 חשבונות מתואמים יכולים להסתיר תוכן לגיטימי (בנוי: בראש התור). · תמונת התאמה לרשימת hash נפתחת לצוות בלי Audit (הצעה: Audit לכל פתיחה). · ה-DB מתיר דיווח עד 1,000 תווים, המוצר 500 (הידוק ב-migration מאוחר).
4. **לבדוק ב-Production:** ‏`/admin/support` (סינון לפי סטטוס), ‏`/admin/audit` (סינון), ‏`/admin/analytics` — כ-Super Admin, שכל אחד נטען בלי "לא הצלחנו לטעון".
5. **מדריכי הסטטוס (BR-070):** לאשר ולפרסם את תשעת המדריכים במסך ניהול המדריכים.
6. **בדיקות במכשיר:** אייפון — מקלדת מעל שדה נמוך ("החלפת סיסמה") · גיליון השיתוף · חיוג בלחיצה למוקד · העלאת HEIC/Android.
7. **מהרשימה הקודמת, עוד לא עברנו עליהם (נבנו לפי ⭐):** 19 — ERR-043 בלי הפניה ל-Support; טופס Support למשתמש מחובר בלבד · 21 — תמונות: דיווח ישן שטופל עם action_taken מאפשר לצוות לדחות כל תמונה של המעלה בלי הגבלת זמן (⭐ להשאיר) · 26 — דגימת אימון עלולה ללכת לאיבוד אם ה-job רץ לפני סגירת הדיווח (⭐ לתקן ב-25–26.10) · 28 — ברירות I8 (חסימה מסתירה שיחה ובקשות; פתיחת הודעה מדווחת בהרשאת צפייה בדיווחים; Chat Block עד 20 ב-24 שעות; Support עד 5 ב-24 שעות; פנייה סגורה לא נפתחת; ביטול בקשת שיחה ממתינה) · 8 — OP-040: ילד עד יום ההולדת ה-18; לידה צפויה עד 300 יום קדימה · 20 — מונה כשלונות השחזור: נשמר כל עוד יש כשלונות, נמחק יום אחרי סוף הנעילה רק אחרי הצלחה (I9) · 5 — OP-037: ספירות מצטברות של "הסתרת פוסט" ל-Admin Intelligence (⭐ לא).
8. **ענפים למחיקה ידנית:** `ccr-21b5fcdf-l5yns9`, `ccr-517c29b5-ek8cc9`, `chore/preview-access`, `claude/guard-allowlist-implementation-xcv55m`, `wip/i2-f2.5-settings-menu`, `wip/i2-gateway-publishable-key`, `fix/password-abort`.
9. **סודות למחיקה (S-56):** הקובץ המקומי `.live/events.jsonl` · GitHub → Settings → Environments → `preview-e2e`: ‏`PREVIEW_SUPABASE_SECRET_KEY` · GitHub → Settings → Secrets → Actions: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD`.
10. **לפני השקה:** למחוק את קופוני הדמו (§10.6) · משתני Sentry/Turnstile · דומיין ו-DNS · אימייל/SMTP ו"שינוי אימייל מאובטח" (S-64) · ‏Supabase Pro · סריקת CSAM של Cloudflare · פרסום מסך ההסכמה של Google OAuth · החזרת דרישת האישור ב-`db-production` (S-59) · בחינה חוזרת של S-17/S-18/S-40 · ‏Vercel Pro או השקה לא מסחרית.
11. **השלמת I10 ג' (#178 + הקוד), נבנו לפי ⭐:** ‏OP-068 — הסף לפי החברים הפעילים עכשיו, ו-Highlight נשאר כשחברים עוזבים · ‏OP-069 — "קבוצה פעילה": 7 ימים, 3 אירועים לפחות, משקל יורד; בפיד של מי שאינו חבר עד 3 קבוצות ציבוריות בלבד · ‏OP-070 — אין אזהרה בלי השתקה, סיבה מרשימה + "אחר", Group Moderator ומעלה אוכף, ההיסטוריה למנהלים בלי מי שביצע · ‏OP-071 — המלצה והזמנה שתיהן נשארות, חבר מושתק לא מזמין ולא ממליץ. **חוויה:** (א) אין "הסרה רגילה" — מי שהוזמן בטעות אפשר רק לחסום (הצעה: "הסרה בלי חסימה" למי שהצטרף בשבוע האחרון); (ב) Professional בלי Friends לא יכול להזמין (הצעה: קישור הזמנה או המלצה גם ל-Professional); (ג) Highlight נשאר בפיד גם כשהחבר בחר "כבוי" להתראות הקבוצה (הצעה: "כבוי" מסתיר גם מהפיד); (ד) קבוצה פרטית לא מקבלת חשיפה בכלל (הצעה: להציג רק שם ותיאור כשהיא פעילה); (ה) כתיבה ישירה לחסימות נשארה פתוחה לקוד הישן — migration קטן שסוגר אותה אחרי מיזוג הקוד.
12. **מחקר התפקידים:** המסמך לא במאגר. שלח אותו (או את רשימת "אחרי הדמו" המלאה) ואשלים את הרשימה למטה.

## אחרי 27.10 (אפיק 21.10)
מה שסומן "אחרי הדמו" במחקר התפקידים: claim-lock (נעילת פריט בתור למי שפתח אותו) · אישור שני אנשים לפעולות רגישות · התראות צוות באימייל · מעקב בקשות פרטיות · (שאר הפריטים — כשהמסמך יגיע).

## טסטים לא יציבים
(טסט שנכשל ועבר בהרצה חוזרת אחת: שורה כאן, לא חוסם. כישלון שחוזר חוסם.)
- `e2e/profile.spec.ts:439` c11 (A9, חשבון מושהה) ו-`e2e/recovery-web.spec.ts:384` c18 — נכשלו בהרצת Chrome מלאה מקומית של השלמת I10 ג' תחת עומס, ועברו בהרצה חוזרת (22.10).
- `e2e-preview/professional-followups.flow.ts:34` — הבית של Professional לא הציג כותרות: עבר בהרצה חוזרת ב-21.10 (39628326965), חזר בשני המסכים ב-22.10 (39704654940). השרת עונה 200 נכון מקומית (בדיקת db חדשה); משך השלב עלה מ-5–9 ל-12–16 שניות. ה-flow מחכה עכשיו לתשובת `/api/professional/home` (עד 30 ש׳), בודק 200 ומדפיס את הזמן — ההרצה הבאה תראה אם זו איטיות או שגיאה.
- `e2e/friends.spec.ts:326` c15 (focus בדיאלוג) — עבר בהרצה חוזרת (21.10, ריצה מלאה על main).
- `e2e/feed.spec.ts:59` c13 — נכשל פעם בריצה מלאה של I11; תוקן כך שרשימת הבקשות לא תלויה בתזמון `/api/account/kind`.
- `e2e/professional-posting.spec.ts:156` c11 (desktop, עמוד פוסט של בעל מקצוע) — נכשל ועבר בהרצה חוזרת (21.10, ריצה מלאה של #121).
- `e2e/journeys-remove.spec.ts:72` c16 (Escape) ו-`e2e/posts.spec.ts:278` c18 (דיאלוג מחיקה בטלפון) — כל אחד עבר בהרצה חוזרת (21.10, בונה I14).
- `apps/web/tests/google/google-completion.test.tsx` — "an email+password orphan: step 2 has no password field": נכשל בהרצה מלאה תחת עומס ועבר בהרצה חוזרת (20.10, פעמיים).
- `registration-children-handoff.test.tsx` — נכשל פעם בהרצה מלאה ועבר לבד (20.10).
- `e2e/journeys-remove.spec.ts` c26 (Escape מחזיר פוקוס ל"הסרה") ו-`e2e/posts.spec.ts` c18 (חלון המחיקה, desktop) — נכשלו פעם אחת בהרצת Chrome מלאה של #138 (ריצה 39519509198) ועברו בהרצה חוזרת (21.10).
- `e2e/app-shell-guard-stories.spec.ts:82` c27 (axe על סיפורי ה-shell) — ה-story לא סיים להיטען (240 שניות) בהרצת Chrome מלאה מקומית של #168; עבר בהרצה חוזרת לבד (22.10).

## באגים לטיפול ב-25–26.10
מתוך יומן החוב שנמחק ב-20.10 (בהיסטוריית git). 🔒 = אבטחה או פרטיות.
1. 🔒 db-production: שגיאת libpq עלולה לצטט את סיסמת ה-owner ביומן ציבורי, אין PGSSLMODE, ו-matview/foreign table עוברים את ה-gate (ממצאים 1–4 של identity-platform a, נדרשים לפני כל אישור db-production) — .github/workflows/migrate.yml
2. 🔒 Actions ו-supabase CLI מוצמדים לתגיות שאפשר להזיז ולא ל-SHA, כולל ה-job שמחזיק את credential הייצור — .github/workflows/migrate.yml, .github/workflows/ci.yml
3. 🔒 סוד ה-bypass של Vercel חשוף: preview-smoke רץ מה-commit שנפרס עם secret של המאגר, ו-flow של e2e יכול לבקש את ה-fixture או את PREVIEW_E2E_BYPASS_FILE — .github/workflows/preview-smoke.yml, e2e-preview/support/fixtures.ts:39
4. 🔒 לשרת אין logger: כשלי config ו-500 לא נרשמים בשום מקום; ברישום עתידי של אובייקט השגיאה ייכתב ה-payload של jose (אימייל), ושורת 5xx בלי stack — apps/server/src/app.ts, apps/server/src/plugins/authentication.ts
5. ✅ (תוקן: z.strictObject עם חסמי .max(), נבדק 22.10) 🔒 סכמת שלב 1 בהרשמה: z.object רגיל (מפתחות זרים נמחקים ולא נדחים) ואין חסם גודל לפני הפיצול ל-code points — packages/shared/src/validation/registration-step1.ts
6. 🔒 שחזור סיסמה: מפתוח מחדש של ה-handle מאפס את מוני ה-throttle; אין ניקוי לשורות recovery_throttles שפגו ואין retention לאירועי audit של השחזור — apps/server/src/recovery
7. 🔒 איפוס הסיסמה עדיין שולח את המפתח הסודי ב-/token, כשמפתח ה-publishable מספיק (least privilege) — apps/server/src/recovery/auth-admin.ts:184
8. 🔒 כותב לא יכול למחוק פוסט או תגובה במצב hidden/removed (RLS); נסגר במיגרציה של I4 — posts_select_viewer, comments_select_viewer, content_hold
9. 🔒 purge_held_content() לא בודק current_user = 'app_jobs'; רק פקודת ה-job המוצמדת מונעת הרצה כ-postgres — supabase/migrations (פונקציית ה-purge של F3.0b)
10. 🔒 החלפת בעלי ה-token בלי sign-out: loadMore שומר את הכרטיסים של A תחת B, ו-Back משחזר אותם ל-B — apps/web/src/features/posts/use-feed.ts
11. 🔒 פערי בדיקה: PATCH של מי שאינו הכותב על פוסט אנונימי (404 ולא 422, מניעת oracle), ושורה מוחזקת שנחשפת לכותב שלה אחרי commit (שתי טרנזקציות) — apps/server/tests/db/anonymous-post.db.test.ts, supabase/tests/76_feed_held_purge.sql
12. משתמש Auth בלי שורות nestly אחרי sign-up שנכשל באמצע: לבדוק אם F1.5 סגר את זה (סומן "must close at F1.5", לא סומן paid) — מסלול ההרשמה ב-apps/server
13. ✅ (תוקן: /terms ו-/privacy פתוחים גם למחובר, access.ts, נבדק 22.10) ‏/terms ו-/privacy הם נתיבי Guest, ולכן משתמש מחובר מנותב מהם ואינו יכול לקרוא את מה שאישר (I9) — apps/web/src/app (החלטת גישה)
14. נתיבי הסיסמה נחסמים ב-isAdminConfigured כשחסר SUPABASE_PUBLISHABLE_KEY, אף שאינם משתמשים בו (fail closed) — apps/server/src/recovery/dependencies.ts:52
15. מיגרציות ו-DB: down script שמבצע drop schema cascade גם אחרי מיגרציות מאוחרות יותר; מיגרציה שנערכה אחרי dispatch מדולגת ב-Preview; drift לא משווה ערכי enum/CHECK ורשימת העמודות קשיחה; נתיבי הסירוב של bootstrap 02 לא נבדקים — supabase/rollback/20261014100000_identity_schema.down.sql, .github/workflows/migrate.yml, apps/server/scripts/drift.ts, supabase/bootstrap/02-anchor-fk.sql
16. נגישות (WCAG 2.4.11): ה-scroll-padding מותאם ידנית לגובה הבר; ‏/profile ו-/settings לא נבדקים ב-focus-not-obscured; מקלדת ב-iOS עלולה לכסות שדות — apps/web/src/styles/index.css:10, e2e/focus-not-obscured.spec.ts, apps/web/index.html:5
17. פיד, UX: לייק שנכשל אחרי יציאה מהפיד לא מבוטל בזיכרון; הודעת הכשל מוצגת רק מתחת ל-h1; שחזור הגלילה מחכה ל-/api/profile בלי timeout; כשל שליחה אחרי חזרה לא מציג ERR-004 — use-feed.ts, FeedScreen.tsx, feed-scroll.ts, FeedComposer.tsx (apps/web/src/features/posts)
18. ניווט והיסטוריה: מצבי מרוץ ב-useBackCloses (stepping/pending); usePostScroll מפסיק בכל לחיצה, מפת המיקומים לא מוגבלת, ה-scroller נבחר פעם אחת — apps/web/src/hooks/use-back-closes.ts, apps/web/src/features/posts/post-scroll.ts, outside-press.ts
19. ביצועים: כל עמוד פיד מדרג את כל המאגר בלי תקרת מועמדים; סריקת כל התשובות לכל הורה (חסר אינדקס); בקשת תגובות אחת לכל כרטיס — apps/server/src/repositories/feed-repository.ts, comments-repository.ts
20. בדיקות חלשות או חסרות: אורך cursor (512) לא מוכח; אין unit ל-withLike; reset של refreshRefused; מונה הכישלונות באי-התאמת אימייל; טלפון ב-post Back; ports; sslmode; SECRET_ENV מיובא מהקוד הנבדק — feed-ranking.test.ts, feed-state.ts, auth-client.ts:176-179, e2e/ux-polish-a.spec.ts, playwright.ports.ts, tools/db-local.mjs, tools/preview-e2e.test.mjs:282
21. e2e/CI לא יציבים: ‏route.abort על route שכבר טופל; ספירת הצלחה לפני commit; concurrency משותף ב-preview-e2e ו-cleanup; אין trace ב-CI; ה-cleanup נתקע מעל 50 משתמשים — e2e-preview/support/bypass.ts:25, e2e-preview/password-recovery.flow.ts:107, .github/workflows/preview-e2e-cleanup.yml:57-59, playwright.config.ts
22. CI/כלים (מינורי): ‏.mts/.cts מחוץ ל-lint; validateConfig ב-check-budgets; cache ריק של Playwright; כשל ב-changes מדלג על db; בדיקות cleanup שקוראות SQL כטקסט; db-local לא מריץ pgTAP; בדיקת ה-expand ב-P6 — eslint.config.mjs:140, tools/check-budgets.mjs, .github/workflows/ci.yml, tools/preview-e2e-cleanup.test.mjs:447, tools/db-local.mjs
23. הערות מטעות (טריוויאלי): held_xact "Never granted", ההערה של post_hides, כותרות בדיקה (anonymous-post:14, 74_feed…:112), README של rollback ב-bootstrap / 01-roles-check.sql:35, ProtectedLayout.stories; תפקידי probe ישנים ב-nestly-preview
24. 🔒 מגיש דיווח יכול לקרוא ברמת המסד את resolution, ‏handled_by ו-handler_note של הדיווח שלו (ה-API לא מחזיר אותם). תיקון: הרשאת SELECT לפי עמודות בלי שלושתן, וצוות קורא דרך נתיב נפרד — supabase (טבלת reports, I4)
25. I12: הסתרת מודעה ע"י MARKETPLACE_MODERATE בלבד לא מזינה את סט האימון (כמו בפוסטים) · תמונה של מוצר ממומן שהוסר לא נמחקת · דיווח פתוח על מודעה שנמחקה לא פג ונופל מהתור (נפתר אם OP-053 ⭐) · צוות ב-/marketplace רואה מודעות של בעלים מושעים או חסומים.
