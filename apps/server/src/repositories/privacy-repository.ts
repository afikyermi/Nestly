// The caller's own privacy settings (I2 F2.3a; schema.md "Drizzle"). Runs inside the caller's identity transaction and nowhere
// else. No `where` and no id anywhere: RLS returns or updates the caller's own row or nothing (regular_profiles_select_own,
// regular_profiles_update_own, both behind is_active_account()); permission is the database's. The UPDATE goes through the
// write model that names exactly the three columns granted UPDATE.

import type { PrivacySettings } from '@nestly/shared';
import { regularProfiles, regularProfilesPrivacyUpdate } from '../db/schema.js';
import type { IdentityTx } from '../db/identity-transaction.js';

/** The settings of the profile rows the caller can see: one for an active Regular account, none otherwise. */
export async function readOwnPrivacySettings(tx: IdentityTx): Promise<PrivacySettings[]> {
  // limit 2: more than one row is a fault the service must see, not a row to ignore.
  return tx
    .select({
      profileVisibility: regularProfiles.profileVisibility,
      isEmptyJourneySentenceShown: regularProfiles.isEmptyJourneySentenceShown,
      isChildBirthdayShared: regularProfiles.isChildBirthdayShared,
    })
    .from(regularProfiles)
    .limit(2);
}

/** Sets the three settings on every row the policy lets the caller update (their own, while active); returns what was stored. */
export async function updateOwnPrivacySettings(tx: IdentityTx, settings: PrivacySettings): Promise<PrivacySettings[]> {
  return tx
    .update(regularProfilesPrivacyUpdate)
    .set({
      profileVisibility: settings.profileVisibility,
      isEmptyJourneySentenceShown: settings.isEmptyJourneySentenceShown,
      isChildBirthdayShared: settings.isChildBirthdayShared,
    })
    .returning({
      profileVisibility: regularProfilesPrivacyUpdate.profileVisibility,
      isEmptyJourneySentenceShown: regularProfilesPrivacyUpdate.isEmptyJourneySentenceShown,
      isChildBirthdayShared: regularProfilesPrivacyUpdate.isChildBirthdayShared,
    });
}
