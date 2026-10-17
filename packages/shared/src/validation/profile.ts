// The own-profile edit body (I2 F2.1; FR-PROFILE-001, AC-015, VAL-001, VAL-006). The web form checks with it before anything
// is sent, and the server with it again on PUT /api/profile, so both judge by the same rule. The body is a strict object:
// any key besides the two, such as a user id, is refused (data-model rules 12, 14). Issue messages are stable codes.
import { z } from 'zod';
import { PARENT_GENDERS, RAW_NAME_MAX_UNITS, type ParentGender } from '../constants/index.js';
import { fullNameSchema } from './names.js';

/** Why an edit body is refused. The two VAL codes come from the field rules; `invalid_body` is everything else (shape, keys). */
export const PROFILE_UPDATE_REASONS = ['full_name_required', 'full_name_length', 'parent_gender_invalid', 'invalid_body'] as const;
export type ProfileUpdateReason = (typeof PROFILE_UPDATE_REASONS)[number];

/** PUT /api/profile: the full name (trimmed on output) and the parent gender, null for "not answered" (Q3). */
export const profileUpdateRequest = z.strictObject({
  // Bounded on the raw string before the code-point count (as registration, F1.4 criterion 2).
  fullName: z.string().max(RAW_NAME_MAX_UNITS, 'full_name_length').pipe(fullNameSchema),
  parentGender: z.enum(PARENT_GENDERS, { error: 'parent_gender_invalid' }).nullable(),
});
export type ProfileUpdate = { fullName: string; parentGender: ParentGender | null };

/** The profile as GET and PUT /api/profile return it. The web checks every answer with it before using it. */
export const ownProfileResponse = z.object({
  fullName: z.string(),
  parentGender: z.enum(PARENT_GENDERS).nullable(),
});
export type OwnProfile = ProfileUpdate;

export type ProfileUpdateCheck = { ok: true; value: ProfileUpdate } | { ok: false; reason: ProfileUpdateReason };

const isFieldReason = (message: string): message is Exclude<ProfileUpdateReason, 'invalid_body'> =>
  PROFILE_UPDATE_REASONS.some((reason) => reason !== 'invalid_body' && reason === message);

/** Parses an edit body. The reason is the first issue's code: a field's rule, or `invalid_body` for a shape or key problem. */
export function checkProfileUpdate(body: unknown): ProfileUpdateCheck {
  const result = profileUpdateRequest.safeParse(body);
  if (result.success) return { ok: true, value: result.data };
  // A wrong shape anywhere (an unknown key, a missing field, a non-object) refuses the body as such, before any field rule.
  if (result.error.issues.some((issue) => !isFieldReason(issue.message) || issue.path.length !== 1)) {
    return { ok: false, reason: 'invalid_body' };
  }
  const [first] = result.error.issues;
  return { ok: false, reason: first !== undefined && isFieldReason(first.message) ? first.message : 'invalid_body' };
}
