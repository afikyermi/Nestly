// The caller's own profile (I2 F2.1; FR-PROFILE-001, AC-015, UC-10). The caller is already authenticated; each call is one
// identity transaction, so a status change is seen by the next request. When the profile row is not visible, the account
// state tells why, in the same transaction: no account row (an Auth user who never registered, Q4) or an account that is not
// active (suspended or banned, rule 15; one answer, as GET /api/me gives). The words suspended and banned never leave here.

import type { OwnProfile, ProfileUpdate } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnStatuses } from '../repositories/account-state-repository.js';
import { readOwnProfiles, updateOwnProfiles, type ProfileRow } from '../repositories/profile-repository.js';

export type ProfileOutcome =
  | { readonly kind: 'profile'; readonly profile: OwnProfile }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'no_profile' };

/** More than one own row cannot happen with the primary key and the policies; seeing them means a policy is wrong. */
export class ProfileFault extends Error {
  constructor() {
    super('more than one own regular_profiles row');
    this.name = 'ProfileFault';
  }
}

const toProfile = (row: ProfileRow): ProfileOutcome => ({
  kind: 'profile',
  profile: { fullName: row.fullName, parentGender: row.gender },
});

/** Why no profile row was visible or updated: a stopped account, or none at all. Fails closed: only `active` reads as no_profile. */
async function withoutProfile(tx: IdentityTx): Promise<ProfileOutcome> {
  const [status] = await readOwnStatuses(tx);
  if (status === undefined) return { kind: 'no_profile' };
  // An active account with no profile row is not a Regular one; nothing of a profile exists to show or edit.
  return status === 'active' ? { kind: 'no_profile' } : { kind: 'unavailable' };
}

function single(rows: readonly ProfileRow[]): ProfileRow | undefined {
  if (rows.length > 1) throw new ProfileFault();
  return rows[0];
}

export async function readOwnProfile(database: Database, identity: Identity): Promise<ProfileOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const row = single(await readOwnProfiles(tx));
    return row === undefined ? withoutProfile(tx) : toProfile(row);
  });
}

/** Last write wins (Q5): no version or conflict check. A >1-row update throws and the transaction rolls back. */
export async function updateOwnProfile(database: Database, identity: Identity, update: ProfileUpdate): Promise<ProfileOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const row = single(await updateOwnProfiles(tx, { fullName: update.fullName, gender: update.parentGender }));
    return row === undefined ? withoutProfile(tx) : toProfile(row);
  });
}
