import type { EnforcementKind, PermissionKey, ReportTargetKind } from '@nestly/shared';

// The admin screens' texts (FR-MOD-002, FR-MOD-003, FR-ADMIN-005). Hebrew, gender-neutral (NFR-USAB-003); an action names what it does.
export const ADMIN_TITLE = 'ניהול';
export const ADMIN_MENU_LABEL = 'ניהול';
export const ADMIN_NAV_LABEL = 'מסכי הניהול';
export const ADMIN_NO_ACCESS_TEXT = 'אין הרשאה למסך הזה';
export const ADMIN_NO_SCREENS_TEXT = 'אין מסכי ניהול זמינים לחשבון הזה';
export const LOADING_TEXT = 'טוענים';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון. אפשר לנסות שוב';
export const RETRY_LABEL = 'ניסיון חוזר';
export const ACTION_FAILED_TEXT = 'הפעולה לא בוצעה. אפשר לנסות שוב';
export const FORBIDDEN_TEXT = 'אין הרשאה לפעולה הזאת';
export const NOT_FOUND_TEXT = 'הפריט כבר לא זמין. אפשר לרענן את הרשימה';
export const REASON_REQUIRED_TEXT = 'יש לכתוב סיבה';
export const NOT_APPLICABLE_TEXT = 'הפעולה לא מתאימה למצב החשבון עכשיו';

export const TAB_LABELS = {
  reports: 'דיווחים',
  users: 'משתמשים',
  audit: 'יומן פעולות',
  media: 'תמונות לבדיקה',
  reasons: 'סיבות דיווח',
  support: 'פניות Support',
  guides: 'מדריכים',
} as const;
export type AdminTab = keyof typeof TAB_LABELS;

/** The key each tab needs (the Admin holds all of them); 'ADMIN' marks a screen for the Admin role only (FR-ADMIN-012: status guides). */
export const TAB_KEYS: Record<AdminTab, PermissionKey | 'ADMIN'> = {
  reports: 'REPORTS_VIEW',
  users: 'USER_VIEW',
  audit: 'AUDIT_LOG_VIEW',
  media: 'CONTENT_MODERATE',
  reasons: 'COMMUNITY_CONFIG',
  support: 'SUPPORT_VIEW',
  guides: 'ADMIN',
};

// ---- the Support inbox (FR-ADMIN-002)
export const SUPPORT_TITLE = 'פניות Support';
export const SUPPORT_FILTER_LABEL = 'סטטוס';
export const SUPPORT_ALL_LABEL = 'הכל';
export const SUPPORT_EMPTY_TEXT = 'אין פניות בסטטוס הזה';
export const SUPPORT_LIST_LABEL = 'פניות Support';
export const SUPPORT_BACK_LABEL = 'חזרה לפניות';
export const SUPPORT_OPEN_LABEL = 'פתיחת הפנייה';
export const SUPPORT_USER_LABEL = 'מאת';
export const SUPPORT_THREAD_LABEL = 'ההודעות בפנייה';
export const SUPPORT_INTERNAL_NOTE = 'הערה פנימית';
export const SUPPORT_REPLY_LABEL = 'תגובה בשם Support';
export const SUPPORT_INTERNAL_LABEL = 'הערה פנימית (רק הצוות רואה)';
export const SUPPORT_SEND_LABEL = 'שמירה';
export const SUPPORT_REPLY_SENT_TEXT = 'התגובה נשלחה בשם Support';
export const SUPPORT_NOTE_SAVED_TEXT = 'ההערה הפנימית נשמרה';
export const SUPPORT_STATUS_LABEL = 'שינוי סטטוס';
export const SUPPORT_STATUS_SAVED_TEXT = 'הסטטוס עודכן';
export const SUPPORT_CLOSE_TITLE = 'לסגור את הפנייה?';
export const SUPPORT_CLOSE_DESCRIPTION = 'אחרי הסגירה אי אפשר לפתוח את הפנייה מחדש, ואין עוד תגובות בה. נושא חדש נפתח כפנייה חדשה';
export const SUPPORT_CLOSE_LABEL = 'סגירת הפנייה';
export const SUPPORT_CANCEL_LABEL = 'ביטול';
export const SUPPORT_CLOSED_NOTE_HINT = 'הפנייה סגורה: אפשר להוסיף רק הערה פנימית';

// ---- the audit log
export const AUDIT_TITLE = 'יומן פעולות';
export const AUDIT_EMPTY_TEXT = 'עדיין אין פעולות ביומן';
export const AUDIT_MORE_LABEL = 'טעינת עוד';
export const AUDIT_COLUMNS = { time: 'זמן', role: 'תפקיד', action: 'פעולה', target: 'יעד', reason: 'סיבה' } as const;
export const ROLE_LABELS = { admin: 'מנהל', moderator: 'מודרטור' } as const;
export const ACTION_LABELS: Record<string, string> = {
  permission_granted: 'הענקת הרשאה',
  permission_revoked: 'ביטול הרשאה',
  user_warn: 'אזהרה למשתמש',
  user_suspend: 'השעיית משתמש',
  user_reinstate: 'סיום השעיה',
  user_ban: 'חסימת משתמש',
  user_unban: 'שחרור חסימה',
  content_hidden: 'הסתרת תוכן',
  content_removed: 'הסרת תוכן',
  content_restored: 'שחזור תוכן',
  author_revealed: 'חשיפת מחבר אנונימי',
  report_handled: 'סגירת דיווח',
  report_reason_changed: 'שינוי סיבת דיווח',
  reported_message_viewed: 'פתיחת הודעה שדווחה',
  support_replied: 'תגובה בשם Support',
  support_note_added: 'הערה פנימית בפנייה',
  support_status_changed: 'שינוי סטטוס פנייה',
  media_approved: 'אישור תמונה',
  media_rejected: 'דחיית תמונה',
  media_suspected: 'חשד לפגיעה בילד בתמונה',
};
export const TARGET_LABELS: Record<string, string> = {
  user: 'משתמש',
  post: 'פוסט',
  comment: 'תגובה',
  report: 'דיווח',
  report_reason: 'סיבת דיווח',
  support_request: 'פניית Support',
  media: 'תמונה',
};
export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;
export const targetLabel = (kind: string): string => TARGET_LABELS[kind] ?? kind;

// ---- the report queue
export const REPORTS_TITLE = 'תור הדיווחים';
export const QUEUE_EMPTY_TEXT = 'אין דיווחים פתוחים';
export const QUEUE_LIST_LABEL = 'דיווחים פתוחים';
// ---- a reported chat message (§9.6)
export const MESSAGE_HEADING = 'ההודעה שדווחה';
export const MESSAGE_PRIVATE_NOTE = 'השיחה פרטית. אפשר לפתוח רק את ההודעה שדווחה, והפתיחה נרשמת ביומן הפעולות';
export const OPEN_MESSAGE_LABEL = 'הצגת ההודעה';
export const senderText = (name: string | null): string => (name === null ? 'השולח: חשבון ללא שם' : `השולח: ${name}`);
export const KIND_LABELS: Record<ReportTargetKind, string> = { post: 'פוסט', comment: 'תגובה', user: 'פרופיל', message: 'הודעה בצ׳אט' };
export const PRIORITY_LABELS: Record<number, string> = { 1: 'עדיפות עליונה', 2: 'עדיפות גבוהה', 3: 'עדיפות בינונית', 4: 'עדיפות רגילה' };
export const RISING_TEXT = 'עלה בתור (3 דיווחים או יותר)';
export const reportCountText = (n: number): string => (n === 1 ? 'דיווח אחד' : `${n.toLocaleString('en-US')} דיווחים`);
export const OPEN_ITEM_LABEL = 'פתיחת הדיווח';
/** Read after the visible label by screen readers only: which line the button opens. */
export const openItemRest = (kind: string, reason: string): string => `${kind}, ${reason}`;
export const DETAIL_TITLE = 'פרטי הדיווח';
export const CONTENT_HEADING = 'התוכן המדווח';
export const CONTENT_GONE_TEXT = 'התוכן כבר לא קיים';
export const CONTENT_STATUS_LABELS: Record<string, string> = { active: 'מוצג', hidden: 'מוסתר', removed: 'הוסר', deleted: 'נמחק על ידי הכותב' };
export const ANONYMOUS_NOTE = 'פוסט אנונימי. אפשר לחשוף את המחבר רק לצורך הטיפול בדיווח, והחשיפה נרשמת ביומן';
export const REPORTS_HEADING = 'הדיווחים';
export const COPIED_TEXT_LABEL = 'הטקסט בעת הדיווח';
export const ACTIONS_HEADING = 'טיפול';
export const NOTE_LABEL = 'הערה';
export const REASON_LABEL = 'סיבה (נרשמת ביומן)';
export const DISMISS_LABEL = 'דחיית הדיווח';
export const HIDE_LABEL = 'הסתרת התוכן וסגירת הדיווח';
export const REMOVE_LABEL = 'הסרת התוכן וסגירת הדיווח';
export const CLOSE_ONLY_LABEL = 'סגירת הדיווח בלי שינוי בתוכן';
export const RESTORE_LABEL = 'שחזור התוכן';
export const REVEAL_LABEL = 'חשיפת המחבר';
export const revealedText = (name: string | null): string => (name === null ? 'המחבר נחשף. אין שם שמור לחשבון' : `המחבר: ${name}`);
export const HANDLED_TEXT = 'הדיווח נסגר';
export const MOVED_TEXT = 'התוכן עודכן';
export const BACK_TO_QUEUE_LABEL = 'חזרה לתור';

// ---- accounts and enforcement
export const USERS_TITLE = 'משתמשים';
export const SEARCH_LABEL = 'חיפוש לפי שם';
export const SEARCH_BUTTON_LABEL = 'חיפוש';
export const USERS_EMPTY_TEXT = 'לא נמצאו משתמשים';
export const USERS_HINT = 'כותבים חלק מהשם. משתמשים מקצועיים מופיעים בלי שם';
export const ACCOUNT_TYPE_LABELS = { regular: 'הורה', professional: 'בעל מקצוע', admin: 'מנהל', moderator: 'מודרטור' } as const;
export const STATUS_LABELS = { active: 'פעיל', suspended: 'מושעה', banned: 'חסום' } as const;
export const NO_NAME_TEXT = 'ללא שם';
export const OPEN_USER_LABEL = 'פתיחה';
/** Read after the visible label by screen readers only: whose account the button opens. */
export const openUserRest = (name: string): string => `החשבון של ${name}`;
export const BACK_TO_LIST_LABEL = 'חזרה לרשימה';
export const ENFORCEMENT_HEADING = 'אכיפה';
export const HISTORY_HEADING = 'היסטוריית אכיפה';
export const HISTORY_EMPTY_TEXT = 'אין אכיפה קודמת';
export const KIND_ACTION_LABELS: Record<EnforcementKind, string> = {
  warning: 'אזהרה',
  suspension: 'השעיה',
  reinstate: 'סיום השעיה',
  ban: 'חסימה',
  unban: 'שחרור חסימה',
};
export const ACTION_FIELD_LABEL = 'פעולה';
export const DURATION_FIELD_LABEL = 'משך ההשעיה';
export const DURATION_OPTIONS = [
  { value: '24', label: '24 שעות' },
  { value: '72', label: '3 ימים' },
  { value: '168', label: '7 ימים' },
  { value: '720', label: '30 ימים' },
];
export const CHILD_SAFETY_LABEL = 'תוכן שמסכן ילד: חסימה מיידית, בלי קשר לשלב במדרג';
export const ENFORCE_SUBMIT_LABEL = 'ביצוע הפעולה';
export const ENFORCED_TEXT = 'הפעולה בוצעה';
export const SKIPPED_TEXT = 'דילוג על שלב';
export const suspendedUntilText = (when: string): string => `מושעה עד ${when}`;
export function suggestionText(kind: 'warning' | 'suspension' | 'ban', hours: number | null): string {
  if (kind === 'warning') return 'המדרג מציע: אזהרה';
  if (kind === 'ban') return 'המדרג מציע: חסימה';
  const label = DURATION_OPTIONS.find((option) => option.value === String(hours))?.label ?? `${hours ?? ''} שעות`;
  return `המדרג מציע: השעיה ל${label}`;
}
export const PICK_ACTION_TEXT = 'יש לבחור פעולה';
export const ACTION_PLACEHOLDER = 'בחירת פעולה';

// ---- the image approval queue (I5; Afik 20.10.2026)
export const MEDIA_QUEUE_TITLE = 'תמונות לבדיקה';
export const MEDIA_QUEUE_INTRO = 'תמונות שהבדיקה האוטומטית עצרה או לא הייתה בטוחה לגביהן. הן מוצגות רק למי שהעלה אותן עד להחלטה.';
export const MEDIA_QUEUE_EMPTY = 'אין תמונות שממתינות לבדיקה';
export const MEDIA_QUEUE_LIST_LABEL = 'תמונות שממתינות לבדיקה';
export const MEDIA_KIND_LABELS = { post: 'תמונה בפוסט', profile: 'תמונת פרופיל', story: 'תמונה בסטורי' } as const;
export const MEDIA_REASON_LABELS = { blocked: 'נחסמה בבדיקה', unsure: 'הבדיקה לא בטוחה', error: 'הבדיקה נכשלה' } as const;
export const mediaScoreText = (score: number): string => `ציון הבדיקה: ${Math.round(score * 100)}%`;
export const MEDIA_IMAGE_ALT = 'התמונה שממתינה לבדיקה';
export const MEDIA_NO_IMAGE = 'לא ניתן להציג את התמונה כרגע';
export const MEDIA_CHILD_LABEL = 'יש בתמונה ילד';
export const MEDIA_APPROVE_LABEL = 'אישור';
export const MEDIA_REJECT_LABEL = 'דחייה';
export const MEDIA_SUSPECT_LABEL = 'חשד לפגיעה בילד';
export const MEDIA_SUSPECT_HINT = 'התמונה תוסר, תישמר 90 יום לטיפול ולא תוצג לאיש. מי שהעלה אותה יראה הודעת דחייה רגילה.';
export const MEDIA_DECIDED_TEXT = 'ההחלטה נשמרה';
export const MEDIA_GONE_TEXT = 'התמונה כבר טופלה או הוסרה';
export const REPORT_IMAGES_LABEL = 'התמונות בפוסט';
export const reportImageAlt = (index: number, total: number): string => (total === 1 ? 'התמונה בפוסט המדווח' : `תמונה ${index + 1} מתוך ${total} בפוסט המדווח`);
export const REPORT_IMAGE_REMOVE_LABEL = 'הסרת התמונה';
export const REPORT_IMAGE_REMOVED_TEXT = 'התמונה הוסרה';
