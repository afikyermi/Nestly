// Comments and replies (I3 F3.3 b1; FR-FEED-003, AC-076; Afik 3א, 18.10). The caller is already authenticated; each call is one identity
// transaction. The database decides everything about permission (who may comment, who reads a comment, who deletes one); this layer names
// the outcome. "post_unavailable" is one outcome for a missing post and one the caller may not read; "parent_invalid" is one for every
// parent that cannot take a reply. A stopped or non-Regular account is told apart first (403), as the feed does. The answer never carries an
// author id: the real author of an anonymous post comes back as `byAuthor` with no `author` key.

import {
  COMMENT_PAGE_SIZE,
  serializeCommentCursor,
  type CommentCursor,
  type CommentThreadPage,
  type CommentView,
  type CommentWrite,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import {
  deleteComment,
  insertComment,
  readComment,
  readReplies,
  readTopLevelComment,
  readTopLevelPage,
  type CommentRow,
} from '../repositories/comments-repository.js';
import { readPost } from '../repositories/posts-repository.js';

/** The caller cannot comment or read a thread: a stopped account (ERR-037), or an account that is not a Regular parent's. */
export type CommentRefusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };

export type CreateOutcome =
  | { readonly kind: 'comment'; readonly comment: CommentView }
  | { readonly kind: 'post_unavailable' }
  | { readonly kind: 'parent_invalid' }
  | CommentRefusal;
export type ThreadOutcome = { readonly kind: 'thread'; readonly page: CommentThreadPage } | { readonly kind: 'post_unavailable' } | CommentRefusal;
export type RemoveOutcome = { readonly kind: 'deleted' } | { readonly kind: 'not_found' } | CommentRefusal;

/** More than one row for one primary key (or none after an insert) cannot happen; seeing it means a policy is wrong. */
export class CommentsFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'CommentsFault';
  }
}

async function classifyViewer(tx: IdentityTx): Promise<CommentRefusal | undefined> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new CommentsFault('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  if (account.status !== 'active') return { kind: 'stopped' };
  return account.accountType === 'regular' ? undefined : { kind: 'forbidden' };
}

function viewOf(row: CommentRow): CommentView {
  return {
    id: row.id,
    parentId: row.parentId,
    body: row.body,
    createdAt: row.createdAt,
    isMine: row.isMine,
    byAuthor: row.byAuthor,
    ...(row.hasAuthor ? { author: { name: row.authorName } } : {}),
  };
}

/** POST: a comment on a readable post, or a reply to one of its readable top-level comments. A refusal by the database propagates and rolls back. */
export async function createComment(database: Database, identity: Identity, postId: string, input: CommentWrite): Promise<CreateOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<CreateOutcome> => {
    const refusal = await classifyViewer(tx);
    if (refusal !== undefined) return refusal;
    if ((await readPost(tx, postId)).length === 0) return { kind: 'post_unavailable' };
    const parentId = input.parentId ?? null;
    if (parentId !== null && (await readTopLevelComment(tx, postId, parentId)).length === 0) return { kind: 'parent_invalid' };
    const ids = await insertComment(tx, { postId, parentId, body: input.body });
    const [id] = ids;
    if (ids.length !== 1 || id === undefined) throw new CommentsFault('unexpected number of comments rows');
    const [row] = await readComment(tx, id);
    if (row === undefined) throw new CommentsFault('the new comment is not readable');
    return { kind: 'comment', comment: viewOf(row) };
  });
}

/** GET: one page of top-level comments, oldest first, each with all its replies oldest first. */
export async function readThread(database: Database, identity: Identity, postId: string, cursor: CommentCursor | null): Promise<ThreadOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<ThreadOutcome> => {
    const refusal = await classifyViewer(tx);
    if (refusal !== undefined) return refusal;
    if ((await readPost(tx, postId)).length === 0) return { kind: 'post_unavailable' };
    const fetched = await readTopLevelPage(tx, postId, cursor, COMMENT_PAGE_SIZE + 1);
    const top = fetched.slice(0, COMMENT_PAGE_SIZE);
    const replies = await readReplies(tx, top.map((row) => row.id));
    const items = top.map((row) => ({ ...viewOf(row), replies: replies.filter((reply) => reply.parentId === row.id).map(viewOf) }));
    const last = top[top.length - 1];
    const nextCursor = fetched.length > COMMENT_PAGE_SIZE && last !== undefined ? serializeCommentCursor({ createdAt: last.cursorAt, id: last.id }) : null;
    return { kind: 'thread', page: { items, nextCursor } };
  });
}

/** DELETE (3א): immediate and permanent, or held when a report is open: the same `deleted` for the commenter either way. */
export async function removeComment(database: Database, identity: Identity, id: string): Promise<RemoveOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<RemoveOutcome> => {
    const refusal = await classifyViewer(tx);
    if (refusal !== undefined) return refusal;
    return (await deleteComment(tx, id)) > 0 ? { kind: 'deleted' } : { kind: 'not_found' };
  });
}
