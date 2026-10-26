import type { ChildTrendDimension, ChildTrendField, ChildTrendMetric, ChildTrendPeriod, ReportTargetKind } from '@nestly/shared';

// The staff's work texts (I14 completion, Afik 21.10.2026): the Admin's home, a Moderator's "my work", the queue's time targets, escalation, the
// ready reasons, the report's context, the Audit Log filters and the children's trends. Hebrew, gender-neutral (NFR-USAB-003).

// ---- the homes
export const ADMIN_HOME_TITLE = 'בית הניהול';
export const MY_WORK_TITLE = 'העבודה שלי';
export const CHILD_SAFETY_BAR = (n: number) => (n === 1 ? 'יש דיווח פתוח על תוכן שמסכן ילד' : `יש ${n} דיווחים פתוחים על תוכן שמסכן ילד`);
export const CHILD_SAFETY_BAR_LINK = 'לטיפול עכשיו';
// I9 (decisions-in-force §16.4): the account deletions that wait for their date, and the red bar for one past it (numbers only).
export const PENDING_DELETIONS_LABEL = 'מחיקות חשבון ממתינות';
export const OVERDUE_DELETIONS_BAR = (n: number) =>
  n === 1 ? 'מחיקת חשבון אחת עברה את מועד הביצוע ועדיין לא בוצעה' : `${n} מחיקות חשבון עברו את מועד הביצוע ועדיין לא בוצעו`;
export const ATTENTION_TITLE = 'דורש תשומת לב';
export const NOTHING_NEEDS_ATTENTION = 'אין כרגע דבר שמחכה לטיפול';
export const ATTENTION_LABELS = {
  openReports: 'דיווחים פתוחים',
  pastTargetReports: 'פריטים שעברו את זמן היעד',
  escalatedReports: 'הועברו אליך מהצוות',
  queuedImages: 'תמונות לבדיקה',
  openSupport: 'פניות Support פתוחות',
  openInvitations: 'הזמנות צוות פתוחות',
  draftGuides: 'מדריכים שממתינים לאישור',
} as const;
export const REPORT_SPIKE_TEXT = (lastDay: number, average: number) => `קפיצה בדיווחים: ${lastDay} ביממה האחרונה, לעומת ממוצע של ${average} ביום בשבוע שלפני`;
export const METRICS_TITLE = 'השבוע לעומת השבוע הקודם';
export const METRIC_LABELS = {
  registrations: 'הרשמות',
  posts: 'פוסטים',
  comments: 'תגובות',
  reports: 'דיווחים',
  enforcements: 'צעדי אכיפה',
  support: 'פניות Support',
} as const;
export const METRIC_CHANGE = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 'ללא שינוי' : 'חדש השבוע';
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent === 0 ? 'ללא שינוי' : percent > 0 ? `עלייה של ${percent}%` : `ירידה של ${-percent}%`;
};
export const METRIC_PREVIOUS = (previous: number) => `בשבוע הקודם: ${previous}`;
export const TEAM_SNAPSHOT_TITLE = 'מצב הצוות';
export const TEAM_SNAPSHOT_EMPTY = 'עדיין אין מודרטורים בצוות';
export const TEAM_SNAPSHOT_UNNAMED = 'מודרטור';
export const TEAM_KEYS_COUNT = (n: number) => (n === 1 ? 'הרשאה אחת' : `${n} הרשאות`);
export const TEAM_LAST_ACTION = (when: string | null) => (when === null ? 'עדיין לא פעל' : `פעולה אחרונה: ${when}`);
export const TEAM_WEEK_ACTIONS = (n: number) => `${n} פעולות השבוע`;
export const SENSITIVE_LINK = 'אירועים רגישים ביומן';
export const OPEN_LABEL = 'פתיחה';

export const MY_WORK_COUNTERS = {
  openReports: 'דיווחים פתוחים',
  childSafetyReports: 'תוכן שמסכן ילד',
  pastTargetReports: 'עברו את זמן היעד',
  escalatedReports: 'הועברו למנהל',
  queuedImages: 'תמונות לבדיקה',
  openSupport: 'פניות Support פתוחות',
} as const;
export const MY_WORK_NO_KEYS = 'עדיין לא הוקצו לך הרשאות. המנהל יכול להקצות אותן';
export const OLDEST_TITLE = 'הוותיק ביותר שממתין';
export const NEXT_IN_QUEUE = 'הבא בתור';
export const QUEUE_EMPTY = 'התור ריק';

// ---- the queue: wait and time target (§9.9)
export const WAITING = (hours: number) => (hours < 1 ? 'ממתין פחות משעה' : hours < 48 ? `ממתין ${Math.floor(hours)} שעות` : `ממתין ${Math.floor(hours / 24)} ימים`);
export const TIME_TARGET = (hours: number) => (hours === 1 ? 'יעד: שעה' : `יעד: ${hours} שעות`);
export const PAST_TARGET = 'עבר את זמן היעד';
export const ESCALATED_MARK = 'הועבר למנהל';
export const OPENED_BY_MARK = (n: number) => (n === 1 ? 'נפתח בידי איש צוות אחד' : `נפתח בידי ${n} אנשי צוות`);
export const TARGET_KIND_LABELS: Record<ReportTargetKind, string> = {
  post: 'פוסט',
  comment: 'תגובה',
  user: 'משתמש',
  message: 'הודעה בצ׳אט',
  listing: 'מודעה',
  review: 'ביקורת',
  article: 'מאמר',
};

// ---- escalation (§9.9)
export const ESCALATE_LABEL = 'העברה למנהל';
export const ESCALATE_NOTE_LABEL = 'מה צריך מהמנהל';
export const ESCALATE_SEND = 'שליחה למנהל';
export const ESCALATED_TEXT = 'הדיווח הועבר למנהל';
export const ESCALATED_ALREADY = 'הדיווח כבר הועבר למנהל';
export const ESCALATION_SHOWN = (who: string, note: string) => `הועבר למנהל בידי ${who}: ${note}`;

// ---- handling status (§9.10)
export const HANDLING_TITLE = 'מצב הטיפול';
export const OPENED_BY = (who: string, when: string) => `נפתח בידי ${who}, ${when}`;
export const ME = 'החשבון הזה';
export const SOMEONE = 'איש צוות';
export const NOT_OPENED = 'עוד לא נפתח בידי איש צוות אחר';

// ---- the report's context (§9.7)
export const CONTEXT_TITLE = 'ההקשר';
export const CONTEXT_POST = 'הפוסט שהתגובה נכתבה עליו, כפי שהוא עכשיו';
export const CONTEXT_THREAD = 'כל התגובות בשרשור';
export const CONTEXT_EMPTY = 'אין תגובות בשרשור';
export const CONTEXT_REPORTED = 'דווח';
/** I14 completion B (decision 10.9): a reported comment in a post's thread is read only from its own report (each opening is audited). */
export const CONTEXT_REPORTED_HIDDEN = 'לתגובה הזו יש דיווח משלה. התוכן שלה נפתח רק מהדיווח עליה, והפתיחה נרשמת ביומן';
export const CONTEXT_ANONYMOUS = 'המחבר (פוסט אנונימי)';
export const AT_REPORT_TIME = 'בזמן הדיווח';
export const NOW_LABEL = 'עכשיו';
export const OPEN_PAGE_LABEL = 'פתיחת העמוד לבדיקה';

// ---- the author card (§9.7)
export const AUTHOR_CARD_TITLE = 'כרטיס המחבר';
export const ACCOUNT_AGE = (days: number) => (days < 1 ? 'החשבון נפתח היום' : days < 60 ? `ותק: ${days} ימים` : `ותק: ${Math.floor(days / 30)} חודשים`);
export const ENFORCEMENTS_YEAR = (n: number) => (n === 0 ? 'אין צעדי אכיפה ב-12 החודשים האחרונים' : `${n} צעדי אכיפה ב-12 החודשים האחרונים`);
export const NEXT_STEP = 'הצעד הבא במדרג';

// ---- ready reasons, tied to the community rules (BR-075, §9.9)
export const READY_REASON_LABEL = 'סיבה מוכנה';
export const READY_REASON_NONE = 'בחירת סיבה מוכנה';
export const READY_REASONS: readonly string[] = [
  'הפרה של כלל 1, כבוד הדדי: העלבה, שיימינג או בריונות',
  'הפרה של כלל 2: אבחנה או מינון תרופות במקום הפניה לרופא',
  'הפרה של כלל 3, פרטיות: פרטים מזהים או תמונה של ילד של אחרים בלי רשות',
  'הפרה של כלל 4, שמירה על ילדים: תוכן שמסכן ילד',
  'הפרה של כלל 5: ספאם או פרסום שאינו קשור',
  'הפרה של כלל 6: תוכן מיני, אלים או מסית',
  'הפרה של כלל 7, זהות אמיתית: התחזות',
  'הדיווח נבדק ולא נמצאה הפרה של כללי הקהילה',
];

// ---- images in the queues: blurred and greyscale by default (§9.9)
export const REVEAL_IMAGE = 'הצגת התמונה';
export const HIDE_IMAGE = 'טשטוש התמונה';

// ---- the Audit Log filters (§9.10)
export const AUDIT_FILTERS_LABEL = 'סינון היומן';
export const AUDIT_FILTER_ACTION = 'פעולה';
export const AUDIT_FILTER_ROLE = 'תפקיד';
export const AUDIT_FILTER_TARGET = 'סוג יעד';
export const AUDIT_FILTER_FROM = 'מתאריך';
export const AUDIT_FILTER_TO = 'עד תאריך';
export const AUDIT_FILTER_SENSITIVE = 'רק אירועים רגישים';
export const AUDIT_FILTER_ALL = 'הכל';
export const AUDIT_FILTER_APPLY = 'סינון';
export const AUDIT_FILTER_CLEAR = 'ניקוי הסינון';

// ---- the children's trends (§9.2)
export const CHILD_TRENDS_TITLE = 'נתוני ילדים: מגמות';
export const CHILD_TRENDS_LEAD = 'מגמות כלליות בלבד, בלי זיהוי, לפי שבוע או חודש. מספר הילדים מעוגל לעשרות. תא עם פחות מ-10 ילדים או פחות מ-10 משפחות מוסתר. כל שאילתה נרשמת ביומן הפעולות';
export const CHILD_TRENDS_METRIC = 'מעקב';
export const CHILD_TRENDS_FIELD = 'מדד';
export const CHILD_TRENDS_DIMENSION = 'חלוקה לפי';
export const CHILD_TRENDS_PERIOD = 'תקופה';
export const CHILD_TRENDS_SHOW = 'הצגה';
export const CHILD_TRENDS_SUPPRESSED = 'מוסתר (פחות מ-10)';
export const CHILD_TRENDS_CHILDREN = (n: number) => `${n} ילדים`;
export const CHILD_TRENDS_TABLE = 'הנתונים בטבלה';
export const CHILD_TRENDS_BUCKET = 'קבוצה';
export const CHILD_TRENDS_VALUE = 'ערך';
export const CHILD_TRENDS_COUNT = 'ילדים';
export const CHILD_TREND_METRIC_LABELS: Record<ChildTrendMetric, string> = {
  breastfeeding: 'הנקה',
  bottle: 'בקבוק',
  sleep: 'שינה',
  diaper: 'חיתולים',
  medicine: 'תרופות',
  growth: 'גדילה',
  vaccine: 'חיסונים',
  bath: 'רחצה',
};
export const CHILD_TREND_FIELD_LABELS: Record<ChildTrendField, string> = {
  events_per_day: 'רשומות ביום',
  duration_minutes: 'משך ממוצע (דקות)',
  amount_ml: 'כמות ממוצעת (מ"ל)',
  weight_kg: 'משקל ממוצע (ק"ג)',
  height_cm: 'גובה ממוצע (ס"מ)',
  head_cm: 'היקף ראש ממוצע (ס"מ)',
};
export const CHILD_TREND_DIMENSION_LABELS: Record<ChildTrendDimension, string> = {
  child_age: 'גיל הילד',
  child_sex: 'מין הילד',
};
export const CHILD_TREND_PERIOD_LABELS: Record<ChildTrendPeriod, string> = {
  this_week: 'השבוע',
  last_week: 'השבוע שעבר',
  this_month: 'החודש',
  last_month: 'החודש שעבר',
};
export const CHILD_TREND_BUCKET_LABELS: Readonly<Record<string, string>> = {
  girl: 'בנות',
  boy: 'בנים',
  unknown: 'לא צוין',
  '0-2': '0–2 חודשים',
  '3-5': '3–5 חודשים',
  '6-11': '6–11 חודשים',
  '12-23': '1–2 שנים',
  '24-59': '2–5 שנים',
  '60+': '5 שנים ומעלה',
};

export const AUDIT_FILTER_PERIOD = 'תקופה';
export const AUDIT_FILTER_PERIODS = { '1': 'היום', '7': '7 ימים', '30': '30 יום', '90': '90 יום' } as const;
