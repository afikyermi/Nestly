import type { PermissionKey } from '@nestly/shared';

// The Moderators team's texts (I14: FR-ADMIN-004, FR-ADMIN-007, FR-ADMIN-008, FR-ADMIN-010, AC-044). Hebrew, gender-neutral (NFR-USAB-003).

// ---- the team (PG-027)
export const TEAM_TITLE = 'צוות';
export const TEAM_MODERATORS_HEADING = 'מודרטורים';
export const TEAM_EMPTY_TEXT = 'עדיין אין מודרטורים בצוות';
export const TEAM_UNNAMED = 'מודרטור';
export const TEAM_JOINED = 'הצטרפות';
export const TEAM_KEYS_LEGEND = 'הרשאות';
export const TEAM_KEYS_HINT = 'הרשאה שדורשת הרשאה אחרת מוסיפה אותה. כל שינוי נרשם ביומן הפעולות';
export const TEAM_SAVE_KEYS = 'שמירת ההרשאות';
export const TEAM_KEYS_SAVED = 'ההרשאות נשמרו';
export const TEAM_DEACTIVATE = 'השבתת המודרטור';
export const TEAM_REACTIVATE = 'החזרת המודרטור לפעילות';
export const TEAM_DEACTIVATE_REASON = 'סיבת ההשבתה';
export const TEAM_REACTIVATE_REASON = 'סיבת ההחזרה לפעילות';
export const TEAM_DEACTIVATED = 'המודרטור הושבת';
export const TEAM_REACTIVATED = 'המודרטור חזר לפעילות';
export const TEAM_STATUS = { active: 'פעיל', suspended: 'מושעה', banned: 'מושבת' } as const;
export const TEAM_INVITE_HEADING = 'הזמנת מודרטור';
export const TEAM_INVITE_NOTE = 'למי ההזמנה';
export const TEAM_INVITE_NOTE_HINT = 'שם או תיאור קצר, רק לצוות הניהול (2 עד 80 תווים)';
export const TEAM_INVITE_NOTE_ERROR = 'יש לכתוב 2 עד 80 תווים';
export const TEAM_INVITE_SEND = 'יצירת הזמנה';
export const TEAM_INVITE_READY = 'ההזמנה מוכנה. הקישור מוצג רק עכשיו: אפשר להעתיק ולשלוח אותו. הוא תקף 48 שעות ולשימוש אחד';
export const TEAM_INVITE_LINK = 'קישור ההזמנה';
export const TEAM_INVITE_COPY = 'העתקת הקישור';
export const TEAM_INVITE_COPIED = 'הקישור הועתק';
export const TEAM_INVITATIONS_HEADING = 'הזמנות';
export const TEAM_INVITATIONS_EMPTY = 'אין הזמנות';
export const TEAM_INVITATION_STATE = { open: 'ממתינה', expired: 'פג תוקף', revoked: 'בוטלה', accepted: 'נוצלה' } as const;
export const TEAM_INVITATION_UNTIL = 'בתוקף עד';
export const TEAM_REVOKE = 'ביטול ההזמנה';
export const TEAM_REVOKED = 'ההזמנה בוטלה';

/** The Permission Keys' names (SRS §3.1). */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  SUPPORT_VIEW: 'צפייה בפניות Support',
  SUPPORT_HANDLE: 'טיפול בפניות Support',
  REPORTS_VIEW: 'צפייה בדיווחים',
  CONTENT_MODERATE: 'טיפול בתוכן קהילתי ובתמונות',
  MARKETPLACE_MODERATE: 'טיפול במודעות Marketplace',
  USER_VIEW: 'צפייה במשתמשים',
  USER_WARN: 'אזהרת משתמש',
  USER_SUSPEND: 'השעיית משתמש',
  USER_BAN: 'חסימת משתמש',
  ANALYTICS_VIEW: 'צפייה בנתוני הניהול',
  AUDIT_LOG_VIEW: 'צפייה ביומן הפעולות',
  COMMUNITY_CONFIG: 'הגדרות הקהילה',
  SYSTEM_ANNOUNCEMENTS: 'הודעות מערכת',
  PRIVATE_GROUP_MODERATE: 'טיפול בתוכן של קבוצה פרטית',
  CHILD_DATA_VIEW: 'מגמות בנתוני ילדים (בלי זיהוי)',
};

// ---- joining (the invited person)
export const JOIN_TITLE = 'הצטרפות לצוות Nestly';
export const JOIN_INTRO = 'קיבלת הזמנה להצטרף לצוות הניהול. יוצרים חשבון צוות חדש עם אימייל וסיסמה. החשבון הזה משמש רק לניהול, לא לקהילה';
export const JOIN_SUBMIT = 'יצירת חשבון צוות';
export const JOIN_BUSY = 'יוצרים את החשבון';
export const JOIN_NO_CODE = 'הקישור חסר או שגוי. אפשר לבקש מהמנהל הזמנה חדשה';
export const JOIN_INVALID_CODE = 'ההזמנה כבר לא בתוקף. אפשר לבקש מהמנהל הזמנה חדשה';
export const JOIN_HAS_ACCOUNT = 'לאימייל הזה כבר יש חשבון ב-Nestly. חשבון צוות צריך אימייל אחר';
export const JOIN_FAILED = 'לא הצלחנו ליצור את החשבון. אפשר לנסות שוב';
export const JOIN_SIGNED_IN = 'החשבון שמחובר עכשיו הוא חשבון קהילה. חשבון צוות הוא חשבון נפרד: כדי להצטרף צריך להתנתק ולפתוח את הקישור שוב';

// ---- community settings (PG-031)
export const COMMUNITY_TITLE = 'הגדרות קהילה';
export const REASONS_HEADING = 'סיבות דיווח';
export const REASONS_HINT = 'הסיבות שמשתמשים בוחרים בחלון הדיווח, בסדר שבו הן מוצגות. העדיפות קובעת את סדר התור (1 ראשונה). "תוכן שמסכן ילד" ו"אחר" תמיד פעילות';
export const REASON_LABEL = 'שם הסיבה';
export const REASON_PRIORITY = 'עדיפות בתור';
export const REASON_ORDER = 'מיקום ברשימה';
export const REASON_ACTIVE = 'פעילה בחלון הדיווח';
export const REASON_SAVE = 'שמירה';
export const REASON_SAVED = 'הסיבה נשמרה';
export const REASON_ADD_HEADING = 'סיבה חדשה';
export const REASON_ADD = 'הוספת הסיבה';
export const REASON_ADDED = 'הסיבה נוספה';
export const REASON_LABEL_ERROR = 'יש לכתוב 2 עד 60 תווים';
export const REASON_INVALID = 'הערכים לא תקינים. עדיפות 1 שמורה ל"תוכן שמסכן ילד"';

// ---- System Announcements (PG-032)
export const ANNOUNCEMENTS_TITLE = 'הודעות מערכת';
export const ANNOUNCEMENTS_EMPTY = 'עדיין אין הודעות מערכת';
export const ANNOUNCEMENT_NEW_HEADING = 'הודעה חדשה';
export const ANNOUNCEMENT_TITLE_LABEL = 'כותרת';
export const ANNOUNCEMENT_BODY_LABEL = 'תוכן ההודעה';
export const ANNOUNCEMENT_TITLE_ERROR = 'יש לכתוב כותרת של 2 עד 80 תווים';
export const ANNOUNCEMENT_BODY_ERROR = 'יש לכתוב תוכן של עד 1,000 תווים';
export const ANNOUNCEMENT_CREATE = 'שמירה כטיוטה';
export const ANNOUNCEMENT_SAVE = 'שמירת השינויים';
export const ANNOUNCEMENT_EDIT = 'עריכה';
export const ANNOUNCEMENT_CANCEL = 'ביטול';
export const ANNOUNCEMENT_PUBLISH = 'פרסום';
export const ANNOUNCEMENT_REMOVE = 'הסרה';
export const ANNOUNCEMENT_REMOVE_CONFIRM_TITLE = 'להסיר את ההודעה?';
export const ANNOUNCEMENT_REMOVE_CONFIRM_TEXT = 'ההודעה תרד מהפיד של כולם. אי אפשר לפרסם אותה שוב';
export const ANNOUNCEMENT_STATUS = { draft: 'טיוטה', published: 'מפורסמת', removed: 'הוסרה' } as const;
export const ANNOUNCEMENT_SAVED = 'ההודעה נשמרה';
export const ANNOUNCEMENT_PUBLISHED = 'ההודעה פורסמה';
export const ANNOUNCEMENT_REMOVED = 'ההודעה הוסרה';
export const ANNOUNCEMENTS_FEED_LABEL = 'הודעות מערכת';

// ---- the analytics (PG-026)
export const ANALYTICS_TITLE = 'נתונים';
export const ANALYTICS_PERIOD = 'תקופה';
export const ANALYTICS_PERIODS = { 7: '7 ימים', 30: '30 יום', 90: '90 יום' } as const;
export const ANALYTICS_NOTE = 'מספרים בלבד, בלי שמות ובלי פרטים מזהים. הנתונים מחושבים מהמוצר עצמו';
export const ANALYTICS_ACCOUNTS = 'חשבונות';
export const ANALYTICS_TYPES = { regular: 'משתמשים', professional: 'בעלי מקצוע', moderator: 'מודרטורים', admin: 'מנהל' } as const;
export const ANALYTICS_STATUSES = { active: 'פעילים', suspended: 'מושעים', banned: 'חסומים', deletionScheduled: 'ממתינים למחיקה' } as const;
export const ANALYTICS_REGISTRATIONS = 'הרשמות ליום';
export const ANALYTICS_FEED = 'פיד';
export const ANALYTICS_POSTS = 'פוסטים ליום';
export const ANALYTICS_COMMENTS = 'תגובות ליום';
export const ANALYTICS_LIKES = 'לייקים ליום';
export const ANALYTICS_PER_AUTHOR = 'חשבונות לפי מספר הפוסטים בתקופה';
export const ANALYTICS_FRIENDS = 'חברויות';
export const ANALYTICS_FRIEND_REQUESTS = 'בקשות חברות';
export const ANALYTICS_FRIENDS_ACCEPTED = 'חברויות שאושרו';
export const ANALYTICS_MODERATION = 'דיווחים ואכיפה';
export const ANALYTICS_REPORTS = 'דיווחים ליום';
export const ANALYTICS_BY_REASON = 'דיווחים לפי סיבה';
export const ANALYTICS_OPEN = 'פתוחים עכשיו';
export const ANALYTICS_ACTION_TAKEN = 'טופלו בנקיטת פעולה';
export const ANALYTICS_DISMISSED = 'נסגרו בלי פעולה';
export const ANALYTICS_MEDIAN = 'זמן טיפול חציוני (שעות)';
export const ANALYTICS_ENFORCEMENTS = { warning: 'אזהרות', suspension: 'השעיות', ban: 'חסימות' } as const;
// FR-ADMIN-003 (I11 follow-ups): the Support metrics
export const ANALYTICS_SUPPORT = 'פניות לתמיכה';
export const ANALYTICS_SUPPORT_REQUESTS = 'פניות ליום';
export const ANALYTICS_SUPPORT_BY_TOPIC = 'פניות לפי נושא';
export const ANALYTICS_SUPPORT_STATUSES = { open: 'פתוחות', inProgress: 'בטיפול', closed: 'סגורות' } as const;
export const ANALYTICS_SUPPORT_ANSWERED = 'פניות שקיבלו תשובה';
export const ANALYTICS_SUPPORT_MEDIAN = 'זמן חציוני לתשובה ראשונה (שעות)';
// FR-ADMIN-010 (SRS audit 21.10): Groups, Professionals and Marketplace, from the product's tables
export const ANALYTICS_GROUPS = 'קבוצות';
export const ANALYTICS_GROUPS_PUBLIC = 'קבוצות ציבוריות פעילות';
export const ANALYTICS_GROUPS_PRIVATE = 'קבוצות פרטיות פעילות';
export const ANALYTICS_GROUPS_CREATED = 'קבוצות חדשות בתקופה';
export const ANALYTICS_GROUPS_MEMBERS = 'חברים בקבוצות ציבוריות';
export const ANALYTICS_GROUPS_JOINS = 'הצטרפויות לקבוצות ציבוריות בתקופה';
export const ANALYTICS_GROUPS_POSTS = 'פוסטים בקבוצות ציבוריות בתקופה';
export const ANALYTICS_GROUPS_COMMENTS = 'תגובות בקבוצות ציבוריות בתקופה';
export const ANALYTICS_GROUPS_NOTE = 'החברים והתוכן של קבוצות פרטיות אינם נספרים.';
export const ANALYTICS_PROS = 'בעלי מקצוע';
export const ANALYTICS_PROS_ACTIVE = 'חשבונות מקצועיים פעילים';
export const ANALYTICS_PROS_FOLLOWS = 'מעקבים חדשים בתקופה';
export const ANALYTICS_PROS_CHATS = 'שיחות שנפתחו בתקופה';
export const ANALYTICS_PROS_REVIEWS = 'ביקורות חדשות בתקופה';
export const ANALYTICS_PROS_BY_FIELD = 'חשבונות מקצועיים פעילים לפי תחום';
export const ANALYTICS_MARKET = 'Marketplace';
export const ANALYTICS_MARKET_ACTIVE = 'מודעות מוצגות עכשיו';
export const ANALYTICS_MARKET_CREATED = 'מודעות חדשות בתקופה';
export const ANALYTICS_MARKET_SOLD = 'מודעות שסומנו כנמכרו בתקופה';
export const ANALYTICS_MARKET_CHATS = 'שיחות על מודעות בתקופה';
/** I12-B (Afik §10.6, AC-206): the Admin's graph of sold listings. */
export const ANALYTICS_MARKET_SOLD_CHART = 'מודעות שסומנו "נמכר/נמסר" לפי יום';
export const ANALYTICS_MARKET_BY_CATEGORY = 'מודעות מוצגות לפי קטגוריה';
export const ANALYTICS_WAITING_HEADING = 'תחומים שעוד לא נמדדים';
export const ANALYTICS_WAITING = 'איכות ההמלצות תוצג כשהאירועים שלה ייאספו. מהחיפושים אין ניתוח למנהלים.';
export const ANALYTICS_USAGE = 'שימוש';
export const ANALYTICS_USAGE_LOGINS = 'חשבונות שנכנסו';
export const ANALYTICS_USAGE_PROFILE_VIEWS = 'צפיות בפרופילים';
export const ANALYTICS_USAGE_POST_VIEWS = 'צפיות בפוסטים';
export const ANALYTICS_USAGE_NOTE = 'כל חשבון נספר פעם אחת ביום. בלי שמות, בלי תוכן ובלי מה נצפה.';
export const ANALYTICS_PROMOTIONS = 'קידום';
export const ANALYTICS_PROMOTIONS_PROFILE = 'קידומי פרופיל פעילים';
export const ANALYTICS_PROMOTIONS_POST = 'קידומי פוסט פעילים';
export const ANALYTICS_PROMOTIONS_LISTING = 'קידומי מודעה פעילים';
export const ANALYTICS_PROMOTIONS_REVENUE = 'סכום לדוגמה ששולם בתקופה (₪)';
export const ANALYTICS_PROMOTIONS_PURCHASES = 'רכישות קידום (תשלום מדומה)';
export const ANALYTICS_PROMOTIONS_IMPRESSIONS = 'חשיפות של קידומים';
export const ANALYTICS_PROMOTIONS_CLICKS = 'לחיצות על קידומים';
export const ANALYTICS_EMPTY = 'אין נתונים בתקופה הזו';
export const ANALYTICS_TABLE = 'הנתונים בטבלה';
export const ANALYTICS_DAY = 'יום';
export const ANALYTICS_COUNT = 'מספר';
export const ANALYTICS_NONE = '—';

// ---- the staff inbox (AC-044)
export const INBOX_BADGE = (count: number) => `${count} ממתינים`;

// I14 completion B (FR-ADMIN-008, OP-042, Afik 21.10.2026): an announcement's audience
export const AUDIENCE_LABEL = 'למי ההודעה';
export const AUDIENCE_STAGE_LABEL = 'השלב';
export const AUDIENCE_LABELS: Record<'everyone' | 'parents' | 'professionals' | 'stage', string> = {
  everyone: 'לכולם',
  parents: 'להורים',
  professionals: 'לבעלי מקצוע',
  stage: 'לשלב מסוים',
};
export const audienceText = (label: string) => `קהל: ${label}`;
