import { COMMENT_BODY_MAX } from '@nestly/shared';

// The comments region's texts (F3.3 w1; FR-FEED-003). Written in .work/comments-likes/screen.md; gender-neutral (NFR-USAB-003). The retry
// label, "מהקהילה" and the delete-failure text are the posts screens' own.
export const COMMENTS_TITLE = 'תגובות';
export const COMMENTS_LIST_LABEL = 'רשימת התגובות';
export const REPLIES_LIST_LABEL = 'השבות';
export const AUTHOR_LABEL = 'המחבר'; // VAL-036: the post author's own comment on an anonymous post
export const REPLY_LABEL = 'השבה';
export const MORE_REPLIES_LABEL = 'הצגת עוד השבות';
export const MORE_LABEL = 'עוד תגובות';
export const LOADING_MORE_TEXT = 'טוענים';
export const COMMENT_FORM_LABEL = 'כתיבת תגובה';
export const REPLY_FORM_LABEL = 'כתיבת השבה';
export const SEND_LABEL = 'שליחה';
export const SENDING_TEXT = 'שולחים';
export const COMMENT_DELETE_LABEL = 'מחיקה';

export const COMMENTS_LOADING_TEXT = 'טוענים את התגובות';
export const COMMENTS_EMPTY_TEXT = 'עוד אין תגובות. אפשר לכתוב את התגובה הראשונה';
export const COMMENTS_LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את התגובות. אפשר לנסות שוב'; // ERR-004
export const REPLIES_LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את ההשבות. אפשר לנסות שוב'; // ERR-004
export const COMMENT_UNAVAILABLE_TEXT = 'התגובה אינה זמינה';
export const MORE_FAILED_TEXT = 'לא הצלחנו לטעון עוד תגובות. אפשר לנסות שוב'; // ERR-004
export const SEND_FAILED_TEXT = 'התגובה לא נשלחה. אפשר לנסות שוב'; // ERR-004
export const LIKE_FAILED_TEXT = 'הלייק לא נשמר. אפשר לנסות שוב'; // ERR-004

export const COMMENT_REQUIRED_TEXT = 'יש לכתוב משהו לפני השליחה';
export const COMMENT_TOO_LONG_TEXT = `התגובה ארוכה מדי. אפשר לקצר אותה עד ${COMMENT_BODY_MAX.toLocaleString('en-US')} תווים`;
export const COMMENT_INVALID_TEXT = 'יש בטקסט תו שאי אפשר לשמור. אפשר להסיר אותו ולנסות שוב';

export const SENT_STATUS = 'התגובה נוספה';
export const REMOVED_STATUS = 'התגובה נמחקה';

export const DELETE_COMMENT_TITLE = 'למחוק את התגובה?';
export const DELETE_COMMENT_CONFIRM_LABEL = 'מחיקת התגובה';
export const DELETE_COMMENT_REPLIES_NOTE = 'גם ההשבות אליה יימחקו';

export const LIKE_LABEL = 'לייק';

/** The counter's words, shown only at 100 characters left or fewer. */
export function commentRemainingText(left: number): string {
  if (left === -1) return 'התגובה ארוכה בתו אחד מהמותר';
  if (left < 0) return `התגובה ארוכה ב-${(-left).toLocaleString('en-US')} תווים מהמותר`;
  if (left === 0) return 'לא נותרו תווים';
  return left === 1 ? 'נותר תו אחד' : `נותרו ${left.toLocaleString('en-US')} תווים`;
}
