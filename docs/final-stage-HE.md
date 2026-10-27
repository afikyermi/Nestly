# השלב האחרון — באגים וטסטים לא יציבים

נקרא רק בשלב האחרון (CLAUDE.md "Stages"), לא בכל סשן. הועבר מ-WORKPLAN ב-24.10; ההיסטוריה ב-git.

## באגים לטיפול
מתוך יומן החוב שנמחק ב-20.10 (בהיסטוריית git). 🔒 = אבטחה או פרטיות.
1. ✅ (#196, 24.10) 🔒 db-production: שגיאת libpq עלולה לצטט את סיסמת ה-owner ביומן ציבורי, אין PGSSLMODE, ו-matview/foreign table עוברים את ה-gate (ממצאים 1–4 של identity-platform a, נדרשים לפני כל אישור db-production) — .github/workflows/migrate.yml
2. ✅ (#196, 24.10) 🔒 Actions ו-supabase CLI מוצמדים לתגיות שאפשר להזיז ולא ל-SHA, כולל ה-job שמחזיק את credential הייצור — .github/workflows/migrate.yml, .github/workflows/ci.yml
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
19. ביצועים (Preview 24.10, ‏40083468195: ‏`POST /api/register` עד 8.8 ש׳, ‏`/api/search` עד 11 ש׳, ‏`/api/profile` עד 4.4 ש׳): כל עמוד פיד מדרג את כל המאגר בלי תקרת מועמדים; סריקת כל התשובות לכל הורה (חסר אינדקס); בקשת תגובות אחת לכל כרטיס — apps/server/src/repositories/feed-repository.ts, comments-repository.ts
20. בדיקות חלשות או חסרות: אורך cursor (512) לא מוכח; אין unit ל-withLike; reset של refreshRefused; מונה הכישלונות באי-התאמת אימייל; טלפון ב-post Back; ports; sslmode; SECRET_ENV מיובא מהקוד הנבדק — feed-ranking.test.ts, feed-state.ts, auth-client.ts:176-179, e2e/ux-polish-a.spec.ts, playwright.ports.ts, tools/db-local.mjs, tools/preview-e2e.test.mjs:282
21. e2e/CI לא יציבים: ‏route.abort על route שכבר טופל; ספירת הצלחה לפני commit; concurrency משותף ב-preview-e2e ו-cleanup; אין trace ב-CI; ה-cleanup נתקע מעל 50 משתמשים — e2e-preview/support/bypass.ts:25, e2e-preview/password-recovery.flow.ts:107, .github/workflows/preview-e2e-cleanup.yml:57-59, playwright.config.ts
22. CI/כלים (מינורי): ‏.mts/.cts מחוץ ל-lint; validateConfig ב-check-budgets; cache ריק של Playwright; כשל ב-changes מדלג על db; בדיקות cleanup שקוראות SQL כטקסט; db-local לא מריץ pgTAP; בדיקת ה-expand ב-P6 — eslint.config.mjs:140, tools/check-budgets.mjs, .github/workflows/ci.yml, tools/preview-e2e-cleanup.test.mjs:447, tools/db-local.mjs
23. הערות מטעות (טריוויאלי): held_xact "Never granted", ההערה של post_hides, כותרות בדיקה (anonymous-post:14, 74_feed…:112), README של rollback ב-bootstrap / 01-roles-check.sql:35, ProtectedLayout.stories; תפקידי probe ישנים ב-nestly-preview
24. 🔒 מגיש דיווח יכול לקרוא ברמת המסד את resolution, ‏handled_by ו-handler_note של הדיווח שלו (ה-API לא מחזיר אותם). תיקון: הרשאת SELECT לפי עמודות בלי שלושתן, וצוות קורא דרך נתיב נפרד — supabase (טבלת reports, I4)
25. I12: הסתרת מודעה ע"י MARKETPLACE_MODERATE בלבד לא מזינה את סט האימון (כמו בפוסטים) · תמונה של מוצר ממומן שהוסר לא נמחקת · דיווח פתוח על מודעה שנמחקה לא פג ונופל מהתור (נפתר אם OP-053 ⭐) · צוות ב-/marketplace רואה מודעות של בעלים מושעים או חסומים.
26. I13 (#177): קליקים/חשיפות של קידום נרשמים לפי דיווח הלקוח · ב-Directory כל טעינה נספרת כחשיפה · ב-Marketplace החשיפות נחתכות ב-3 ליום.
27. ✅ (#292, 27.10, רק החלק של ה-visual) `e2e/professional-posting.visual.spec.ts` עדיין מצפה ל"הפוסט יוצג לכולם" (AC-130 החליף) · שורת SRS 2.14 עדיין אומרת שטסטי התמונות חוסמים (#214 שינה).

## טסטים לא יציבים — היסטוריה (עד 23.10)
- 23.10: main f73c0a4 — שני shards של Chrome חרגו מ-15 דקות; ניסיון 2 של 39938107866 עבר. #177 Chrome מלא מקומי: 3550 עברו, שתי סריקות Storybook ובדיקת ניווט Professional נכשלו; שלושתן עברו בריצה חוזרת אחת (2.9 דקות). 32 בדיקות הפוסטים עברו יחד אחרי תיקון בידוד נתוני הבדיקה.
- 23.10: כשלי login/registration המקומיים בסביבת Codex היו ENOENT של מטמון Vite לפני טעינת טסטים; TEMP/TMP משותף פתר, 176 עברו. אינו כשל מוצר.
- 22.10: ‏#182 db (39714500846) עבר בניסיון 2; הראשון בוטל אחרי 20 דקות, npm ci לקח 7:05 ו-P6 לא הספיק. main ‏7da210f (39730083505) עבר בניסיון 2; Chrome shard 2 הגיע תחילה ל-780 שניות, 715 עברו ו-3 לא רצו. ללא שינוי בדיקות או תקציבי זמן.
- `e2e-preview/professional-followups.flow.ts:34` ו-`:74` — לוח הבקרה של Professional לא נטען תוך 10 שניות, וההרשמה לא עברה תוך 10 שניות (Preview איטי; 22.10, ריצות 39704654940, 39711104426). ‏`/api/professional/home` ענה 200 אחרי 1.8–7.2 שניות; ההמתנה הוגדלה ל-30 שניות (#179).
- `e2e-preview/srs-audit.flow.ts:87` — עבר את 90 השניות (שלושה משתמשים חדשים); ‏#181 מגדיל ל-180.
- CI ‏`test` של #181 — נתקע 10 דקות ב-test:tools פעמיים (22.10). לבדוק.
- `e2e-preview/professional-followups.flow.ts:34` — הבית של Professional לא הציג כותרות: עבר בהרצה חוזרת ב-21.10 (39628326965), חזר בשני המסכים ב-22.10 (39704654940). השרת עונה 200 נכון מקומית (בדיקת db חדשה); משך השלב עלה מ-5–9 ל-12–16 שניות. ה-flow מחכה עכשיו לתשובת `/api/professional/home` (עד 30 ש׳), בודק 200 ומדפיס את הזמן — ההרצה הבאה תראה אם זו איטיות או שגיאה.
- `e2e/friends.spec.ts:326` c15 (focus בדיאלוג) — עבר בהרצה חוזרת (21.10, ריצה מלאה על main).
- `e2e/feed.spec.ts:59` c13 — נכשל פעם בריצה מלאה של I11; תוקן כך שרשימת הבקשות לא תלויה בתזמון `/api/account/kind`.
- `e2e/professional-posting.spec.ts:156` c11 (desktop, עמוד פוסט של בעל מקצוע) — נכשל ועבר בהרצה חוזרת (21.10, ריצה מלאה של #121).
- `e2e/journeys-remove.spec.ts:72` c16 (Escape) ו-`e2e/posts.spec.ts:278` c18 (דיאלוג מחיקה בטלפון) — כל אחד עבר בהרצה חוזרת (21.10, בונה I14).
- `apps/web/tests/google/google-completion.test.tsx` — "an email+password orphan: step 2 has no password field": נכשל בהרצה מלאה תחת עומס ועבר בהרצה חוזרת (20.10, פעמיים).
- `registration-children-handoff.test.tsx` — נכשל פעם בהרצה מלאה ועבר לבד (20.10).
- `e2e/journeys-remove.spec.ts` c26 (Escape מחזיר פוקוס ל"הסרה") ו-`e2e/posts.spec.ts` c18 (חלון המחיקה, desktop) — נכשלו פעם אחת בהרצת Chrome מלאה של #138 (ריצה 39519509198) ועברו בהרצה חוזרת (21.10).
- `e2e/app-shell-guard-stories.spec.ts:82` c27 (axe על סיפורי ה-shell) — ה-story לא סיים להיטען (240 שניות) בהרצת Chrome מלאה מקומית של #168; עבר בהרצה חוזרת לבד (22.10).
