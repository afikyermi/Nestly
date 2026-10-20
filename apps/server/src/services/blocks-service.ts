// Blocking a user (FR-REL-002): mutual in effect, it hides posts, comments and the profile both ways and ends the Friendship. The caller is
// already authenticated; each call is one identity transaction. The database decides who may block (an active Regular or Professional
// account), whose block is lifted and everything a block hides; this layer only refuses the caller's own id before the work and names a
// database refusal by its SQLSTATE (42501 not allowed, 23503 no such account).

import type { BlockedAccount } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { deleteBlock, insertBlock, readBlocked } from '../repositories/blocks-repository.js';

export type BlockOutcome = { readonly kind: 'done' } | { readonly kind: 'invalid' } | { readonly kind: 'user_unavailable' } | { readonly kind: 'not_allowed' };

/** PUT: the caller blocks the account (a repeat is the same answer). */
export async function blockUser(database: Database, identity: Identity, blockedId: string): Promise<BlockOutcome> {
  if (blockedId === identity.userId) return { kind: 'invalid' };
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<BlockOutcome> => {
      await insertBlock(tx, blockedId);
      return { kind: 'done' };
    });
  } catch (error) {
    switch (readDatabaseFault(error)?.code) {
      case '42501':
        return { kind: 'not_allowed' };
      case '23503':
        return { kind: 'user_unavailable' };
      case '23514':
        return { kind: 'invalid' };
      default:
        throw error;
    }
  }
}

/** DELETE: lifts the caller's own block; no block is the same answer (no oracle). */
export async function unblockUser(database: Database, identity: Identity, blockedId: string): Promise<BlockOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<BlockOutcome> => {
    await deleteBlock(tx, blockedId);
    return { kind: 'done' };
  });
}

/** GET: the accounts the caller blocked. */
export async function listBlocked(database: Database, identity: Identity): Promise<BlockedAccount[]> {
  return inIdentityTransaction(database, identity, (tx) => readBlocked(tx));
}
