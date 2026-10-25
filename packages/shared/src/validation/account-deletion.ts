// Account deletion (I9 part 1; FR-SET-002, BR-073, PG-050, VAL-052). The web checks what it sends with these, and the server checks the
// body again before any database work. Neither request names an account: the server acts on the caller alone.
import { z } from 'zod';

/** The regret window (BR-073): the deletion runs this many days after the request. The database sets the date; this is for the copy. */
export const ACCOUNT_DELETION_DAYS = 30;

/**
 * How recent the password check before a request must be (VAL-052): the request is accepted only from a sign-in with the password made
 * within this many seconds, so a session left open on a shared device cannot schedule the deletion.
 */
export const ACCOUNT_DELETION_REAUTH_SECONDS = 5 * 60;

/** POST /api/account/deletion: the confirmation box, ticked (VAL-052). Strict: any other key is refused. */
export const accountDeletionRequest = z.strictObject({ confirmed: z.literal(true) });
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequest>;

/** POST /api/account/deletion/cancel takes no body beyond an empty object. */
export const accountDeletionCancelRequest = z.strictObject({});

/** GET /api/account/deletion, and the answer of a request: none scheduled, or scheduled with its date (ISO, UTC). */
export const accountDeletionStatus = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('none') }),
  z.strictObject({ status: z.literal('scheduled'), dueAt: z.iso.datetime({ offset: true }) }),
]);
export type AccountDeletionStatus = z.infer<typeof accountDeletionStatus>;

/**
 * The error codes of the deletion routes. `reauth_required`: no password sign-in within ACCOUNT_DELETION_REAUTH_SECONDS (ERR-048) ·
 * `group_owner`: the account owns a Group (ERR-026) · `not_allowed`: the account cannot schedule its deletion (a staff account, or
 * already scheduled) · `not_scheduled`: nothing to cancel, or the date has passed.
 */
export const ACCOUNT_DELETION_ERRORS = ['invalid', 'reauth_required', 'group_owner', 'not_allowed', 'not_scheduled'] as const;
export type AccountDeletionError = (typeof ACCOUNT_DELETION_ERRORS)[number];

/** The Admin's home (§16.4): how many deletions wait, and how many of them are past their date. Numbers only. */
export const accountDeletionCounts = z.strictObject({ pending: z.number().int().min(0), overdue: z.number().int().min(0) });
export type AccountDeletionCounts = z.infer<typeof accountDeletionCounts>;
