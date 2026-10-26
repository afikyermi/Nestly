// The texts of the Groups screens (I10; FR-GRP-001..004, FR-ALG-010; ux-copy-he: short, calm, gender-neutral, no slashes).
import type { GroupEnforcementReason, GroupMuteHours, GroupNotificationMode, GroupPostView, GroupPrivacy, GroupRole } from '@nestly/shared';

export const GROUPS_TITLE = 'קבוצות';
export const MY_GROUPS_TAB = 'הקבוצות שלי';
export const DISCOVER_TAB = 'גילוי קבוצות';
export const TABS_LABEL = 'רשימות הקבוצות';
export const SEARCH_LABEL = 'חיפוש קבוצה';
export const SEARCH_HINT = 'לפי שם הקבוצה או התיאור שלה';
export const CREATE_LABEL = 'יצירת קבוצה';
export const LOADING_TEXT = 'טוענים את הקבוצות…';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את הקבוצות. אפשר לנסות שוב';
export const RETRY_LABEL = 'ניסיון נוסף';
export const NO_MY_GROUPS_TEXT = 'עדיין לא הצטרפת לקבוצה. אפשר למצוא קבוצות בגילוי, או ליצור קבוצה חדשה';
export const NO_GROUPS_TEXT = 'לא מצאנו קבוצות. אפשר ליצור קבוצה חדשה';
export const ACTION_FAILED_TEXT = 'הפעולה לא הצליחה. אפשר לנסות שוב';

export const PRIVACY_LABEL: Record<GroupPrivacy, string> = { public: 'קבוצה ציבורית', private: 'קבוצה פרטית' };
export const PRIVACY_HINT: Record<GroupPrivacy, string> = {
  public: 'כל מי שמחובר רואה את התוכן ויכול להצטרף מיד. רק חברי הקבוצה כותבים ומגיבים',
  private: 'כולם רואים את השם והתיאור. התוכן גלוי רק לחברי הקבוצה, והצטרפות דורשת אישור',
};
export const membersCount = (count: number): string => (count === 1 ? 'חבר אחד בקבוצה' : `${count} חברים בקבוצה`);

export const ROLE_LABEL: Record<GroupRole, string> = { owner: 'בעלים', admin: 'מנהל', moderator: 'מנחה', member: 'חבר' };

// Actions on a Group
export const JOIN_LABEL = 'הצטרפות';
export const REQUEST_LABEL = 'בקשת הצטרפות';
export const REQUESTED_LABEL = 'הבקשה נשלחה';
export const CANCEL_REQUEST_LABEL = 'ביטול הבקשה';
export const MEMBER_LABEL = 'חברות בקבוצה';
export const LEAVE_LABEL = 'עזיבת הקבוצה';
export const BLOCKED_TEXT = 'אין אפשרות להצטרף לקבוצה הזו';
export const JOINED_STATUS = 'הצטרפת לקבוצה';
export const REQUESTED_STATUS = 'בקשת ההצטרפות נשלחה. נעדכן כשתאושר';
export const REQUEST_CANCELLED_STATUS = 'הבקשה בוטלה';
export const LEFT_STATUS = 'עזבת את הקבוצה';
export const OWNER_MUST_TRANSFER_TEXT = 'לפני שעוזבים, צריך להעביר את הבעלות על הקבוצה לחבר אחר';
export const LEAVE_TITLE = 'לעזוב את הקבוצה?';
export const LEAVE_PRIVATE_DESCRIPTION = 'זו קבוצה פרטית: אחרי העזיבה לא יהיה אפשר לראות את התוכן שלה בלי לבקש שוב';
export const CANCEL_LABEL = 'ביטול';
export const CLOSE_LABEL = 'סגירה';
export const MORE_LABEL = 'עוד פעולות בקבוצה';
export const MORE_MENU_LABEL = 'פעולות בקבוצה';

// Invitations
export const INVITATIONS_TITLE = 'הזמנות לקבוצות';
export const invitedBy = (name: string | null): string => (name === null ? 'הזמנה לקבוצה' : `הזמנה מ${name}`);
export const ACCEPT_LABEL = 'הצטרפות';
export const DECLINE_LABEL = 'לא תודה';
export const DECLINED_STATUS = 'ההזמנה נדחתה';
export const INVITED_TEXT = 'הוזמנת לקבוצה הזו';

// Create
export const CREATE_TITLE = 'קבוצה חדשה';
export const CREATE_DESCRIPTION = 'מי שיוצר קבוצה הוא הבעלים שלה ומנהל אותה';
export const NAME_LABEL = 'שם הקבוצה';
export const DESCRIPTION_LABEL = 'תיאור';
export const RULES_LABEL = 'כללי הקבוצה';
export const PRIVACY_LEGEND = 'מי רואה את התוכן';
export const CREATE_SUBMIT = 'יצירה';
export const CREATING_TEXT = 'יוצרים…';
export const SAVE_LABEL = 'שמירה';
export const SAVING_TEXT = 'שומרים…';
export const SAVED_STATUS = 'השינויים נשמרו';
export const FIELD_ERRORS = {
  name_too_short: 'שם הקבוצה צריך לכלול לפחות 3 תווים',
  name_too_long: 'שם הקבוצה יכול לכלול עד 60 תווים',
  description_too_long: 'התיאור יכול לכלול עד 1,000 תווים',
  rules_too_long: 'הכללים יכולים לכלול עד 2,000 תווים',
} as const;

// The Group page
export const TAB_DISCUSSION = 'דיון';
export const VIEW_LABEL = 'מה מוצג בדיון';
export const VIEW_OPTIONS: { value: GroupPostView; label: string }[] = [
  { value: 'all', label: 'כל הפוסטים' },
  { value: 'highlights', label: 'עיקרי הדברים' },
];
export const TAB_MEMBERS = 'חברים';
export const TAB_ABOUT = 'על הקבוצה';
export const TAB_MANAGE = 'ניהול';
export const GROUP_TABS_LABEL = 'חלקי הקבוצה';
export const DISCUSSION_HEADING = 'דיון בקבוצה';
export const PRIVATE_CONTENT_TEXT = 'התוכן של הקבוצה גלוי רק לחברים. אפשר לבקש להצטרף';
export const GROUP_UNAVAILABLE_TEXT = 'הקבוצה הזו אינה זמינה';
export const GROUP_LOADING_TEXT = 'טוענים את הקבוצה…';
export const BACK_TO_GROUPS = 'לכל הקבוצות';
export const NO_DESCRIPTION_TEXT = 'אין תיאור לקבוצה';
export const NO_RULES_TEXT = 'לא נכתבו כללים לקבוצה';
export const MEMBERS_ONLY_TEXT = 'רשימת החברים גלויה רק לחברי הקבוצה';
export const PINNED_STATUS = 'הפוסט הוצמד לראש הקבוצה';
export const UNPINNED_STATUS = 'ההצמדה בוטלה';

// Notifications of the Group (FR-ALG-010)
export const MODE_LABEL = 'התראות מהקבוצה';
export const MODE_TITLE = 'התראות מהקבוצה';
export const MODE_DESCRIPTION = 'תגובות ותשובות אליך מגיעות תמיד, בכל בחירה';
export const MODE_OPTIONS: { value: GroupNotificationMode; label: string; description: string }[] = [
  { value: 'all', label: 'כל הפוסטים', description: 'התראה על כל פוסט חדש, על פוסט מוצמד ועל פוסטים פופולריים' },
  { value: 'highlights', label: 'עיקרי הדברים', description: 'פוסט מוצמד ופוסטים שזוכים להרבה תגובות ולייקים' },
  { value: 'off', label: 'כבוי', description: 'בלי התראות על פעילות בקבוצה' },
];
export const MODE_SAVED_STATUS = 'בחירת ההתראות נשמרה';

// Invite and recommend (friends)
export const INVITE_LABEL = 'הזמנת חברים';
export const RECOMMEND_LABEL = 'המלצה לחברים';
export const INVITE_TITLE = 'הזמנת חברים לקבוצה';
export const RECOMMEND_TITLE = 'המלצה על הקבוצה לחברים';
export const RECOMMEND_DESCRIPTION = 'החברים יקבלו התראה עם קישור לקבוצה. ההמלצה לא מצרפת אותם';
export const INVITE_DESCRIPTION = 'החברים יקבלו הזמנה ויוכלו להצטרף בלחיצה';
export const INVITE_PRIVATE_DESCRIPTION = 'זו קבוצה פרטית: ההזמנה תישלח אחרי שבעלי הקבוצה או מנהל יאשרו אותה';
export const AWAITING_ONE = 'ממתין לאישור המנהל';
export const INVITE_AWAITING_STATUS = 'ההזמנה נשלחה לאישור המנהל';
export const NO_FRIENDS_TEXT = 'עדיין אין חברים ברשימה';
export const INVITE_ONE = 'הזמנה';
export const INVITED_ONE = 'הוזמנו';
export const RECOMMEND_ONE = 'המלצה';
export const RECOMMENDED_ONE = 'נשלחה';
export const ALREADY_MEMBER = 'כבר בקבוצה';
export const inviteFriendLabel = (name: string): string => `הזמנה של ${name}`;
export const recommendFriendLabel = (name: string): string => `המלצה ל${name}`;

// Members and management (FR-GRP-003)
export const YOU_LABEL = '(את או אתה)';
export const MEMBER_MENU_LABEL = (name: string): string => `פעולות על ${name}`;
export const MAKE_ADMIN = 'מינוי למנהל';
export const MAKE_MODERATOR = 'מינוי למנחה';
export const MAKE_MEMBER = 'החזרה לחבר רגיל';
export const MAKE_OWNER = 'העברת הבעלות';
export const WARN_MEMBER = 'אזהרה והשתקה';
export const BLOCK_MEMBER = 'הסרה וחסימה';
export const TRANSFER_TITLE = 'להעביר את הבעלות על הקבוצה?';
export const TRANSFER_DESCRIPTION = 'הבעלים החדשים ינהלו את הקבוצה. התפקיד שלך יהיה מנהל';
export const BLOCK_TITLE = 'הסרה וחסימה מהקבוצה';
export const BLOCK_DESCRIPTION = 'לא תהיה אפשרות להצטרף שוב, לבקש או לקבל הזמנה, עד שהחסימה תבוטל';
export const WARN_TITLE = 'אזהרה והשתקה';
export const WARN_DESCRIPTION = 'תישלח הודעה עם הסיבה. בזמן ההשתקה אפשר רק לקרוא: בלי פוסטים, תגובות, לייקים והזמנות';
export const REASON_LEGEND = 'הסיבה';
export const REASON_OTHER_LABEL = 'פירוט הסיבה';
export const REASON_OTHER_HINT = 'עד 500 תווים';
export const REASON_OTHER_REQUIRED = 'צריך לכתוב את הסיבה';
export const REASON_REQUIRED = 'צריך לבחור סיבה';
export const DURATION_LEGEND = 'משך ההשתקה';
export const REASON_LABEL: Record<GroupEnforcementReason, string> = {
  offensive: 'פגיעה או שפה פוגענית',
  spam: 'ספאם או פרסום',
  off_topic: 'לא קשור לנושא הקבוצה',
  privacy: 'פגיעה בפרטיות',
  rules: 'הפרת כללי הקבוצה',
  other: 'אחר',
};
export const DURATION_LABEL: Record<GroupMuteHours, string> = { 24: '24 שעות', 168: '7 ימים' };
export const WARN_SUBMIT = 'שליחת אזהרה והשתקה';
export const WARNED_STATUS = 'האזהרה נשלחה וההשתקה התחילה';
export const muteBanner = (until: string, reason: string): string => `קיבלת אזהרה בקבוצה הזו (${reason}). עד ${until} אפשר רק לקרוא`;
export const ROLE_CHANGED_STATUS = 'התפקיד עודכן';
export const REMOVED_STATUS = 'ההסרה והחסימה בוצעו';
export const MUTED_TEXT = 'בזמן ההשתקה אפשר רק לקרוא';
/** FR-GRP-003, OP-070: a muted Group Moderator or Admin, on the Group page. */
export const managementPausedLine = (until: string): string => `בזמן ההשתקה פעולות הניהול בקבוצה מושהות עד ${until}`;
export const ROLE_NOT_ALLOWED_TEXT = 'אין הרשאה לפעולה הזו מול התפקיד הזה';
export const NO_NAME = 'חבר בקבוצה';

export const REQUESTS_TITLE = 'בקשות הצטרפות';
export const NO_REQUESTS_TEXT = 'אין בקשות שמחכות';
export const APPROVE_LABEL = 'אישור';
export const REJECT_LABEL = 'דחייה';
export const APPROVED_STATUS = 'הבקשה אושרה';
export const REJECTED_STATUS = 'הבקשה נדחתה';
export const AWAITING_TITLE = 'הזמנות שמחכות לאישור';
export const NO_AWAITING_TEXT = 'אין הזמנות שמחכות';
export const invitedByLine = (inviter: string, invitee: string): string => `${invitee}, בהזמנה של ${inviter}`;
export const INVITATION_APPROVED_STATUS = 'ההזמנה אושרה ונשלחה';
export const INVITATION_REJECTED_STATUS = 'ההזמנה נדחתה';
export const INVITATION_GONE_TEXT = 'ההזמנה כבר לא בתוקף';
export const HISTORY_TITLE = 'היסטוריית אכיפה';
export const NO_HISTORY_TEXT = 'עדיין לא בוצעה אכיפה בקבוצה';
export const HISTORY_KIND: Record<'warn_mute' | 'remove_block' | 'unblock', string> = {
  warn_mute: 'אזהרה והשתקה',
  remove_block: 'הסרה וחסימה',
  unblock: 'ביטול חסימה',
};
export const MY_HISTORY_TITLE = 'האכיפה כלפיי בקבוצה';
export const muteUntilLine = (until: string): string => `עד ${until}`;
export const highlightRule = (threshold: number): string =>
  `פוסט נכנס לעיקרי הדברים ולפיד הראשי של החברים כש-${threshold} אנשים שונים, מלבד מי שכתב אותו, סימנו לייק או הגיבו עליו (כל אדם נספר פעם אחת)`;
export const BANS_TITLE = 'חסומים בקבוצה';
export const NO_BANS_TEXT = 'אין חסומים';
export const UNBLOCK_LABEL = 'ביטול החסימה';
export const UNBLOCKED_STATUS = 'החסימה בוטלה';
export const SETTINGS_TITLE = 'פרטי הקבוצה';
export const DELETE_GROUP_LABEL = 'מחיקת הקבוצה';
export const DELETE_TITLE = 'למחוק את הקבוצה?';
export const DELETE_DESCRIPTION = 'הקבוצה והתוכן שלה ייעלמו לכל החברים. אי אפשר לבטל את זה';
export const DELETED_STATUS = 'הקבוצה נמחקה';
