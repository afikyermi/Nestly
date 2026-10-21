# תוכנית עבודה — Nestly

**סטטוס קצר בלבד.** הכללים: `CLAUDE.md`. ההחלטות ומפת ה-Initiatives: `decisions-in-force.md`. המוצר: `docs/srs/`.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⬜ לא התחיל

## מטרה ותאריכים
- **26.10:** כל ה-SRS בנוי (I4–I14 ו-I9; ‏I15 אחרי ההשקה). **27.10:** המרצה בודק.
- **24.10 בחצות:** אין פיצ'ר חדש. **25–26.10:** חבילת הטסטים המלאה, ‏Edge וטסטי התמונות ורענון baselines, תיקון באגים (הרשימה למטה), משתמשי דמו ותוכן דמו דרך המוצר (`docs/lecturer-demo-plan-HE.md`), בדיקת SRS מול קוד, טבלת סטטוס FR ב-`17-traceability.md`, ייצוא Word.

## איפה אנחנו עומדים
**עודכן:** 21.10.2026, סוף הסשן · **SRS:** 2.35 על main · **Production:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app)
- **מוזג 20–21.10:** ‏#126 (I4) · ‏#119 (I6) · ‏#121 (I7) · ‏#136/#138 (I8) · ‏#130 (I5) · ‏#137/#139 (I14) · ‏#141/#145 (I10) · ‏#146/#148 (I11) · ‏#142 · ‏#147 (תיקון דחוף ב-production) · ‏#151/#162 (החלטות אפיק §9, §10) · ‏#152/#156/#158 (I12) · ‏#153/#155 (השלמות I11) · ‏#154 (main אדום: טסט share-link) · ‏#157 (migration השלמת I14) · ‏#161 (קוד השלמת I14, SRS 2.35) · ‏#160 (migration ‏I13).
- **migrate הצליח (preview, production):** ‏I8 ‏39507325686 · ‏I14 ‏39512483014 · ‏I10 ‏39535119509 · ‏I11 ‏39541622275 · ‏I12 ‏39566261400 · ‏השלמות I11 ‏39572527445 · ‏השלמת I14 ‏39619674702 · ‏I13 ‏39624013035.
- **Preview אמיתי (preview-e2e מ-main):** ‏70/70 אחרי #161 (39628326965, בהרצה חוזרת; בהרצה הראשונה flow ה-Professional נכשל פעם אחת ב-375px — ראה טסטים לא יציבים). flow הצוות רץ רק כחשבון קהילה.

| # | Initiative | מצב |
|---|---|---|
| I1–I8 | יסודות, פרופיל, פיד, בטיחות, מדיה, בית, התראות, שיחות | ✅ |
| I10 | קבוצות | ✅ |
| I11 | בעלי מקצוע ושירותים | ✅ (+ השלמות #153/#155) |
| I12 | Marketplace | ✅ (#152, ‏#156, ‏#158); ⬜ השלמה ב' (§10.5–10.6) |
| I14 | צוות Moderators | ✅ (#137, ‏#139); השלמה א': ✅ (#157, ‏#161) חוץ מ-flow צוות על Preview; ⬜ השלמה ב' (§10.1–10.4, §10.7) |
| I13 | מונטיזציה | 🔄 migration ‏#160 מוזג; אירועי שימוש ו-PR קוד — לא התחילו |
| I9 | מוכנות להשקה | ⬜ |

### ענפים ו-PR פתוחים (נעצר 21.10, סוף הסשן)
- **אין ענף WIP פתוח.** כל העבודה של היום מוזגה; ה-worktrees `.work/wt/i14c` ו-`.work/wt/i13` נקיים (הענפים מוזגו).
- **השלמת I14 א'** (#157 migration, ‏#161 קוד, SRS 2.35) — **נעשה:** הזמנה ל-48 שעות; ‏CHILD_DATA_VIEW ו-`child_tracker_trends()` (10 ילדים מ-10 משפחות, nonce ב-`trend_scopes`); חשיפת מחבר בקבוצה פרטית עם PRIVATE_GROUP_MODERATE; צוות קורא כל פוסט ותגובה לבדיקה עצמאית, בלי לכתוב; פתיחה מבוקרת של עמוד קבוצה פרטית; "העברה ל-Admin"; מי פתח דיווח; בית Admin (פס אדום, "דורש תשומת לב", מדדים, צוות), "העבודה שלי", בונה מגמות ילדים, מסנני Audit; ‏/home ו-/profile של צוות ← `/admin` (באג ה-Admin ב-production). **ביקורת:** ‏/code-review על ה-migration (תוקנו: חשיפה, ‏scope של נתוני ילדים, העברה חוזרת) ועל הקוד; לא רץ שוב על שלושת ה-commits האחרונים (מיזוג main, רשימת קבוצות לצוות, SRS). **נשאר:** ה-flow של הצוות על Preview אמיתי — חסום עד משתמש הבדיקה (השלמת I14 ב', סעיף 1); עד אז מסכי הצוות מוכחים רק מול stubs.
- **I13** (#160 migration מוזג, migrate ‏39624013035) — **נעשה:** `promotion_plans` ("מחיר לדוגמה"), ‏`promotion_payments` (מדומה בלבד), ‏`promotions` (פרופיל/פוסט של Professional, מודעה של Regular), ‏`promotion_events` (חשיפות, קליקים, מעקבים ושיחות מקידום; ספירות בלבד), טריגרי ייחוס; ‏pgTAP 101. **ביקורת:** ‏/code-review פעמיים על ה-migration. **נשאר:** אירועי שימוש (§10.8) ב-migration המשך; ‏PR הקוד כולו (לא התחיל).
- **#109** טיוטה, מתנגשת עם main; יעד 16.01.2027 — אחרי 27.10.

## המשך מכאן
**הסשן החדש:** עד 2 בונים על Opus במקביל (עד 24.10), כל אחד ב-worktree משלו; ההחלטות ב-`decisions-in-force.md` §9–§10.
1. **השלמת I14 א'** — נשאר רק ה-flow של הצוות על Preview, אחרי סעיף 1 של השלמה ב'.
2. **השלמת I14 ב'** (migration ואז קוד): משתמש Moderator לבדיקה ב-Preview בלבד, נוצר ב-CI עם credential ה-cleanup ונמחק ב-cleanup, ו-flow צוות מלא על Preview (§10.1) · ‏OP-056: שבוע/חודש קלנדרי בלבד וספירות מעוגלות (§10.2) · צוות רואה פרופיל סגור מלא; PRIVATE_GROUP_MODERATE רואה פוסטים ותגובות (§10.3) · כלל התוכן המדווח (§10.4): דיווח מוצדק מוחק את התוכן; רשומה בהיסטוריית האכיפה; ‏>10 דיווחים זהים מסתירים עד החלטה (מחליף את BR-074); כל תמונה שלא אושרה לסט האימון; hash תפיסתי לחשד לפגיעה בילד; ‏M6 בעינו · קהל להודעות מערכת (§10.7).
3. **I13** — ‏migration ‏#160 מוזג. ואז אירועי שימוש מינימליים (§10.8) ב-migration המשך, ואז PR הקוד: ‏`/pro/promotion`, ‏`/pro/billing`, קידום מודעה, תצוגת Admin, יחידות מקודמות מסומנות (Directory, ‏Marketplace, פיד) עם תקרת תדירות, תוצאות בתשלום מול אורגני, ממשק תשלום מדומה אחד, טסטים, ‏flow ב-e2e-preview, ‏SRS.
4. **השלמת I12 ב'** (§10.5–10.6): "חנות" ל-Professional (צפייה ופנייה) · "מכשירי חשמל" · תיאור עד 1,000 · מחיר 0–100,000 (0 = "למסירה") · מודעה שפגה נמחקת · "נמכר" יורד מהתצוגה ונשמר, וגרף לאדמין · קופוני דמו "ממומן" בלי "דוגמה".
5. **I9** אחרון. **24.10 בחצות:** אין פיצ'ר חדש.
**כלל:** פיצ'ר גמור רק אחרי שה-flow הראשי שלו עובר מול Preview אמיתי. **לפני כל מיזוג:** main ירוק; קבצים משותפים — הרצת Chrome מלאה. **סדר migrations:** הבא אחרי `20261022900000`, ‏pgTAP הבא אחרי 101.
**שעה 20:00:** המשימה בוטלה בסשן הזה — ליצור מחדש בסשן החדש (עד 26.10).
**תחזית:** ‏22.10 השלמות I14 (א, ב) ו-I13 · ‏23.10 השלמת I12 ב' ו-I9 · ‏24.10 מרווח · ‏25–26.10 בדיקות, באגים, דמו.

## ממתין לך
**הוכרע 21.10:** §9 ו-§10 ב-`decisions-in-force.md`; שאר השאלות הפתוחות נבנות לפי ⭐.
1. **סעיף 34 — ברירות השלמות I11 (נבנו, לאשר):** דיווח על ביקורת עצמית מותר (המבקר לא מזוהה) · ביקורת או מאמר שהבעלים מחק: הדיווחים הפתוחים עליהם פגים · ‏`audit_trigger()` הוחלף עם ענף נוסף.
2. **לבדוק ב-Production:** ‏`/admin/support` (סינון לפי סטטוס), ‏`/admin/audit` (סינון), ‏`/admin/analytics` — כ-Super Admin, שכל אחד נטען בלי "לא הצלחנו לטעון".
3. **ברירות I13 (נבנו ב-migration, לאשר):** Admin צופה בלבד בקידומים ובתשלומים (בלי החזרים ועצירה) · תשלומים מדומים נמחקים עם החשבון · אין עדיין תקופת שמירה לאירועי קידום · תווית "פרסומת" לקידום Professional ו-"מודעה מקודמת" לקידום מודעה · פוסט מקודם בפיד לפי נושאי החיפוש.
4. **OP-057 (השאר):** מדריך לבדיקה חוזרת — טיוטה או מקורות שנבדקו לפני 12 חודשים ומעלה; הזמנה "עומדת לפוג" — פחות מ-12 שעות. ⭐ לאשר.
5. **מדריכי הסטטוס (BR-070):** לאשר ולפרסם את תשעת המדריכים במסך ניהול המדריכים.
6. **ענפים למחיקה ידנית:** `ccr-21b5fcdf-l5yns9`, `ccr-517c29b5-ek8cc9`, `chore/preview-access`, `claude/guard-allowlist-implementation-xcv55m`, `wip/i2-f2.5-settings-menu`, `wip/i2-gateway-publishable-key`, `fix/password-abort`.
7. **סודות למחיקה (S-56):** הקובץ המקומי `.live/events.jsonl` · GitHub → Settings → Environments → `preview-e2e`: ‏`PREVIEW_SUPABASE_SECRET_KEY` · GitHub → Settings → Secrets → Actions: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD`.
8. **בדיקות במכשיר:** אייפון — מקלדת מעל שדה נמוך ("החלפת סיסמה") · גיליון השיתוף · חיוג בלחיצה למוקד · העלאת HEIC/Android.
9. **לפני השקה:** למחוק את קופוני הדמו (§10.6) · משתני Sentry/Turnstile · דומיין ו-DNS · אימייל/SMTP ו"שינוי אימייל מאובטח" (S-64) · ‏Supabase Pro · סריקת CSAM של Cloudflare · פרסום מסך ההסכמה של Google OAuth · החזרת דרישת האישור ב-`db-production` (S-59) · בחינה חוזרת של S-17/S-18/S-40 · ‏Vercel Pro או השקה לא מסחרית.
10. **מחקר התפקידים:** המסמך לא במאגר. שלח אותו (או את רשימת "אחרי הדמו" המלאה) ואשלים את הרשימה למטה.
11. **באגי בדיקת ה-SRS (#167, PR הקוד אחריו) — לאשר:** (א) פונקציית SECURITY DEFINER חדשה, `deliver_child_birthdays()`, באותו מבנה של I7. כשחבר פותח את ההתראות, היא כותבת לו התראת יום הולדת של ילד של חבר מאושר, רק כשההורה התיר (BR-037) ובלי שם הילד, מינו או גילו. ההתראה מופיעה ביום ההולדת ועד שבוע אחריו. (ב) נוסח ההתראה: "יום הולדת לילד או לילדה של <שם ההורה>". (ג) במסך הנתונים, החברים והתוכן של קבוצות פרטיות לא נספרים, וגם זמן אישור ההצטרפות לא נמדד: כדי לספור אותם צריך לקרוא נתוני קבוצה פרטית. גם הצעות עזרה לא נספרות, כי כל שורה כוללת את הודעת הפתיחה.

## אחרי 27.10 (אפיק 21.10)
מה שסומן "אחרי הדמו" במחקר התפקידים: claim-lock (נעילת פריט בתור למי שפתח אותו) · אישור שני אנשים לפעולות רגישות · התראות צוות באימייל · מעקב בקשות פרטיות · (שאר הפריטים — כשהמסמך יגיע).

## טסטים לא יציבים
(טסט שנכשל ועבר בהרצה חוזרת אחת: שורה כאן, לא חוסם. כישלון שחוזר חוסם.)
- `e2e-preview/professional-followups.flow.ts:34` (mobile-375) — הבית של Professional לא הציג כותרות; עבר בהרצה חוזרת (21.10, ריצה 39628326965 אחרי #161). אם חוזר — בדיקה של ניתוב /home לפי תפקיד.
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
5. ✅ (נבדק 21.10: הסכמה היא `z.strictObject` עם חסם `max` לכל שדה לפני הפירוק) 🔒 סכמת שלב 1 בהרשמה: z.object רגיל (מפתחות זרים נמחקים ולא נדחים) ואין חסם גודל לפני הפיצול ל-code points — packages/shared/src/validation/registration-step1.ts
6. 🔒 שחזור סיסמה: מפתוח מחדש של ה-handle מאפס את מוני ה-throttle; אין ניקוי לשורות recovery_throttles שפגו ואין retention לאירועי audit של השחזור — apps/server/src/recovery
7. 🔒 איפוס הסיסמה עדיין שולח את המפתח הסודי ב-/token, כשמפתח ה-publishable מספיק (least privilege) — apps/server/src/recovery/auth-admin.ts:184
8. 🔒 כותב לא יכול למחוק פוסט או תגובה במצב hidden/removed (RLS); נסגר במיגרציה של I4 — posts_select_viewer, comments_select_viewer, content_hold
9. 🔒 purge_held_content() לא בודק current_user = 'app_jobs'; רק פקודת ה-job המוצמדת מונעת הרצה כ-postgres — supabase/migrations (פונקציית ה-purge של F3.0b)
10. 🔒 החלפת בעלי ה-token בלי sign-out: loadMore שומר את הכרטיסים של A תחת B, ו-Back משחזר אותם ל-B — apps/web/src/features/posts/use-feed.ts
11. 🔒 פערי בדיקה: PATCH של מי שאינו הכותב על פוסט אנונימי (404 ולא 422, מניעת oracle), ושורה מוחזקת שנחשפת לכותב שלה אחרי commit (שתי טרנזקציות) — apps/server/tests/db/anonymous-post.db.test.ts, supabase/tests/76_feed_held_purge.sql
12. משתמש Auth בלי שורות nestly אחרי sign-up שנכשל באמצע: לבדוק אם F1.5 סגר את זה (סומן "must close at F1.5", לא סומן paid) — מסלול ההרשמה ב-apps/server
13. ✅ (נבדק 21.10: `DOCUMENT_PATHS` ב-`access.ts` פותח אותם גם למשתמש מחובר, F2.5 c6) ‏/terms ו-/privacy הם נתיבי Guest, ולכן משתמש מחובר מנותב מהם ואינו יכול לקרוא את מה שאישר (I9) — apps/web/src/app (החלטת גישה)
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
