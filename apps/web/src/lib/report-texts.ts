import { REPORT_DETAILS_MAX, type CoreReportReason, type ReportTargetKind } from '@nestly/shared';

// The report window's texts and the entry points' names (F3.7). Written in .work/report/screen.md; gender-neutral (NFR-USAB-003). The reasons
// are FR-MOD-001's, in its order (REPORT_REASONS); the spam hint is its parenthesis. The menu's own name, "פעולות נוספות", is F3.9's.
export const REPORT_POST_ITEM = 'דיווח על הפוסט';
export const REPORT_COMMENT_ITEM = 'דיווח על התגובה';
export const COMMENT_MORE_LABEL = 'פעולות נוספות לתגובה';
export const REPORT_PROFILE_LABEL = 'דיווח על הפרופיל';

export const REPORT_TITLES: Record<ReportTargetKind, string> = { post: 'דיווח על פוסט', comment: 'דיווח על תגובה', user: 'דיווח על פרופיל', message: 'דיווח על הודעה', listing: 'דיווח על מודעה' };
export const REPORT_INTRO = 'הדיווח מגיע רק לצוות Nestly, ולא נשלחת עליו הודעה לאף אחד';
export const REASONS_LEGEND = 'מה הבעיה?';
export const REASON_LABELS: Record<CoreReportReason, string> = {
  child_safety: 'תוכן שמסכן ילד',
  harassment: 'הטרדה או בריונות',
  sexual_violent_hateful: 'תוכן מיני, אלים או מסית',
  personal_information: 'חשיפת פרטים אישיים',
  medical_misinformation: 'מידע רפואי מסוכן או מטעה',
  impersonation: 'התחזות',
  spam: 'ספאם או פרסום לא קשור',
  other: 'אחר',
};
export const SPAM_HINT = 'כולל פוסט פרסומי בלי שיתוף ידע';
export const DETAILS_LABEL = 'פרטים נוספים';
export const DETAILS_HINT = "לא חובה. בבחירת 'אחר' צריך לכתוב מה הבעיה";
export const RULES_LINK_LABEL = 'כללי הקהילה';
export const NEW_TAB_NOTE = '(נפתח בכרטיסייה חדשה)';
export const SEND_REPORT_LABEL = 'שליחת הדיווח';
export const SENDING_REPORT_TEXT = 'שולחים';
export const REPORT_CANCEL_LABEL = 'ביטול';

export const REASON_REQUIRED_TEXT = 'יש לבחור סיבה';
export const OTHER_DETAILS_REQUIRED_TEXT = "בבחירת 'אחר' יש לכתוב מה הבעיה";
export const DETAILS_TOO_LONG_TEXT = `הטקסט ארוך מדי. אפשר לקצר אותו עד ${REPORT_DETAILS_MAX.toLocaleString('en-US')} תווים`;
export const DETAILS_INVALID_TEXT = 'יש בטקסט תו שאי אפשר לשמור. אפשר להסיר אותו ולנסות שוב'; // F3.3's text (COMMENT_INVALID_TEXT)
export const REPORT_FAILED_TEXT = 'הדיווח לא נשלח. אפשר לנסות שוב'; // ERR-004

export const POST_REPORTED_STATUS = 'הדיווח נשלח. הפוסט לא יוצג לכם יותר';
export const REPORT_RECEIVED_STATUS = 'הדיווח נשלח. הצוות יבדוק אותו';
export const ALREADY_REPORTED_STATUS = 'כבר דיווחתם על זה. הצוות יבדוק את הדיווח';
export const REPORT_UNAVAILABLE_STATUS = 'אי אפשר לדווח על זה. ייתכן שהתוכן כבר לא זמין';

/** The counter's words, shown only at 100 characters left or fewer (F3.3's pattern). */
export function detailsRemainingText(left: number): string {
  if (left === -1) return 'הטקסט ארוך בתו אחד מהמותר';
  if (left < 0) return `הטקסט ארוך ב-${(-left).toLocaleString('en-US')} תווים מהמותר`;
  if (left === 0) return 'לא נותרו תווים';
  return left === 1 ? 'נותר תו אחד' : `נותרו ${left.toLocaleString('en-US')} תווים`;
}
