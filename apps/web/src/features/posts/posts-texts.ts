import { POST_BODY_MAX, type PostAudience } from '@nestly/shared';

// The post screens' texts (F3.1b; FR-FEED-002, OP-033, Afik 1א, 5א, 6ב). The headings, labels and statuses are written in
// .work/post-create/spec.md criteria 14-18; the rest is BUILDER's (ux-copy-he), recorded in notes.md. Gender-neutral (NFR-USAB-003).

export const NEW_POST_LABEL = 'כתיבת פוסט';
export const FEED_TITLE = 'הפיד'; // F3.2b c13 (was 'פיד')
export const CHECKING_TEXT = 'בודקים אם אפשר לכתוב פוסט';

export const BODY_LABEL = 'מה תרצו לשתף?';
export const AUDIENCE_LEGEND = 'מי יראה את הפוסט'; // c15
export const AUDIENCE_LABELS: Record<PostAudience, string> = { everyone: 'כולם', friends: 'חברים בלבד' };
/** Afik 6ב: a named post says whose name it carries. */
export const NAME_NOTICE_TEXT = 'השם שלכם יוצג לכל מי שיכול לראות את הפוסט';
// F3.4 (.work/anonymous-post/screen.md). The anonymous notice is the ⭐ text of Gate 1 decision 2, until Afik answers the DR on staff access.
export const ANONYMOUS_LABEL = 'פרסום אנונימי';
export const ANONYMOUS_NOTICE_TEXT = 'השם שלכם לא יוצג לאף אחד בקהילה. צוות Nestly יכול לראות מי כתב, רק לבטיחות ואכיפה';
export const ANONYMOUS_OWN_NOTE = 'פרסמתם את הפוסט הזה באופן אנונימי. רק אתם רואים את ההודעה הזו';
export const ANONYMOUS_FIXED_TEXT = 'הפוסט אנונימי ומוצג לכולם. אי אפשר לשנות את זה';
export const TAG_LEGEND = 'תגית (לא חובה)';
export const NO_TAG_LABEL = 'בלי תגית'; // c16
export const TAG_HINT_TEXT = 'התגית תוצג לקוראים'; // c16

export const EDIT_FORM_LABEL = 'עריכת פוסט';
export const PUBLISH_LABEL = 'פרסום';
export const PUBLISHING_TEXT = 'מפרסמים';
export const SAVE_LABEL = 'שמירה';
export const SAVING_TEXT = 'שומרים';
export const CANCEL_LABEL = 'ביטול';
export const BACK_TO_FEED_LABEL = 'חזרה לפיד'; // c17
export const RETRY_LABEL = 'נסו שוב';

export const BODY_REQUIRED_TEXT = 'יש לכתוב משהו לפני הפרסום';
export const BODY_TOO_LONG_TEXT = `הפוסט ארוך מדי. אפשר לקצר אותו עד ${POST_BODY_MAX.toLocaleString('en-US')} תווים`;
export const PUBLISH_FAILED_TEXT = 'הפרסום לא הצליח. אפשר לנסות שוב'; // ERR-004
export const SAVE_FAILED_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב'; // ERR-004
export const DELETE_FAILED_TEXT = 'המחיקה לא הצליחה. אפשר לנסות שוב'; // ERR-004
export const LOADING_TEXT = 'טוענים את הפוסט';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את הפוסט. אפשר לנסות שוב'; // ERR-004
export const POST_TITLE = 'פוסט';
export const POST_UNAVAILABLE_TEXT = 'הפוסט אינו זמין'; // c18: one text for every reason (404)

export const PUBLISHED_STATUS = 'הפוסט פורסם'; // c17
export const UPDATED_STATUS = 'הפוסט עודכן';
export const DELETED_STATUS = 'הפוסט נמחק'; // c18

export const CONFIRM_DELETE_LABEL = 'מחיקת הפוסט';
export const DELETING_TEXT = 'מוחקים';
export const DELETE_TITLE = 'למחוק את הפוסט?';
export const DELETE_DESCRIPTION = 'המחיקה מיידית ולצמיתות'; // c18
export const DIALOG_CANCEL_LABEL = 'ביטול';

/** The counter's words, shown only at 100 characters left or fewer (c16). */
export function remainingText(left: number): string {
  if (left < 0) return `הפוסט ארוך ב-${(-left).toLocaleString('en-US')} תווים מהמותר`;
  if (left === 0) return 'לא נותרו תווים';
  return left === 1 ? 'נותר תו אחד' : `נותרו ${left.toLocaleString('en-US')} תווים`;
}

export const audienceLine = (audience: PostAudience): string => `${AUDIENCE_LEGEND}: ${AUDIENCE_LABELS[audience]}`;
export const tagLine = (label: string): string => `תגית: ${label}`;
