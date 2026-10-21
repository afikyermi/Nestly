# תוכנית עבודה — Nestly

**סטטוס קצר בלבד.** הכללים: `CLAUDE.md`. ההחלטות ומפת ה-Initiatives: `decisions-in-force.md`. המוצר: `docs/srs/`.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⬜ לא התחיל

## מטרה ותאריכים
- **26.10:** כל ה-SRS בנוי (I4–I14 ו-I9; ‏I15 אחרי ההשקה). **27.10:** המרצה בודק.
- **24.10 בחצות:** אין פיצ'ר חדש. **25–26.10:** חבילת הטסטים המלאה, ‏Edge וטסטי התמונות ורענון baselines, תיקון באגים (הרשימה למטה), משתמשי דמו ותוכן דמו דרך המוצר (`docs/lecturer-demo-plan-HE.md`), בדיקת SRS מול קוד, טבלת סטטוס FR ב-`17-traceability.md`, ייצוא Word.

## איפה אנחנו עומדים
**עודכן:** 21.10.2026 (תשובות אפיק נרשמו; בונים יוצאים לדרך) · **SRS:** 2.32 על main · **Production:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app)
- **מוזג 20–21.10:** ‏#126 (I4) · ‏#119 (I6) · ‏#121 (I7) · ‏#136/#138 (I8) · ‏#130 (I5) · ‏#137/#139 (I14) · ‏#141/#145 (I10, SRS 2.31) · ‏#146/#148 (I11, SRS 2.32) · ‏#142 (תיקון ה-nightly) · ‏**#147 תיקון דחוף ב-production** (ראה למטה).
- **migrate (preview ו-production) הצליח** לכל ה-migrations: ‏I8 ‏39507325686 · ‏I14 ‏39512483014 · ‏I10 ‏39535119509 · ‏I11 ‏39541622275.
- **תיקון דחוף #147 (21.10):** ה-rewrite של Vercel ‏(`/api/:path*` → `/api/index`) מוסיף פרמטר `path` ל-query, וכל נתיב שבודק query ב-`z.strictObject` ענה 400 ב-production: מעקבים, התראות, העלאת תמונות, תיבת ה-Support של הצוות, audit, נתונים. ה-adapter מסיר את הפרמטר במקום אחד. ‏preview-e2e על Preview אמיתי: 62/62, כולל טסט חדש `e2e-preview/strict-query.flow.ts` (התראות 200, מעקבים 200, Support ‏200, העלאה 415 ולא 400). נתיבי האדמין לא נבדקו על Preview (משתמש הבדיקה אינו צוות).

| # | Initiative | מצב |
|---|---|---|
| I1–I8 | יסודות, פרופיל, פיד, בטיחות, מדיה, בית, התראות, שיחות | ✅ |
| I10 | קבוצות | ✅ (#141, ‏#145) |
| I11 | בעלי מקצוע ושירותים | ✅ (#146, ‏#148); השלמות ב-WIP (ראה למטה) |
| I14 | צוות Moderators | ✅ (#137, ‏#139) |
| I12 | Marketplace | 🔄 PR קוד (migration מוזג) |
| I13 · I9 | | ⬜ |

### כל ענף פתוח (נעצר 21.10, ‏~08:40, סוף הסשן)
- **I12 — `build/i12-code`** (worktree `.work/wt/i12s`): migration #152 מוזג והורץ (preview, production). PR הקוד — שרת, מסכי Marketplace ואדמין, טסטים, SRS 2.34. **ממתין:** אפיק — OP-053 (מודעה שדווחה: מחיקה מיידית או שמירה מוסתרת כמו פוסט); flow ה-e2e-preview ‏(`marketplace.flow.ts`) רץ ב-`preview-e2e` מ-main אחרי המיזוג. ל-Professional אין "חנות" בניווט ובתפריט (§9.8 לא כולל אותה) — לשאול אם להוסיף. flaky: `share-link.spec.ts` c4 desktop נכשל פעמיים ב-dispatch ‏39574661280 ועבר ב-rerun. לסבב הבאגים 25–26.10: הסתרה ע"י MARKETPLACE_MODERATE בלבד לא מזינה את סט האימון; תמונה של מוצר ממומן שהוסר לא נמחקת; דיווח פתוח על מודעה שנמחקה לא פג.
- **השלמות I11 + החלטות Professional (§9.8)** — migration ‏#153 מוזג ו-migrate הצליח (‏20261022700000); PR קוד מענף `build/i11f-code` (SRS 2.33): מדדי Support, "בעלי מקצוע במעקב", דיווח על ביקורת ומאמר, הרשמה מקצועית מהשלמה, הודעת הצעת העזרה בשיחה קיימת, התראות לבעל מקצוע וסיכום עוקבים שבועי, תפריט וניווט Professional, לוח בקרה בסדר של אפיק, הצהרת הכשרה. ‏preview-e2e: ‏`e2e-preview/professional-followups.flow.ts` רץ בהרצה מ-main אחרי המיזוג.
- **#109** טיוטה; אושר לפי ⭐ — מיזוג והרצה ב-Preview (ממתין לך 1).

## המשך מכאן
**סדר (עודכן 21.10, אחרי תשובות אפיק):** עד 2 בונים על Opus במקביל, כל אחד ב-worktree שלו.
1. 🔄 בונה A: ‏I12 מ-`build/i12-schema` → migration → migrate → קוד.
2. 🔄 בונה B: השלמות I11 מ-`build/i11-followups` (פריטים 1–5) + החלטות Professional (`decisions-in-force.md` §9.8, ‏§9.6 ל-Professional) → migration → migrate → קוד.
3. ⬜ השלמת I14 (§9.1, ‏§9.2, ‏§9.4, ‏§9.6–9.7, ‏§9.9–9.10) — הבונה הראשון שמתפנה.
4. ⬜ ‏I13 (אחרי I11 ו-I12; כולל תווית הפרסומת מ-§9.8), ואז I9 אחרון.
**כלל (CLAUDE.md, אפיק 21.10):** פיצ'ר גמור רק אחרי שה-flow הראשי שלו עובר מול Preview אמיתי (‏flow ב-`e2e-preview`).
**לפני כל מיזוג:** הריצה האחרונה על main ירוקה. PR שנוגע בקבצים משותפים — הרצת Chrome מלאה לפני מיזוג.
**שעה 20:00:** משימה יומית בסשן הזה, עד 26.10.
**תחזית:** ‏22.10 ‏I12 והשלמות I11 · ‏23.10 השלמת I14 ו-I13 · ‏24.10 ‏I9 · ‏25–26.10 בדיקות, באגים, דמו.

## ממתין לך
**הוכרע 21.10:** סעיפים 2, 6, 9, 24, 25, 29, 31 ו-OP-051 — ב-`decisions-in-force.md` §9. כל שאר השאלות הפתוחות (5, 7, 8, 10, 11, 19–23, 26, 28, 30, 32, 34, 35) נבנות לפי ⭐ (אפיק 21.10) ונכנסות ל-SRS ב-PR של ה-Initiative.
**נשאר לך (פעולות שרק אתה עושה):**
1. **#109 — המחיקה הסופית:** ⭐ אושר; אני ממזג ומריץ ב-Preview, ואז ההרצה ב-production שלך.
2. **מדריכי הסטטוס (BR-070):** לאשר ולפרסם את תשעת המדריכים במסך ניהול המדריכים.
3. **לבדוק ב-Production:** ‏`/admin/support` (סינון לפי סטטוס), ‏`/admin/audit` (סינון), ‏`/admin/analytics` — כ-Super Admin, שכל אחד נטען.
4. **ענפים למחיקה ידנית:** `ccr-21b5fcdf-l5yns9`, `ccr-517c29b5-ek8cc9`, `chore/preview-access`, `claude/guard-allowlist-implementation-xcv55m`, `wip/i2-f2.5-settings-menu`, `wip/i2-gateway-publishable-key`, `fix/password-abort`.
5. **סודות למחיקה (S-56):** הקובץ המקומי `.live/events.jsonl` · GitHub → Settings → Environments → `preview-e2e`: ‏`PREVIEW_SUPABASE_SECRET_KEY` · GitHub → Settings → Secrets → Actions: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD`.
6. **בדיקות במכשיר:** אייפון — מקלדת מעל שדה נמוך ("החלפת סיסמה") · גיליון השיתוף · חיוג בלחיצה למוקד · העלאת HEIC/Android.
7. **לפני השקה:** משתני Sentry/Turnstile · דומיין ו-DNS · אימייל/SMTP ו"שינוי אימייל מאובטח" (S-64) · ‏Supabase Pro · סריקת CSAM של Cloudflare · פרסום מסך ההסכמה של Google OAuth · החזרת דרישת האישור ב-`db-production` (S-59) · בחינה חוזרת של S-17/S-18/S-40 · ‏Vercel Pro או השקה לא מסחרית.
8. **מחקר התפקידים:** המסמך לא במאגר. שלח אותו (או את רשימת "אחרי הדמו" המלאה) ואשלים את הרשימה למטה.

## אחרי 27.10 (אפיק 21.10, §9.11)
מה שסומן "אחרי הדמו" במחקר התפקידים: claim-lock (נעילת פריט בתור למי שפתח אותו) · אישור שני אנשים לפעולות רגישות · התראות צוות באימייל · מעקב בקשות פרטיות · (שאר הפריטים — כשהמסמך יגיע).

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
