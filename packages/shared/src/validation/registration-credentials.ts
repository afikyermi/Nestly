// Registration step 2 (FR-REG-004, VAL-002, VAL-003): the email and the password, and the consent declaration.
// Every issue message is a stable code from CREDENTIALS_ERROR_CODES; the web app maps codes to ERR-003 texts.
import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  EMAIL_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RAW_EMAIL_MAX_UNITS,
  RAW_PASSWORD_MAX_UNITS,
} from '../constants/index.js';
import { codePointLength } from './text.js';

export const CREDENTIALS_ERROR_CODES = ['email_required', 'email_invalid', 'password_length'] as const;
export type CredentialsErrorCode = (typeof CREDENTIALS_ERROR_CODES)[number];

/** VAL-002: 3-254 code points, one `@`, a dot inside the domain, no whitespace. Judged after trimming. */
function isValidEmail(value: string): boolean {
  const length = codePointLength(value);
  if (length < EMAIL_MIN_LENGTH || length > EMAIL_MAX_LENGTH) return false;
  if (/\s/u.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local = '', domain = ''] = parts;
  if (local === '') return false;
  const dot = domain.indexOf('.');
  return dot > 0 && !domain.endsWith('.');
}

const email = z
  .string()
  .max(RAW_EMAIL_MAX_UNITS, 'email_invalid')
  .transform((raw, ctx) => {
    const value = raw.trim();
    if (value === '') ctx.issues.push({ code: 'custom', message: 'email_required', input: raw });
    else if (!isValidEmail(value)) ctx.issues.push({ code: 'custom', message: 'email_invalid', input: raw });
    return value;
  });

/** VAL-003: not trimmed, no composition rule; spaces and Hebrew allowed. Length in code points. */
const password = z
  .string()
  .max(RAW_PASSWORD_MAX_UNITS, 'password_length')
  .refine(
    (value) => {
      const length = codePointLength(value);
      return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
    },
    { error: 'password_length' },
  );

/** The two credential fields as typed. Output: the trimmed email and the password untouched. */
export const registrationCredentialsInput = z.strictObject({ email, password });
export type RegistrationCredentialsInput = z.input<typeof registrationCredentialsInput>;
export type RegistrationCredentials = z.output<typeof registrationCredentialsInput>;

/** The consent declaration (BR-068, AC-084): the literal `true`. `false`, absent and `"true"` are refused. */
export const registrationConsentInput = z.literal(true, { error: 'consent_required' });
