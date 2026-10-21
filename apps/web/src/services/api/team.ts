import {
  analyticsBody,
  announcement,
  announcementsBody,
  inboxBody,
  invitationCreatedBody,
  reportReasonRow,
  reportReasonsBody,
  teamBody,
  type AnalyticsPeriod,
  type AnalyticsView,
  type Announcement,
  type AnnouncementRequest,
  type InvitationCreated,
  type PermissionKey,
  type ReportReasonCreate,
  type ReportReasonRow,
  type ReportReasonUpdate,
  type StaffInbox,
  type TeamView,
} from '@nestly/shared';
import type { AdminOutcome, AdminRefusal } from './admin';

// The Moderators team's calls (I14): /api/admin/team, announcements, report reasons, analytics and the inbox, and /api/team/join. The Actor is never
// sent: the server acts on the token's user. Only the status, the one `error` code and a body that passes the shared schema are read.

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const FAILED = { kind: 'failed' } as const;
const REFUSALS: Record<string, AdminRefusal> = {
  forbidden: 'forbidden',
  not_found: 'not-found',
  invalid: 'invalid',
  reason_required: 'reason-required',
  not_applicable: 'not-applicable',
};
const anything: Parser<unknown> = { safeParse: (value: unknown) => ({ success: true, data: value }) };

export async function call<T>(token: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, schema: Parser<T>, body?: unknown): Promise<AdminOutcome<T>> {
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

export const fetchTeam = (token: string): Promise<AdminOutcome<TeamView>> => call(token, 'GET', '/api/admin/team', teamBody);
export const inviteModerator = (token: string, note: string): Promise<AdminOutcome<InvitationCreated>> =>
  call(token, 'POST', '/api/admin/team/invitations', invitationCreatedBody, { note });
export const revokeInvitation = (token: string, id: string): Promise<AdminOutcome<unknown>> =>
  call(token, 'POST', `/api/admin/team/invitations/${encodeURIComponent(id)}/revoke`, anything, {});
export const saveModeratorKeys = (token: string, userId: string, permissions: readonly PermissionKey[]): Promise<AdminOutcome<unknown>> =>
  call(token, 'PUT', `/api/admin/team/${encodeURIComponent(userId)}/permissions`, anything, { permissions });

export const fetchAnnouncements = (token: string): Promise<AdminOutcome<{ items: Announcement[] }>> => call(token, 'GET', '/api/admin/announcements', announcementsBody);
export const createAnnouncement = (token: string, request: AnnouncementRequest): Promise<AdminOutcome<Announcement>> =>
  call(token, 'POST', '/api/admin/announcements', announcement, request);
export const editAnnouncement = (token: string, id: string, request: AnnouncementRequest): Promise<AdminOutcome<Announcement>> =>
  call(token, 'PATCH', `/api/admin/announcements/${encodeURIComponent(id)}`, announcement, request);
export const setAnnouncementStatus = (token: string, id: string, status: 'published' | 'removed'): Promise<AdminOutcome<Announcement>> =>
  call(token, 'POST', `/api/admin/announcements/${encodeURIComponent(id)}/status`, announcement, { status });

export const fetchReportReasons = (token: string): Promise<AdminOutcome<{ items: ReportReasonRow[] }>> => call(token, 'GET', '/api/admin/report-reasons', reportReasonsBody);
export const updateReportReason = (token: string, key: string, change: ReportReasonUpdate): Promise<AdminOutcome<ReportReasonRow>> =>
  call(token, 'PATCH', `/api/admin/report-reasons/${encodeURIComponent(key)}`, reportReasonRow, change);
export const addReportReason = (token: string, reason: ReportReasonCreate): Promise<AdminOutcome<ReportReasonRow>> =>
  call(token, 'POST', '/api/admin/report-reasons', reportReasonRow, reason);

export const fetchAnalytics = (token: string, days: AnalyticsPeriod): Promise<AdminOutcome<AnalyticsView>> =>
  call(token, 'GET', `/api/admin/analytics?days=${days}`, analyticsBody);
export const fetchInbox = (token: string): Promise<AdminOutcome<StaffInbox>> => call(token, 'GET', '/api/admin/inbox', inboxBody);

export type JoinOutcome = 'joined' | 'invalid-code' | 'has-account' | 'failed';

/** POST /api/team/join: the signed-in account with no Nestly row becomes a Moderator with the code. */
export async function joinTeam(token: string, code: string): Promise<JoinOutcome> {
  try {
    const response = await fetch('/api/team/join', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
    if (response.status === 201) return 'joined';
    if (response.status === 410 || response.status === 400) return 'invalid-code';
    if (response.status === 409) return 'has-account';
    return 'failed';
  } catch {
    return 'failed';
  }
}
