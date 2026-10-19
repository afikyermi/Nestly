// Text posts (I3 F3.1a, F3.4; FR-FEED-002, FR-FEED-005, OP-033, Afik 3א/5א/6א). The caller is already authenticated; each call is one identity transaction.
// The database decides everything about permission: who may post (the FKs: a Professional is 23503; a stopped account 42501), who reads
// a post (posts_select_viewer), who edits it and who deletes it. This layer only names the outcome. "Not found" is one outcome for a
// missing post, one the caller may not read and one that is not theirs, so the answer never tells them apart. Nothing reads journey_contexts:
// the stage tag is what the author chose, or none (5א). Faults (a refusal or a constraint) are thrown and mapped by the route. An anonymous
// post is written and answered like any other; its real author is the database's (post_authors) and never part of an answer.

import type { PostAudience, PostPageView, PostView, PostWrite, ShareOriginal } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readCommentCounts, readLikeCounts, readLikedTargetIds } from '../repositories/likes-repository.js';
import { deletePost, insertPost, readPostKind, readPostDetail, updatePost, type PostDetailRow, type PostRow } from '../repositories/posts-repository.js';

export type PostOutcome<T> = { readonly kind: 'post'; readonly post: T } | { readonly kind: 'not_found' };
/** PATCH also answers that an anonymous post cannot become friends-only (F3.4 c6), and that a share cannot be edited (F3.5 c8). */
export type EditOutcome = PostOutcome<PostView> | { readonly kind: 'audience_not_allowed' } | { readonly kind: 'share_not_editable' };
export type DeleteOutcome = { readonly kind: 'deleted' } | { readonly kind: 'not_found' };

/** What a new post is made of: the text and the audience, the author's own tag choice or none, and whether it is anonymous (absent: named). */
export interface NewPost {
  readonly body: string;
  readonly audience: PostAudience;
  readonly stageTag?: PostRow['stageTag'] | undefined;
  readonly isAnonymous?: boolean | undefined;
}

/** More than one row for one primary key (or none after an insert) cannot happen; seeing it means a policy is wrong. */
export class PostsFault extends Error {
  constructor() {
    super('unexpected number of posts rows');
    this.name = 'PostsFault';
  }
}

function single(rows: readonly PostRow[]): PostRow | undefined {
  if (rows.length > 1) throw new PostsFault();
  return rows[0];
}

function viewOf(row: PostRow): PostView {
  return {
    id: row.id,
    body: row.body,
    audience: row.audience,
    stageTag: row.stageTag,
    createdAt: row.createdAt.toISOString(),
    isAnonymous: row.isAnonymous,
  };
}

/** A share's original as the post page shows it (F3.5 c7, BR-065): available only when the caller's policies return it whole, named. */
function originalOf(row: PostDetailRow): ShareOriginal {
  const { originalId, originalBody, originalAudience, originalCreatedAt, originalIsAnonymous } = row;
  if (originalId === null || originalBody === null || originalAudience === null || originalCreatedAt === null || originalIsAnonymous !== false) {
    return { available: false };
  }
  return {
    available: true,
    id: originalId,
    body: originalBody,
    audience: originalAudience,
    createdAt: originalCreatedAt,
    isAnonymous: false,
    isMine: row.originalIsMine,
    author: { name: row.originalAuthorName },
  };
}

/** POST: the caller's post. A refusal by the database (23503, 42501, 23514) propagates and rolls back, the post_authors row with it. */
export async function createPost(database: Database, identity: Identity, input: NewPost): Promise<PostView> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const row = single(
      await insertPost(tx, {
        body: input.body,
        audience: input.audience,
        stageTag: input.stageTag ?? null,
        isAnonymous: input.isAnonymous ?? false,
      }),
    );
    if (row === undefined) throw new PostsFault();
    return viewOf(row);
  });
}

/**
 * GET: the post if the caller may read it; `isMine` says whether the caller is its author, named or anonymous, as the post-detail read computes
 * it in SQL (display only, not a permission; no second comparison here). The displayed counts
 * and the viewer's own like come from the same snapshot (F3.3 c11, c12): one REPEATABLE READ transaction. A post the caller cannot read is 404, not 0.
 */
export async function readPostById(database: Database, identity: Identity, id: string, within?: IdentityTx): Promise<PostOutcome<PostPageView>> {
  const read = async (tx: IdentityTx): Promise<PostOutcome<PostPageView>> => {
    const rows = await readPostDetail(tx, id);
    if (rows.length > 1) throw new PostsFault();
    const [row] = rows;
    if (row === undefined) return { kind: 'not_found' };
    const likeCount = (await readLikeCounts(tx, 'post', [row.id])).get(row.id) ?? 0;
    const commentCount = (await readCommentCounts(tx, [row.id])).get(row.id) ?? 0;
    const likedByMe = (await readLikedTargetIds(tx, [row.id])).has(row.id);
    // F3.5 c7: a share answers its sharer, text and original (never anonymous: the database forbids it); a plain post its fields as before.
    if (row.isShare && !row.isAnonymous) {
      return {
        kind: 'post',
        post: {
          kind: 'share',
          id: row.id,
          body: null,
          sharerText: row.body,
          audience: row.audience,
          stageTag: row.stageTag,
          createdAt: row.createdAt,
          isAnonymous: false,
          isMine: row.isMine,
          author: { name: row.authorName },
          original: originalOf(row),
          likeCount,
          commentCount,
          likedByMe,
        },
      };
    }
    return {
      kind: 'post',
      post: {
        kind: 'post',
        id: row.id,
        body: row.body,
        audience: row.audience,
        stageTag: row.stageTag,
        createdAt: row.createdAt,
        isAnonymous: row.isAnonymous,
        isMine: row.isMine,
        likeCount,
        commentCount,
        likedByMe,
      },
    };
  };
  // F3.5 c3: a share just inserted is read back inside its own transaction (`within`), so a failed read rolls the share back.
  return within === undefined ? inIdentityTransaction(database, identity, read, { isolationLevel: 'repeatable read' }) : read(within);
}

/**
 * PATCH: the named columns of the author's post. 0 rows: not found, whatever the reason. A friends-only audience on an anonymous post is
 * refused by the database before posts_audience_check is reached (the new row fails the update's RLS checks first: 42501), so when the post
 * the caller reads is anonymous and the audience asked is "friends", that 42501 is named audience_not_allowed. A share the caller reads is
 * refused before any update (F3.5 c8: delete and share again); the database refuses it too (NS005, mapped by the route). Any other fault propagates.
 */
export async function editPost(database: Database, identity: Identity, id: string, changes: PostWrite): Promise<EditOutcome> {
  let anonymousToFriends = false;
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<EditOutcome> => {
      const read = await readPostKind(tx, id);
      if (read.some((row) => row.isShare)) return { kind: 'share_not_editable' };
      anonymousToFriends = changes.audience === 'friends' && read.some((row) => row.isAnonymous);
      const row = single(await updatePost(tx, id, changes));
      return row === undefined ? { kind: 'not_found' } : { kind: 'post', post: viewOf(row) };
    });
  } catch (error) {
    if (anonymousToFriends && readDatabaseFault(error)?.code === '42501') return { kind: 'audience_not_allowed' };
    throw error;
  }
}

/** DELETE (3א): immediate and permanent, or held when a report is open: the same `deleted` for the author either way. */
export async function removePost(database: Database, identity: Identity, id: string): Promise<DeleteOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<DeleteOutcome> => {
    return (await deletePost(tx, id)) > 0 ? { kind: 'deleted' } : { kind: 'not_found' };
  });
}
