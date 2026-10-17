// Texts the Friends page (F2.4b) and another person's profile (F2.4c2) both show: the removal dialog and the messages of a
// relationship action that did not go through. They live here, not in either feature, because a Feature never imports another
// Feature. A name is only ever placed whole into a sentence.

export const REMOVE_LABEL = 'הסרה';
export const DIALOG_CANCEL_LABEL = 'ביטול';
export const RETRY_LABEL = 'נסו שוב';

export const removeTitle = (name: string): string => `להסיר את ${name} מהחברים?`;
export const REMOVE_DESCRIPTION = 'אפשר לשלוח בקשת חברות חדשה בהמשך';

export const ACTION_FAILED_TEXT = 'הפעולה לא הצליחה. אפשר לנסות שוב'; // F2.4b c14 · ERR-004
export const GONE_TEXT = 'הבקשה כבר לא זמינה'; // F2.4b c14: 409 request_gone
export const FRIEND_GONE_TEXT = 'האדם הזה כבר לא ברשימת החברים'; // F2.4b c14: a removal that found no Friendship
/** ERR-032: a general message that names no threshold, number or time (NFR-SEC-006). */
export const RATE_LIMITED_TEXT = 'נפתחו הרבה פרופילים בזמן קצר. אפשר לנסות שוב מאוחר יותר';
