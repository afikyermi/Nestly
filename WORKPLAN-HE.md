# תוכנית עבודה — Nestly

**מסמך חי.** מתעדכן בסוף כל שלב, באותו commit.
**מקרא:** ✅ בוצע · 🔄 בתהליך · ⏳ ממתין להכרעה · ⏸️ נדחה בהכרעה · ⬜ לא התחיל

**חוק עבודה:** כללי העבודה מ-11.10 (`CLAUDE.md`, "Decision authority"): אני מחליט את מה שלא שמור לך ורושם.
**חוק סנכרון:** כל שינוי במערכת מתעדכן ב-SRS. המנגנון נקבע ב-D1.

---

## איפה אנחנו עומדים

**עודכן:** 14.10.2026 · **גרסת SRS:** 2.12 · **מצב:** בניית מוצר. מערך הסוכנים קפוא עד ש-I1 ממוזג (הכרעתך מ-13.10, `decisions.md`).

- **✅ כלי ה-Preview — מוזג** (PR 21, ‏`2d877b2`, ‏14.10; ‏`.work/preview-access/result.md`): ‏`preview-smoke` (רץ על כל Preview: ‏health ‏200, נתיב מוגן נכשל סגור) ו-`tools/preview-shot.mjs` (צילום Preview מוגן). השרת מוחק את כותרת ה-bypass. ‏CRITIC: ‏Validated with Concern; ‏1–4 נסגרו, 5 ב-debt, 6 אומת בריצה הראשונה.
- **✅ F1.3 `register-profile-step` — מוזג** (PR 22, ‏14.10; ‏`.work/register-profile-step/result.md`): שלב 1 בהרשמה — שלב במסע, שם, מין ההורה, תאריך לידה משוער, ילדים 1–10; הנתונים בזיכרון הטאב בלבד. ‏CRITIC: ‏Validated with Concern (סכמה strict ב-F1.4 Gate 2, ‏debt). ה-Preview נבדק ב-375 וב-1024.
- **✅ האצה — מוזג** (PR 23, ‏`a756931`, ‏14.10, בקשתך): ‏CI ‏browser כ-matrix (Chrome/Edge × 2 shards): ‏4–5 דק׳ במקום 16–18. ‏Vercel בונה כל ענף עם PR פתוח, בלי תלות בסדר push/PR. ‏vitest רץ מהשורש. ‏CRITIC: ‏Validated. סעיפים 4–6 אושרו (‏14.10) ונבנו ב-`chore/speed-up-2`: ‏TEST ENGINEER עורך ומריץ את הטסטים שלו, ‏BUILDER כותב `interface.md`, ו-jq אינו נחשב נתיב ב-guard. ‏CRITIC (opus): שני ממצאים גבוהים ב-guard תוקנו, ‏Validated.
- **✅ F1.2 `app-shell-guard` — מוזג** (PR 19, ‏`53b85d0`, ‏14.10; ‏`.work/app-shell-guard/result.md`): מסך Welcome, ‏AppShell, ‏RouteGuard ושכבת session. ‏CRITIC: ‏Validated with Concern, וארבעה ממצאים קלים נסגרו. ה-Preview נבדק על production אחרי המיזוג ב-375 וב-1024.
- **ממתין להכרעה שלך:** אין. (14.10: סוד ה-bypass נשאר repository secret — הכרעתך, `decisions.md`; הסיכון הנותר ב-`debt.md`.)
- **ממתין לך (סודות ופעולות):**
  1. **קובץ יומן מקומי ישן** `.live/events.jsonl` (טקסט מפרומפטים, לא ב-git): מחיקה היא שלך. אחריה אפשר להסיר את `.live/` מ-`.gitignore`.
  2. **מחיקת ענפים מרוחקים שמוזגו:** ‏`ui-wave-1/part-a` עד `part-e`, ‏`chore/i1-prep`, ‏`chore/guard-env-paths` (מוזג), ‏`chore/preview-access` (הוחלף ב-`-v2` אחרי rebase), ‏`chore/records-after-f12` (מוזג).
  3. **ב-F1.8:** הגדרת Google Cloud והסודות — אנחה אותך צעד-צעד.
  4. **כשיידרש route שנוגע במסד (F1.4):** ‏`DATABASE_URL` של `app_server` ב-Vercel (‏transaction pooler, פורט 6543).
- **פתוח, בלי הכרעה עכשיו:** החלטות המדיה M1–M6 לפני I5 · תקציב לביקורת משפטית לפני I9 · אם בניות ש-Vercel דילג עליהן נספרות במגבלה, עוברים ל-`git.deploymentEnabled`.
- **התקדמות מוצר (שורה לכל סשן):**
  - 14.10: ‏F1.1 הושלם, שלושה PRs מוזגו (15, 16, 17). הסכמה הראשונה הוחלה על preview, ו-pgTAP עבר 394/394. ‏F1.2 מוזג (PR 19). ‏Welcome חי ב-production, ואורח מנותב אליו. כלי ה-Preview מוזג (PR 21), ו-F1.3 נפתח. ‏F1.3 מוזג (PR 22). האצת CI מוזגה (PR 23).
- **להמשך (מסירה ל-session הבא):**
  1. **איפה עומדים:** ‏I1: ‏F1.1, ‏F1.2 ו-F1.3 מוזגו; כלי ה-Preview והאצת ה-CI מוזגו. ‏SRS ‏2.12 (טקסטי ERR-003 וסדר השדות ממתינים למנת ה-SRS הבאה). מערך הסוכנים קפוא עד סוף I1, מלבד חריג ההאצה. ‏Production: ‏[nestly-blue.vercel.app](https://nestly-blue.vercel.app).
  2. **הבא בתור:** ‏F1.4 (יצירת החשבון): ‏intake ו-spec. ב-Gate 2: סכמת שלב 1 strict וחסומה בגודל (‏debt). לפני push: כל חבילת הדפדפן מקומית. ‏F1.4 הראשון בתהליך החדש: ‏interface.md ובדיקת עובדות-בלבד לפני TEST ENGINEER.
  3. **בדרך:** שינוי קטן ב-`tools/critic-diff.mjs` (בלי package-lock, ‏noise, ‏incidents ו-.claude/logs) נכנס עם הפיצ'ר הבא. לפני F1.5: ‏PR אחד שסוגר את ה-debt שמסומן "חייב לפני F1.5", כמו הבדיקה של `is_active_account`.
  4. **פתוח אצלך:** הפריטים 1–4 ב"ממתין לך". אימתת ב-14.10: ‏Git Fork Protection פועל, ל-`db-production` יש reviewer חובה וכלל main-only, ו-Node ב-Vercel הוא 22.x.
  5. **כללי עבודה:** בדיקות מקומיות בין שלבים, ‏push אחד לכל חלק. ‏draft PR נפתח מיד אחרי ה-push הראשון של הענף, כי Vercel בונה Preview רק לענף עם PR פתוח. ה-diff ל-CRITIC רק דרך `tools/critic-diff.mjs`, ובלי נימוקי BUILDER בתדריך (‏incidents ‏14.10). ‏spec עד כ-150 שורות, וטסט אחד או שניים לכל קריטריון.
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

- skills שלב ב: `react-web`, `fastify-api`, `drizzle-postgres`, `testing-craft`, `shared-contracts`, `rls-tests` (חריג: skill ממוקד אחד אחרי שני כשלים על אותה בעיית craft).
- 6.1: domain של Threat Modeling.
- 7.2: בדיקת ה-hook של security-guidance.
- skills שלב ג: דוגמאות שמפנות לקוד אמיתי, `/srs-coverage`.
- הצעת BUILDER לעדכון conventions "Git and shell" אחרי תיקון כלל ה-env (`.work/guard-env-paths/notes.md`).
- סוכן שמריץ `node -e` עם טקסט שמזכיר קובץ env נחסם (נכון לפי הכלל): פעמיים ב-13.10. לשקול שורה ב-conventions.
- חסימות fail-closed של כלל ה-env על ארגומנטים שנראים כמו glob (`.[]` של jq, ‏`gh api`): שלוש ב-14.10, כלומר סף הדפוס. יש עקיפה סבירה, ולכן אין חריג הקפאה. ההצעה של CRITIC (debt): כלל לא-קריטי לעמימות.
- גדר הקריאה של TEST ENGINEER: ‏21 חסימות ב-F1.1, ועקיפה דרך טסטי סריקה ב-F1.2. לבחון לתת לו לקרוא טיפוסים וממשקים מיוצאים במקום חסימה גורפת (הכרעתך מ-14.10).
- ה-guard חוסם כל פקודה של סוכן שה-cwd שלו הוא worktree תחת `.claude/worktrees/` ("not the project root"): ‏TEST ENGINEER נחסם 5 פעמים ב-3 דקות (14.10, ‏preview-access). בינתיים: ענפים נבדקים ב-checkout הראשי, לא ב-worktree, ו-ORCHESTRATOR מריץ את הטסטים.

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
