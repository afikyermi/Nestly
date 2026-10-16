// Texts the registration and login screens both show (ERR-003, ERR-001, Q6 of F1.4). They live here, not in either feature, because a
// Feature never imports another Feature.
export const EMAIL_REQUIRED_TEXT = 'יש למלא כתובת אימייל'; // AC-003 · ERR-003
export const EMAIL_INVALID_TEXT = 'כתובת האימייל אינה תקינה'; // VAL-002 · ERR-003
export const RATE_LIMITED_TEXT = 'בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות'; // Q6
export const GENERIC_ERROR_TEXT = 'משהו השתבש. אפשר לנסות שוב';
export const STOPPED_TEXT = 'הכניסה לחשבון הזה אינה זמינה כרגע'; // ERR-037 · DR-1: no reason, no length
