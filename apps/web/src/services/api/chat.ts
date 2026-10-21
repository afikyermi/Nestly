import {
  chatAcceptBody,
  chatOverviewBody,
  chatStartBody,
  chatUnreadBody,
  conversationBody,
  supportCreatedBody,
  supportDetailBody,
  supportInboxBody,
  supportListBody,
  supportThreadBody,
  type ChatOverview,
  type ChatStartResult,
  type ConversationThread,
  type SupportDetail,
  type SupportInbox,
  type SupportList,
  type SupportStatus,
  type SupportThread,
  type SupportTopic,
} from '@nestly/shared';

// Chat and Support (I8; FR-CHAT-001..004, FR-ADMIN-001/002, FR-SERV-009): /api/chat/*, /api/support/*, /api/users/:id/chat-block and the staff's
// /api/admin/support/*. The caller is never sent: the server acts on the token's user. Only the status, the one `error` code and a body that
// passes the shared schema are read; no response text reaches the screen.

/** What a refused call means to a screen. */
export type ChatRefusal = 'invalid' | 'unavailable' | 'not-allowed' | 'blocked' | 'request-pending' | 'closed' | 'rate-limited' | 'forbidden' | 'not-found' | 'not-applicable';

export type ChatResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: ChatRefusal }
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable (ERR-037)
  | { kind: 'failed' }; // 5xx, an unreadable answer, or the call did not reach the server

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const FAILED = { kind: 'failed' } as const;
const REFUSALS: Record<string, ChatRefusal> = {
  invalid: 'invalid',
  unavailable: 'unavailable',
  not_allowed: 'not-allowed',
  blocked: 'blocked',
  request_pending: 'request-pending',
  closed: 'closed',
  rate_limited: 'rate-limited',
  forbidden: 'forbidden',
  not_found: 'not-found',
  not_applicable: 'not-applicable',
};
const nothing: Parser<null> = { safeParse: () => ({ success: true, data: null }) };

async function call<T>(token: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, schema: Parser<T>, body?: unknown): Promise<ChatResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 204) {
    // No body: only a call that expects none (`nothing`) reads it as done.
    const parsed = schema.safeParse(null);
    return parsed.success ? { kind: 'ok', value: parsed.data } : FAILED;
  }
  const answer: unknown = await response.json().catch(() => undefined);
  if (response.status === 200 || response.status === 201) {
    const parsed = schema.safeParse(answer);
    return parsed.success ? { kind: 'ok', value: parsed.data } : FAILED;
  }
  const code: unknown = typeof answer === 'object' && answer !== null ? Reflect.get(answer, 'error') : undefined;
  if (response.status === 403 && code === 'account_unavailable') return { kind: 'account-unavailable' };
  const refusal = typeof code === 'string' ? REFUSALS[code] : undefined;
  return refusal === undefined ? FAILED : { kind: refusal };
}

const anything: Parser<unknown> = { safeParse: (value: unknown) => ({ success: true, data: value }) };

// ---- chat
export const fetchChatOverview = (token: string): Promise<ChatResult<ChatOverview>> => call(token, 'GET', '/api/chat', chatOverviewBody);
export const fetchChatUnread = (token: string): Promise<ChatResult<{ count: number }>> => call(token, 'GET', '/api/chat/unread', chatUnreadBody);
export const startChat = (token: string, userId: string, text: string): Promise<ChatResult<ChatStartResult>> =>
  call(token, 'POST', '/api/chat/start', chatStartBody, { userId, text });
export const fetchConversation = (token: string, id: string): Promise<ChatResult<ConversationThread>> =>
  call(token, 'GET', `/api/chat/conversations/${encodeURIComponent(id)}`, conversationBody);
export const sendChatMessage = (token: string, id: string, text: string): Promise<ChatResult<unknown>> =>
  call(token, 'POST', `/api/chat/conversations/${encodeURIComponent(id)}/messages`, anything, { text });
export const acceptChatRequest = (token: string, id: string): Promise<ChatResult<{ conversationId: string }>> =>
  call(token, 'POST', `/api/chat/requests/${encodeURIComponent(id)}/accept`, chatAcceptBody);
export const declineChatRequest = (token: string, id: string): Promise<ChatResult<null>> => call(token, 'POST', `/api/chat/requests/${encodeURIComponent(id)}/decline`, nothing);
export const cancelChatRequest = (token: string, id: string): Promise<ChatResult<null>> => call(token, 'DELETE', `/api/chat/requests/${encodeURIComponent(id)}`, nothing);
export const setChatBlock = (token: string, userId: string, block: boolean): Promise<ChatResult<null>> =>
  call(token, block ? 'PUT' : 'DELETE', `/api/users/${encodeURIComponent(userId)}/chat-block`, nothing);

// ---- Support, the user's side
export const createSupportRequest = (token: string, topic: SupportTopic, text: string): Promise<ChatResult<{ id: string }>> =>
  call(token, 'POST', '/api/support', supportCreatedBody, { topic, text });
export const fetchOwnSupport = (token: string): Promise<ChatResult<SupportList>> => call(token, 'GET', '/api/support', supportListBody);
export const fetchSupportThread = (token: string, id: string): Promise<ChatResult<SupportThread>> =>
  call(token, 'GET', `/api/support/${encodeURIComponent(id)}`, supportThreadBody);
export const replySupport = (token: string, id: string, text: string): Promise<ChatResult<null>> =>
  call(token, 'POST', `/api/support/${encodeURIComponent(id)}/messages`, nothing, { text });

// ---- Support, the staff's side (the admin screens)
export const fetchSupportInbox = (token: string, status: SupportStatus | null): Promise<ChatResult<SupportInbox>> =>
  call(token, 'GET', status === null ? '/api/admin/support' : `/api/admin/support?status=${status}`, supportInboxBody);
export const fetchSupportDetail = (token: string, id: string): Promise<ChatResult<SupportDetail>> =>
  call(token, 'GET', `/api/admin/support/${encodeURIComponent(id)}`, supportDetailBody);
export const sendSupportStaffMessage = (token: string, id: string, text: string, internal: boolean): Promise<ChatResult<unknown>> =>
  call(token, 'POST', `/api/admin/support/${encodeURIComponent(id)}/messages`, anything, { text, internal });
export const setSupportStatus = (token: string, id: string, status: SupportStatus): Promise<ChatResult<unknown>> =>
  call(token, 'POST', `/api/admin/support/${encodeURIComponent(id)}/status`, anything, { status });
