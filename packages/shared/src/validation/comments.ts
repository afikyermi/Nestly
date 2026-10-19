// Write and read a comment or a reply (I3 F3.3 b1; FR-FEED-003, AC-076, VAL-036, BR-062; Afik 3א, 18.10). The web checks what it sends and the
// server checks again, by the same rule. The create body is strict: `authorId`, `byAuthor`, `status` and `postId` are refused, because the
// commenter is the caller's by the database, "המחבר" is the database's mark, and the post is the path's. A response never carries a user id.
import { z } from 'zod';
import { COMMENT_BODY_MAX } from '../constants/index.js';
import { dbTimestamp } from '../feed/cursor.js';
import { codePointLength } from './text.js';

export const COMMENT_ERROR_CODES = ['body_required', 'body_too_long'] as const;
export type CommentErrorCode = (typeof COMMENT_ERROR_CODES)[number];

/** Trimmed, 1..COMMENT_BODY_MAX code points. The two failures carry their code as the issue message. */
const commentBody = z
  .string()
  .trim()
  .min(1, 'body_required')
  .refine((value) => !value.includes('\u0000'), 'invalid') // Postgres text cannot hold NUL: a shape error (400), not a 500
  .refine((value) => codePointLength(value) <= COMMENT_BODY_MAX, 'body_too_long');

/** POST /api/posts/:id/comments: `{ body, parentId? }` and nothing else. */
export const createCommentSchema = z.strictObject({ body: commentBody, parentId: z.guid().optional() });

/** The `:id` of a post or comment path: a uuid's text form, else the caller answers 404 before any query. */
export const commentPathParams = z.object({ id: z.guid() });

export interface CommentWrite {
  readonly body: string;
  readonly parentId?: string;
}

export type CommentWriteCheck =
  | { ok: true; value: CommentWrite }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: CommentErrorCode };

const isCommentErrorCode = (message: string): message is CommentErrorCode => COMMENT_ERROR_CODES.some((code) => code === message);

/** A shape or key problem is `invalid` (400); a body that is only empty or too long is its code (422). */
export function checkCreateComment(input: unknown): CommentWriteCheck {
  const result = createCommentSchema.safeParse(input);
  if (result.success) {
    const { body, parentId } = result.data;
    return { ok: true, value: { body, ...(parentId === undefined ? {} : { parentId: parentId.toLowerCase() }) } };
  }
  const messages = result.error.issues.map((issue) => issue.message);
  const [first] = messages;
  if (first !== undefined && messages.every(isCommentErrorCode)) return { ok: false, reason: isCommentErrorCode(first) ? first : 'invalid' };
  return { ok: false, reason: 'invalid' };
}

/**
 * A comment as the server answers it. `author` is absent exactly when the commenter is the anonymous post's author ("המחבר", `byAuthor`):
 * the answer then carries no name, no id and nothing to tell who. `name` is what regular_names shows the viewer, else null.
 */
export const commentView = z.strictObject({
  id: z.guid(),
  parentId: z.guid().nullable(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  isMine: z.boolean(),
  byAuthor: z.boolean(),
  author: z.strictObject({ name: z.string().nullable() }).optional(),
});
/** `replies`: the first COMMENT_INLINE_REPLIES, oldest first; `replyCount`: all the replies the viewer can read under it. */
export const commentThreadItem = commentView.extend({ replies: z.array(commentView), replyCount: z.number().int().nonnegative() });
export const commentThreadPage = z.strictObject({ items: z.array(commentThreadItem), nextCursor: z.string().nullable() });

/** GET /api/comments/:id/replies: one page of replies, oldest first. */
export const commentReplyPage = z.strictObject({ items: z.array(commentView), nextCursor: z.string().nullable() });

export type CommentView = z.infer<typeof commentView>;
export type CommentThreadItem = z.infer<typeof commentThreadItem>;
export type CommentThreadPage = z.infer<typeof commentThreadPage>;
export type CommentReplyPage = z.infer<typeof commentReplyPage>;

const COMMENT_CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The last top-level comment of a page: the database's own timestamp text (microseconds, never a JS Date) and the id. Opaque to the client. */
export interface CommentCursor {
  readonly createdAt: string;
  readonly id: string;
}

export const serializeCommentCursor = (cursor: CommentCursor): string => `${cursor.createdAt}~${cursor.id}`;

/** Text from the query string to a cursor, or null for anything that is not exactly one: the route answers 400 `cursor_invalid`. */
export function parseCommentCursor(text: unknown): CommentCursor | null {
  if (typeof text !== 'string' || text.length > 100) return null;
  const match = COMMENT_CURSOR.exec(text);
  const createdAt = match?.[1]?.toUpperCase();
  const id = match?.[2]?.toLowerCase();
  if (createdAt === undefined || id === undefined || !dbTimestamp.safeParse(createdAt).success) return null;
  return { createdAt, id };
}
