import { toRecord, toRecords, type App } from './identity-fixtures.js';

// The one place the F2.4a tests learn the API's URLs and body field names (I2 F2.4a, .work/friends/spec.md c1-c12).
// spec.md fixes the body (`{targetUserId}`), the status codes and the error codes; it names no path and no list key, and
// schema.md only says that every action is "keyed by the counterpart id". ASSUMED here (a spec gap, reported to ORCHESTRATOR);
// if BUILDER's routes differ, change this file and nothing else:
//   POST   /api/friend-requests                   {targetUserId}   send                       -> 201
//   POST   /api/friend-requests/:userId/accept    accept the request that :userId sent to the caller
//   POST   /api/friend-requests/:userId/decline   decline the request that :userId sent to the caller
//   DELETE /api/friend-requests/:userId           cancel the caller's own pending request to :userId
//   DELETE /api/friends/:userId                   remove the Friendship with :userId
//   GET    /api/friends                           { incoming: [{userId, fullName, requestedAt}], sent: [same], friends: [{userId, fullName}] }

export const ACTIONS = ['accept', 'decline', 'cancel', 'remove'] as const;
export type Action = (typeof ACTIONS)[number];

const ACTION_CALL: Record<Action, (id: string) => { method: 'POST' | 'DELETE'; url: string }> = {
  accept: (id) => ({ method: 'POST', url: `/api/friend-requests/${id}/accept` }),
  decline: (id) => ({ method: 'POST', url: `/api/friend-requests/${id}/decline` }),
  cancel: (id) => ({ method: 'DELETE', url: `/api/friend-requests/${id}` }),
  remove: (id) => ({ method: 'DELETE', url: `/api/friends/${id}` }),
};

export const SEND_URL = '/api/friend-requests';
export const LISTS_URL = '/api/friends';

const headersOf = (header: string | null, json: boolean): Record<string, string> => ({
  ...(header === null ? {} : { authorization: header }),
  ...(json ? { 'content-type': 'application/json' } : {}),
});

export function send(app: App, header: string | null, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: SEND_URL,
    headers: headersOf(header, true),
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

export const sendTo = (app: App, header: string | null, targetUserId: string) => send(app, header, { targetUserId });

export function act(app: App, header: string | null, action: Action, id: string) {
  const { method, url } = ACTION_CALL[action](id);
  return app.inject({ method, url, headers: headersOf(header, false) });
}

export const getLists = (app: App, header: string | null) => app.inject({ method: 'GET', url: LISTS_URL, headers: headersOf(header, false) });

export const callOf = (action: Action | 'send' | 'lists', id: string): { method: 'GET' | 'POST' | 'DELETE'; url: string } =>
  action === 'send' ? { method: 'POST', url: SEND_URL } : action === 'lists' ? { method: 'GET', url: LISTS_URL } : ACTION_CALL[action](id);

export interface Entry {
  userId: unknown;
  fullName: unknown;
  keys: string[];
  requestedAt: unknown;
}
export interface Lists {
  keys: string[];
  incoming: Entry[];
  sent: Entry[];
  friends: Entry[];
}

function entriesOf(value: unknown): Entry[] {
  return toRecords(value).map((r) => ({ userId: r.userId, fullName: r.fullName, requestedAt: r.requestedAt, keys: Object.keys(r).sort() }));
}

/** A lists answer parsed; throws (a failed test) if it is not the shape assumed above. */
export function parseLists(body: string): Lists {
  const parsed = toRecord(JSON.parse(body));
  return { keys: Object.keys(parsed).sort(), incoming: entriesOf(parsed.incoming), sent: entriesOf(parsed.sent), friends: entriesOf(parsed.friends) };
}

export const idsOf = (list: Entry[]): unknown[] => list.map((e) => e.userId).sort();
