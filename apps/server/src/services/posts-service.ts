// Text posts (I3 F3.1a; FR-FEED-002, OP-033, Afik 3א/5א). The caller is already authenticated; each call is one identity transaction.
// The database decides everything about permission: who may post (the FKs: a Professional is 23503; a stopped account 42501), who reads
// a post (posts_select_viewer), who edits it and who deletes it. This layer only names the outcome. "Not found" is one outcome for a
// missing post, one the caller may not read and one that is not theirs, so the answer never tells them apart. Nothing reads journey_contexts:
// the stage tag is what the author chose, or none (5א). Faults (a refusal or a constraint) are thrown and mapped by the route.

import type { PostAudience, PostReadView, PostView, PostWrite } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readCommentCounts, readLikeCounts, readLikedTargetIds } from '../repositories/likes-repository.js';
import { deletePost, insertPost, readPost, updatePost, type PostRow } from '../repositories/posts-repository.js';

export type PostOutcome<T> = { readonly kind: 'post'; readonly post: T } | { readonly kind: 'not_found' };
export type DeleteOutcome = { readonly kind: 'deleted' } | { readonly kind: 'not_found' };

/** What a new post is made of: the text and the audience, and the author's own tag choice or none. */
export interface NewPost {
  readonly body: string;
  readonly audience: PostAudience;
  readonly stageTag?: PostRow['stageTag'] | undefined;
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
  };
}

/** POST: the caller's post. A refusal by the database (23503, 42501, 23514) propagates and rolls back. */
export async function createPost(database: Database, identity: Identity, input: NewPost): Promise<PostView> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const row = single(
      await insertPost(tx, {
        body: input.body,
        audience: input.audience,
        stageTag: input.stageTag ?? null,
      }),
    );
    if (row === undefined) throw new PostsFault();
    return viewOf(row);
  });
}

/**
 * GET: the post if the caller may read it; `isMine` says whether the caller is its author (display only, not a permission). The displayed counts
 * and the viewer's own like come from the same snapshot (F3.3 c11, c12): one REPEATABLE READ transaction. A post the caller cannot read is 404, not 0.
 */
export async function readPostById(database: Database, identity: Identity, id: string): Promise<PostOutcome<PostReadView>> {
  return inIdentityTransaction(
    database,
    identity,
    async (tx): Promise<PostOutcome<PostReadView>> => {
      const row = single(await readPost(tx, id));
      if (row === undefined) return { kind: 'not_found' };
      const likeCount = (await readLikeCounts(tx, 'post', [row.id])).get(row.id) ?? 0;
      const commentCount = (await readCommentCounts(tx, [row.id])).get(row.id) ?? 0;
      const likedByMe = (await readLikedTargetIds(tx, [row.id])).has(row.id);
      return {
        kind: 'post',
        post: {
          ...viewOf(row),
          isMine: row.authorId !== null && row.authorId === identity.userId.toLowerCase(),
          likeCount,
          commentCount,
          likedByMe,
        },
      };
    },
    { isolationLevel: 'repeatable read' },
  );
}

/** PATCH: the named columns of the author's post. 0 rows: not found, whatever the reason. */
export async function editPost(database: Database, identity: Identity, id: string, changes: PostWrite): Promise<PostOutcome<PostView>> {
  return inIdentityTransaction(database, identity, async (tx): Promise<PostOutcome<PostView>> => {
    const row = single(await updatePost(tx, id, changes));
    return row === undefined ? { kind: 'not_found' } : { kind: 'post', post: viewOf(row) };
  });
}

/** DELETE (3א): immediate and permanent, or held when a report is open: the same `deleted` for the author either way. */
export async function removePost(database: Database, identity: Identity, id: string): Promise<DeleteOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<DeleteOutcome> => {
    return (await deletePost(tx, id)) > 0 ? { kind: 'deleted' } : { kind: 'not_found' };
  });
}
