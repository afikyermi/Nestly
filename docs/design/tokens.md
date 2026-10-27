# Design tokens — שזיף על לבן, עם Assistant

**מעמד:** מאושר על ידי אפיק ב-27.10.2026 (עיצוב מחדש, Claude Design סבב 7, `handoff-2026-10-27/`). מחליף את כיוון A, משמש וטרקוטה (R1, 11.10.2026).
**ייעוד המסמך:** מפרט לקריאה. מקור הקוד ייבנה ב-9.7 ב-`packages/shared/src/design-tokens/`, וממנו יופקו ה-CSS וטסט
הניגודיות. אם המסמך והקוד לא מסכימים, הקוד מתוקן לפי המסמך, או שהמסמך מתעדכן בהחלטה.
**מצב כהה:** לא מוגדר (החלטה מ-11.10). הרכיבים משתמשים רק בשמות הסמנטיים שלמטה, ולכן אפשר להוסיף מצב כהה בעתיד
בלי לגעת ברכיבים.

## צבע — tokens סמנטיים

השמות תואמים ל-shadcn/ui, כדי שרכיבים שנוצרים לא יצטרכו שינוי שם. שורות שמסומנות "+" הן תוספות שלנו.
**עקרון העל (עיצוב 27.10):** רקע לבן ושזיף עמום רק כסימן: הסרגל העליון, הכפתור הראשי, מה שנבחר, אייקונים קטנים וקישורים. אין משטחים גדולים בשזיף, ואין קידוד מגדרי בצבע.

| token | ערך | תפקיד |
|---|---|---|
| `background` | `#FFFFFF` | רקע הדף, לבן. פריטי הפיד מופרדים בקו `divider` |
| `foreground` | `#1D1B1D` | טקסט ראשי |
| `card` · `popover` | `#FFFFFF` | משטחים: כרטיס, תפריט, דיאלוג |
| `card-foreground` · `popover-foreground` | `#1D1B1D` | טקסט על משטח |
| `primary` | `#805B75` | שזיף עמום: כפתור ראשי, טבעת focus, סימון נבחר, אייקון פעיל |
| `primary-foreground` | `#FFFFFF` | טקסט על `primary` |
| + `primary-strong` | `#6A4B61` | קישור, טקסט ואייקון על פסטל, hover של כפתור ראשי |
| + `primary-soft` | `#F2E8EF` | פסטל שזיף: בועת המונה, ההודעות שלי בצ'אט |
| `secondary` | `#F2F0F1` | כפתור משני ניטרלי, בלי מילוי שזיף |
| `secondary-foreground` | `#1D1B1D` | טקסט על `secondary` |
| `muted` | `#F2F0F1` | משטח משני: שדה חיפוש, skeleton, תגית יועץ |
| `accent` | `#E9E7E8` | hover על משטח משני |
| `muted-foreground` | `#6B6168` | טקסט משני: זמן, הקשר, רמזים |
| + `accent-soft` | `#F5ECDD` | פסטל חול חם: מסע הילד, הדגשות |
| `destructive` | `#B3261E` | שגיאה ופעולה הרסנית |
| + `destructive-soft` | `#FCEEEC` | רקע הודעת שגיאה |
| + `success` · `success-soft` | `#2E6B45` · `#E6F0E9` | הצלחה |
| + `warning` · `warning-soft` | `#8A5300` · `#FBF0DC` | אזהרה. לא נקבע צבע מידע כחול |
| `border` | `#E9E7E8` | קו מפריד דקורטיבי בלבד. לא משמש לזיהוי רכיב |
| `input` | `#8B7E87` | גבול שדה קלט, תיבת סימון ושבב (3.87:1) |
| `ring` | `#805B75` | טבעת focus |
| + `badge` · `badge-foreground` | `#F2E8EF` · `#543B4C` | מונה שקט, תגית |
| + `brand-bar` | `#805B75` | רקע הסרגל העליון. אותו ערך כמו `primary`, תפקיד נפרד |
| + `brand-subtle` | `#F9F4F7` | כרטיס ההריון, שבב נבחר, אזורי "רק אתם רואים" |
| + `warm` · `warm-foreground` | `#F5ECDD` · `#6E5126` | חול חם: כרטיס הילד, אזור ממומן, מודעה מקודמת. אף פעם לא כפתור ראשי |
| + `egg` | `#DEC093` | הביצה בסימן בלבד. לעולם לא טקסט |
| + `divider` | `#E9E7E8` | קו של 1px בין פריטי הפיד. דקורטיבי |
| + `avatar-1` · `avatar-2` · `avatar-3` · `avatar-4` · `avatar-5` · `avatar-6` | `#EBD9BC` · `#F3D5C5` · `#D3E3EE` · `#D6E6D1` · `#E3D4DE` · `#E2DDEF` | אווטאר אותיות: אחד מששת הפסטלים, לפי חישוב קבוע מתוך השם. הטקסט `foreground` |

## ניגודיות — WCAG 2.2 AA

הסף: 4.5 לטקסט, ו-3 לגבולות, לאייקונים ולטבעת ה-focus. החישוב לפי נוסחת WCAG, והטסט ב-Vitest קורא את הטבלה הזו.

| קדמה | רקע | יחס | סף | |
|---|---|---|---|---|
| foreground | background | 17.12 | 4.5 | ✅ |
| foreground | card | 17.12 | 4.5 | ✅ |
| foreground | muted | 15.09 | 4.5 | ✅ |
| muted-foreground | background | 5.94 | 4.5 | ✅ |
| muted-foreground | card | 5.94 | 4.5 | ✅ |
| muted-foreground | muted | 5.24 | 4.5 | ✅ |
| primary-foreground | primary | 5.72 | 4.5 | ✅ |
| primary-foreground | primary-strong (hover) | 7.52 | 4.5 | ✅ |
| primary-strong | background | 7.52 | 4.5 | ✅ |
| primary-strong | card | 7.52 | 4.5 | ✅ |
| primary-strong | primary-soft | 6.29 | 4.5 | ✅ |
| foreground | primary-soft | 14.32 | 4.5 | ✅ |
| foreground | accent-soft | 14.61 | 4.5 | ✅ |
| primary-strong | accent-soft | 6.42 | 4.5 | ✅ |
| destructive | card | 6.54 | 4.5 | ✅ |
| destructive | background | 6.54 | 4.5 | ✅ |
| destructive | destructive-soft | 5.78 | 4.5 | ✅ |
| primary-foreground | destructive | 6.54 | 4.5 | ✅ |
| success | card | 6.35 | 4.5 | ✅ |
| success | success-soft | 5.45 | 4.5 | ✅ |
| warning | card | 6.33 | 4.5 | ✅ |
| warning | warning-soft | 5.61 | 4.5 | ✅ |
| input | card | 3.87 | 3 | ✅ |
| input | background | 3.87 | 3 | ✅ |
| ring | card | 5.72 | 3 | ✅ |
| ring | background | 5.72 | 3 | ✅ |
| ring | primary-soft | 4.78 | 3 | ✅ |
| primary-soft | card | 1.20 | — | ℹ️ פסטל לבד לא נושא מידע |
| badge-foreground | badge | 8.34 | 4.5 | ✅ |
| primary-foreground | brand-bar | 5.72 | 4.5 | ✅ |
| foreground | brand-subtle | 15.74 | 4.5 | ✅ |
| primary-strong | brand-subtle | 6.92 | 4.5 | ✅ |
| warm-foreground | warm | 6.25 | 4.5 | ✅ |
| foreground | secondary | 15.09 | 4.5 | ✅ |
| muted-foreground | brand-subtle | 5.46 | 4.5 | ✅ |
| foreground | avatar-1 | 12.38 | 4.5 | ✅ |
| foreground | avatar-2 | 12.34 | 4.5 | ✅ |
| foreground | avatar-3 | 13.04 | 4.5 | ✅ |
| foreground | avatar-4 | 13.12 | 4.5 | ✅ |
| foreground | avatar-5 | 12.01 | 4.5 | ✅ |
| foreground | avatar-6 | 12.90 | 4.5 | ✅ |

**שלושה כללים שנובעים מהטבלה:**
- **פסטל לא מסמן לבד.** מצב נבחר, לשונית פעילה ומונה מקבלים גם טקסט עמוק, משקל גופן, אייקון מלא או סימן.
- **`border` ו-`divider` הם קישוט בלבד.** כל שדה קלט, וכל רכיב אחר שצריך גבול כדי לזהות אותו, משתמש ב-`input`.
- **הכפתור הראשי והסרגל הם הזוג הכי קרוב לסף (5.72).** לכן לא מחלישים אותם: לא שקיפות ולא גוון בהיר יותר.

## טיפוגרפיה — Assistant

- **גופן אחד**, `Assistant`, משתנה בין 200 ל-800. במוצר נטען דרך `@fontsource-variable/assistant`, ב-subsets עברית ולטינית. הוא החליף את Rubik ב-27.10.
- **הלוגו:** "nestly" ב-Fredoka קיים רק כנתיבים בתוך ה-SVG של הלוגו. הגופן לא נטען.
- **גיבוי:** `system-ui, sans-serif`.

| token | גודל ושורה (px) | משקל | שימוש |
|---|---|---|---|
| `display` | 30 / 36 | 800 | מסכי פתיחה בלבד |
| `h1` | 24 / 30 | 800 | כותרת מסך |
| `h2` | 19 / 25 | 700 | כותרת אזור |
| `h3` | 17 / 22 | 700 | כותרת כרטיס, שמות בפוסט ובתגובה |
| `lead` | 19 / 27 | 500 | פוסט קצר (עד כ-120 תווים), פתיח |
| `body` | **17 / 26** | 400 | גוף טקסט, פוסטים |
| `label` | 15 / 20 | 600 | תוויות שדות וכפתורים |
| `small` | 15 / 22 | 400 | טקסט משני, רמזים |
| `caption` | 13 / 18 | 500 | זמן, הקשר, מונים |

- **מינימום 13px.** אין טקסט קטן מזה.
- **ספרות:** מונים, מחירים ושעות מוצגים ב-`tabular-nums`, כלומר ספרות ברוחב שווה.
- **הדגשה:** Assistant קל מ-Rubik באותו משקל, ולכן 500 לפעולות, 600 לתוויות, 700 ו-800 לכותרות, לשמות ולמצב פעיל.

## ריווח, פינות וצללים

| קבוצה | ערכים |
|---|---|
| ריווח | הסקאלה של Tailwind, עם בסיס של 4px. **קצב:** ריפוד כרטיס 16 במובייל ו-20 בדסקטופ · בין כרטיסים 12 (בפיד בטלפון: קו `divider` במקום רווח; בדסקטופ 16) · בין אזורים 24 עד 32 · שוליים בצדי המסך 16 |
| פינות | `sm` 6 לתג · `md` 10 לשדה וכפתור · `lg` 14 לכרטיס, אריח ותמונה · `xl` 20 ל-sheet ודיאלוג · `full` ל-avatar, pill, שבב ושדה חיפוש |
| צל `card` | `0 0 0 1px #D8D4D7`: קו מתאר של כרטיס בדסקטופ. על רקע לבן אין צל רך |
| צל `raised` | `0 6px 20px -8px rgb(63 44 57 / .25)`: תפריט, popover, "N פוסטים חדשים", כפתור "חזרה למעלה" |
| צל `sheet` | `0 -10px 40px -10px rgb(63 44 57 / .35)`: גיליון מלמטה |
| צל `bar` | `0 1px 0 #E9E7E8`: הקצה העליון של הניווט התחתון |

## מצבים, מגע ותנועה

| token | ערך |
|---|---|
| focus | טבעת `ring` של 2px, עם מרווח 2px, רק ב-`:focus-visible` |
| hover | משטח עובר ל-`muted`. כפתור ראשי עובר ל-`primary-strong` |
| selected | שבב: רקע `brand-subtle`, קו `primary` וטקסט `badge-foreground`. טאב: אייקון מלא ותווית ב-`primary-strong` במשקל 700, **בלי רקע**. כרטיס בחירה: גבול `primary` ו**סימן ✓** |
| error | גבול `destructive` של 2px, אייקון והודעה, עם `aria-invalid` ו-`aria-describedby` |
| disabled | רק כשאין ברירה. כפתור שליחה לא מנוטרל, ובמקום זה מוצגות שגיאות |
| גודל מגע | **44×44** לכל פעולת מגע ראשית. המינימום המוחלט הוא 24×24 (WCAG 2.5.8) |
| תנועה | `fast` 150ms · `base` 200ms · `slow` 300ms · `ripple` 600ms (אדוות הלייק), עם `cubic-bezier(.2,.8,.2,1)`. ב-`prefers-reduced-motion` אין תזוזה |
| z-index | `base` 0 · `sticky` 10 (Top Bar, ניווט) · `scrolltop` 20 · `drawer` 30 · `popover` 40 · `toast` 50 · `dialog` 60 |
| breakpoints | `sm` 640 · `md` 768 · `lg` 1024. מ-`lg` ומעלה היעדים עוברים למרכז הסרגל העליון, ובצד ההתחלה עמודת קיצורי דרך |
