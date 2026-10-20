// Another Regular's profile for a signed-in viewer (I2 F2.4c1; FR-PRIV-001, BR-044, OP-020, AC-078, NFR-SEC-006). One identity
// transaction per open. The database decides everything about the profile: Restricted or Open, the Friend branch, the Friends lists, the
// relationship state, and whether this open is over the limit (profile_view counts it). This layer classifies the viewer first, so a
// stopped account is 403 whatever the target is, then names the outcome. A refused open (`rate_limited`) returns normally, so the
// transaction commits and its Security event persists (c21); a missing configuration (NS001) is thrown by the database, rolled back,
// and answered the same way with `misconfigured` set so the route logs it (c22). No outcome carries a threshold or a count (c23).

import { profileViewResponse, type ProfileView } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { OPEN_LIMITED, rateLimitFault, type RateLimited } from '../lib/profile-open-limit.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import { openProfile } from '../repositories/profile-view-repository.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { readProfilePhotos } from '../repositories/media-repository.js';
import { imageViews } from './media-service.js';
import type { ActorRefusal } from './friends-service.js';

export type ViewOutcome =
  | { readonly kind: 'profile'; readonly profile: ProfileView }
  | { readonly kind: 'unavailable' }
  | RateLimited
  | ActorRefusal;

/**
 * The viewer's state: a stopped account is refused (ERR-037); an account that does not exist is `forbidden`, as in F2.4a. Any active
 * account type may view (a Professional gets the same view, OP-020), so the type is not asked.
 */
async function classifyViewer(tx: IdentityTx): Promise<ActorRefusal | undefined> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new Error('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  return account.status === 'active' ? undefined : { kind: 'stopped' };
}

/** GET /api/profiles/:userId. `targetId` is a lowercase uuid's text form (the route checked it). */
export async function readUserProfile(database: Database, identity: Identity, targetId: string, storage?: MediaStorage): Promise<ViewOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<ViewOutcome> => {
      const refusal = await classifyViewer(tx);
      if (refusal !== undefined) return refusal;
      const [row, ...others] = await openProfile(tx, targetId);
      if (row === undefined) return { kind: 'unavailable' };
      if (others.length > 0) throw new Error('profile_view returned more than one row');
      if (row.outcome === 'limited') return OPEN_LIMITED;
      // I5: the target's photo as the caller's policies show it (profile_photos_select_viewer: passed or approved only, for another person)
      const photos = storage === undefined ? [] : await readProfilePhotos(tx, [targetId]);
      const photo = photos[0] === undefined || storage === undefined ? null : ((await imageViews(storage, photos)).get(photos[0].id) ?? null);
      // Fails closed: a `shown` row with a missing field is a database fault, not a partial profile (the open rolls back with it).
      return {
        kind: 'profile',
        profile: profileViewResponse.parse({
          fullName: row.full_name,
          gender: row.gender,
          childrenCount: row.children_count,
          childAges: row.child_ages,
          isPregnant: row.is_pregnant,
          showsEmptyJourneySentence: row.shows_empty_journey_sentence,
          relationship: row.relationship,
          friends: row.friends,
          mutualFriends: row.mutual_friends,
          ...(photo === null ? {} : { photo }),
        }),
      };
    });
  } catch (error) {
    const limited = rateLimitFault(error);
    if (limited === undefined) throw error;
    return limited;
  }
}
