// Share a post into one's feed (I3 F3.5; FR-FEED-006, BR-064-066, VAL-038; Afik 2א, 18.10). A share is the sharer's own post (§13): their
// optional text, the audience they pick, and the original by id in the path, never in the body. The body is strict: `sharedPostId`,
// `authorId`, `isAnonymous`, `stageTag`, `status` and `id` are refused, because the original comes from the path (resolved to the first
// original by the server, BR-066), the author is the caller's by the database, a share is never anonymous and never tagged.
import { z } from 'zod';
import { POST_AUDIENCES, POST_BODY_MAX, type PostAudience } from '../constants/index.js';
import { shareOriginal } from '../feed/response.js';
import { postReadView } from './posts.js';
import { codePointLength } from './text.js';

/** Trimmed; blank is no text. At most POST_BODY_MAX code points, like a post (the database's posts_body_length_check holds the same). */
const shareText = z
  .string()
  .refine((value) => !value.includes('\u0000'), 'invalid') // Postgres text cannot hold NUL: a shape error (400), not a 500
  .transform((value) => value.trim())
  .refine((value) => codePointLength(value) <= POST_BODY_MAX, 'body_too_long');

/** POST /api/posts/:id/shares: `{ text?, audience }` and nothing else. The parsed `text` is the trimmed text, or null when absent or blank. */
export const createShareSchema = z
  .strictObject({ text: shareText.nullable().optional(), audience: z.enum(POST_AUDIENCES) })
  .transform(({ text, audience }) => ({ text: text === undefined || text === null || text === '' ? null : text, audience }));

export interface ShareCreate {
  readonly text: string | null;
  readonly audience: PostAudience;
}

export type ShareCreateCheck = { ok: true; value: ShareCreate } | { ok: false; reason: 'invalid' | 'body_too_long' };

/** A shape, key or enum problem is `invalid` (400); a text over the limit is `body_too_long` (422, as a post's). */
export function checkCreateShare(body: unknown): ShareCreateCheck {
  const result = createShareSchema.safeParse(body);
  if (result.success) return { ok: true, value: result.data };
  const tooLong = result.error.issues.length > 0 && result.error.issues.every((issue) => issue.message === 'body_too_long');
  return { ok: false, reason: tooLong ? 'body_too_long' : 'invalid' };
}

/**
 * A share as GET /api/posts/:id (and the 201 of a new share) answers it (F3.5 c7): the sharer's header and text, the original by the feed
 * unit's own schema (available, or only that it is not), the share's own counts. `body` is always null: the sharer's text is `sharerText`.
 * Never an author id, and never the id of an intermediate share (BR-066: a share names its first original only).
 */
export const shareReadView = z.strictObject({
  kind: z.literal('share'),
  id: z.guid(),
  body: z.null(),
  sharerText: z.string().nullable(),
  audience: z.enum(POST_AUDIENCES),
  stageTag: postReadView.shape.stageTag,
  createdAt: z.iso.datetime(),
  isAnonymous: z.literal(false),
  isMine: z.boolean(),
  author: z.strictObject({ name: z.string().nullable() }),
  original: shareOriginal,
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});

/** GET /api/posts/:id: a post (`kind: "post"`, fields as F3.1/F3.3) or a share. */
export const postPageView = z.union([postReadView, shareReadView]);

export type ShareReadView = z.infer<typeof shareReadView>;
export type PostPageView = z.infer<typeof postPageView>;
