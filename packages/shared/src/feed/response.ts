// The feed response (I3 F3.2 a1; FR-FEED-001, FR-FEED-005 r.3, BR-062, BR-065). Strict on purpose: no author id, score, tier, friend
// flag or ranking count can ride along (only the displayed likeCount, commentCount and likedByMe do, F3.3), and an anonymous unit has no `author` key at all (not a null one). The server builds the answer with
// it and the web checks every answer with it.
import { z } from 'zod';
import { JOURNEY_STAGES, POST_AUDIENCES } from '../constants/index.js';
import { mediaImage, POST_MAX_IMAGES } from '../media/index.js';
import { publishedAnnouncement } from '../validation/team.js';
import { feedGroupSuggestion } from '../validation/groups.js';

const audience = z.enum(POST_AUDIENCES);
/** I11: a Professional author carries its "יועץ · תחום" tag (decisions-in-force §4); a Regular author has no `tag` key. */
const author = z.strictObject({ name: z.string().nullable(), tag: z.string().min(1).optional() });
const unitId = z.guid();
const createdAt = z.iso.datetime();

/** The displayed counts and the viewer's own like-state (F3.3 c11, c12): never the score's `n`, never who liked. */
const reactions = { likeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative(), likedByMe: z.boolean() };

const common = { id: unitId, source: z.literal('organic'), audience, stageTag: z.enum(JOURNEY_STAGES).nullable(), createdAt, ...reactions };
const named = { isMine: z.boolean(), isAnonymous: z.literal(false), author };
const anonymousPost = { isMine: z.literal(false), isAnonymous: z.literal(true) };

/**
 * The original of a share (the database forbids anonymous shares, so a share and its original are always named): the fields of the original
 * and nothing else, or just that it is not available (BR-065, AC-081). `isMine` (F3.5 c7): the viewer wrote the original; display only (one's
 * own post is not shared into one's feed, FR-FEED-006), never an id.
 */
export const shareOriginal = z.union([
  z.strictObject({ available: z.literal(true), id: unitId, body: z.string(), audience, createdAt, isAnonymous: z.literal(false), isMine: z.boolean(), author }),
  z.strictObject({ available: z.literal(false) }),
]);
const original = shareOriginal;

/** I5: a post's images the viewer may see, in order (absent: none). */
/** I11 (OP-038): `isHelpRequest` is present (true) only on a post that asks for help. */
const post = {
  ...common,
  kind: z.literal('post'),
  body: z.string(),
  images: z.array(mediaImage).max(POST_MAX_IMAGES).optional(),
  isHelpRequest: z.literal(true).optional(),
  /** I10-C (§11.13): a Group's Highlight in the main feed of its members carries its Group ("מתוך: <name>"); absent on a feed post. */
  group: z.strictObject({ id: z.guid(), name: z.string() }).optional(),
};
const share = { ...common, kind: z.literal('share'), body: z.string().nullable(), sharerText: z.string().nullable(), original };

export const feedUnit = z.union([
  z.strictObject({ ...post, ...named }),
  z.strictObject({ ...post, ...anonymousPost }),
  z.strictObject({ ...share, ...named }),
]);

/** GET /feed: units in display order, the opaque cursor of the next page (null on the last) and the configuration version used. */
export const feedPageResponse = z.strictObject({
  items: z.array(feedUnit),
  nextCursor: z.string().min(1).nullable(),
  configVersion: z.number().int().min(0),
  /** True when the cursor's version could not be used and this page is a new first page. */
  restarted: z.boolean().optional(),
  /** I14 (FR-ADMIN-008): the published System Announcements, newest first, on the first page only. */
  announcements: z.array(publishedAnnouncement).optional(),
  /** I10-C (§11.14): active Public Groups the viewer is not a member of, on the first page only, never inside the ranking. */
  suggestedGroups: z.array(feedGroupSuggestion).optional(),
});

export type FeedUnit = z.infer<typeof feedUnit>;
export type ShareOriginal = z.infer<typeof shareOriginal>;
export type FeedPageResponse = z.infer<typeof feedPageResponse>;
