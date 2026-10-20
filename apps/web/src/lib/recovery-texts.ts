import { PASSWORD_MIN_LENGTH } from '@nestly/shared';

// The texts of the recovery screens (F1.6). The server answers with a status; this is the only place a status becomes text, so no
// server string reaches the DOM. A mismatch names neither the email nor an answer, and a lock gives no number (criterion 16).
export const RECOVERY_MISMATCH_TEXT = 'הפרטים שהוזנו אינם תואמים. אפשר לנסות שוב';
export const RECOVERY_LOCKED_TEXT = 'בוצעו יותר מדי ניסיונות. אפשר לנסות שוב מאוחר יותר';
/** ERR-043, the permanent lock of the ladder (NFR-SEC-010; Afik 17.10.2026). */
export const RECOVERY_LOCKED_PERMANENTLY_TEXT = 'השחזור לחשבון הזה נחסם. לשחרור אפשר לפנות לתמיכה';
export const RECOVERY_UNAVAILABLE_TEXT = 'לא הצלחנו להשלים את הפעולה כרגע. אפשר לנסות שוב מאוחר יותר';
export const RECOVERY_PASSWORD_LENGTH_TEXT = `הסיסמה צריכה להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`; // VAL-003 · ERR-003
