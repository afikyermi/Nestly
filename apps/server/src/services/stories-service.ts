// Stories (I5; FR-FEED-008, VAL-042, ERR-040, AC-102, AC-103, OP-033). The caller is authenticated; each call is one identity transaction.
// Who may publish and who sees a Story is the database's: stories_insert_author (a Regular account), stories_prepare (the caller's own Story
// image; at most 10 in 24 hours under a per-author lock, NS021), stories_select_viewer (unexpired; the author at once, others after the
// image's check, by audience). Read addresses are signed only for the images the caller's own read returned.

import { STORY_CAPTION_MAX, type StoriesResponse, type StoryAudience, type StoryAuthorGroup } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { readVisibleNames } from '../repositories/friends-repository.js';
import { countOwnStoriesToday, insertStory, readLiveStories } from '../repositories/media-repository.js';
import { imageViews } from './media-service.js';

export type CreateStoryOutcome =
  | { readonly kind: 'created'; readonly id: string }
  | { readonly kind: 'limit' } // ERR-040: the eleventh in 24 hours
  | { readonly kind: 'caption_too_long' }
  | { readonly kind: 'not_allowed' }; // not the caller's fresh Story image, used already, not a Regular account, or stopped

export async function createStory(
  database: Database,
  identity: Identity,
  input: { mediaId: string; caption: string | null; audience: StoryAudience },
): Promise<CreateStoryOutcome> {
  if (input.caption !== null && [...input.caption].length > STORY_CAPTION_MAX) return { kind: 'caption_too_long' };
  try {
    const id = await inIdentityTransaction(database, identity, (tx) => insertStory(tx, input));
    return { kind: 'created', id };
  } catch (error) {
    const fault = readDatabaseFault(error);
    if (fault?.code === 'NS021') return { kind: 'limit' };
    // by code only: the image check and the account check are both 42501 in the database, so both answer "this Story cannot be published"
    if (fault?.code === '23505' || fault?.code === '42501' || fault?.code === '23503') return { kind: 'not_allowed' };
    throw error;
  }
}

/** GET /api/stories: the live Stories the caller may see, grouped by author (the caller first, then the newest), and the caller's count today. */
export async function readStories(database: Database, identity: Identity, storage: MediaStorage): Promise<StoriesResponse> {
  const { rows, names, postedToday } = await inIdentityTransaction(database, identity, async (tx) => {
    const live = await readLiveStories(tx);
    const authors = [...new Set(live.map((row) => row.authorId))];
    return { rows: live, names: new Map((await readVisibleNames(tx, authors)).map((n) => [n.userId, n.fullName])), postedToday: await countOwnStoriesToday(tx) };
  });
  const views = await imageViews(
    storage,
    rows.map((row) => ({ id: row.mediaId, status: row.status, width: row.width, height: row.height })),
  );
  const groups = new Map<string, StoryAuthorGroup>();
  for (const row of rows) {
    const image = views.get(row.mediaId);
    if (image === undefined) continue;
    const group = groups.get(row.authorId) ?? { authorId: row.authorId, authorName: names.get(row.authorId) ?? null, isMine: row.isMine, items: [] };
    group.items.push({ id: row.id, caption: row.caption, audience: row.audience, createdAt: row.createdAt, expiresAt: row.expiresAt, image });
    groups.set(row.authorId, group);
  }
  // within a group the oldest first (the order a Story is watched); the caller's own group first, then the most recent author
  const ordered = [...groups.values()].map((group) => ({ ...group, items: [...group.items].reverse() }));
  ordered.sort((a, b) => Number(b.isMine) - Number(a.isMine) || (b.items.at(-1)?.createdAt ?? '').localeCompare(a.items.at(-1)?.createdAt ?? ''));
  return { groups: ordered, postedToday };
}
