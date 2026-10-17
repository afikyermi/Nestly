// The caller's own privacy settings (I2 F2.3a; FR-PRIV-001, BR-037). The caller is already authenticated; each call is one
// identity transaction, so a status change is seen by the next request. The settings are columns of the caller's own
// regular_profiles row, so when that row is not visible the answer is the profile's: no account row, or a stopped account
// (profile-service.ts `withoutProfile`). One Save sets the three together; last write wins (Q2).

import type { PrivacySettings } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnPrivacySettings, updateOwnPrivacySettings } from '../repositories/privacy-repository.js';
import { withoutProfile, type NoProfileOutcome } from './profile-service.js';

export type PrivacyOutcome = { readonly kind: 'settings'; readonly settings: PrivacySettings } | NoProfileOutcome;

/** More than one own row cannot happen with the primary key and the policies; seeing them means a policy is wrong. */
export class PrivacyFault extends Error {
  constructor() {
    super('more than one own regular_profiles row');
    this.name = 'PrivacyFault';
  }
}

function single(rows: readonly PrivacySettings[]): PrivacySettings | undefined {
  if (rows.length > 1) throw new PrivacyFault();
  return rows[0];
}

export async function readOwnPrivacy(database: Database, identity: Identity): Promise<PrivacyOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const settings = single(await readOwnPrivacySettings(tx));
    return settings === undefined ? withoutProfile(tx) : { kind: 'settings', settings };
  });
}

/** A >1-row update throws and the transaction rolls back. 0 rows: no profile row, or a stopped account; nothing changed. */
export async function updateOwnPrivacy(database: Database, identity: Identity, update: PrivacySettings): Promise<PrivacyOutcome> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const settings = single(await updateOwnPrivacySettings(tx, update));
    return settings === undefined ? withoutProfile(tx) : { kind: 'settings', settings };
  });
}
