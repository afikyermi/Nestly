# תוכנית עבודה — Nestly

**סטטוס קצר בלבד.** הכללים: `CLAUDE.md`. ההחלטות ומפת ה-Initiatives: `decisions-in-force.md`. המוצר: `docs/srs/`.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⬜ לא התחיל

## מטרה ותאריכים
- **26.10:** כל ה-SRS בנוי (I4–I14 ו-I9; ‏I15 אחרי ההשקה). **27.10:** המרצה בודק.
- **24.10 בחצות:** אין פיצ'ר חדש. **25–26.10:** חבילת הטסטים המלאה, ‏Edge וטסטי התמונות ורענון baselines, תיקון באגים (הרשימה למטה), משתמשי דמו ותוכן דמו דרך המוצר (`docs/lecturer-demo-plan-HE.md`), בדיקת SRS מול קוד, טבלת סטטוס FR ב-`17-traceability.md`, ייצוא Word.

## איפה אנחנו עומדים
**עודכן:** 21.10.2026, ‏08:10 · **SRS:** 2.32 על main · **Production:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app)
- **מוזג 20–21.10:** ‏#126 (I4) · ‏#119 (I6) · ‏#121 (I7) · ‏#136/#138 (I8) · ‏#130 (I5) · ‏#137/#139 (I14) · ‏#141/#145 (I10, SRS 2.31) · ‏#146/#148 (I11, SRS 2.32) · ‏#142 (תיקון ה-nightly) · ‏**#147 תיקון דחוף ב-production** (ראה למטה).
- **migrate (preview ו-production) הצליח** לכל ה-migrations: ‏I8 ‏39507325686 · ‏I14 ‏39512483014 · ‏I10 ‏39535119509 · ‏I11 ‏39541622275.
- **תיקון דחוף #147 (21.10):** ה-rewrite של Vercel ‏(`/api/:path*` → `/api/index`) מוסיף פרמטר `path` ל-query, וכל נתיב שבודק query ב-`z.strictObject` ענה 400 ב-production: מעקבים, התראות, העלאת תמונות, תיבת ה-Support של הצוות, audit, נתונים. ה-adapter מסיר את הפרמטר במקום אחד. ‏preview-e2e על Preview אמיתי: 62/62, כולל טסט חדש `e2e-preview/strict-query.flow.ts` (התראות 200, מעקבים 200, Support ‏200, העלאה 415 ולא 400). נתיבי האדמין לא נבדקו על Preview (משתמש הבדיקה אינו צוות).

| # | Initiative | מצב |
|---|---|---|
| I1–I8 | יסודות, פרופיל, פיד, בטיחות, מדיה, בית, התראות, שיחות | ✅ |
| I10 | קבוצות | ✅ (#141, ‏#145) |
| I11 | בעלי מקצוע ושירותים | ✅ (#146, ‏#148); השלמות בבנייה (ראה למטה) |
| I14 | צוות Moderators | ✅ (#137, ‏#139) |
| I12 | Marketplace | 🔄 בונה התחיל (21.10, 08:05) |
| I13 · I9 | | ⬜ |

### כל ענף פתוח
- **I12** בונה: migration → migrate → קוד.
- **השלמות I11 + מדדי Support** בונה: מדדי Support ‏(FR-ADMIN-003, סעיף 27) · רשימת "עוקב אחרי" (PG-039) · דיווח על ביקורת ומאמר · הרשמת בעל מקצוע ממצב "השלמת הרשמה" · הודעת הצעת העזרה בשיחה קיימת.
- **#109** טיוטה, ממתין לך (סעיף 11).

## המשך מכאן
1. ‏I12 והשלמות I11 — שני הבונים.
2. אחריהם: ‏I13 (אחרי I11 ו-I12), ואז I9 אחרון.
**לפני כל מיזוג:** הריצה האחרונה על main ירוקה. PR שנוגע בקבצים משותפים — הרצת Chrome מלאה לפני מיזוג.
**בונים:** עד 2 במקביל על Opus עד 24.10, אחר כך Sonnet.
**תחזית:** ‏21.10 ‏I12 והשלמות I11; ‏22.10 ‏I13; ‏23.10 ‏I9; ‏24.10 מרווח.

## ממתין לך
**לילה 20–21.10:** לפי בקשתך, כל שאלה פתוחה למטה נבנית לפי ⭐; אתה מאשר או משנה בבוקר.
1. ✅ **קצב:** 2 בונים במקביל על Opus (אפיק 20.10). קיצוץ היקף לא הוכרע — בונים הכל לפי הסדר.
2. **I6 — שאלות פתוחות (בנינו ברירת מחדל, אפשר לשנות):** (א) **OP-003** — סדר המסלולים בבית: ⭐ כל המסלולים, בסדר הריון, ילדים, תכנון, מחזור · (ב) **חלון הביוץ:** ⭐ ביוץ 14 יום לפני המחזור הבא, חלון מ-5 ימים לפני עד יום אחרי, מוצג כהערכה בלבד · (ג) **בית לבעל מקצוע (OP-016):** היום Professional שנכנס ל-/home רואה שגיאה. ⭐ מפנים אותו לפיד עד שהבית שלו נבנה ב-I11.
3. **I6 — מדריכי הסטטוס (BR-070):** תשעת המדריכים שמורים כטיוטות ולא מוצגים. אחרי שמסך ניהול המדריכים נבנה (אחרי I4), אתה מאשר ומפרסם.
4. ✅ **I4 — חשבון Super Admin:** נוצר בשתי הסביבות (אפיק 20.10); ב-production התפריט מוצג. ב-Preview: לבדוק אחרי ריצת ה-nightly הבאה (`ready/nightly` עוד לא כולל את קוד האדמין).
5. **OP-037 (פרטיות; ל-I15):** ספירות מצטברות של "הסתרת פוסט" ל-Admin Intelligence? ⭐ (א) לא · (ב) כן, מצטבר בלבד, בלי זהות ובלי השפעה על דירוג.
6. **‏§18.6 ו-ANALYTICS_VIEW (קטינים; ל-I14):** האם "נתונים לכל משתמש בלי שמות" חל גם על שורות של ילדים? ⭐ (א) לא — שורות ילדים מצטברות בלבד · (ב) כן.
7. **OP-039 (ל-I14):** גרפי המנהל ב-I14 מול איסוף אירועים רק מ-I15. ⭐ (א) ב-I14 רק גרפים מטבלאות המוצר · (ב) איסוף אירועים מינימלי ב-I14.
8. **OP-040 (קטינים; ל-I9):** ⭐ (א) ילד עד יום ההולדת ה-18 (לא כולל); לידה צפויה עד 300 יום קדימה · (ב) אחר.
9. **כללי דיווח שנבנו (מדיניות דיווח):** דיווח אחד לכל יעד; סף 3 דיווחים סופר אנשים. ⭐ (א) מאשר · (ב) לשנות. ובקווים הרפואיים: מאוחדת "מוקד טלפוני 24/7" במקום "קו אחות" — ⭐ מאשר.
10. **OP-038 (ל-I11):** סימון פוסט "מבקש עזרה". ⭐ (א) תיבת סימון בכתיבת הפוסט · (ב) אחר.
11. **PR-B — תזמון המחיקה הסופית (draft PR #109, ענף `work/purge-schedule`; יעד לפני 16.01.2027):** pg_cron לא מריץ job כ-`app_jobs` (בלי login). ⭐ לאשר: ה-job שייך ל-postgres ומריץ `set role app_jobs; select nestly.purge_held_content()` — המחיקה עצמה רצה כ-app_jobs תחת RLS. אחרי אישור: מיזוג, הרצה ב-Preview, ואז הרצה שלך ב-production.
12. **ענפים למחיקה ידנית:** `ccr-21b5fcdf-l5yns9`, `ccr-517c29b5-ek8cc9`, `chore/preview-access`, `claude/guard-allowlist-implementation-xcv55m`, `wip/i2-f2.5-settings-menu`, `wip/i2-gateway-publishable-key`, `fix/password-abort`.
13. **סודות למחיקה (S-56):** הקובץ המקומי `.live/events.jsonl` · GitHub → Settings → Environments → `preview-e2e`: ‏`PREVIEW_SUPABASE_SECRET_KEY` · GitHub → Settings → Secrets → Actions: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD`.
14. **בדיקות במכשיר:** אייפון — מקלדת מעל שדה נמוך ("החלפת סיסמה") · גיליון השיתוף · חיוג בלחיצה למוקד · ב-I5: העלאת HEIC/Android.
15. **I6:** לאשר את המדריכים (BR-070) — ראה סעיף 2.
16. **לפני השקה:** משתני Sentry/Turnstile · דומיין ו-DNS · אימייל/SMTP ו"שינוי אימייל מאובטח" (S-64) · ‏Supabase Pro · סריקת CSAM של Cloudflare · פרסום מסך ההסכמה של Google OAuth · החזרת דרישת האישור ב-`db-production` (S-59) · בחינה חוזרת של S-17/S-18/S-40 · ‏Vercel Pro או השקה לא מסחרית.

17. **I5 — הקמת תמונות:** ✅ בוצע על ידך (20.10) בשתי הסביבות.
18. ✅ **I8 — הוכרע (אפיק 20.10):** נכנס ל-SRS 2.30 ב-#138; §9 יצא מ-`decisions-in-force.md`.
19. **ERR-043 והפניה ל-Support:** נבנה לפי ⭐ (א) — אין הפניה ל-Support ב-ERR-043; טופס ה-Support למשתמש מחובר בלבד (בתפריט "פנייה לתמיכה" ובמסך השיחות). אפשר לשנות.
20. **שמירת מונה הכשלונות בשחזור (RecoveryThrottle):** ⭐ (א) נשמר כל עוד יש כשלונות; נמחק יום אחרי סוף הנעילה רק אחרי הצלחה (אימייל שלא מצליח נשמר ללא הגבלה) · (ב) נמחק יום אחרי סוף כל נעילה, והספירה מתחילה מחדש. רלוונטי ל-I9.
21. **תמונות — עילת דחייה:** דיווח ישן שטופל עם action_taken על המעלה מאפשר לצוות לדחות כל תמונה שלו, בלי הגבלת זמן. ⭐ (א) להשאיר · (ב) להגביל לתמונות שהועלו לפני הטיפול בדיווח או לחלון זמן.
22. **I14 — נבנה לפי ⭐ (לאשר):** סעיף 6 (א) בלי שורות ילדים/שלב בנתונים · סעיף 7 (א) גרפים רק מטבלאות המוצר (OP-039 נשאר פתוח) · סעיף 21 (א) בלי הגבלת זמן לעילת דחייה.
23. **OP-042 (I14):** קהל הודעות המערכת. נבנה: ⭐ כל המשתמשים, בראש הפיד · (ב) אחר.
24. **ANALYTICS_VIEW — מודל הגישה (פרטיות):** נבנה: מדיניות `*_select_analytics` חושפת שורות שלמות רק בתוך טרנזקציית הנתונים, והשרת מחזיר ספירות בלבד (כמו `staff_view` ב-I4). ⭐ (א) לאשר · (ב) פונקציית SECURITY DEFINER שמחזירה ספירות בלבד (חריג שדורש אישורך).
25. **יצירת Moderator (אבטחה):** נבנה: קישור הזמנה חד-פעמי מה-Admin; ה-Moderator יוצר חשבון Auth נפרד בעמוד `/team/join`. זה מסלול יצירת חשבון חדש. ⭐ (א) לאשר · (ב) אחר.
26. **דגימות אימון (I5):** תמונה שהוסרה בעקבות דיווח עלולה לאבד את הדגימה אם ה-job היומי רץ לפני שהדיווח נסגר עם action_taken. ⭐ (א) לתקן ב-25–26.10 (באג) · (ב) לקבל.
27. **פער:** מדדי Support ‏(FR-ADMIN-003) עוד לא בנתונים — דורש migration עם מדיניות ניתוח על טבלאות ה-Support של I8. נבנה אחרי I8.
28. **I8 — ברירות מחדל (נבנו, OP-043/OP-044 ב-SRS):** (א) חסימת משתמש מסתירה את השיחה ואת בקשות השיחה משני הצדדים ומסיימת בקשה ממתינה · (ב) פתיחת הודעה שדווחה — בהרשאת צפייה בדיווחים, והטיפול הוא פעולה על חשבון השולח · (ג) Chat Block עד 20 ב-24 שעות · (ד) Support עד 5 פניות ב-24 שעות · (ה) פנייה סגורה לא נפתחת מחדש · (ו) השולח יכול לבטל בקשת שיחה ממתינה. ⭐ לאשר את כולן.
29. **I10 — חריג SECURITY DEFINER חדש (אבטחה):** ‏`notify_group()` (התראות קבוצה), באותה צורה ובאותם תנאים כמו ארבע פונקציות ההתראות שאישרת ב-I7 (§6). נבנה ונרשם ב-data-model. ⭐ (א) לאשר · (ב) לבטל את התראות הקבוצה.
30. **I10 — ברירות מחדל (OP-045..048, נבנו):** פוסט בקבוצה מוצג רק בעמוד הקבוצה, לא בפיד · רק Owner ו-Admin מזמינים, וחברים פעילים בלבד · אכיפה בקבוצה: הסרה, הסרה וחסימה, ביטול חסימה (בלי אזהרה והשתקה) · Highlight ב-5 לייקים ותגובות של אחרים; ברירת המחדל לחבר: Highlights. ⭐ לאשר.
31. **I10 — פערים ידועים (פרטיות):** תמונה שנחסמה בפוסט של קבוצה פרטית מגיעה לתור התמונות לצוות עם CONTENT_MODERATE (לפי מדיניות התמונות) · דיווח שהוגש כשהקבוצה הייתה ציבורית שומר עותק טקסט גם אחרי שהפכה לפרטית · חשיפת מחבר אנונימי בקבוצה פרטית עלולה להיכשל לצוות. ⭐ (א) לתקן ב-25–26.10 · (ב) לקבל.
32. **I11 — ברירות מחדל (נבנו):** ‏OP-038 ⭐ (א) תיבת "הפוסט מבקש עזרה מבעלי מקצוע" · ‏OP-049 ביקורת רק על שיחה שבעל המקצוע כתב בה, אחת לשיחה · ‏OP-050 ‏14 תחומים ו"אחר", ‏11 אזורים · ‏OP-051 בלי התראה על עוקב חדש או הצעת עזרה (היה דורש SECURITY DEFINER חדש). ⭐ לאשר.

## טסטים לא יציבים
(טסט שנכשל ועבר בהרצה חוזרת אחת: שורה כאן, לא חוסם. כישלון שחוזר חוסם.)
- `e2e/friends.spec.ts:326` c15 (focus בדיאלוג) — עבר בהרצה חוזרת (21.10, ריצה מלאה על main).
- `e2e/feed.spec.ts:59` c13 — נכשל פעם בריצה מלאה של I11; תוקן כך שרשימת הבקשות לא תלויה בתזמון `/api/account/kind`.
- `e2e/professional-posting.spec.ts:156` c11 (desktop, עמוד פוסט של בעל מקצוע) — נכשל ועבר בהרצה חוזרת (21.10, ריצה מלאה של #121).
- `e2e/journeys-remove.spec.ts:72` c16 (Escape) ו-`e2e/posts.spec.ts:278` c18 (דיאלוג מחיקה בטלפון) — כל אחד עבר בהרצה חוזרת (21.10, בונה I14).
- `apps/web/tests/google/google-completion.test.tsx` — "an email+password orphan: step 2 has no password field": נכשל בהרצה מלאה תחת עומס ועבר בהרצה חוזרת (20.10, פעמיים).
- `registration-children-handoff.test.tsx` — נכשל פעם בהרצה מלאה ועבר לבד (20.10).
- `e2e/journeys-remove.spec.ts` c26 (Escape מחזיר פוקוס ל"הסרה") ו-`e2e/posts.spec.ts` c18 (חלון המחיקה, desktop) — נכשלו פעם אחת בהרצת Chrome מלאה של #138 (ריצה 39519509198) ועברו בהרצה חוזרת (21.10).

## באגים לטיפול ב-25–26.10
מתוך יומן החוב שנמחק ב-20.10 (בהיסטוריית git). 🔒 = אבטחה או פרטיות.
1. 🔒 db-production: שגיאת libpq עלולה לצטט את סיסמת ה-owner ביומן ציבורי, אין PGSSLMODE, ו-matview/foreign table עוברים את ה-gate (ממצאים 1–4 של identity-platform a, נדרשים לפני כל אישור db-production) — .github/workflows/migrate.yml
2. 🔒 Actions ו-supabase CLI מוצמדים לתגיות שאפשר להזיז ולא ל-SHA, כולל ה-job שמחזיק את credential הייצור — .github/workflows/migrate.yml, .github/workflows/ci.yml
3. 🔒 סוד ה-bypass של Vercel חשוף: preview-smoke רץ מה-commit שנפרס עם secret של המאגר, ו-flow של e2e יכול לבקש את ה-fixture או את PREVIEW_E2E_BYPASS_FILE — .github/workflows/preview-smoke.yml, e2e-preview/support/fixtures.ts:39
4. 🔒 לשרת אין logger: כשלי config ו-500 לא נרשמים בשום מקום; ברישום עתידי של אובייקט השגיאה ייכתב ה-payload של jose (אימייל), ושורת 5xx בלי stack — apps/server/src/app.ts, apps/server/src/plugins/authentication.ts
5. 🔒 סכמת שלב 1 בהרשמה: z.object רגיל (מפתחות זרים נמחקים ולא נדחים) ואין חסם גודל לפני הפיצול ל-code points — packages/shared/src/validation/registration-step1.ts
6. 🔒 שחזור סיסמה: מפתוח מחדש של ה-handle מאפס את מוני ה-throttle; אין ניקוי לשורות recovery_throttles שפגו ואין retention לאירועי audit של השחזור — apps/server/src/recovery
7. 🔒 איפוס הסיסמה עדיין שולח את המפתח הסודי ב-/token, כשמפתח ה-publishable מספיק (least privilege) — apps/server/src/recovery/auth-admin.ts:184
8. 🔒 כותב לא יכול למחוק פוסט או תגובה במצב hidden/removed (RLS); נסגר במיגרציה של I4 — posts_select_viewer, comments_select_viewer, content_hold
9. 🔒 purge_held_content() לא בודק current_user = 'app_jobs'; רק פקודת ה-job המוצמדת מונעת הרצה כ-postgres — supabase/migrations (פונקציית ה-purge של F3.0b)
10. 🔒 החלפת בעלי ה-token בלי sign-out: loadMore שומר את הכרטיסים של A תחת B, ו-Back משחזר אותם ל-B — apps/web/src/features/posts/use-feed.ts
11. 🔒 פערי בדיקה: PATCH של מי שאינו הכותב על פוסט אנונימי (404 ולא 422, מניעת oracle), ושורה מוחזקת שנחשפת לכותב שלה אחרי commit (שתי טרנזקציות) — apps/server/tests/db/anonymous-post.db.test.ts, supabase/tests/76_feed_held_purge.sql
12. משתמש Auth בלי שורות nestly אחרי sign-up שנכשל באמצע: לבדוק אם F1.5 סגר את זה (סומן "must close at F1.5", לא סומן paid) — מסלול ההרשמה ב-apps/server
13. ‏/terms ו-/privacy הם נתיבי Guest, ולכן משתמש מחובר מנותב מהם ואינו יכול לקרוא את מה שאישר (I9) — apps/web/src/app (החלטת גישה)
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
