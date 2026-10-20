import { CYCLE_TRACKER, type TrackerKind, type TrackerPage } from '@nestly/shared';

// What the tracker and home screens say (FR-HOME-001..004, FR-TRACK-001/002). Gender-neutral (NFR-USAB-003), calm, no medical advice
// (BR-012). Error texts: ERR-015 is the end before the start; the rest is the generic "could not complete".

export const PAGE_LABEL: Record<TrackerPage, string> = {
  breastfeeding: 'הנקה',
  bottle: 'בקבוק',
  sleep: 'שינה',
  diaper: 'חיתול',
  medicine: 'תרופה',
  growth: 'גדילה',
  vaccine: 'חיסון',
  bath: 'אמבטיה',
  [CYCLE_TRACKER]: 'מחזור וביוץ',
};

export const SIDE_LABEL: Record<string, string> = { left: 'שמאל', right: 'ימין' };
export const DIAPER_LABEL: Record<string, string> = { wet: 'רטוב', dirty: 'מלוכלך' };

export const FORM_TEXT = {
  child: 'ילד או ילדה',
  childPlaceholder: 'בחירת ילד או ילדה',
  start: 'התחלה',
  end: 'סיום',
  when: 'מתי',
  date: 'תאריך',
  time: 'שעה',
  timeHint: 'למשל 08:30',
  amountMl: 'כמות במ״ל',
  side: 'צד',
  sidePlaceholder: 'בחירת צד',
  diaper: 'סוג',
  diaperPlaceholder: 'בחירת סוג',
  medicineName: 'שם התרופה',
  dosage: 'מינון',
  vaccineName: 'שם החיסון',
  weight: 'משקל בק״ג',
  height: 'גובה בס״מ',
  head: 'היקף ראש בס״מ',
  growthHint: 'אפשר למלא מדד אחד או יותר',
  note: 'הערה',
  save: 'שמירה',
  saveChanges: 'שמירת השינויים',
  cancelEdit: 'ביטול',
  bathDone: 'אמבטיה בוצעה',
} as const;

export const TIMER_TEXT = {
  start: 'התחלת טיימר',
  stop: 'עצירת טיימר',
  elapsed: 'זמן שעבר:',
} as const;

export const ERROR_TEXT = {
  time: 'יש להזין תאריך ושעה תקינים.',
  endBeforeStart: 'זמן הסיום לא יכול להיות מוקדם מזמן ההתחלה.',
  value: 'יש להזין ערך תקין.',
  required: 'יש למלא את השדות הנדרשים.',
  child: 'יש לבחור ילד או ילדה.',
  failed: 'השמירה לא הצליחה. אפשר לנסות שוב.',
  loadFailed: 'לא הצלחנו לטעון את הנתונים. אפשר לנסות שוב.',
  retry: 'ניסיון חוזר',
  duplicateDate: 'כבר יש מחזור שהתחיל בתאריך הזה.',
  cycleLength: 'האורך הממוצע של מחזור הוא בין 15 ל-60 ימים.',
  cycleDate: 'תאריך ההתחלה לא יכול להיות בעתיד.',
  cycleDateInvalid: 'יש להזין תאריך התחלה תקין.',
} as const;

export const HISTORY_TEXT = {
  title: 'היסטוריה',
  empty: 'עדיין אין רישומים בתקופה שנבחרה.',
  edit: 'עריכה',
  remove: 'מחיקה',
  removed: 'הרישום נמחק.',
  saved: 'הרישום נשמר.',
  confirmRemove: 'למחוק את הרישום?',
  confirmRemoveBody: 'אי אפשר לשחזר רישום שנמחק.',
  keep: 'ביטול',
  chartTitle: 'גרף לפי תקופה',
  privateNote: 'הנתונים נראים רק לך.',
  noChild: 'כדי לרשום מעקב אפשר להוסיף ילד או ילדה בפרופיל.',
  addChild: 'הוספת ילד או ילדה בפרופיל',
  truncated: 'בתקופה שנבחרה יש יותר רישומים ממה שמוצג. מוצגים הרישומים האחרונים. אפשר לבחור תקופה קצרה יותר.',
  allChildren: 'כל הילדים',
} as const;

export const PERIOD_TEXT = {
  legend: 'תקופה',
  week: '7 ימים',
  month: '30 ימים',
  quarter: '3 חודשים',
  year: 'שנה',
  custom: 'טווח אחר',
  from: 'מתאריך',
  to: 'עד תאריך',
  apply: 'הצגה',
  invalid: 'יש לבחור טווח תקין של עד שנה.',
} as const;

export const CHART_UNIT: Record<string, string> = { ml: 'מ״ל', minutes: 'דקות', count: 'רישומים', kg: 'ק״ג', cm: 'ס״מ', days: 'ימים' };
export const CHART_PER_DAY: Partial<Record<TrackerKind, string>> = {
  breastfeeding: 'דקות הנקה ליום',
  bottle: 'מ״ל ליום',
  sleep: 'דקות שינה ליום',
  diaper: 'חיתולים ליום',
  medicine: 'מתן תרופה ליום',
  vaccine: 'חיסונים ליום',
  bath: 'אמבטיות ליום',
};
export const GROWTH_METRICS = { weight: 'משקל', height: 'גובה', head: 'היקף ראש' } as const;

export const CYCLE_TEXT = {
  startDate: 'תאריך התחלת המחזור',
  length: 'אורך ממוצע בימים',
  lengthHint: 'בין 15 ל-60',
  save: 'שמירה',
  windowTitle: 'חלון ביוץ משוער',
  windowNone: 'אחרי שמירת מחזור יוצג כאן חלון ביוץ משוער.',
  windowNote: 'זו הערכה בלבד, מחושבת מתאריך ההתחלה ומהאורך הממוצע. היא אינה תחליף לייעוץ רפואי.',
  nextStart: 'המחזור הבא צפוי להתחיל ב-',
  historyEmpty: 'עדיין לא נשמר מחזור.',
  history: 'מחזורים שנשמרו',
  chartTitle: 'אורך מחזור לפי תאריך התחלה',
  daysSuffix: 'ימים',
} as const;

export const HOME_TEXT = {
  title: 'בית',
  lead: 'המעקב והתכנון שלך, במקום אחד.',
  routesTitle: 'המסלולים שלי',
  planning: 'מתכננים הריון',
  pregnancy: 'הריון',
  pregnancyWeek: (week: number, trimester: number) => `שבוע ${week}, שליש ${trimester}`,
  pregnancyNoDate: 'אפשר להוסיף תאריך לידה משוער בפרופיל כדי לראות את השבוע',
  childAge: (age: string) => `גיל ${age}`,
  cycleCard: 'מחזור וביוץ',
  cycleWindow: 'חלון ביוץ משוער',
  cycleEstimate: 'הערכה בלבד',
  addRouteTitle: 'הוספת מסלול מעקב',
  addChildOrPregnancy: 'ילד או ילדה, או הריון, בפרופיל',
  addCycle: 'מחזור וביוץ',
  noRoutes: 'עדיין אין מסלול מעקב. אפשר להוסיף ילד או ילדה, הריון או מחזור.',
  trackersTitle: 'יומן פעולות',
  trackersNeedChild: 'מעקב אחרי ילד או ילדה נפתח אחרי הוספת ילד או ילדה בפרופיל.',
  guidesTitle: 'טיפים ומאמרים',
  guidesEmpty: 'טיפים ומאמרים לפי השלב יופיעו כאן.',
  guideSource: 'מקורות',
  loadFailed: 'לא הצלחנו לטעון את דף הבית. אפשר לנסות שוב.',
} as const;
