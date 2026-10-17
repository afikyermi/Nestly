import {
  ownJourneysResponse,
  type ChildInput,
  type DateParts,
  type DueDateInput,
  type OwnJourneys,
  type PregnancyAddInput,
} from '@nestly/shared';

// GET /api/journeys, POST /api/children, PUT /api/children/:id (F2.2a), POST /api/journeys, PUT /api/journeys/:id (F2.2b1), DELETE
// /api/children/:id, DELETE /api/journeys/:id, POST /api/journeys/:id/birth (F2.2b2): the
// signed-in parent's own journeys and children. No user id is ever sent: the server acts on the token's user, and a child or a
// journey is named by its row id only. Only the status, the one `error` code
// and a body that passes the shared response schema are read; no response text reaches the screen. Children's names and dates go
// in the request body only: not a URL, not storage, not a log line.
export type JourneysOutcome =
  | { kind: 'journeys'; journeys: OwnJourneys }
  | { kind: 'unauthenticated' } // 401: the server does not accept the token
  | { kind: 'account-unavailable' } // 403 account_unavailable: the account is stopped (ERR-037)
  | { kind: 'too-many' } // 409 children_too_many: ten children are stored already (VAL-040)
  | { kind: 'stage-conflict' } // 409 stage_conflict: a pregnant or planning journey is stored already (VAL-039)
  | { kind: 'not-found' } // 404 not_found: the child or the journey is not there (gone in another tab, Q3)
  | { kind: 'failed' }; // anything else: 5xx, 400, another 404, an unreadable answer, or the call did not reach the server

const FAILED: JourneysOutcome = { kind: 'failed' };

type Call =
  | { method: 'GET' | 'DELETE'; path: string }
  | { method: 'POST' | 'PUT'; path: string; body: ChildInput | DueDateInput | PregnancyAddInput };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
}

async function call(accessToken: string, init: Call): Promise<JourneysOutcome> {
  let response: Response;
  try {
    // A DELETE carries no body and no content type (the server refuses a body, c20).
    response = await fetch(init.path, {
      method: init.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...('body' in init ? { 'content-type': 'application/json' } : {}),
      },
      ...('body' in init ? { body: JSON.stringify(init.body) } : {}),
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
  if (response.status === 409) {
    const code = errorCode(body);
    return code === 'children_too_many' ? { kind: 'too-many' } : code === 'stage_conflict' ? { kind: 'stage-conflict' } : FAILED;
  }
  if (response.status === 404) return errorCode(body) === 'not_found' ? { kind: 'not-found' } : FAILED;
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

/**
 * POST /api/journeys with the checked due date as typed (all parts empty = none); `endPlanning` once the parent confirmed that
 * "מתכננים" ends (c23). The answer is the journeys and children after the add.
 */
export const addOwnPregnancy = (accessToken: string, dueDate: DateParts, endPlanning = false): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'POST', path: '/api/journeys', body: endPlanning ? { dueDate, endPlanning: true } : { dueDate } });

/** PUT /api/journeys/:id with the checked due date as typed. The answer is the journeys and children after the edit. */
export const saveOwnDueDate = (accessToken: string, id: string, dueDate: DateParts): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'PUT', path: `/api/journeys/${encodeURIComponent(id)}`, body: { dueDate } });

/** DELETE /api/children/:id. The answer is the journeys and children after the removal. */
export const removeOwnChild = (accessToken: string, id: string): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'DELETE', path: `/api/children/${encodeURIComponent(id)}` });

/** DELETE /api/journeys/:id: ends the pregnancy. The answer is the journeys and children after it. */
export const endOwnPregnancy = (accessToken: string, id: string): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'DELETE', path: `/api/journeys/${encodeURIComponent(id)}` });

/** POST /api/journeys/:id/birth with the checked child form. The answer is the journeys and children after the birth. */
export const recordOwnBirth = (accessToken: string, id: string, child: ChildInput): Promise<JourneysOutcome> =>
  call(accessToken, { method: 'POST', path: `/api/journeys/${encodeURIComponent(id)}/birth`, body: child });
