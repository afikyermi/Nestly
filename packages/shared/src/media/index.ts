// Images (I5: FR-FEED-002, FR-PROFILE-001, FR-FEED-008, NFR-MEDIA-001, VAL-041, VAL-042; Afik's image policy of 20.10.2026). The rules the web,
// the server and the background check share. No DOM, no Node API.
import { z } from 'zod';

/** Where an image belongs (I12 adds a listing's images and a Sponsored Product's one). */
export const MEDIA_KINDS = ['post', 'profile', 'story', 'listing', 'sponsored'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** VAL-041: what the picker accepts from the device (HEIC where the browser can decode it into a picture). */
export const MEDIA_SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
/** VAL-041: the largest source file, 15 MB. */
export const MEDIA_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
/** VAL-041, AC-104: the long side after shrinking. */
export const MEDIA_MAX_SIDE = 2048;
/** What the browser sends after shrinking, and what the server accepts: the server re-encodes it whatever it is. */
export const MEDIA_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaUploadType = (typeof MEDIA_UPLOAD_TYPES)[number];
/** The largest shrunk upload the server reads (a 2,048-pixel picture is far below it). */
export const MEDIA_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** VAL-041: images per post. */
export const POST_MAX_IMAGES = 4;
/** VAL-042: Stories per author in the last 24 hours. */
export const STORIES_PER_DAY = 10;
/** VAL-042: the optional Story text (TBD in the SRS; the recommended default until Afik decides). */
export const STORY_CAPTION_MAX = 200;
/** How long a signed image address works at least, from the answer that carries it (seconds). The page asks again after that. */
export const MEDIA_URL_TTL_SECONDS = 600;
/** The image queue answers at most this many images, oldest first; the screen asks again when it has decided a full page. */
export const MEDIA_QUEUE_PAGE = 50;

export const mediaKindParam = z.enum(MEDIA_KINDS);
export const mediaUploadType = z.enum(MEDIA_UPLOAD_TYPES);

/**
 * One image as an answer shows it. `ready`: checked and shown (url set). `pending`: only its uploader sees it, waiting for the check or for
 * staff ("ממתין לבדיקה"; url set, for the uploader only). `rejected`: not approved (url null; the uploader alone gets this state).
 */
export const MEDIA_STATES = ['ready', 'pending', 'rejected'] as const;
export type MediaState = (typeof MEDIA_STATES)[number];
export const mediaImage = z.strictObject({
  id: z.guid(),
  state: z.enum(MEDIA_STATES),
  url: z.string().url().nullable(),
  width: z.number().int().min(1).max(MEDIA_MAX_SIDE),
  height: z.number().int().min(1).max(MEDIA_MAX_SIDE),
});
export type MediaImage = z.infer<typeof mediaImage>;

/** POST /api/media?kind=: the new image (always pending). */
export const mediaUploadResponse = mediaImage;

/** A post's images on create: the uploader's own unattached post images, in order. */
export const postImageIds = z.array(z.guid()).max(POST_MAX_IMAGES);

/** PUT /api/profile/photo. */
export const profilePhotoBody = z.strictObject({ mediaId: z.guid() });
/** GET and PUT /api/profile/photo: the caller's own photo (any state), or null. */
export const profilePhotoResponse = z.strictObject({ photo: mediaImage.nullable() });
/** POST /api/stories. */
export const storyCreatedResponse = z.strictObject({ id: z.guid() });

// ---- Stories (FR-FEED-008) --------------------------------------------------------------------------------------------------------
export const STORY_AUDIENCES = ['everyone', 'friends'] as const;
export type StoryAudience = (typeof STORY_AUDIENCES)[number];

export const storyCaption = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => [...value].length <= STORY_CAPTION_MAX, 'caption_too_long');

/** POST /api/stories: the uploaded Story image, optional text, the audience. */
export const createStoryBody = z.strictObject({
  mediaId: z.guid(),
  caption: storyCaption.optional(),
  audience: z.enum(STORY_AUDIENCES),
});
export type CreateStoryBody = z.infer<typeof createStoryBody>;

export const storyItem = z.strictObject({
  id: z.guid(),
  caption: z.string().nullable(),
  audience: z.enum(STORY_AUDIENCES),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  image: mediaImage,
});
export type StoryItem = z.infer<typeof storyItem>;

/** GET /api/stories: the live Stories the caller may see, by author (the caller's own first). Never anonymous. */
export const storyAuthorGroup = z.strictObject({
  authorId: z.guid(),
  authorName: z.string().nullable(),
  isMine: z.boolean(),
  items: z.array(storyItem).min(1),
});
export const storiesResponse = z.strictObject({ groups: z.array(storyAuthorGroup), postedToday: z.number().int().min(0) });
export type StoriesResponse = z.infer<typeof storiesResponse>;
export type StoryAuthorGroup = z.infer<typeof storyAuthorGroup>;

// ---- the approval queue (Afik 20.10.2026; CONTENT_MODERATE) --------------------------------------------------------------------
export const MEDIA_DECISIONS = ['approved', 'rejected', 'suspected'] as const;
export type MediaDecision = (typeof MEDIA_DECISIONS)[number];
// I14 completion B (Afik 21.10.2026): hash_match, an upload that matched the block list of images marked as suspected child abuse
export const QUEUE_REASONS = ['blocked', 'unsure', 'error', 'hash_match'] as const;
export type QueueReason = (typeof QUEUE_REASONS)[number];

export const mediaDecisionBody = z.strictObject({ decision: z.enum(MEDIA_DECISIONS), isChild: z.boolean() });
/** POST /api/admin/media/:id/match: staff decide a block-list match once: confirmed (a suspicion in their name), or not_abuse (a false
 *  positive: the listed hashes it matched leave the list, audited). I14 completion B, Afik 21.10.2026. */
export const MATCH_DECISIONS = ['confirmed', 'not_abuse'] as const;
export type MatchDecision = (typeof MATCH_DECISIONS)[number];
export const mediaMatchDecisionBody = z.strictObject({ decision: z.enum(MATCH_DECISIONS) });
export type MediaDecisionBody = z.infer<typeof mediaDecisionBody>;

export const mediaQueueItem = z.strictObject({
  id: z.guid(),
  kind: z.enum(MEDIA_KINDS),
  queueReason: z.enum(QUEUE_REASONS),
  /** The label the model scored highest among those it checks, and that score (0 to 1); null when the check failed. */
  topLabel: z.string().nullable(),
  topScore: z.number().min(0).max(1).nullable(),
  /** Staff marked "יש בתמונה ילד" (kept with the decision; it does not keep the image out of the training set). */
  isChild: z.boolean(),
  createdAt: z.iso.datetime(),
  url: z.string().url().nullable(),
  width: z.number().int(),
  height: z.number().int(),
});
export type MediaQueueItem = z.infer<typeof mediaQueueItem>;
export const mediaQueueResponse = z.strictObject({ items: z.array(mediaQueueItem) });

/** POST /api/admin/media/:id/removal: a checked image removed after a report, or as a suspicion of child abuse (CONTENT_MODERATE and
 *  REPORTS_VIEW). The uploader sees the same rejection either way. */
export const mediaRemovalBody = z.strictObject({ suspected: z.boolean() });
export type MediaRemovalBody = z.infer<typeof mediaRemovalBody>;
export type MediaQueueResponse = z.infer<typeof mediaQueueResponse>;

// ---- the background check (decisions-in-force.md §2) ----------------------------------------------------------------------------
/** The model's labels that block an image: exposed genitals, buttocks, anus and female breast (breastfeeding included). */
export const BLOCKING_LABELS = ['FEMALE_GENITALIA_EXPOSED', 'MALE_GENITALIA_EXPOSED', 'BUTTOCKS_EXPOSED', 'ANUS_EXPOSED', 'FEMALE_BREAST_EXPOSED'] as const;

/** The default thresholds (configuration on the server): at or above T_block the image is blocked, between T_low and T_block unsure. */
export const MEDIA_CHECK_DEFAULTS = { blockThreshold: 0.6, lowThreshold: 0.25, maxAttempts: 3 } as const;

export type CheckVerdict = { readonly status: 'passed' } | { readonly status: 'queued'; readonly reason: 'blocked' | 'unsure' };

/** The decision rule: the highest score of a blocking label against the two thresholds. */
export function verdictOf(scores: Readonly<Record<string, number>>, thresholds: { blockThreshold: number; lowThreshold: number }): CheckVerdict {
  const top = Math.max(0, ...BLOCKING_LABELS.map((label) => scores[label] ?? 0));
  if (top >= thresholds.blockThreshold) return { status: 'queued', reason: 'blocked' };
  if (top >= thresholds.lowThreshold) return { status: 'queued', reason: 'unsure' };
  return { status: 'passed' };
}
