import type { EnforcementKind, PermissionKey, ReportTargetKind } from '@nestly/shared';

// The admin screens' texts (FR-MOD-002, FR-MOD-003, FR-ADMIN-005). Hebrew, gender-neutral (NFR-USAB-003); an action names what it does.
export const ADMIN_TITLE = 'ניהול';
export const ADMIN_MENU_LABEL = 'ניהול';
export const ADMIN_NAV_LABEL = 'מסכי הניהול';
export const ADMIN_NO_ACCESS_TEXT = 'אין לכם הרשאה למסך הזה';
export const LOADING_TEXT = 'טוענים';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון. אפשר לנסות שוב';
export const RETRY_LABEL = 'נסו שוב';
export const ACTION_FAILED_TEXT = 'הפעולה לא בוצעה. אפשר לנסות שוב';
export const FORBIDDEN_TEXT = 'אין לכם הרשאה לפעולה הזאת';
export const NOT_FOUND_TEXT = 'הפריט כבר לא זמין. אפשר לרענן את הרשימה';
export const REASON_REQUIRED_TEXT = 'יש לכתוב סיבה';
export const NOT_APPLICABLE_TEXT = 'הפעולה לא מתאימה למצב החשבון עכשיו';

export const TAB_LABELS = {
  reports: 'דיווחים',
  users: 'משתמשים',
  audit: 'יומן פעולות',
  reasons: 'סיבות דיווח',
} as const;
export type AdminTab = keyof typeof TAB_LABELS;

/** The key each tab needs (the Admin holds all of them). */
export const TAB_KEYS: Record<AdminTab, PermissionKey> = {
  reports: 'REPORTS_VIEW',
  users: 'USER_VIEW',
  audit: 'AUDIT_LOG_VIEW',
  reasons: 'COMMUNITY_CONFIG',
};

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
  recovery_lock_released: 'שחרור נעילת שחזור',
};
export const TARGET_LABELS: Record<string, string> = {
  user: 'משתמש',
  post: 'פוסט',
  comment: 'תגובה',
  report: 'דיווח',
  report_reason: 'סיבת דיווח',
};
export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;
export const targetLabel = (kind: string): string => TARGET_LABELS[kind] ?? kind;

// ---- the report queue
export const REPORTS_TITLE = 'תור הדיווחים';
export const QUEUE_EMPTY_TEXT = 'אין דיווחים פתוחים';
export const QUEUE_LIST_LABEL = 'דיווחים פתוחים';
export const KIND_LABELS: Record<ReportTargetKind, string> = { post: 'פוסט', comment: 'תגובה', user: 'פרופיל' };
export const PRIORITY_LABELS: Record<number, string> = { 1: 'עדיפות עליונה', 2: 'עדיפות גבוהה', 3: 'עדיפות בינונית', 4: 'עדיפות רגילה' };
export const RISING_TEXT = 'עלה בתור (3 דיווחים או יותר)';
export const reportCountText = (n: number): string => (n === 1 ? 'דיווח אחד' : `${n.toLocaleString('en-US')} דיווחים`);
export const OPEN_ITEM_LABEL = 'פתיחת הדיווח';
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
