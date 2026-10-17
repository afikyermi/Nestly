import { registrationCredentialsInput } from '@nestly/shared';
import { RECOVERY_PASSWORD_LENGTH_TEXT } from '@/lib/recovery-texts';

// The forced new-password screen texts (F2.0 c14, copy Q-3) and its check before anything is sent: the password by the shared
// VAL-003 schema.

export const TITLE = 'קביעת סיסמה חדשה';
export const INTRO_TEXT = 'כדי להגן על החשבון, צריך לקבוע סיסמה חדשה. הסיסמה הקודמת בוטלה, וכל המכשירים האחרים נותקו מהחשבון.';

/** VAL-003 · ERR-003: the field error, or null when the password may be sent. */
export const passwordError = (password: string): string | null =>
  registrationCredentialsInput.shape.password.safeParse(password).success ? null : RECOVERY_PASSWORD_LENGTH_TEXT;
