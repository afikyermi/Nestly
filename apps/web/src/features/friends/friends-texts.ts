// The Friends page's texts (F2.4b; PG-036, FR-REL-001). Q1: the headings and actions are written in spec.md c13; the empty texts, the
// failure texts and the status lines are BUILDER's (ux-copy-he), recorded in notes-b.md. A name is only ever placed whole into a
// sentence; nothing here builds text from fragments of a name.

export const TITLE = 'חברים';

export const INCOMING_TITLE = 'בקשות שקיבלת';
export const SENT_TITLE = 'בקשות ששלחת';
export const FRIENDS_TITLE = 'החברים שלי';

// Q1: why the list is empty. There is no next step to offer yet: no screen creates a request before F2.4c2.
export const INCOMING_EMPTY_TEXT = 'אין בקשות חברות שממתינות לתשובה';
export const SENT_EMPTY_TEXT = 'אין בקשות ששלחת וממתינות לתשובה';
export const FRIENDS_EMPTY_TEXT = 'עדיין אין חברים ברשימה';

export const ACCEPT_LABEL = 'אישור';
export const DECLINE_LABEL = 'דחייה';
export const CANCEL_REQUEST_LABEL = 'ביטול';
export const REMOVE_LABEL = 'הסרה';
export const DIALOG_CANCEL_LABEL = 'ביטול';
export const RETRY_LABEL = 'נסו שוב';

/** The part of an action's accessible name that follows its visible label (S3): "אישור" + " בקשת החברות של דנה". */
export const requestFromName = (name: string): string => `בקשת החברות של ${name}`;
export const requestToName = (name: string): string => `בקשת החברות ל${name}`;
export const friendName = (name: string): string => `של ${name}`;

export const removeTitle = (name: string): string => `להסיר את ${name} מהחברים?`;
export const REMOVE_DESCRIPTION = 'אפשר לשלוח בקשת חברות חדשה בהמשך';

export const LOADING_TEXT = 'טוענים את החברים';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את החברים. אפשר לנסות שוב'; // c14 · ERR-004
export const ACTION_FAILED_TEXT = 'הפעולה לא הצליחה. אפשר לנסות שוב'; // c14 · ERR-004
export const GONE_TEXT = 'הבקשה כבר לא זמינה'; // c14

export const ACCEPTED_STATUS = 'הבקשה אושרה';
export const DECLINED_STATUS = 'הבקשה נדחתה';
export const CANCELLED_STATUS = 'הבקשה בוטלה';
export const REMOVED_STATUS = 'החבר הוסר מהרשימה';
