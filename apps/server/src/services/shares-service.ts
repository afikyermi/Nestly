// Share a post into one's feed (I3 F3.5; FR-FEED-006, BR-064-066). The caller is already authenticated. The database decides everything about
// permission: posts_insert_prepare refuses an unshareable original (NS002: friends-only, anonymous, a share, not active, the caller's own,
// unreadable or unknown, one code for all) and a caller who is not an active Regular account (42501), under the caller's RLS. This layer only
// names the original (BR-066: a share of a share shares its first original) and answers the share as the post page reads it.

import type { PostAudience, ShareReadView } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { insertShare, readSharedPostId } from '../repositories/shares-repository.js';
import { readPostById } from './posts-service.js';

export interface NewShare {
  readonly text: string | null;
  readonly audience: PostAudience;
}

/** No row from an insert, or a new share that its own author cannot read or that does not read as a share: a policy is wrong. */
export class SharesFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'SharesFault';
  }
}

/**
 * POST /posts/:id/shares: the caller's share of `postId`, or of its original when `postId` is a share the caller can read (BR-066). A refusal
 * by the database (NS002, 42501, 23514) propagates and rolls back. The answer is the share as GET /posts/:id reads it, read in the same
 * identity transaction: a failed read-back rolls the share back, so a retry cannot leave a duplicate.
 */
export async function createShare(database: Database, identity: Identity, postId: string, input: NewShare): Promise<ShareReadView> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const [source] = await readSharedPostId(tx, postId);
    const [row] = await insertShare(tx, { text: input.text, audience: input.audience, sharedPostId: source?.sharedPostId ?? postId });
    if (row === undefined) throw new SharesFault('a share insert returned no row');
    const outcome = await readPostById(database, identity, row.id, tx);
    if (outcome.kind !== 'post' || outcome.post.kind !== 'share') throw new SharesFault('a new share does not read as one');
    return outcome.post;
  });
}
