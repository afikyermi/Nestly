# Nestly

רשת חברתית לתכנון הריון, הריון והורות. **אפיק מקבל את ההחלטות**; הקוד נבנה עם Claude Code לפי `CLAUDE.md`.

**מתחילים מכאן:** [`WORKPLAN-HE.md`](WORKPLAN-HE.md) — איפה העבודה עומדת ומה ממתין להכרעה. המוצר: [`docs/srs/INDEX.md`](docs/srs/INDEX.md).

---

## מבנה

```
nestly/
├── README.md               ← הקובץ הזה
├── CLAUDE.md               ← כללי הבנייה. נטען אוטומטית בכל סשן מהתיקייה הזו
├── WORKPLAN-HE.md          ← סטטוס קצר ו"ממתין לך"
├── decisions-in-force.md   ← החלטות אפיק שבתוקף ואינן ב-SRS, ומפת ה-Initiatives
├── security-privacy-open.md ← סיכוני אבטחה ופרטיות והכרעותיהם
│
├── apps/web · apps/server · packages/shared   ← React (Vite) · ‏Fastify · ‏Zod וטיפוסים משותפים
├── supabase/               ← migrations, ‏rollback, ‏bootstrap ובדיקות pgTAP
├── e2e/ · e2e-preview/     ← בדיקות Playwright: מול build מקומי, ומול Preview אמיתי (לילה)
│
├── .claude/
│   ├── knowledge/          ← data-model.md (חוקי המסד וה-RLS), ‏data-model-tables.md, ‏conventions.md
│   ├── skills/             ← srs-lookup, ‏srs-update ו-skills של UI (accessibility, ‏rtl-hebrew, ‏design-system, ‏ux-copy-he)
│   ├── rules/srs-editing.md ← כללי עריכת ה-SRS
│   ├── hooks/              ← ה-guard: חוסם סודות, force push וכתיבה ל-production
│   └── settings.json       ← הרשאות (Guardrails שנאכפים, לא פרוזה)
│
├── docs/                   ← ה-SRS, ומסמכים בעברית להבנה ולהחלטות
│   ├── srs/                        ← **ה-SRS — מקור האמת של המוצר**, ב-markdown ומפוצל לפי סעיפים
│   │   ├── INDEX.md                ← מתחילים כאן: מפת קבצים, כל FR וכל AC וגם טווחי המזהים
│   │   ├── 00-document-info.md … 18-algorithms-spec.md · appendix-a … appendix-d
│   │   ├── 05-functional/          ← ה-FR ב-16 קבצי תחום (auth, registration, feed, chat …; הרשימה ב-INDEX)
│   │   └── archive/                ← ה-SRS ב-Word: v1 ו-v2.2. היסטוריה בלבד, לא לעריכה
│   │
│   ├── srs-analysis-HE.md          ← ניתוח SRS v2.2 (היסטוריה)
│   ├── glossary-HE.md              ← מילון מונחים מאפס
│   ├── database-decision-HE.md     ← RLS ובחירת המסד
│   ├── engineering-guidelines-review-HE.md ← סקירת הנחיות הנדסיות חיצוניות (היסטוריה)
│   ├── lecturer-demo-plan-HE.md    ← תוכנית ההצגה למרצה
│   └── design/                     ← כיוון העיצוב, tokens, sketches ו-mockups
│
└── tools/
    ├── build-srs-index.js  ← בונה את docs/srs/INDEX.md מתוך קבצי ה-SRS. להריץ אחרי כל שינוי ב-FR או AC
    ├── srs-ac-names.json   ← השמות המקוצרים של ה-AC באינדקס
    ├── export-srs-docx.js  ← מייצא את ה-SRS המלא ל-Word: exports/Nestly_SRS_v<גרסה>.docx
    ├── package.json        ← תלויות הכלים (docx, postgres), מותקנות רק ב-tools/
    ├── docx2md.ps1         ← ממיר docx ל-markdown, למקרה שיגיע שוב קובץ Word
    ├── db-preview.mjs      ← SQL על nestly-preview בלבד; קורא את .env.preview בעצמו ולא מדפיס אותו
    ├── db-local.mjs        ← בדיקות ה-DB (test:db) מקומית ב-Docker, באותו image כמו ב-CI, רק על 127.0.0.1 (ראו למטה)
    ├── branch-delete.mjs   ← מחיקת ענף מרוחק: רק ready/* או ענף שמוזג ל-main; את main לעולם לא
    ├── probes/             ← בדיקות התשתית של 7.3 (T3–T7, P1–P4), על preview בלבד
    ├── build-design-tokens.js, check-stories.mjs, eslint-rules/  ← שערי העיצוב וה-CI
```

## בדיקות ה-DB מקומית (Docker)

1. **אחרי הפעלה מחדש של המחשב:** לפתוח את Docker Desktop ולחכות ל-"Engine running". בלי זה הכלי עוצר עם הודעה.
2. `node tools/db-local.mjs test` — מקים מסד חד-פעמי מאותו image, מריץ את קובצי ההקמה של ה-job ‏`db` ב-CI באותו סדר
   (כולל בדיקת ה-anchor FK), מריץ `npm run test:db` ומוחק את הקונטיינר. בפעם הראשונה הוא מוריד את ה-image ואת
   ה-Supabase CLI הנעול (כמה דקות).
3. `--keep` משאיר את הקונטיינר רץ (127.0.0.1, ביציאה מהטווח 54400–54899 שנגזרת מנתיב ה-checkout; שם הקונטיינר `nestly-local-db-<8 תווים>` נגזר מאותו נתיב, כך ששני checkouts או worktrees לא מתנגשים); `node tools/db-local.mjs down` מוחק רק את הקונטיינר של ה-checkout הזה. אם נשאר קונטיינר (Ctrl-C), ההרצה הבאה או `down` מוחקות אותו.
4. `node tools/db-local.mjs pgtap [קבצים…]` — מקים את אותו מסד ומריץ את קובצי ה-pgTAP כמו שלב ה-pg_prove ב-CI (כ-`app_server`, ‏`search_path=pgtap,tests`); בלי קבצים — כולם, בסדר שמות. קוד יציאה שונה מ-0 על `not ok`, על אי-התאמה בין התכנית לספירה או על שגיאה.

**זה לא ה-CI כולו.** השערים האחרים של ה-job לא רצים כאן: up→down→up של המיגרציה האחרונה, push שני בלי שינוי,
בדיקת האטומיות, הרצה שנייה של שלב 2, בדיקת ה-drift של Drizzle, ה-fire checks של שער ה-RLS, שער ה-RLS כ-app_server
ובדיקת ה-expand של P6 (קובצי ה-SQL שלא רצים: `SKIPPED_CI` בכלי). חבילת ה-pgTAP כן רצה כאן, עם `pgtap` (שלב 4). מעבר מקומי הוא אות מוקדם; ה-CI נשאר הפסק.

הסיסמאות אקראיות לכל הרצה ונשארות בתהליך בלבד. הכלי לא קורא קובצי env ולא פונה לשום מסד מלבד המקומי.

## חוקים שלא משתנים

- **שפות המוצר (כלל 0):** React, TypeScript, CSS ו-HTML ב-Web, ושרת Node.js ב-TypeScript. כך הוחלט ב-11.10.2026, במקום כלל ה-JavaScript מ-12.9. קודם Web, ו-React Native רק אחרי אישור. בדיקות: Vitest, ‏React Testing Library, ‏Playwright, ‏axe-core, ‏pgTAP
- **כל שינוי במערכת מתעדכן ב-SRS**, כלומר בקבצי ה-markdown תחת `docs/srs/`. כשנוסף או משתנה FR או AC, מריצים את `node tools/build-srs-index.js`. כללי העריכה: `.claude/rules/srs-editing.md`
- ‏`git push --force` ו-`git remote add` **חסומים** ב-`.claude/settings.json`; ‏push רגיל מותר. מיזוג רק כש-CI ירוק.
