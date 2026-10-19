// Write and read a text post (I3 F3.1a; FR-FEED-002, OP-033, BR-062, VAL-036; Afik 1א, 5א). The web checks what it sends and the server
// checks again, by the same rule. Both bodies are strict objects: `isAnonymous`, `authorId`, `status`, `sharedPostId` and `id` are refused,
// because the author is the caller's by the database, a post is always a named active text post here (anonymity is F3.4's), and status
// moves only by the database. The stage tag is the author's own choice (5א), one of JOURNEY_STAGES or none; nothing derives it.
import { z } from 'zod';
import { JOURNEY_STAGES, POST_AUDIENCES, POST_BODY_MAX, type JourneyStage, type PostAudience } from '../constants/index.js';
import { codePointLength } from './text.js';

export const POST_ERROR_CODES = ['body_required', 'body_too_long'] as const;
export type PostErrorCode = (typeof POST_ERROR_CODES)[number];

/** Trimmed, 1..POST_BODY_MAX code points. The two failures carry their code as the issue message. */
const postBody = z
  .string()
  .trim()
  .min(1, 'body_required')
  .refine((value) => !value.includes('\u0000'), 'invalid') // Postgres text cannot hold NUL: a shape error (400), not a 500
  .refine((value) => codePointLength(value) <= POST_BODY_MAX, 'body_too_long');

const audience = z.enum(POST_AUDIENCES);
const stageTag = z.enum(JOURNEY_STAGES).nullable();

/** POST /api/posts: `{ body, audience, stageTag? }` and nothing else. */
export const createPostSchema = z.strictObject({ body: postBody, audience, stageTag: stageTag.optional() });

/** PATCH /api/posts/:id: any of the three, at least one. Absent = unchanged; `stageTag: null` clears the tag. */
export const updatePostSchema = z
  .strictObject({ body: postBody.optional(), audience: audience.optional(), stageTag: stageTag.optional() })
  .refine((value) => Object.keys(value).length > 0, 'invalid');

/** The `:id` of a post path: a uuid's text form (`guid`, so Postgres' cast cannot fail), else the caller answers 404 before any query. */
export const postPathParams = z.object({ id: z.guid() });

export interface PostWrite {
  readonly body?: string;
  readonly audience?: PostAudience;
  readonly stageTag?: JourneyStage | null;
}

export type PostWriteCheck =
  | { ok: true; value: PostWrite }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: PostErrorCode };

const isPostErrorCode = (message: string): message is PostErrorCode => POST_ERROR_CODES.some((code) => code === message);

/** A shape, key or enum problem is `invalid` (400); a body that is only empty or too long is its code (422). */
function judge(result: ReturnType<typeof createPostSchema.safeParse> | ReturnType<typeof updatePostSchema.safeParse>): PostWriteCheck {
  if (result.success) {
    const { body, audience: chosen, stageTag: tag } = result.data;
    return {
      ok: true,
      value: { ...(body === undefined ? {} : { body }), ...(chosen === undefined ? {} : { audience: chosen }), ...(tag === undefined ? {} : { stageTag: tag }) },
    };
  }
  const messages = result.error.issues.map((issue) => issue.message);
  const [first] = messages;
  if (first !== undefined && messages.every(isPostErrorCode)) return { ok: false, reason: isPostErrorCode(first) ? first : 'invalid' };
  return { ok: false, reason: 'invalid' };
}

export const checkCreatePost = (body: unknown): PostWriteCheck => judge(createPostSchema.safeParse(body));
export const checkUpdatePost = (body: unknown): PostWriteCheck => judge(updatePostSchema.safeParse(body));

/** A post as the server answers it. `isMine` only on a read (GET). `body` is null only for a share (F3.5), which F3.1 never writes. */
export const postView = z.strictObject({
  id: z.guid(),
  body: z.string().nullable(),
  audience,
  stageTag,
  createdAt: z.iso.datetime(),
});
/** The read adds `isMine` and the displayed counts (F3.3 c11, c12): `likeCount`, `commentCount` over the rows the viewer can read; `likedByMe` is the viewer's own. */
export const postReadView = postView.extend({
  isMine: z.boolean(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});

export type PostView = z.infer<typeof postView>;
export type PostReadView = z.infer<typeof postReadView>;
