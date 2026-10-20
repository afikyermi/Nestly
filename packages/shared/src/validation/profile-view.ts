// Another Regular's profile as the viewer API returns it (I2 F2.4c1; FR-PRIV-001, §1.4 Basic Public Profile, BR-044, FR-REL-001).
// `profile_view` (the database) decides what the viewer may see; these schemas only check what it returned and what the server sends,
// strictly: a column the database later adds does not reach a client unnoticed. The profile carries no child name, sex, birth date,
// due date, pregnancy week, id, slot, email, consent or tracker data, and no response carries a threshold, window or count (c23).
import { z } from 'zod';
import { PARENT_GENDERS, PROFILE_VIEW_OUTCOMES, RELATIONSHIP_STATES } from '../constants/index.js';
import { mediaImage } from '../media/index.js';

/** A person in B's Friends or the mutual Friends: exactly the user id and the full name (c18). */
export const profileFriendEntry = z.strictObject({ userId: z.guid(), fullName: z.string() });

/** One child's age as completed years and months (F2.3b c14); the web turns it into text with `formatChildAge`. */
export const childAge = z.strictObject({
  years: z.number().int().min(0),
  months: z.number().int().min(0).max(11),
});

/** One row of `nestly.profile_view(text)` as the driver returns it (snake_case). A `limited` row carries nothing but the outcome. */
export const profileViewRow = z.strictObject({
  full_name: z.string().nullable(),
  gender: z.enum(PARENT_GENDERS).nullable(),
  children_count: z.number().int().min(0).nullable(),
  child_ages: z.array(childAge).nullable(),
  is_pregnant: z.boolean().nullable(),
  shows_empty_journey_sentence: z.boolean().nullable(),
  relationship: z.enum(RELATIONSHIP_STATES).nullable(),
  friends: z.array(profileFriendEntry).nullable(),
  mutual_friends: z.array(profileFriendEntry).nullable(),
  outcome: z.enum(PROFILE_VIEW_OUTCOMES),
});

/**
 * GET /api/profiles/:userId, 200. `gender` and `childAges` are null when the profile is Restricted to this viewer (a non-Friend of a
 * Restricted B); `relationship` is null for a Professional viewer (c19). Never a threshold, window, remaining count or reset time.
 */
export const profileViewResponse = z.strictObject({
  fullName: z.string(),
  gender: z.enum(PARENT_GENDERS).nullable(),
  childrenCount: z.number().int().min(0),
  childAges: z.array(childAge).nullable(),
  isPregnant: z.boolean(),
  showsEmptyJourneySentence: z.boolean(),
  relationship: z.enum(RELATIONSHIP_STATES).nullable(),
  friends: z.array(profileFriendEntry),
  mutualFriends: z.array(profileFriendEntry),
  /** I5 (FR-PROFILE-001): the profile photo when it passed the check (others never see an unchecked one); absent or null: none. */
  photo: mediaImage.nullable().optional(),
});

export type ProfileFriendEntry = z.infer<typeof profileFriendEntry>;
export type ChildAge = z.infer<typeof childAge>;
export type ProfileViewRow = z.infer<typeof profileViewRow>;
export type ProfileView = z.infer<typeof profileViewResponse>;
