// Friend Requests and Friendships (I2 F2.4a; FR-REL-001, VAL-017, BR-029, AC-034). The web checks what it sends and reads with these,
// and the server checks again, so both judge by the same rule. The send body is a strict object of exactly the target: any other
// key (`requesterId`, `addresseeId`, `status`) is refused, because the requester is set by the database from the caller's token and
// the status moves only by the database's trigger (data-model rules 11-14). An action names the other person by user id in the
// path, never a row id: the caller's own id is never sent.
import { z } from 'zod';

/** A user id as text: `guid`, so Postgres' uuid cast cannot fail (22P02 would be a 500). Lowercased by `checkUserId`. */
const userId = z.guid();

/** POST /api/friend-requests: `{ targetUserId }` and nothing else (VAL-017, c12). */
export const friendRequestBody = z.strictObject({ targetUserId: userId });

export type UserIdCheck = { ok: true; userId: string } | { ok: false };

/** The target of a send. One answer for every refusal (a type, a non-uuid, a missing or an extra key): the body is invalid. */
export function checkFriendRequest(body: unknown): UserIdCheck {
  const result = friendRequestBody.safeParse(body);
  return result.success ? { ok: true, userId: result.data.targetUserId.toLowerCase() } : { ok: false };
}

/** The `:userId` of an action's path (accept, decline, cancel, remove): a uuid's text form, else 400 before any query. */
export function checkUserId(value: unknown): UserIdCheck {
  const result = userId.safeParse(value);
  return result.success ? { ok: true, userId: result.data.toLowerCase() } : { ok: false };
}

/** A person in a list: exactly the user id and the full name (c11, PG-036). Never an email, a gender, a status or a setting. */
const listedPerson = { userId: z.guid(), fullName: z.string() };

/** A person in the incoming or sent list: the time the request was made as an ISO instant. */
export const friendRequestEntry = z.strictObject({ ...listedPerson, requestedAt: z.iso.datetime() });

/** A Friend in the Friends list. */
export const friendEntry = z.strictObject(listedPerson);

/** GET /api/friends: the caller's incoming and sent requests and Friends (c11). The web checks every answer with it. */
export const friendListsResponse = z.strictObject({
  incoming: z.array(friendRequestEntry),
  sent: z.array(friendRequestEntry),
  friends: z.array(friendEntry),
});

export type FriendRequestEntry = z.infer<typeof friendRequestEntry>;
export type FriendEntry = z.infer<typeof friendEntry>;
export type FriendLists = z.infer<typeof friendListsResponse>;
