// Blocking a user (FR-REL-002): block from another person's profile, see and lift one's blocks in Settings. The path's `:id` is the other
// account's id; no call takes a body, and no call names the caller (the database binds the blocker to the token's user).
import { z } from 'zod';

/** PUT|DELETE /api/users/:id/block: a uuid's text form (`guid`, so Postgres' cast cannot fail), else 400 before any query. */
export const blockPathParams = z.object({ id: z.guid() });

/**
 * What a refused block answers: 400 `invalid` (not a uuid, a body, or the caller's own id), 404 `user_unavailable` (no such account),
 * 403 `not_allowed` (the caller may not block: not an active Regular or Professional account).
 */
export const BLOCK_ERROR_CODES = ['invalid', 'user_unavailable', 'not_allowed'] as const;
export type BlockErrorCode = (typeof BLOCK_ERROR_CODES)[number];
export const blockErrorBody = z.object({ error: z.enum(BLOCK_ERROR_CODES) });

/** One account the caller blocked: its id, its name when it has one (a Professional account has none), and when. */
export const blockedAccount = z.object({ userId: z.guid(), fullName: z.string().nullable(), blockedAt: z.string() });
export type BlockedAccount = z.infer<typeof blockedAccount>;

/** GET /api/blocks: the accounts the caller blocked, newest first. */
export const blockedListResponse = z.object({ blocked: z.array(blockedAccount) });
export type BlockedList = z.infer<typeof blockedListResponse>;
