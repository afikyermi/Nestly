// Write and read a text post (I3 F3.1a, F3.4; FR-FEED-002, FR-FEED-005, OP-033, BR-062, VAL-036; Afik 1א, 5א, 6א). The web checks what it
// sends and the server checks again, by the same rule. Both bodies are strict objects: `authorId`, `status`, `sharedPostId` and `id` are
// refused, because the author is the caller's by the database and status moves only by the database. `isAnonymous` is chosen once, on
// create (absent = false); an anonymous post is always for everyone (6א), so with "friends" it is `audience_not_allowed`. An edit refuses
// `isAnonymous` either way: anonymity never changes after posting. The stage tag is the author's own choice (5א), one of JOURNEY_STAGES or
// none; nothing derives it.
import { z } from 'zod';
import { JOURNEY_STAGES, POST_AUDIENCES, POST_BODY_MAX, type JourneyStage, type PostAudience } from '../constants/index.js';
import { codePointLength } from './text.js';
import { mediaImage, POST_MAX_IMAGES } from '../media/index.js';

export const POST_ERROR_CODES = ['body_required', 'body_too_long', 'audience_not_allowed'] as const;
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

/** POST /api/posts: `{ body, audience, stageTag?, isAnonymous? }` and nothing else; an anonymous post is never friends-only. */
/** I5 (FR-FEED-002, VAL-041): the uploader's own unattached post images, in display order, at most 4, no repeat. */
const imageIds = z
  .array(z.guid())
  .max(POST_MAX_IMAGES)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, 'invalid');

export const createPostSchema = z
  .strictObject({ body: postBody, audience, stageTag: stageTag.optional(), isAnonymous: z.boolean().optional(), imageIds: imageIds.optional() })
  .refine((value) => !(value.isAnonymous === true && value.audience === 'friends'), 'audience_not_allowed');

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

/** A create adds the one-time anonymity choice; present only when the body named it. */
export interface PostCreate extends PostWrite {
  readonly isAnonymous?: boolean;
  /** I5: the post's images (ids of the uploader's post images), in order. */
  readonly imageIds?: readonly string[];
}

export type PostCheck<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' } | { ok: false; reason: PostErrorCode };
export type PostWriteCheck = PostCheck<PostWrite>;
export type PostCreateCheck = PostCheck<PostCreate>;

const isPostErrorCode = (message: string): message is PostErrorCode => POST_ERROR_CODES.some((code) => code === message);

/** The parsed fields, with each absent key left out (not set to undefined). */
interface ParsedWrite {
  readonly body?: string | undefined;
  readonly audience?: PostAudience | undefined;
  readonly stageTag?: JourneyStage | null | undefined;
}

const writeOf = ({ body, audience: chosen, stageTag: tag }: ParsedWrite): PostWrite => ({
  ...(body === undefined ? {} : { body }),
  ...(chosen === undefined ? {} : { audience: chosen }),
  ...(tag === undefined ? {} : { stageTag: tag }),
});

/** A shape, key or enum problem is `invalid` (400); an empty or too long text, or an anonymous friends-only post, is its code (422). */
function refusal(error: z.ZodError): Exclude<PostWriteCheck, { ok: true }> {
  const messages = error.issues.map((issue) => issue.message);
  const [first] = messages;
  if (first !== undefined && messages.every(isPostErrorCode)) return { ok: false, reason: isPostErrorCode(first) ? first : 'invalid' };
  return { ok: false, reason: 'invalid' };
}

export function checkCreatePost(body: unknown): PostCreateCheck {
  const result = createPostSchema.safeParse(body);
  if (!result.success) return refusal(result.error);
  const { isAnonymous, imageIds: images } = result.data;
  return {
    ok: true,
    value: {
      ...writeOf(result.data),
      ...(isAnonymous === undefined ? {} : { isAnonymous }),
      ...(images === undefined || images.length === 0 ? {} : { imageIds: images.map((id) => id.toLowerCase()) }),
    },
  };
}

export function checkUpdatePost(body: unknown): PostWriteCheck {
  const result = updatePostSchema.safeParse(body);
  return result.success ? { ok: true, value: writeOf(result.data) } : refusal(result.error);
}

/**
 * A post as the server answers it. `isMine` only on a read (GET). `body` is null only for a share (F3.5), which F3.1 never writes.
 * `isAnonymous` says the post carries no name (FR-FEED-005); no answer ever carries an author id.
 */
export const postView = z.strictObject({
  id: z.guid(),
  body: z.string().nullable(),
  audience,
  stageTag,
  createdAt: z.iso.datetime(),
  isAnonymous: z.boolean(),
  /** I5: the images the viewer may see, in order (absent: none). */
  images: z.array(mediaImage).max(POST_MAX_IMAGES).optional(),
});
/**
 * The read adds `isMine` and the displayed counts (F3.3 c11, c12): `likeCount`, `commentCount` over the rows the viewer can read; `likedByMe`
 * is the viewer's own. `kind: "post"` tells it from a share's read (F3.5 c7, `shareReadView`).
 */
export const postReadView = postView.extend({
  kind: z.literal('post'),
  isMine: z.boolean(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});

export type PostView = z.infer<typeof postView>;
export type PostReadView = z.infer<typeof postReadView>;
