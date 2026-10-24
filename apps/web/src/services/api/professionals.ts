import {
  accountKindResponse,
  createdIdResponse,
  createdStatusResponse,
  directoryResponse,
  followingResponse,
  outreachAcceptResponse,
  outreachResponse,
  professionalHomeResponse,
  professionalPage,
  type AccountKind,
  type ArticleWrite,
  type DirectoryQuery,
  type HelpRequestItem,
  type OutreachItem,
  type ProfessionalCard,
  type ProfessionalDashboard,
  type ProfessionalPage,
  type ProfessionalProfileInput,
  type PromotedProfessional,
  type ProfessionalRegistrationInput,
} from '@nestly/shared';

// Professionals and services (I11): /api/register/professional, /api/account/kind, /api/professionals/*, /api/professional/*, /api/outreach/* and
// /api/posts/:id/offer-help. The caller is never sent: the server acts on the token's user. Only the status, the one `error` code and a body that
// passes the shared schema are read; no response text reaches the screen.

export type ProRefusal = 'invalid' | 'unavailable' | 'not-allowed' | 'already-done' | 'rate-limited';

export type ProResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: ProRefusal }
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable (ERR-037)
  | { kind: 'failed' }; // 5xx, an unreadable answer, or the call did not reach the server

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const FAILED = { kind: 'failed' } as const;
const REFUSALS: Readonly<Record<string, ProRefusal>> = {
  invalid: 'invalid',
  unavailable: 'unavailable',
  not_allowed: 'not-allowed',
  already_done: 'already-done',
  rate_limited: 'rate-limited',
};
const nothing: Parser<null> = { safeParse: () => ({ success: true, data: null }) };
const idBody = createdIdResponse;
const conversationBody = outreachAcceptResponse;
const createdBody = createdStatusResponse;

async function call<T>(token: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, schema: Parser<T>, body?: unknown): Promise<ProResult<T>> {
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

const enc = (value: string): string => encodeURIComponent(value);

/** POST /api/register/professional (FR-PROREG-002), with the session Auth just issued. */
export const registerProfessional = (token: string, body: ProfessionalRegistrationInput): Promise<ProResult<unknown>> =>
  call(token, 'POST', '/api/register/professional', createdBody, body);

/** GET /api/account/kind: which product the signed-in account gets (presentation only). */
export async function fetchAccountKind(token: string): Promise<ProResult<AccountKind>> {
  const result = await call(token, 'GET', '/api/account/kind', accountKindResponse);
  return result.kind === 'ok' ? { kind: 'ok', value: result.value.kind } : result;
}

/** GET /api/professionals with the promoted Professionals that match the same filters (I13: shown apart, labelled "ממומן"). */
export function fetchDirectoryPage(token: string, query: DirectoryQuery): Promise<ProResult<{ professionals: ProfessionalCard[]; promoted: PromotedProfessional[] }>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const text = params.toString();
  return call(token, 'GET', text === '' ? '/api/professionals' : `/api/professionals?${text}`, directoryResponse);
}

/** GET /api/professionals/following (PG-039): the Professionals the caller follows. */
export async function fetchFollowing(token: string): Promise<ProResult<ProfessionalCard[]>> {
  const result = await call(token, 'GET', '/api/professionals/following', followingResponse);
  return result.kind === 'ok' ? { kind: 'ok', value: result.value.professionals } : result;
}

export const fetchProfessional = (token: string, userId: string, promotionId?: string): Promise<ProResult<ProfessionalPage>> =>
  call(token, 'GET', `/api/professionals/${enc(userId)}${promotionId === undefined ? '' : `?promotion=${enc(promotionId)}`}`, professionalPage);

export const setFollow = (token: string, userId: string, follow: boolean): Promise<ProResult<null>> =>
  call(token, follow ? 'PUT' : 'DELETE', `/api/professionals/${enc(userId)}/follow`, nothing);

export const writeReview = (token: string, userId: string, rating: number, text: string): Promise<ProResult<unknown>> =>
  call(token, 'POST', `/api/professionals/${enc(userId)}/reviews`, createdBody, { rating, text });

export const saveOwnProfile = (token: string, profile: ProfessionalProfileInput): Promise<ProResult<null>> =>
  call(token, 'PUT', '/api/professional/profile', nothing, profile);

export const fetchProfessionalHome = (token: string): Promise<ProResult<{ dashboard: ProfessionalDashboard; helpRequests: HelpRequestItem[] }>> =>
  call(token, 'GET', '/api/professional/home', professionalHomeResponse);

export const createArticle = (token: string, article: ArticleWrite): Promise<ProResult<{ id: string }>> =>
  call(token, 'POST', '/api/professional/articles', idBody, article);
export const editArticle = (token: string, articleId: string, article: ArticleWrite): Promise<ProResult<null>> =>
  call(token, 'PUT', `/api/professional/articles/${enc(articleId)}`, nothing, article);
export const deleteArticle = (token: string, articleId: string): Promise<ProResult<null>> =>
  call(token, 'DELETE', `/api/professional/articles/${enc(articleId)}`, nothing);

export const offerHelp = (token: string, postId: string, text: string): Promise<ProResult<{ id: string }>> =>
  call(token, 'POST', `/api/posts/${enc(postId)}/offer-help`, idBody, { text });

export const fetchOutreach = (token: string): Promise<ProResult<{ received: OutreachItem[]; sent: OutreachItem[] }>> =>
  call(token, 'GET', '/api/outreach', outreachResponse);
export const acceptOutreach = (token: string, outreachId: string): Promise<ProResult<{ conversationId: string }>> =>
  call(token, 'POST', `/api/outreach/${enc(outreachId)}/accept`, conversationBody);
export const declineOutreach = (token: string, outreachId: string): Promise<ProResult<null>> =>
  call(token, 'POST', `/api/outreach/${enc(outreachId)}/decline`, nothing);
