import { ownJourneysResponse, type ChildInput, type OwnJourneys } from '@nestly/shared';

// GET /api/journeys, POST /api/children, PUT /api/children/:id (F2.2a): the signed-in parent's own journeys and children. No user id
// is ever sent: the server acts on the token's user, and a child is named by its row id only. Only the status, the one `error` code
// and a body that passes the shared response schema are read; no response text reaches the screen. Children's names and dates go
// in the request body only: not a URL, not storage, not a log line.
export type JourneysOutcome =
  | { kind: 'journeys'; journeys: OwnJourneys }
  | { kind: 'unauthenticated' } // 401: the server does not accept the token
  | { kind: 'account-unavailable' } // 403 account_unavailable: the account is stopped (ERR-037)
  | { kind: 'too-many' } // 409 children_too_many: ten children are stored already (VAL-040)
  | { kind: 'failed' }; // anything else: 5xx, 400, 404, an unreadable answer, or the call did not reach the server

const FAILED: JourneysOutcome = { kind: 'failed' };

type Call = { method: 'GET'; path: string } | { method: 'POST' | 'PUT'; path: string; body: ChildInput };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
}

async function call(accessToken: string, init: Call): Promise<JourneysOutcome> {
  let response: Response;
  try {
    response = await fetch(init.path, {
      method: init.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.method === 'GET' ? {} : { 'content-type': 'application/json' }),
      },
      ...(init.method === 'GET' ? {} : { body: JSON.stringify(init.body) }),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return FAILED;
  }
  if (response.status === 403) return errorCode(body) === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  if (response.status === 409) return errorCode(body) === 'children_too_many' ? { kind: 'too-many' } : FAILED;
  if (response.status !== 200 && response.status !== 201) return FAILED;
  const parsed = ownJourneysResponse.safeParse(body);
  return parsed.success ? { kind: 'journeys', journeys: parsed.data } : FAILED;
}

/** GET /api/journeys. */
export const fetchOwnJourneys = (accessToken: string): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'GET', path: '/api/journeys' });

/** POST /api/children with the checked form. The answer is the journeys and children after the add. */
export const addOwnChild = (accessToken: string, child: ChildInput): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'POST', path: '/api/children', body: child });

/** PUT /api/children/:id with the checked form. The answer is the journeys and children after the edit. */
export const saveOwnChild = (accessToken: string, id: string, child: ChildInput): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'PUT', path: `/api/children/${encodeURIComponent(id)}`, body: child });
