import {
  cycleResponse,
  homeResponse,
  trackerEventsResponse,
  type CycleResponse,
  type HomeResponse,
  type Period,
  type TrackerEventDto,
  type TrackerKind,
} from '@nestly/shared';

// GET /api/home, the tracker event routes and the cycle routes (I6). No user id is ever sent: the server acts on the token's user, and
// an event or a cycle entry is named by its row id only. Health data about children and the user: it goes in a request body or a
// query only, never in storage or a log line. Only the status, the one `error` code and a body that passes the shared response
// schema are read.
export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable (ERR-037)
  | { kind: 'not-found' } // 404 not_found
  | { kind: 'duplicate-date' } // 409 duplicate_date: a cycle entry for that day exists
  | { kind: 'invalid'; reason: string } // 400 invalid: the server refused the values
  | { kind: 'failed' }; // anything else

const FAILED = { kind: 'failed' } as const;

function field(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, key) : undefined;
}

async function request<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  parse: (json: unknown) => T | null,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return FAILED;
  }
  const code = field(json, 'error');
  if (response.status === 403) return code === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  if (response.status === 404) return code === 'not_found' ? { kind: 'not-found' } : FAILED;
  if (response.status === 409) return code === 'duplicate_date' ? { kind: 'duplicate-date' } : FAILED;
  if (response.status === 400) {
    const reason = field(json, 'reason');
    return code === 'invalid' && typeof reason === 'string' ? { kind: 'invalid', reason } : FAILED;
  }
  if (response.status !== 200 && response.status !== 201) return FAILED;
  const value = parse(json);
  return value === null ? FAILED : { kind: 'ok', value };
}

const saved = (json: unknown): true | null => (field(json, 'saved') === true ? true : null);
const parsed =
  <T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }) =>
  (json: unknown): T | null => {
    const result = schema.safeParse(json);
    return result.success && result.data !== undefined ? result.data : null;
  };

export const fetchHome = (token: string): Promise<ApiResult<HomeResponse>> =>
  request(token, 'GET', '/api/home', undefined, parsed<HomeResponse>(homeResponse));

export const fetchEvents = (token: string, kind: TrackerKind, childId: string | null, period: Period): Promise<ApiResult<TrackerEventDto[]>> => {
  const query = new URLSearchParams({ kind, from: period.from, to: period.to });
  if (childId !== null) query.set('childId', childId);
  return request(token, 'GET', `/api/trackers/events?${query.toString()}`, undefined, (json) => {
    const result = trackerEventsResponse.safeParse(json);
    return result.success ? result.data.events : null;
  });
};

/** The body of a write: the kind's fields as the shared validation names them (see checkTrackerEventWrite). */
export type EventBody = Record<string, unknown>;

export const addEvent = (token: string, body: EventBody) => request(token, 'POST', '/api/trackers/events', body, saved);
export const editEvent = (token: string, id: string, body: EventBody) => request(token, 'PUT', `/api/trackers/events/${id}`, body, saved);
export const removeEvent = (token: string, id: string) => request(token, 'DELETE', `/api/trackers/events/${id}`, undefined, saved);

export interface CycleBody {
  startDate: string;
  cycleLengthDays: number;
}

export const fetchCycle = (token: string): Promise<ApiResult<CycleResponse>> =>
  request(token, 'GET', '/api/cycle', undefined, parsed<CycleResponse>(cycleResponse));
export const addCycle = (token: string, body: CycleBody) => request(token, 'POST', '/api/cycle', body, saved);
export const editCycle = (token: string, id: string, body: CycleBody) => request(token, 'PUT', `/api/cycle/${id}`, body, saved);
export const removeCycle = (token: string, id: string) => request(token, 'DELETE', `/api/cycle/${id}`, undefined, saved);
