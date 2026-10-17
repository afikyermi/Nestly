import { toRecord, type App } from './identity-fixtures.js';

// The one place the F2.4c1 tests learn the viewer API's URL and body field names (I2 F2.4c1, .work/friends/spec.md c16-c24).
// spec.md fixes the status codes and error codes and says "GET /api/profiles/:userId (name may change)"; it names no body key.
// ASSUMED here (a spec gap, reported to ORCHESTRATOR): camelCase of F2.3b's columns --
//   200 { fullName, gender, childrenCount, childAges, isPregnant, showsEmptyJourneySentence, relationship, friends, mutualFriends }
//   friends entries { userId, fullName }; 404 { error: 'unavailable' }; 429 { error: 'rate_limited' }; 403 { error: 'account_unavailable' }
// If BUILDER's routes differ, change this file and nothing else.

export const profileUrl = (id: string): string => `/api/profiles/${id}`;

export function open(app: App, header: string | null, id: string) {
  return app.inject({ method: 'GET', url: profileUrl(id), headers: header === null ? {} : { authorization: header } });
}

export interface Opened {
  status: number;
  body: string;
  headers: Record<string, unknown>;
  json: Record<string, unknown>;
}

export async function opened(app: App, header: string | null, id: string): Promise<Opened> {
  const res = await open(app, header, id);
  let json: Record<string, unknown> = {};
  try {
    json = toRecord(JSON.parse(res.body));
  } catch {
    json = {};
  }
  return { status: res.statusCode, body: res.body, headers: res.headers, json };
}

/** Every key name anywhere in a JSON value. */
export function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...keysDeep(v)]);
  return [];
}

/** What no response may carry (c23): a threshold, a window, a remaining count, a reset time. */
export const LIMIT_WORDS = /limit|window|remaining|reset|threshold|retry|quota|max|seconds|expires/i;
export const LIMIT_HEADERS = /ratelimit|rate-limit|retry-after|x-remaining|x-reset|x-limit/i;
