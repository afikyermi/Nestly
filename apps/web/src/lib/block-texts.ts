// Blocking a user (FR-REL-002): the texts another person's profile and the blocked list in Settings both show. They live here, not in either
// feature, because a Feature never imports another Feature. A name is only ever placed whole into a sentence. Gender-neutral (NFR-USAB-003).

export const BLOCK_LABEL = 'חסימה';
export const blockTitle = (name: string): string => `לחסום את ${name}?`;
export const BLOCK_DESCRIPTION = 'הפוסטים, התגובות והפרופיל של כל אחד מכם לא יוצגו לשני, והחברות ביניכם תסתיים. אפשר לבטל את החסימה בהגדרות';
export const BLOCK_FAILED_TEXT = 'החסימה לא בוצעה. אפשר לנסות שוב';
export const BLOCKED_TITLE = 'החשבון נחסם';
export const BLOCKED_TEXT = 'אפשר לבטל את החסימה בהגדרות, ברשימת המשתמשים החסומים';
export const BLOCKED_LINK_LABEL = 'למשתמשים החסומים';

export const BLOCKED_HEADING = 'משתמשים חסומים';
export const BLOCKED_LOADING_TEXT = 'טוענים את רשימת החסומים';
export const BLOCKED_LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את רשימת החסומים. אפשר לנסות שוב';
export const BLOCKED_EMPTY_TEXT = 'אין משתמשים חסומים. אפשר לחסום משתמש מהפרופיל שלו';
export const BLOCKED_LIST_LABEL = 'משתמשים חסומים';
export const NO_NAME_TEXT = 'חשבון ללא שם';
export const UNBLOCK_LABEL = 'ביטול החסימה';
export const UNBLOCKED_STATUS = 'החסימה בוטלה';
export const UNBLOCK_FAILED_TEXT = 'ביטול החסימה לא בוצע. אפשר לנסות שוב';
/** Read after a visible label by screen readers only: whose block it is. */
export const ofName = (name: string): string => `של ${name}`;
