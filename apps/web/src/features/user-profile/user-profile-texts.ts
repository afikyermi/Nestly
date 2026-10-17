// Another person's profile: the texts (F2.4c2; §1.4 Basic Public Profile, FR-PRIV-001, FR-REL-001). Q1/Q3: the headings and actions
// are written in spec.md c25, c28 and c29; the empty texts, the failure texts and the status lines are BUILDER's (ux-copy-he),
// recorded in notes-c2.md. The Journey Summary sentence is the SRS's, verbatim (OP-021). A name is only ever placed whole into a
// sentence; nothing here builds text from fragments of a name.

export const TITLE = 'פרופיל';
export const UNAVAILABLE_TEXT = 'הפרופיל לא זמין'; // c29: one text for every reason (404)
export const LOADING_TEXT = 'טוענים את הפרופיל';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב'; // c29 · ERR-004

export const GENDER_LABEL = 'מין ההורה';
export const CHILDREN_COUNT_LABEL = 'מספר ילדים';
export const CHILD_AGES_LABEL = 'גילאים';
export const PREGNANCY_LABEL = 'הריון';
export const PREGNANT_TEXT = 'בהריון';
export const EMPTY_JOURNEY_TEXT = 'עוד אין כאן ילדים, אז הקפה עדיין מגיע חם ☕'; // §1.4 · OP-021

export const friendsOfTitle = (name: string): string => `החברים של ${name}`; // c25
export const MUTUAL_TITLE = 'חברים משותפים'; // c25
// Q1: why the list is empty.
export const FRIENDS_EMPTY_TEXT = 'עדיין אין כאן חברים להצגה';
export const MUTUAL_EMPTY_TEXT = 'אין חברים משותפים';

export const SEND_LABEL = 'שליחת בקשת חברות'; // c28
export const CANCEL_LABEL = 'ביטול הבקשה';
export const ACCEPT_LABEL = 'אישור';
export const DECLINE_LABEL = 'דחייה';
export const REMOVE_FRIEND_LABEL = 'הסרה מהחברים';

/** The part of an action's accessible name that follows its visible label (S3): "שליחת בקשת חברות" + " לדנה כהן". */
export const toName = (name: string): string => `ל${name}`;
export const requestFromName = (name: string): string => `בקשת החברות של ${name}`;
export const friendName = (name: string): string => `של ${name}`;

export const SENT_STATUS = 'הבקשה נשלחה';
export const CANCELLED_STATUS = 'הבקשה בוטלה';
export const DECLINED_STATUS = 'הבקשה נדחתה';
export const ACCEPTED_STATUS = 'הבקשה אושרה';
export const REMOVED_STATUS = 'החבר הוסר מהרשימה';
