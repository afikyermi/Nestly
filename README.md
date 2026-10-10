# Nestly

רשת חברתית לתכנון הריון, הריון והורות. נבנית בידי צוות סוכנים, ו**אפיק מקבל את ההחלטות**.

**מתחילים מכאן:** [`WORKPLAN-HE.md`](WORKPLAN-HE.md) — איפה העבודה עומדת ומה ההכרעות הפתוחות.

---

## מבנה

```
nestly/
├── README.md               ← הקובץ הזה
├── CLAUDE.md               ← ORCHESTRATOR: חוקי הלופ הראשי. נטען אוטומטית בכל סשן מהתיקייה הזו
├── WORKPLAN-HE.md          ← תוכנית העבודה החיה
├── decisions.md            ← יומן החלטות וחלופות שנדחו. סוכנים קוראים אותו לפני כל הצעה
├── open-questions.md       ← שאלות פתוחות ומה כל אחת חוסמת
├── debt.md · escapes.md · incidents.md · noise.md   ← יומני הלמידה והתפעול
│
├── .claude/
│   ├── agents/             ← 6 הגדרות סוכנים (spec, data-architect, builder, scout, critic, test-engineer)
│   ├── knowledge/          ← ידע פרויקט: conventions.md, data-model.md
│   ├── workflow.md         ← הצינור הקנוני — מי נכנס מתי
│   ├── learning.md         ← לופ השיפור: טריגרים, תקציבים, גרסאות
│   └── settings.json       ← הרשאות (Guardrails שנאכפים, לא פרוזה)
│
├── docs/                   ← ה-SRS, ומסמכים בעברית להבנה ולהחלטות
│   ├── srs/                        ← **ה-SRS — מקור האמת של המוצר**, ב-markdown ומפוצל לפי סעיפים
│   │   ├── INDEX.md                ← מתחילים כאן: מפת קבצים, כל FR וכל AC וגם טווחי המזהים
│   │   ├── 00-document-info.md … 18-algorithms-spec.md · appendix-a … appendix-d
│   │   ├── 05-functional/          ← 82 FR ב-16 קבצי תחום (auth, registration, feed, chat …)
│   │   └── archive/                ← ה-SRS ב-Word: v1 ו-v2.2. היסטוריה בלבד, לא לעריכה
│   │
│   ├── srs-analysis-HE.md          ← ניתוח SRS v2.2 והשלכותיו על הסוכנים
│   ├── coverage-audit-HE.md        ← ביקורת כיסוי: המודל המקורי מול מה שנבנה
│   ├── overview-HE.md              ← סקירת כל הסוכנים והמבנה
│   ├── glossary-HE.md              ← מילון מונחים מאפס
│   ├── database-decision-HE.md     ← RLS ובחירת המסד
│   └── design-history/             ← איך הגענו למודל, לפי סדר כרונולוגי (ראה למטה)
│
└── tools/
    ├── build-srs-index.js  ← בונה את docs/srs/INDEX.md מתוך קבצי ה-SRS. להריץ אחרי כל שינוי ב-FR או AC
    ├── srs-ac-names.json   ← השמות המקוצרים של ה-AC באינדקס
    ├── export-srs-docx.js  ← מייצא את ה-SRS המלא ל-Word: exports/Nestly_SRS_v<גרסה>.docx
    ├── package.json        ← התלות היחידה של הכלים (docx), מותקנת רק ב-tools/
    └── docx2md.ps1         ← ממיר docx ל-markdown, למקרה שיגיע שוב קובץ Word
```

## היסטוריית התכנון — לפי הסדר

| # | מסמך | מה בו |
|---|---|---|
| 0 | `agent_operating_model_skill_registry_v1.md` | **המודל המקורי של אפיק:** 11 סוכנים, Skills, Gates וגוורננס |
| 1 | `agent-model-review-HE.md` | ביקורת: האם המודל יישומי או מנופח |
| 2 | `nestly-model-v2-proposal-HE.md` | עיצוב מחדש לפי עלות-טעות, אחרי ה-SRS הראשון |
| 3 | `nestly-build-team-design-HE.md` | צוות הבנייה: 6 סוכנים, פרוטוקול והרשאות |
| 4 | `nestly-model-v3-merged-HE.md` | שיקלול: 11 מנגנונים שחזרו מהמודל המקורי |
| 5 | `nestly-v3.1-requirements-audit-HE.md` | ביקורת 25 הדרישות של אפיק → v3.1 |

אחרי v3.1 נכתבו הקבצים החיים ב-`.claude/`, ומאז הם מקור האמת. המסמכים כאן הם **היסטוריה**, ולא מתעדכנים.

## חוקים שלא משתנים

- **המוצר נבנה רק ב-React, JavaScript, CSS ו-HTML.** זה חוק ברזל. כלי QA נבחרים לפי NFR-QA-001
- **כל שינוי במערכת מתעדכן ב-SRS**, כלומר בקבצי ה-markdown תחת `docs/srs/`. כשנוסף או משתנה FR או AC, מעדכנים גם את `INDEX.md`. היקף הכלל וניהול הגרסאות עדיין פתוחים בהכרעה D1
- `git push` ו-`git remote add` **חסומים** ב-`.claude/settings.json`. כדי לפתוח אותם צריך החלטה של אפיק
