// Registration account creation (I1 F1.4 part b; FR-REG-004, AC-091). The caller is already authenticated: the route
// has the Auth user's verified identity. This layer writes the account under that identity, in one transaction (rule
// 11), and calls no Auth. The consent versions are the shared constants, never anything the client sent (criterion 9).

import {
  CONSENT_PRIVACY_VERSION,
  CONSENT_TERMS_VERSION,
  type RegistrationStep1,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { accountExists, insertRegularAccount } from '../repositories/registration-repository.js';

export type RegistrationOutcome = { readonly kind: 'created' } | { readonly kind: 'already_registered' };

/** The primary key of `users`: the one signal that this Auth user already has an account (schema.md "Limits"). */
const USERS_PRIMARY_KEY = 'users_pkey';
const UNIQUE_VIOLATION = '23505';

/** True when the identity's own account is visible. A suspended account is not; the write then settles it with 23505. */
export function hasAccount(database: Database, identity: Identity): Promise<boolean> {
  return inIdentityTransaction(database, identity, accountExists);
}

/**
 * Writes the account for `identity` from validated step 1. `already_registered` when the users row exists (also a
 * concurrent twin request, and an account the caller cannot see); nothing is written then. Any other failure throws and
 * leaves no row in any table.
 */
export async function createRegistration(
  database: Database,
  identity: Identity,
  step1: RegistrationStep1,
): Promise<RegistrationOutcome> {
  try {
    await inIdentityTransaction(database, identity, (tx) =>
      insertRegularAccount(tx, {
        fullName: step1.fullName,
        parentGender: step1.parentGender,
        journeys: step1.stages.map((stage) => ({ stage, dueDate: stage === 'pregnant' ? step1.dueDate : null })),
        children: step1.children,
        consent: { termsVersion: CONSENT_TERMS_VERSION, privacyVersion: CONSENT_PRIVACY_VERSION },
      }),
    );
    return { kind: 'created' };
  } catch (error) {
    const fault = readDatabaseFault(error);
    if (fault?.code === UNIQUE_VIOLATION && fault.constraint === USERS_PRIMARY_KEY) return { kind: 'already_registered' };
    throw error;
  }
}
