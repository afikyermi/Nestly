// Hide a post for oneself, and undo it (I3 F3.9; FR-ALG-009 — the Hide action only; Afik 8א: for me only, never a matching signal). The path's
// `:id` is a post id; neither call takes a body. The error codes are the whole answer to a refused call: no reason beyond them, no author id.
import { z } from 'zod';

/** PUT|DELETE /api/posts/:id/hide: a uuid's text form (`guid`, so Postgres' cast cannot fail), else the server answers 400 before any query. */
export const hidePathParams = z.object({ id: z.guid() });

/**
 * What a refused hide answers: 400 `invalid` (not a uuid, or a body), 404 `post_unavailable` (unknown or not readable: one body for every
 * reason), 409 `own_post` (the caller's own post, named or anonymous), 403 `not_allowed` (not an active Regular account).
 */
export const HIDE_ERROR_CODES = ['invalid', 'post_unavailable', 'own_post', 'not_allowed'] as const;
export type HideErrorCode = (typeof HIDE_ERROR_CODES)[number];

/** The body of a refused hide or undo, as the web reads it. Any other code (the session guard's included) is not one of these. */
export const hideErrorBody = z.object({ error: z.enum(HIDE_ERROR_CODES) });
