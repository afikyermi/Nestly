// The feed response (I3 F3.2 a1; FR-FEED-001, FR-FEED-005 r.3, BR-062, BR-065). Strict on purpose: no author id, score, tier, friend
// flag or count can ride along, and an anonymous unit has no `author` key at all (not a null one). The server builds the answer with
// it and the web checks every answer with it.
import { z } from 'zod';
import { JOURNEY_STAGES } from '../constants/index.js';

const audience = z.enum(['everyone', 'friends']);
const author = z.strictObject({ name: z.string().nullable() });
const unitId = z.guid();
const createdAt = z.iso.datetime();

const common = { id: unitId, source: z.literal('organic'), audience, stageTag: z.enum(JOURNEY_STAGES).nullable(), createdAt };
const named = { isMine: z.boolean(), isAnonymous: z.literal(false), author };
const anonymousPost = { isMine: z.literal(false), isAnonymous: z.literal(true) };

/** The original of a share (the database forbids anonymous shares, so a share and its original are always named): the fields of the original and nothing else, or just that it is not available (BR-065, AC-081). */
const original = z.union([
  z.strictObject({ available: z.literal(true), id: unitId, body: z.string(), audience, createdAt, isAnonymous: z.literal(false), author }),
  z.strictObject({ available: z.literal(false) }),
]);

const post = { ...common, kind: z.literal('post'), body: z.string() };
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
});

export type FeedUnit = z.infer<typeof feedUnit>;
export type FeedPageResponse = z.infer<typeof feedPageResponse>;
