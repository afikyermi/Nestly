import { ACCOUNT_DELETION_DAYS } from '@nestly/shared';

// The account deletion texts (I9; FR-SET-002, BR-073, PG-050, PG-060, ERR-026, ERR-048, VAL-052), shared by the deletion screen, PG-050
// and the login screen's notices. This is the only place a deletion outcome becomes text.

export const DELETE_TITLE = 'מחיקת חשבון';
export const DELETE_LINK = 'מחיקת חשבון';
export const DELETE_INTRO = `אחרי הבקשה החשבון והתוכן שלך יוסתרו מכולם מיד, ויימחקו לצמיתות בעוד ${ACCOUNT_DELETION_DAYS} יום. עד אז אפשר להתחבר ולבטל את המחיקה.`;
export const DELETE_GOES_TITLE = 'מה יימחק';
export const DELETE_GOES: readonly string[] = [
  'הפרופיל, פרטי הילדים, המסע והמעקבים',
  'הפוסטים, גם האנונימיים, התגובות והלייקים',
  'החברויות, המעקבים והחברות בקבוצות',
  'מודעות, מאמרים, ביקורות, פניות והתראות',
  'כל התמונות',
];
export const DELETE_STAYS_TITLE = 'מה נשאר';
export const DELETE_STAYS: readonly string[] = [
  'שיחות נשארות אצל הצד השני, וההודעות שלך מוצגות תחת "משתמש שנמחק"',
  'תגובה שיש לה תשובות נשארת כ"משתמש שנמחק", בלי הטקסט',
  'רשומות אבטחה וביקורת נשמרות 90 יום ואז נמחקות',
];
export const CONFIRM_LABEL = `הבנתי שבעוד ${ACCOUNT_DELETION_DAYS} יום החשבון וכל התוכן יימחקו לצמיתות`;
export const PASSWORD_LABEL = 'סיסמה';
export const PASSWORD_HINT = 'לאישור, צריך להזין את הסיסמה של החשבון';
export const DELETE_BUTTON = 'מחיקת החשבון';
export const DELETE_BUSY = 'שולחים';

// VAL-052
export const CONFIRM_REQUIRED_TEXT = 'יש לסמן את האישור כדי להמשיך';
export const PASSWORD_REQUIRED_TEXT = 'יש למלא סיסמה';
// ERR-048
export const PASSWORD_WRONG_TEXT = 'הסיסמה שגויה. אפשר לנסות שוב';
export const REAUTH_EXPIRED_TEXT = 'האישור פג. אפשר להזין את הסיסמה שוב';
// ERR-026
export const GROUP_OWNER_TEXT = 'לפני מחיקת החשבון צריך להעביר את הבעלות על הקבוצות שלך לחבר אחר בקבוצה';
export const NOT_ALLOWED_TEXT = 'אי אפשר למחוק את החשבון הזה מכאן';

// PG-050
export const SCHEDULED_TITLE = 'החשבון שלך מתוזמן למחיקה';
export const scheduledText = (date: string | null): string =>
  date === null ? 'החשבון שלך מתוזמן למחיקה.' : `החשבון שלך מתוזמן למחיקה ב-${date}.`;
export const SCHEDULED_HIDDEN = 'עד אז החשבון והתוכן מוסתרים מכולם. ביטול המחיקה מחזיר את החשבון ואת כל התוכן.';
export const CANCEL_BUTTON = 'ביטול המחיקה';
export const SIGN_OUT_BUTTON = 'התנתקות';
export const CANCEL_BUSY = 'מבטלים';
export const CANCEL_CLOSED_TEXT = 'מועד המחיקה כבר הגיע, ואי אפשר לבטל אותה';

// The login screen
export const deletionScheduledNotice = (date: string | null): string =>
  date === null
    ? 'המחיקה תוזמנה. עד מועד המחיקה אפשר להתחבר ולבטל אותה'
    : `החשבון יימחק ב-${date}. עד אז אפשר להתחבר ולבטל את המחיקה`;
export const ACCOUNT_DELETED_TEXT = 'החשבון הזה נמחק';

/** The date of a deletion, in Israel time (rtl-hebrew): "24 בנובמבר 2026". Null for a value that is not a time. */
export function formatDeletionDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeZone: 'Asia/Jerusalem' }).format(date);
}
