import type { SupportStatus, SupportTopic } from '@nestly/shared';

// Chat and Support texts (I8). Hebrew, gender-neutral (NFR-USAB-003); an action names what it does. The Support side is always "Support"
// (BR-043): no staff name or role appears.
export const CHAT_TITLE = 'הודעות';
export const CHAT_BUTTON_LABEL = 'הודעות';
export const chatButtonLabel = (unread: number): string => (unread === 0 ? CHAT_BUTTON_LABEL : `${CHAT_BUTTON_LABEL}, ${unread} חדשות`);
export const CHAT_DROPDOWN_LABEL = 'שיחות אחרונות';
export const CHAT_ALL_LABEL = 'כל ההודעות';
export const CHAT_EMPTY_TEXT = 'עדיין אין שיחות. אפשר לשלוח הודעה מהפרופיל של מישהו';
export const LOADING_TEXT = 'טוענים';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון. אפשר לנסות שוב';
export const RETRY_LABEL = 'ניסיון חוזר';
export const ACTION_FAILED_TEXT = 'הפעולה לא בוצעה. אפשר לנסות שוב';
export const RATE_LIMITED_TEXT = 'הגעת למגבלה היומית. אפשר לנסות שוב מחר';
export const NO_NAME = 'חשבון ללא שם';
export const YOU_PREFIX = 'ממך: ';
export const unreadText = (count: number): string => (count === 1 ? 'הודעה חדשה אחת' : `${count} הודעות חדשות`);

// ---- the Chat Center (FR-CHAT-001)
export const REQUESTS_HEADING = 'בקשות שיחה';
export const REQUESTS_LIST_LABEL = 'בקשות שיחה שממתינות לך';
export const CONVERSATIONS_HEADING = 'שיחות';
export const CONVERSATIONS_LIST_LABEL = 'השיחות שלך';
export const SUPPORT_HEADING = 'Support';
export const SUPPORT_LIST_LABEL = 'שיחות עם Support';
export const SENT_HEADING = 'בקשות ששלחת';
export const SENT_LIST_LABEL = 'בקשות שיחה ששלחת';
export const ACCEPT_LABEL = 'אישור';
export const DECLINE_LABEL = 'דחייה';
export const CANCEL_REQUEST_LABEL = 'ביטול הבקשה';
/** The rest of an action's accessible name, after its visible label (label in name). */
export const acceptRest = (name: string): string => `של ${name}`;
export const cancelRest = (name: string): string => `אל ${name}`;
export const DECLINED_TEXT = 'הבקשה נדחתה';
export const CANCELLED_TEXT = 'הבקשה בוטלה';
export const SUPPORT_NAME = 'Support';
export const NEW_SUPPORT_LABEL = 'פנייה לתמיכה';

// ---- a conversation
export const BACK_TO_CHAT_LABEL = 'חזרה להודעות';
export const THREAD_LABEL = 'ההודעות בשיחה';
export const MESSAGE_LABEL = 'הודעה';
export const SEND_LABEL = 'שליחה';
export const SENDING_TEXT = 'שולחים';
export const CANNOT_SEND_TEXT = 'לא ניתן לשלוח הודעות בשיחה הזו';
export const CONVERSATION_GONE_TEXT = 'השיחה לא זמינה';
export const CONVERSATION_MENU_LABEL = 'פעולות בשיחה';
export const CHAT_BLOCK_LABEL = 'חסימת הודעות';
export const CHAT_UNBLOCK_LABEL = 'ביטול חסימת ההודעות';
export const CHAT_BLOCKED_TEXT = 'ההודעות בשיחה נחסמו. החסימה לא מסתירה את הפרופיל ולא משנה חברות';
export const CHAT_UNBLOCKED_TEXT = 'חסימת ההודעות בוטלה';
export const REPORT_MESSAGE_LABEL = 'דיווח על ההודעה';
export const REPORTED_TEXT = 'הדיווח התקבל. תודה';
export const OPENING_NOTE = 'הודעת הפתיחה';
export const messageFrom = (mine: boolean, name: string): string => (mine ? 'ממך' : `מ${name}`);

// ---- writing to someone (FR-CHAT-002)
export const WRITE_LABEL = 'שליחת הודעה';
export const writeLabelFor = (name: string): string => `שליחת הודעה אל ${name}`;
export const WRITE_TITLE = (name: string): string => `הודעה אל ${name}`;
export const WRITE_REQUEST_NOTE = 'אתם לא חברים, ולכן ההודעה תישלח כבקשת שיחה. השיחה תיפתח אם הבקשה תאושר';
export const CLOSE_LABEL = 'ביטול';
export const REQUEST_SENT_TEXT = 'בקשת השיחה נשלחה';
export const REQUEST_PENDING_TEXT = 'כבר יש בקשת שיחה ביניכם שממתינה לתשובה';
export const NOT_ALLOWED_TEXT = 'אי אפשר לשלוח הודעה לחשבון הזה';
export const EMPTY_TEXT = 'יש לכתוב הודעה';
export const TOO_LONG_TEXT = 'ההודעה ארוכה מדי (עד 2000 תווים)';

// ---- Support (FR-ADMIN-001, FR-CHAT-004)
export const SUPPORT_TITLE = 'פנייה לתמיכה';
export const SUPPORT_INTRO = 'הפנייה מגיעה לצוות Nestly. התשובה תופיע בהודעות, תחת Support';
export const TOPIC_LABEL = 'נושא';
export const TOPIC_PLACEHOLDER = 'בחירת נושא';
export const TOPIC_REQUIRED_TEXT = 'יש לבחור נושא';
export const SUPPORT_TEXT_LABEL = 'מה קרה?';
export const SUPPORT_SEND_LABEL = 'שליחת הפנייה';
export const SUPPORT_SENT_TEXT = 'הפנייה נשלחה. התשובה תופיע בהודעות';
export const SUPPORT_STAFF_TEXT = 'חשבונות צוות לא שולחים פניות';
export const MY_REQUESTS_HEADING = 'הפניות שלי';
export const MY_REQUESTS_LIST_LABEL = 'הפניות ששלחת';
export const NO_REQUESTS_TEXT = 'עדיין לא שלחת פניות';
export const OPEN_REQUEST_LABEL = 'פתיחה';
export const SUPPORT_CLOSED_TEXT = 'הפנייה נסגרה. לנושא חדש אפשר לשלוח פנייה חדשה';
export const SUPPORT_THREAD_TITLE = 'פנייה ל-Support';
export const REQUEST_TEXT_LABEL = 'הפנייה';
export const REPLY_LABEL = 'תגובה';
export const TOPIC_LABELS: Record<SupportTopic, string> = {
  account: 'חשבון והתחברות',
  bug: 'תקלה באתר',
  privacy_safety: 'פרטיות ובטיחות',
  usage: 'שאלה על השימוש',
  suggestion: 'הצעה לשיפור',
  other: 'אחר',
};
export const STATUS_LABELS: Record<SupportStatus, string> = { open: 'פתוחה', in_progress: 'בטיפול', closed: 'סגורה' };
