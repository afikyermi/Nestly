# תוכנית עבודה — Nestly

**סטטוס קצר בלבד.** הכללים: `CLAUDE.md`. ההחלטות ומפת ה-Initiatives: `decisions-in-force.md`. המוצר: `docs/srs/`.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⬜ לא התחיל

## מטרה ותאריכים
- **26.10:** כל ה-SRS בנוי (I4–I14 ו-I9; ‏I15 אחרי ההשקה). **27.10:** המרצה בודק.
- **24.10 בחצות:** אין פיצ'ר חדש. **25–26.10:** חבילת הטסטים המלאה, ‏Edge וטסטי התמונות ורענון baselines, תיקון באגים (הרשימה למטה), משתמשי דמו ותוכן דמו דרך המוצר (`docs/lecturer-demo-plan-HE.md`), בדיקת SRS מול קוד, טבלת סטטוס FR ב-`17-traceability.md`, ייצוא Word.

## איפה אנחנו עומדים
**עובד כרגע:** Codex (מ-22.10.2026)
**עודכן:** 23.10.2026, צהריים · **SRS:** 2.38 על main (2.39 ב-#174, ‏2.40 ב-#177, ‏2.41 ב-#180) · **Production:** [nestly-blue.vercel.app](https://nestly-blue.vercel.app)
- **מוזג 20–21.10:** ‏I4–I8, ‏I10, ‏I11, ‏I12, ‏I14 + השלמה א' (#119–#162) · ‏#164 (brief, ‏done-check, כללי SRS) · ‏#165 · ‏#166 (SRS 2.36) · ‏#170 (Storybook) · ‏#172/#173 · ‏#167 · ‏#169.
- **מוזג 22.10 (הסשן הזה):** ‏#171 (migration ‏I13 לפי §11.1–11.6) · ‏#176 (migration ‏FR-ADMIN-012: מדריך מתפרסם בלי תאריך בדיקת מקורות) · ‏#168 (באגי ביקורת SRS: Settings לפי סוג חשבון, Professionals בחיפוש, ימי הולדת, דירוג לוח הבקרה, analytics; ‏SRS 2.37–2.38) · ‏#179 (ה-flow של לוח הבקרה של Professional מדווח זמן ותשובה; חיפוש בטלפון) · ‏#178 (migration השלמת I10) · ‏#183 (WORKPLAN סגירת סשן) · ‏#184 (העברת מקל ל-Codex: `AGENTS.md`, התיקייה `.codex/`, שורה ב-CLAUDE.md).
- **migrate הצליח (preview, production) ב-22.10:** ‏#171 ‏39699653883 · ‏#176 ‏39703246590 · ‏#178 ‏39713781769. (קודם: I8–I13, ‏#167, ‏#169.)
- **Preview אמיתי (preview-e2e מ-main):** 22.10 — 69/72 (39704654940), אחר כך 72/74 (39711104426). לוח הבקרה של Professional עונה 200 אחרי 1.8–7.2 שניות (Preview איטי, לא באג); הכישלונות — timeouts של הרשמה ושל ה-flow החדש (ראה טסטים לא יציבים, ‏#181).

| # | Initiative | מצב |
|---|---|---|
| I1–I8 · I11 | | ✅ (השלמת I11 לפי §11 — ⬜, חסום: ממתין לך 10) |
| I10 | קבוצות | ✅; השלמה (§11.13–11.17): migration ‏#178 ✅, קוד ‏#180 🔄 |
| I12 | Marketplace | ✅; ⬜ השלמה ב' (§10.5–10.6) |
| I14 | צוות Moderators | ✅; השלמה א' ✅ חוץ מ-flow צוות; השלמה ב': migration ‏#169 ✅, קוד ‏#174 ירוק, חסר flow צוות (ממתין לך 1) |
| I13 | מונטיזציה | migrations ‏#160/#171 ✅; ‏#182 (RLS) מוזג ו-migrate עבר; קוד ‏#177 🔄 |
| באגי ביקורת SRS (C) | | ✅ ‏#167, ‏#168 |
| I9 | מוכנות להשקה | ⬜ |

### ענפים ו-PR פתוחים (23.10) — Codex מטפל ב-#177
- **#174** `build/i14b-code` (קוד השלמת I14 ב', ‏SRS 2.39): CI ירוק. **חסר:** החלק של הצוות ב-flow (ממתין לך 1); ‏done-check חוזר אחרי זה; ‏SRS לעדכן גרסה מעל 2.38. אחריו: migration קטן שמוריד את `child_tracker_trends` של 30/90/365 ו-PR קוד קטן ל-FR-ADMIN-012 (להוריד `source_date_required`).
- **#182 מוזג** דרך rebase-and-merge (`0e1a9d1`, 22.10, 18:38), אחרי ניסיון 2 ירוק של PR ושל main. migrate ידני מ-main ‏39806997130 עבר ב-preview וב-production. הכשל המקורי היה חריגת 20 דקות אחרי npm ci איטי; בלי שינוי SQL או הגדלת זמן.
- **#177** `build/i13-code` (086094d מפורסם, SRS 2.40): CI בסיס d686d27 (39951436229) ירוק, כולל db; CI התוספת 39978733293 רץ. תוקנו תגית Professional אסורה בנתוני בדיקה, מחירי Moderator, תקרת 500 מודעות מקודמות, ספירת ביקור ממומן גם כאורגני וזליגת פוסט בין בדיקות. החלטת אפיק: קידום בפיד לפי נושאי חיפוש בלבד; התאמה לשלב נדחית. אפיק אישר גם ש-4–7 הוא טווח ברירת מחדל; Admin רשאי לשנות קצוות וספים עם סיבה ו-Audit. Chrome מלא מקומי: 3550/3553; שלוש הנכשלות עברו בריצה חוזרת (Storybook x2, ניווט Professional). ריצה ידנית מלאה 39975068699 על d686d27 הסתיימה: כל Edge עבר; Chrome נכשל בתמונות ישנות ובמגבלת 13 דקות בחלק 2 (80 לא רצו). אינה מסומנת ירוקה. אפיק אישר ב-23.10 משתמש Moderator זמני וניקוי Audit ב-Preview בלבד; המימוש פורסם ב-086094d, עם CONTENT_MODERATE בלבד, checkout נפרד מ-main, וקובץ אישורים פרטי זמני. בדיקות harness: 168 עברו, 11 דולגו בגלל Git Bash; tsc Preview עבר. **נשאר:** CI התוספת, סקירה/done-check סופיים, מיזוג ו-preview-e2e אמיתי כולל עצירת צוות והודעת הבעלים. Docker מקומי אינו זמין.
- **#180** `build/i10c-code` (‏9842eb2, ‏SRS 2.41): השלמת I10 בנויה (Highlights בפיד עם "מתוך:", סף 5% 3–20, קבוצות פעילות בחיפוש ובגילוי, הזמנה באישור בקבוצה פרטית, אזהרה+השתקה, הסרה+חסימה, ביטול חסימה, בלי הסרה רגילה); OP-045..048 נסגרו. Chrome מלא מקומי: 3547 עברו. **נשאר:** ‏CI על ה-commit האחרון, ‏done-check, ‏`group-rules.flow.ts` על Preview אחרי המיזוג, migration המשך שסוגר כתיבה ישירה לטבלת החסימות.
- **#181** `fix/srs-audit-flow-timeout`: ‏timeout של 180 שניות ל-flow של ביקורת ה-SRS. **job ה-test נתקע 10 דקות ב-test:tools פעמיים** (בוטל) — לבדוק אם השינוי גורם; שורות ה-WORKPLAN שלו עברו לכאן.
- **main ירוק:** f73c0a4 (מיזוג #187); CI 39938107866 ניסיון 2 עבר, אחרי ששני shards של Chrome הגיעו למגבלת 15 דקות בניסיון הראשון. לבדוק main עדכני לפני כל מיזוג.
- **#109** טיוטה, אחרי 27.10.

## המשך מכאן
**לסשן הבא:** עד 2 בונים על Opus במקביל (עד 24.10), כל אחד ב-worktree; ‏brief לפני כל Initiative, ‏done-check לפני מיזוג קוד. ה-briefs ב-`.work/briefs/` (I13, ‏I14-B, ‏I10-C, ‏I11-C).
1. **#182 הושלם; #177:** בסיס d686d27 מפורסם וירוק ב-CI, main f73c0a4 ירוק בניסיון 2. להשלים פרסום ואימות תוספת Moderator ב-Preview שאפיק אישר ב-23.10, לעקוב אחרי CI מלא 39975068699, ואז סקירה ו-done-check סופיים. #187 מוזג. התאמה לשלב בקידומים נדחית בהחלטת אפיק; נושאי חיפוש בלבד.
2. **#177:** אחרי שערים ירוקים ופתרון חסימות done-check — למזג, ואז להריץ את monetization.flow.ts על Preview אמיתי (הפעולה והתוצאה אצל משתמש אחר). #182 ו-migrate כבר הושלמו.
3. **#180 (השלמת I10):** ‏CI, ‏done-check, מיזוג, ‏preview-e2e; אחר כך migration ההמשך לטבלת החסימות.
4. **#174 (השלמת I14 ב'):** אחרי תשובה על ממתין לך 1 — משתמש צוות ב-Preview ו-flow הצוות; ‏done-check; מיזוג. אם אין תשובה עד 23.10 בערב — למזג בלי חלק הצוות ולרשום ב-WORKPLAN.
5. **השלמת I11** (§11.10, ‏§11.18–11.22, ‏brief ‏`.work/briefs/I11-C.md`): אחרי #174 ואחרי תשובה על ממתין לך 10.
6. **השלמת I12 ב'** (§10.5–10.6).
7. **I9** אחרון (23.10): job יומי אחד לכל המחיקות של §13.4 (נושאי חיפוש 30 יום, תוכן מוחזק, התראות 90 יום, מוני קצב שפגו, Audit/אבטחה/שחזור 12 חודשים, דיווחים שטופלו 12 חודשים, אירועי שימוש 90 יום, פירוט קידומים 12 חודשים + סיכום חודשי) — כולל שתי פונקציות ה-purge הקיימות ו-`purge_usage_events()` · ‏logger לשרת (באג 4) עם Sentry.
8. **24.10 (מרווח) — flows חסרים ב-e2e-preview:** פוסט+תגובה+לייק (משתמש אחר רואה) · העלאת תמונה אמיתית · סטורי · צ'אט בין שניים · קבוצה · דיווח ← החלטת צוות ← אכיפה · הצעת עזרה ← אישור ← ביקורת · פנייה למוכר · רשומת מעקב. **24.10 בחצות:** אין פיצ'ר חדש.
9. **25–26.10:** בדיקות מלאות, ‏Edge ותמונות + רענון baselines, באגים, דמו, יישור SRS (טקסט HOW, החלטות, טבלת הסטטוס ב-17, §2.5, ‏Turnstile/Sentry, ‏AC-125, ‏SENSITIVE_DATA_FULL_ACCESS ו-FR-MOD-003 מול §9), ייצוא Word.
**כלל:** פיצ'ר גמור רק אחרי שה-flow הראשי שלו עובר מול Preview אמיתי. **לפני כל מיזוג:** main ירוק; קבצים משותפים — הרצת Chrome מלאה (בלי טסטי תמונות). **סדר migrations:** ‏#182 (I13 RLS), ואחריו המשך I10 ו-`child_tracker_trends`; ‏pgTAP הבא אחרי 107.
**שעה 20:00:** משימה מתוזמנת יומית (19:52) עד 26.10.
**תחזית:** ‏22.10 #182/#177, ‏#180, ‏#174 · ‏23.10 השלמות I11 ו-I12 ב', ‏I9 · ‏24.10 flows · ‏25–26.10 בדיקות, באגים, דמו, יישור SRS. **בסיכון:** השלמת I11 (חסומה ב-13) ו-I12 ב' — אם 23.10 נגמר בלי שתיהן, I9 קודם.

## ממתין לך
**החלטות שקיבלתי בעצמי (22.10) ודורשות את אישורך:**
- ריצה ידנית של CI נכשלת בטסטי התמונות עד 25.10; התייחסתי לזה כלא-אדום, ומיזגתי #168 על סמך ה-push CI הירוק והרצת Chrome מלאה מקומית.
- ה-flow של לוח הבקרה של Professional מחכה עד 30 שניות (במקום 10), וה-flow של ביקורת ה-SRS — 3 דקות (Preview איטי). תשובה איטית כבר לא נכשלת.
- תיקנתי בעצמי את #176 (תגיות pgTAP, שורת ההיסטוריה בסקריפט ה-down, ספירת העריכות בטסט 87) ומיזגתי.
- התחלתי את השלמת I10 לפני I12 ב'.
1. **Moderator לבדיקה ב-Preview — אושר ב-23.10:** אפיק בחר משתמש זמני וניקוי של רשומות ה-Audit שלו ב-Preview בלבד. ב-#177 מתווספים שני משתמשי בדיקה נפרדים למסכים, CONTENT_MODERATE בלבד, צעד setup מ-checkout מהימן של main ב-environment preview-e2e, ואישורי כניסה בקובץ runner זמני פרטי. ניקוי actor נעול לפי תבנית משתמשי הבדיקה, כיבוי/החזרת audit_log_append_only באותה טרנזקציה; Production לא משתנה. ה-flow עדיין טעון אימות אמיתי. לפני הרחבת הרשאות ל-flow של #174 יש להוסיף ניקוי מתאים לרשומות הצוות הנוספות.
2. **ימי הולדת (#167/#168):** הפרופיל לא מציג שם ילד לאף אחד (FR-PRIV-001), ולכן כל Friend מקבל "יום הולדת לילד או לילדה של <הורה>". ⭐ להשאיר · זמן ההתראה = זמן המסירה. **חוויה:** ההתראה נוצרת רק כשה-Friend פותח את מסך ההתראות (חלון 7 ימים, OP-059) — ⭐ ליצור גם בטעינת הפעמון · התראה שנמסרה נשארת אחרי כיבוי המתג/חסימה — ⭐ להסתיר. · ‏OP-060, ‏OP-061 פתוחים.
3. **השלמת I14 ב' (#174), נבנו לפי ⭐:** ‏OP-062 — הכותב והמדווחים לא רואים שינוי בהסתרה (הצעה: "התוכן בבדיקה" לכותב) · ‏OP-063 — מוסתר אוטומטית מיד אחרי ילדים בתור · ‏OP-064 — דיווח תגובה בלי קישור לפוסט. **חוויה:** מדווח לא יודע מה יצא (הצעה: "הדיווח טופל") · כותב שתוכנו נמחק לא מקבל הסבר (הצעה: "הפוסט הוסר לפי כלל X") · תמונת התאמה לרשימת hash נפתחת לצוות בלי Audit (הצעה: Audit לכל פתיחה). · **פער E1:** הקוד מציג לצוות את כל השרשור של תגובה מדווחת (החלטתך: רק הפריט) — לא שונה.
4. **לבדוק ב-Production:** ‏`/admin/support`, ‏`/admin/audit`, ‏`/admin/analytics` — כ-Super Admin, שכל אחד נטען. וגם לוח הבקרה של Professional (כמה זמן לוקח להיטען).
5. **מדריכי הסטטוס (BR-070):** לאשר ולפרסם את תשעת המדריכים במסך ניהול המדריכים.
6. **בדיקות במכשיר:** אייפון — מקלדת מעל שדה נמוך ("החלפת סיסמה") · גיליון השיתוף · חיוג בלחיצה למוקד · העלאת HEIC/Android.
7. **מהרשימה הקודמת (נבנו לפי ⭐):** 19 — ERR-043 בלי הפניה ל-Support · 21 — דחיית תמונות אחרי דיווח ישן (⭐ להשאיר) · 26 — דגימת אימון עלולה ללכת לאיבוד (⭐ לתקן ב-25–26.10) · 28 — ברירות I8 · 8 — OP-040: ילד עד 18; לידה צפויה עד 300 יום · 20 — מונה כשלונות השחזור (I9) · 5 — OP-037 (⭐ לא).
8. **I13 (#177), נבנו לפי ⭐:** ‏OP-065 — גם Moderator עם הרשאת המודרציה המתאימה עוצר קידום · ‏OP-066 — 3 חשיפות לצופה ביום, Professional מקודם אחד בעמוד Directory, ספי 20/200 פוסטים ב-48 שעות · ‏OP-067 — אירועי שימוש 90 יום.
9. **השלמת I10 (#180), נבנו לפי ⭐ (OP-068–071):** הסף נספר לפי החברים הפעילים ברגע ההגעה, ו-Highlight נשאר כשחברים עוזבים · "פעילה" = 7 ימים, לפחות 3 אירועים, בדעיכה · אין אזהרה בלי השתקה; סיבות מרשימה + "אחר" עד 500 · Moderator קבוצה ומעלה אוכפים; ההיסטוריה למנהלים, בלי מי ביצע · "המלצה" ו"הזמנה" נשארות שתיהן; מושתק לא מזמין ולא ממליץ. **חוויה:** בלי הסרה רגילה אי אפשר להוציא חבר בטעות בעדינות.
10. **השלמת I11 — definer חדש (חוסם):** ‏`post_author_allows_offers(post_id)` — מחזיר רק כן/לא אם ההורה מאפשר הצעות עזרה, כדי שבפוסט אנונימי אפשר לבדוק בלי לחשוף מי כתב. כן/לא. ועוד ⭐: לצוות רק כן/לא "קיימת שיחה שבעל המקצוע ענה בה" בדיווח "שקרית / בלי אינטראקציה" · אחרי מחיקה מוצדקת של ביקורת ההורה לא כותב חדשה לאותו בעל מקצוע · **חוויה:** הודעה בהצעה הראשונה להורה (ההצעות דלוקות כברירת מחדל גם בפוסטי אובדן) · לאפשר להורה למחוק ביקורת שלו.
11. **ענפים למחיקה ידנית:** `ccr-21b5fcdf-l5yns9`, `ccr-517c29b5-ek8cc9`, `chore/preview-access`, `claude/guard-allowlist-implementation-xcv55m`, `wip/i2-f2.5-settings-menu`, `wip/i2-gateway-publishable-key`, `fix/password-abort`.
12. **סודות למחיקה (S-56):** הקובץ המקומי `.live/events.jsonl` · GitHub → Settings → Environments → `preview-e2e`: ‏`PREVIEW_SUPABASE_SECRET_KEY` · GitHub → Settings → Secrets → Actions: ‏`PREVIEW_TEST_EMAIL`, ‏`PREVIEW_TEST_PASSWORD`.
13. **לפני השקה:** למחוק את קופוני הדמו (§10.6) · משתני Sentry/Turnstile · דומיין ו-DNS · אימייל/SMTP (S-64) · ‏Supabase Pro · סריקת CSAM של Cloudflare · מסך ההסכמה של Google OAuth · דרישת האישור ב-`db-production` (S-59) · S-17/S-18/S-40 · ‏Vercel Pro או השקה לא מסחרית.
14. **מחקר התפקידים:** המסמך לא במאגר. שלח אותו ואשלים את הרשימה למטה.

## אחרי 27.10 (אפיק 21.10)
מה שסומן "אחרי הדמו" במחקר התפקידים: claim-lock (נעילת פריט בתור למי שפתח אותו) · אישור שני אנשים לפעולות רגישות · התראות צוות באימייל · מעקב בקשות פרטיות · (שאר הפריטים — כשהמסמך יגיע).

## טסטים לא יציבים
- 23.10: main f73c0a4 — שני shards של Chrome חרגו מ-15 דקות; ניסיון 2 של 39938107866 עבר. #177 Chrome מלא מקומי: 3550 עברו, שתי סריקות Storybook ובדיקת ניווט Professional נכשלו; שלושתן עברו בריצה חוזרת אחת (2.9 דקות). 32 בדיקות הפוסטים עברו יחד אחרי תיקון בידוד נתוני הבדיקה.
- 23.10: כשלי login/registration המקומיים בסביבת Codex היו ENOENT של מטמון Vite לפני טעינת טסטים; TEMP/TMP משותף פתר, 176 עברו. אינו כשל מוצר.
- 22.10: ‏#182 db (39714500846) עבר בניסיון 2; הראשון בוטל אחרי 20 דקות, npm ci לקח 7:05 ו-P6 לא הספיק. main ‏7da210f (39730083505) עבר בניסיון 2; Chrome shard 2 הגיע תחילה ל-780 שניות, 715 עברו ו-3 לא רצו. ללא שינוי בדיקות או תקציבי זמן.
(טסט שנכשל ועבר בהרצה חוזרת אחת: שורה כאן, לא חוסם. כישלון שחוזר חוסם.)
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
