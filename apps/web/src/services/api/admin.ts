import {
  adminAccessBody,
  auditPageBody,
  enforceBody,
  mediaQueueResponse,
  queueBody,
  reportDetailBody,
  revealBody,
  targetUser,
  userListBody,
  type AdminAccess,
  type AuditPage,
  type EnforceRequest,
  type HandleReportsRequest,
  type MediaDecision,
  type MediaQueueResponse,
  type ModerateContentRequest,
  type QueueItem,
  type ReportDetail,
  type ReportTargetKind,
  type TargetUser,
  type UserList,
} from '@nestly/shared';

/** What a response schema must offer: the shared Zod schemas do, and so does the status-only reader below. */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

// The admin screens' calls (FR-MOD-002, FR-MOD-003, FR-ADMIN-005): /api/admin/*. The Actor is never sent: the server acts on the token's user. Only the
// status, the one `error` code and a body that passes the shared schema are read; no response text reaches the screen.
export type AdminRefusal = 'forbidden' | 'not-found' | 'invalid' | 'reason-required' | 'not-applicable';

export type AdminOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: AdminRefusal }
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable (ERR-037)
  | { kind: 'failed' }; // 5xx, an unreadable answer, or the call did not reach the server

const FAILED = { kind: 'failed' } as const;

const REFUSALS: Record<string, AdminRefusal> = {
  forbidden: 'forbidden',
  not_found: 'not-found',
  invalid: 'invalid',
  reason_required: 'reason-required',
  not_applicable: 'not-applicable',
};

async function call<T>(accessToken: string, method: 'GET' | 'POST', path: string, schema: Parser<T>, body?: unknown): Promise<AdminOutcome<T>> {
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
  const answer: unknown = await response.json().catch(() => undefined);
  if (response.status === 200) {
    const parsed = schema.safeParse(answer);
    return parsed.success ? { kind: 'ok', value: parsed.data } : FAILED;
  }
  const code: unknown = typeof answer === 'object' && answer !== null ? Reflect.get(answer, 'error') : undefined;
  if (response.status === 403 && code === 'account_unavailable') return { kind: 'account-unavailable' };
  const refusal = typeof code === 'string' ? REFUSALS[code] : undefined;
  return refusal === undefined ? FAILED : { kind: refusal };
}

/** An action whose answer is read for its status only. */
const anything: Parser<unknown> = { safeParse: (value: unknown) => ({ success: true, data: value }) };

export type StaffAccess = { staff: false } | ({ staff: true } & AdminAccess);

export const fetchStaffAccess = (token: string): Promise<AdminOutcome<StaffAccess>> => call(token, 'GET', '/api/admin/access', adminAccessBody);
export const fetchAudit = (token: string, before: string | null): Promise<AdminOutcome<AuditPage>> =>
  call(token, 'GET', before === null ? '/api/admin/audit' : `/api/admin/audit?before=${encodeURIComponent(before)}`, auditPageBody);
export const fetchQueue = (token: string): Promise<AdminOutcome<{ items: QueueItem[] }>> => call(token, 'GET', '/api/admin/reports', queueBody);
export const fetchReportDetail = (token: string, kind: ReportTargetKind, id: string): Promise<AdminOutcome<ReportDetail>> =>
  call(token, 'GET', `/api/admin/reports/${kind}/${id}`, reportDetailBody);
export const handleReports = (token: string, request: HandleReportsRequest): Promise<AdminOutcome<unknown>> =>
  call(token, 'POST', '/api/admin/reports/handle', anything, request);
export const moderateContent = (token: string, request: ModerateContentRequest): Promise<AdminOutcome<unknown>> =>
  call(token, 'POST', '/api/admin/content/moderate', anything, request);
export const revealAuthor = (token: string, postId: string): Promise<AdminOutcome<{ userId: string; fullName: string | null }>> =>
  call(token, 'POST', '/api/admin/reports/reveal', revealBody, { postId });
export const enforceUser = (token: string, request: EnforceRequest): Promise<AdminOutcome<{ status: 'active' | 'suspended' | 'banned'; suspendedUntil: string | null }>> =>
  call(token, 'POST', '/api/admin/enforcements', enforceBody, request);
export const fetchUsers = (token: string, search: string): Promise<AdminOutcome<UserList>> =>
  call(token, 'GET', `/api/admin/users?q=${encodeURIComponent(search)}`, userListBody);
export const fetchUser = (token: string, id: string): Promise<AdminOutcome<TargetUser>> => call(token, 'GET', `/api/admin/users/${id}`, targetUser);

// The image approval queue (I5; Afik 20.10.2026; CONTENT_MODERATE) and the removal of a checked image after a report (with REPORTS_VIEW).
export const fetchMediaQueue = (token: string): Promise<AdminOutcome<MediaQueueResponse>> => call(token, 'GET', '/api/admin/media-queue', mediaQueueResponse);
export const decideMedia = (token: string, id: string, decision: MediaDecision, isChild: boolean): Promise<AdminOutcome<unknown>> =>
  call(token, 'POST', `/api/admin/media/${encodeURIComponent(id)}/decision`, anything, { decision, isChild });
export const removeMediaAfterReport = (token: string, id: string, suspected: boolean): Promise<AdminOutcome<unknown>> =>
  call(token, 'POST', `/api/admin/media/${encodeURIComponent(id)}/removal`, anything, { suspected });
