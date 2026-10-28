import { assistantAnswerSchema, assistantStatusSchema, type AssistantTurn } from '@nestly/shared';

// The Nestly assistant (Afik 28.10.2026; FR-AI-001): GET /api/assistant (available or not) and POST /api/assistant (one message and the last few
// of the same conversation). The caller is never sent: the server acts on the token's user. Only the status, the one `error` code and a body
// that passes the shared schema are read.

export type AssistantResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'rate-limited' } // 429 (BR-092)
  | { kind: 'not-allowed' } // 403: staff, a stopped account
  | { kind: 'unauthenticated' } // 401
  | { kind: 'unavailable' }; // 503 (no key, the model failed or was slow: ERR-055), 5xx, an unreadable answer, or no answer at all

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const UNAVAILABLE = { kind: 'unavailable' } as const;
const PATH = '/api/assistant';

async function call<T>(token: string, schema: Parser<T>, body?: unknown): Promise<AssistantResult<T>> {
  let response: Response;
  try {
    response = await fetch(PATH, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    return UNAVAILABLE;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 429) return { kind: 'rate-limited' };
  if (response.status === 403) return { kind: 'not-allowed' };
  if (response.status !== 200) return UNAVAILABLE;
  const answer: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(answer);
  return parsed.success ? { kind: 'ok', value: parsed.data } : UNAVAILABLE;
}

/** GET /api/assistant: whether the assistant can answer now. */
export function fetchAssistantStatus(token: string): Promise<AssistantResult<{ available: boolean }>> {
  return call(token, assistantStatusSchema);
}

/** POST /api/assistant: the answer to `text`, given the last few messages of the conversation (oldest first). */
export function askAssistant(token: string, text: string, history: readonly AssistantTurn[]): Promise<AssistantResult<{ answer: string }>> {
  return call(token, assistantAnswerSchema, { text, history });
}
