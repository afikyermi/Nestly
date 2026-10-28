// The Nestly assistant's words (Afik 28.10.2026; FR-AI-001, PG-062, ERR-055). Gender-neutral (NFR-USAB-003).
import { ASSISTANT_PER_DAY, ASSISTANT_PER_HOUR, ASSISTANT_TEXT_MAX } from '@nestly/shared';

export const ASSISTANT_NAME = 'העוזר של Nestly';
export const ASSISTANT_OPEN_LABEL = 'פתיחת העוזר של Nestly';
export const ASSISTANT_CLOSE_LABEL = 'סגירת העוזר';
export const ASSISTANT_PRIVACY_NOTE = 'ההודעות נשלחות לשירות של Google לעיבוד. לא נשלח מידע מהחשבון שלכם.';
export const ASSISTANT_INTRO = 'אפשר לשאול על תכנון הריון, הריון והורות. הנה כמה שאלות לדוגמה:';
export const ASSISTANT_SUGGESTIONS: readonly string[] = [
  'מה כדאי לדעת לפני שמתחילים לנסות להיכנס להריון?',
  'אילו בדיקות מקובלות בשליש הראשון?',
  'איך אפשר לעזור לתינוק להירדם בלילה?',
  'רעיונות לארוחות קלות בהריון',
];
export const ASSISTANT_SUGGESTIONS_LABEL = 'שאלות לדוגמה';
export const ASSISTANT_THREAD_LABEL = 'השיחה עם העוזר';
export const ASSISTANT_MESSAGE_LABEL = 'הודעה לעוזר';
export const ASSISTANT_SEND_LABEL = 'שליחה לעוזר';
export const ASSISTANT_TYPING = 'העוזר כותב…';
export const ASSISTANT_FROM_YOU = 'ההודעה שנשלחה';
export const ASSISTANT_FROM_ASSISTANT = 'העוזר';
export const ASSISTANT_UNAVAILABLE = 'העוזר לא זמין כרגע. אפשר לנסות שוב בעוד כמה דקות';
export const ASSISTANT_RATE_LIMITED = `נשלחו כבר הרבה הודעות לעוזר: אפשר עד ${ASSISTANT_PER_HOUR} בשעה ועד ${ASSISTANT_PER_DAY} ביום. אפשר לחזור מאוחר יותר.`;
export const ASSISTANT_TOO_LONG = `אפשר לכתוב עד ${ASSISTANT_TEXT_MAX.toLocaleString('he-IL')} תווים בהודעה.`;
export const ASSISTANT_EMPTY = 'יש לכתוב שאלה לפני השליחה.';
export const ASSISTANT_URGENT = 'אם זה מצב דחוף, אין לחכות לתשובה: אפשר להתקשר למד"א 101 או למוקד האחיות של קופת החולים.';
export const ASSISTANT_URGENT_LINK = 'לכל מוקדי הרפואה';
/** The fixed line at the bottom (FR-AI-001): its link opens the medical hotlines page. */
export const ASSISTANT_DISCLAIMER = 'לא ייעוץ רפואי · במצב דחוף — ';
export const ASSISTANT_DISCLAIMER_LINK = 'מוקדי רפואה';
