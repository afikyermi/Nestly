import { z } from 'zod';
import { FULL_NAME_MAX_LENGTH, FULL_NAME_MIN_LENGTH } from '../constants/index.js';
import { checkName } from './text.js';

/** VAL-001. The output is the space-trimmed string. Matches regular_profiles_full_name_check. */
export const fullNameSchema = z.string().transform((raw, ctx) => {
  const result = checkName(raw, FULL_NAME_MIN_LENGTH, FULL_NAME_MAX_LENGTH);
  if (result.ok) return result.value;
  ctx.issues.push({ code: 'custom', message: result.reason === 'empty' ? 'full_name_required' : 'full_name_length', input: raw });
  return z.NEVER;
});
