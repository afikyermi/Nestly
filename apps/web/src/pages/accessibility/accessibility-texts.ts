// The accessibility statement (NFR-A11Y-001, §2 "הצהרת נגישות"; PG-061, AC-187): what the site supports and how it is checked, as built,
// and its known limits. Built per ⭐ OP-078: the named accessibility coordinator and contact details the regulation asks for are Afik's.
import type { LegalSection } from '@/pages/legal/legal-texts';

export const ACCESSIBILITY_TITLE = 'הצהרת נגישות';
/** The day this text last changed (YYYY-MM-DD). It is no consent document, so no registration records it. */
export const ACCESSIBILITY_UPDATED = '2026-10-26';
export const ACCESSIBILITY_INTRO =
  'אנחנו רוצים ש-Nestly תהיה נוחה לכל ההורים, גם למי שמשתמשים במקלדת בלבד, בקורא מסך או בהגדלה. אתר האינטרנט נבנה לפי התקן הבינלאומי WCAG 2.2 ברמה AA.';

export const ACCESSIBILITY_SECTIONS: readonly LegalSection[] = [
  {
    title: 'מה נתמך',
    items: [
      'כל הפעולות זמינות במקלדת, עם סימון ברור של המקום שבו נמצאים, וקישור "דילוג לתוכן הראשי" בתחילת כל מסך שיש בו תפריט.',
      'כותרות, שדות, כפתורים והודעות שגיאה מסומנים כך שקורא מסך מקריא אותם, והודעות על שמירה או שגיאה מוקראות.',
      'האתר כתוב בעברית מימין לשמאל, והוא מתאים את עצמו לגודל המסך, מטלפון ועד מחשב, בלי גלילה לרוחב.',
      'האתר אינו חוסם הגדלה של התצוגה בדפדפן.',
      'כשבמערכת ההפעלה נבחרה תנועה מופחתת, אין אנימציות.',
      'כפתורים ויעדי לחיצה גדולים מספיק למגע, ומידע אינו מועבר בצבע בלבד.',
      'אין חידות או מבחנים בכניסה, ואפשר להדביק סיסמה.',
    ],
  },
  {
    title: 'איך זה נבדק',
    text: 'המסכים נבדקים בבדיקות אוטומטיות של נגישות ושל מעבר במקלדת, בגודל של טלפון ושל מחשב, בכל שינוי בקוד של האתר.',
  },
  {
    title: 'מגבלות ידועות',
    items: [
      'לתמונות שמשתמשים מעלים עוד אין תיאור שהמעלה כותב: קורא המסך מקריא "תמונה" ואת מספרה בפוסט או במודעה.',
      'האפליקציה לטלפון עוד לא קיימת; רמת הנגישות שלה תיקבע כשתיבנה.',
    ],
  },
  {
    title: 'נתקלתם בבעיה?',
    text: 'אם משהו באתר אינו נגיש לכם, אפשר לפנות ל-Support מתוך התפריט, בנושא "שאלה על השימוש", ולתאר את המסך ואת הבעיה. נחזור אליכם בפנייה.',
  },
];
