# תוכנית עבודה — Nestly

**סטטוס קצר בלבד.** הכללים: `CLAUDE.md`. ההחלטות ומפת ה-Initiatives: `decisions-in-force.md`. המוצר: `docs/srs/`.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⬜ לא התחיל

## מטרה ותאריכים
- **26.10:** כל ה-SRS בנוי (I4–I14 ו-I9; ‏I15 אחרי ההשקה). **27.10:** המרצה בודק.
- **24.10 בחצות:** אין פיצ'ר חדש. **25–26.10:** חבילת הטסטים המלאה, ‏Edge וטסטי התמונות ורענון baselines, תיקון באגים (הרשימה למטה), משתמשי דמו ותוכן דמו דרך המוצר (`docs/lecturer-demo-plan-HE.md`), בדיקת SRS מול קוד, טבלת סטטוס FR ב-`17-traceability.md`, ייצוא Word.

## איפה אנחנו עומדים
**עודכן:** 20.10.2026 · **SRS:** 2.25 · **Production:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app)
- ✅ I1 חשבונות וגישה · ✅ I2 פרופיל, פרטיות ו-Friends · ✅ I3 פיד קהילתי, שיתוף ומוקדי רפואה.
- ✅ שלב א של האיפוס (20.10): ניקוי התהליך, ‏CI חדש, ניקוי ה-SRS.

| # | Initiative | פיצ'רים | תלוי ב | מצב |
|---|---|---|---|---|
| I4 | בטיחות וניהול · Super Admin · מדרג נעילת שחזור וכלי שחרור · חסימת משתמש | 7 | — | ⬜ |
| I6 | בית ומעקב | 6 | — (מדריכי סטטוס ← I4) | ⬜ |
| I7 | התראות וחיפוש | 4 | — | ⬜ |
| I5 | מדיה וסטוריז (מדיניות התמונות החדשה) | 5 | I4 | ⬜ |
| I8 | שיחות ו-Support | 5 | I4, I7 | ⬜ |
| I10 | קבוצות | 5 | I4, I7 | ⬜ |
| I14 | צוות Moderators · גרפי אדמין | 5 | I4, I7 | ⬜ |
| I11 | בעלי מקצוע ושירותים | 9 | I5, I8 | ⬜ |
| I12 | Marketplace | 5 | I5, I8 | ⬜ |
| I13 | מונטיזציה (תשלום מדומה) | 5 | I11, I12 | ⬜ |
| I9 | מוכנות להשקה · מחיקת חשבון · Sentry · Turnstile — אחרון | 6 | כל השאר | ⬜ |

**סה"כ שנותר:** 62 פיצ'רים. עד 3 במקביל: מתחילים ב-I4, ‏I6, ‏I7.

## ממתין לך
1. **I6 — שאלות פתוחות (בנינו ברירת מחדל, אפשר לשנות):** (א) **OP-003** — סדר המסלולים בבית: ⭐ כל המסלולים, בסדר הריון, ילדים, תכנון, מחזור · (ב) **חלון הביוץ:** ⭐ ביוץ 14 יום לפני המחזור הבא, חלון מ-5 ימים לפני עד יום אחרי, מוצג כהערכה בלבד · (ג) **בית לבעל מקצוע (OP-016):** היום Professional שנכנס ל-/home רואה שגיאה. ⭐ מפנים אותו לפיד עד שהבית שלו נבנה ב-I11.
2. **I6 — מדריכי הסטטוס (BR-070):** תשעת המדריכים שמורים כטיוטות ולא מוצגים. אחרי שמסך ניהול המדריכים נבנה (אחרי I4), אתה מאשר ומפרסם.
3. **I4 — חשבון Super Admin:** אחרי שה-migrations של I4 רצות: (1) ב-Supabase Dashboard → Authentication יוצרים משתמש חדש למנהל; (2) ב-SQL Editor מדביקים את `supabase/bootstrap/03-super-admin.sql`, מחליפים את `CHANGE-ME@example.com` באימייל שלו ומריצים. פעם אחת ב-nestly-preview ופעם ב-production.
4. **OP-037 (פרטיות; ל-I15):** ספירות מצטברות של "הסתרת פוסט" ל-Admin Intelligence? ⭐ (א) לא · (ב) כן, מצטבר בלבד, בלי זהות ובלי השפעה על דירוג.
5. **‏§18.6 ו-ANALYTICS_VIEW (קטינים; ל-I14):** האם "נתונים לכל משתמש בלי שמות" חל גם על שורות של ילדים? ⭐ (א) לא — שורות ילדים מצטברות בלבד · (ב) כן.
6. **OP-039 (ל-I14):** גרפי המנהל ב-I14 מול איסוף אירועים רק מ-I15. ⭐ (א) ב-I14 רק גרפים מטבלאות המוצר · (ב) איסוף אירועים מינימלי ב-I14.
7. **OP-040 (קטינים; ל-I9):** ⭐ (א) ילד עד יום ההולדת ה-18 (לא כולל); לידה צפויה עד 300 יום קדימה · (ב) אחר.
8. **כללי דיווח שנבנו (מדיניות דיווח):** דיווח אחד לכל יעד; סף 3 דיווחים סופר אנשים. ⭐ (א) מאשר · (ב) לשנות. ובקווים הרפואיים: מאוחדת "מוקד טלפוני 24/7" במקום "קו אחות" — ⭐ מאשר.
9. **OP-038 (ל-I11):** סימון פוסט "מבקש עזרה". ⭐ (א) תיבת סימון בכתיבת הפוסט · (ב) אחר.
10. **PR-B — תזמון המחיקה הסופית (draft PR #109, ענף `work/purge-schedule`; יעד לפני 16.01.2027):** pg_cron לא מריץ job כ-`app_jobs` (בלי login). ⭐ לאשר: ה-job שייך ל-postgres ומריץ `set role app_jobs; select nestly.purge_held_content()` — המחיקה עצמה רצה כ-app_jobs תחת RLS. אחרי אישור: מיזוג, הרצה ב-Preview, ואז הרצה שלך ב-production.
11. **ענפים למחיקה ידנית:** `ccr-21b5fcdf-l5yns9`, `ccr-517c29b5-ek8cc9`, `chore/preview-access`, `claude/guard-allowlist-implementation-xcv55m`, `wip/i2-f2.5-settings-menu`, `wip/i2-gateway-publishable-key`, `fix/password-abort`.
12. **סודות למחיקה (S-56):** הקובץ המקומי `.live/events.jsonl` · GitHub → Settings → Environments → `preview-e2e`: ‏`PREVIEW_SUPABASE_SECRET_KEY` · GitHub → Settings → Secrets → Actions: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD`.
13. **בדיקות במכשיר:** אייפון — מקלדת מעל שדה נמוך ("החלפת סיסמה") · גיליון השיתוף · חיוג בלחיצה למוקד · ב-I5: העלאת HEIC/Android.
14. **I6:** לאשר את המדריכים (BR-070) — ראה סעיף 2.
15. **לפני השקה:** משתני Sentry/Turnstile · דומיין ו-DNS · אימייל/SMTP ו"שינוי אימייל מאובטח" (S-64) · ‏Supabase Pro · סריקת CSAM של Cloudflare · פרסום מסך ההסכמה של Google OAuth · החזרת דרישת האישור ב-`db-production` (S-59) · בחינה חוזרת של S-17/S-18/S-40 · ‏Vercel Pro או השקה לא מסחרית.

## טסטים לא יציבים
(טסט שנכשל ועבר בהרצה חוזרת אחת: שורה כאן, לא חוסם. כישלון שחוזר חוסם.)

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
