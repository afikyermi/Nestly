// Groups (I10): one Group's discussion (FR-GRP-001, AC-036, AC-037). The posts the caller may read (posts_group_hide), newest first, the pin first.

import { GROUP_FEED_PAGE_SIZE, feedPageResponse, type FeedPageResponse, type FeedUnit } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readDisplayPosts } from '../repositories/feed-repository.js';
import { readGroupDetail, readGroupPostExists, readGroupPostIds } from '../repositories/groups-repository.js';
import { readCommentCounts, readLikeCounts, readLikedTargetIds } from '../repositories/likes-repository.js';
import type { MediaStorage } from '../media/storage-admin.js';
import type { PostImageRow } from '../repositories/media-repository.js';
import { unitOf } from './feed-service.js';
import { classifyReader, isRefusal } from './membership.js';
import { openPrivateGroupForReview } from '../repositories/group-staff-views-repository.js';
import { imagesByPost, readPostImageRows } from './posts-service.js';


import { asMember, fail, ok, type GroupResult } from './groups-service.js';
import { deletePost } from '../repositories/posts-repository.js';

// ---- the Group's discussion ----------------------------------------------------------------------------------------------------

/** The discussion's cursor: the last post's time (microseconds, UTC) and id. Opaque to the web app. */
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function parseGroupFeedCursor(raw: unknown): { at: string; id: string } | null | 'invalid' {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') return 'invalid';
  const m = CURSOR.exec(raw);
  return m === null || m[1] === undefined || m[2] === undefined ? 'invalid' : { at: m[1], id: m[2] };
}

/**
 * GET /api/groups/:id/posts: the Group's posts the caller may read, newest first, the pinned post first on the first page. The same units as
 * the feed (FeedPageResponse), so the web app shows them with the feed's cards. A Private Group's outsider reads none (posts_group_hide).
 */
export async function readGroupFeed(
  database: Database,
  identity: Identity,
  id: string,
  after: { at: string; id: string } | null,
  storage?: MediaStorage,
): Promise<GroupResult<FeedPageResponse>> {
  const imageRows: PostImageRow[] = [];
  const result = await inIdentityTransaction(
    database,
    identity,
    async (tx): Promise<GroupResult<FeedPageResponse>> => {
      const reader = await classifyReader(tx);
      if (isRefusal(reader)) return reader;
      // I14 completion (§9.7): a staff account reviews; a Private Group opens to it only with PRIVATE_GROUP_MODERATE, audited
      if (reader.kind === 'staff') await openPrivateGroupForReview(tx, id);
      const group = await readGroupDetail(tx, id);
      if (group === undefined) return fail('group_unavailable');
      const pinned = after === null && group.pinnedPostId !== null && (await readGroupPostExists(tx, id, group.pinnedPostId)) ? group.pinnedPostId : null;
      const rows = await readGroupPostIds(tx, id, after, group.pinnedPostId, GROUP_FEED_PAGE_SIZE + 1);
      const page = rows.slice(0, GROUP_FEED_PAGE_SIZE);
      const ids = [...(pinned === null ? [] : [pinned]), ...page.map((row) => row.id)];
      const display = new Map((await readDisplayPosts(tx, ids)).map((row) => [row.id, row]));
      const likeCounts = await readLikeCounts(tx, 'post', ids);
      const commentCounts = await readCommentCounts(tx, ids);
      const liked = await readLikedTargetIds(tx, ids);
      imageRows.push(...(await readPostImageRows(tx, storage, ids)));
      const items = ids.flatMap((postId): FeedUnit[] => {
        const row = display.get(postId);
        const unit = row === undefined ? undefined : unitOf(row, { likeCount: likeCounts.get(postId) ?? 0, commentCount: commentCounts.get(postId) ?? 0, likedByMe: liked.has(postId) });
        return unit === undefined ? [] : [unit];
      });
      const last = page.at(-1);
      const nextCursor = rows.length > GROUP_FEED_PAGE_SIZE && last !== undefined ? `${last.createdAt}_${last.id}` : null;
      return ok(feedPageResponse.parse({ items, nextCursor, configVersion: 0 }));
    },
    { isolationLevel: 'repeatable read' },
  );
  if (result.kind !== 'ok' || imageRows.length === 0) return result;
  const imagesOf = await imagesByPost(storage, imageRows);
  const items = result.value.items.map((item) => {
    const images = item.kind === 'post' ? imagesOf.get(item.id) : undefined;
    return images === undefined ? item : { ...item, images };
  });
  return ok(feedPageResponse.parse({ ...result.value, items }));
}


/**
 * DELETE /api/groups/:id/posts/:postId: the author, or a Group Moderator or higher, removes a post of the Group (FR-GRP-003; held while a report
 * is open, as every delete). The database checks the Roles: a post still readable after a refused delete belongs to an equal or higher Role.
 */
export async function removeGroupPost(database: Database, identity: Identity, id: string, postId: string): Promise<GroupResult<null>> {
  return asMember(database, identity, async (tx) => {
    if ((await readGroupDetail(tx, id)) === undefined) return fail('group_unavailable');
    if ((await deletePost(tx, postId)) > 0) return ok(null);
    return (await readGroupPostExists(tx, id, postId)) ? fail('role_not_allowed') : fail('user_unavailable');
  });
}
