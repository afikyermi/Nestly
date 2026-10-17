// The caller's own RegularProfile (I2 F2.1; schema.md "Server write model"). Runs inside the caller's identity transaction
// and nowhere else. No `where` and no id anywhere: RLS returns or updates the caller's own row or nothing
// (regular_profiles_select_own, regular_profiles_update_own, both behind is_active_account()); permission is the database's.
// The UPDATE goes through the write model that names exactly the columns granted UPDATE.

import type { ParentGender } from '@nestly/shared';
import { regularProfiles, regularProfilesUpdate } from '../db/schema.js';
import type { IdentityTx } from '../db/identity-transaction.js';

export interface ProfileRow {
  readonly fullName: string;
  readonly gender: ParentGender | null;
}

/** The profile rows the caller can see: one for an active Regular account, none otherwise. */
export async function readOwnProfiles(tx: IdentityTx): Promise<ProfileRow[]> {
  // limit 2: more than one row is a fault the service must see, not a row to ignore.
  return tx.select({ fullName: regularProfiles.fullName, gender: regularProfiles.gender }).from(regularProfiles).limit(2);
}

/** Sets both fields on every row the policy lets the caller update (their own, while active) and returns what was stored. */
export async function updateOwnProfiles(tx: IdentityTx, profile: ProfileRow): Promise<ProfileRow[]> {
  return tx
    .update(regularProfilesUpdate)
    .set({ fullName: profile.fullName, gender: profile.gender })
    .returning({ fullName: regularProfilesUpdate.fullName, gender: regularProfilesUpdate.gender });
}
