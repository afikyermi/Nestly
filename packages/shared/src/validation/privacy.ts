// The owner's privacy settings (I2 F2.3a; FR-PRIV-001, BR-037, VAL-027). The web checks what it sends with it, and the server
// with it again on PUT /api/privacy, so both judge by the same rule. The body is a strict object of exactly the three settings:
// any other key — a user id, or a "hide from search" option VAL-027 forbids — is refused (data-model rules 12, 14).
import { z } from 'zod';
import { PROFILE_VISIBILITIES, type ProfileVisibility } from '../constants/index.js';

/** PUT /api/privacy: visibility to non-Friends, the Journey Summary sentence toggle (§1.4, OP-021), the birthday consent (BR-037). */
export const privacySettingsRequest = z.strictObject({
  profileVisibility: z.enum(PROFILE_VISIBILITIES),
  isEmptyJourneySentenceShown: z.boolean(),
  isChildBirthdayShared: z.boolean(),
});

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  isEmptyJourneySentenceShown: boolean;
  isChildBirthdayShared: boolean;
}

/** The settings as GET and PUT /api/privacy return them. The web checks every answer with it before using it. */
export const privacySettingsResponse = z.object({
  profileVisibility: z.enum(PROFILE_VISIBILITIES),
  isEmptyJourneySentenceShown: z.boolean(),
  isChildBirthdayShared: z.boolean(),
});

export type PrivacySettingsCheck = { ok: true; value: PrivacySettings } | { ok: false };

/** Parses a settings body. One answer for every refusal (a value, a type, a missing or an extra key): the body is invalid. */
export function checkPrivacySettings(body: unknown): PrivacySettingsCheck {
  const result = privacySettingsRequest.safeParse(body);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
