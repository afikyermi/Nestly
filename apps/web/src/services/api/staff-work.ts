import {
  adminOverviewBody,
  auditPageBody,
  childTrendsBody,
  myWorkBody,
  type AdminOverview,
  type AuditFilters,
  type AuditPage,
  type ChildTrends,
  type ChildTrendsQuery,
  type MyWork,
  type ReportTargetKind,
} from '@nestly/shared';
import type { AdminOutcome } from './admin';
import { call } from './team';

// The staff's work calls (I14 completion): "my work", the Admin's home, escalation, children's trends and the filtered Audit Log. The Actor is never
// sent: the server acts on the token's user. Only the status, the one `error` code and a body that passes the shared schema are read.

const anything = { safeParse: (value: unknown) => ({ success: true as const, data: value }) };

export const fetchMyWork = (token: string): Promise<AdminOutcome<MyWork>> => call(token, 'GET', '/api/admin/my-work', myWorkBody);
export const fetchAdminOverview = (token: string): Promise<AdminOutcome<AdminOverview>> => call(token, 'GET', '/api/admin/overview', adminOverviewBody);
export const escalateReport = (token: string, targetKind: ReportTargetKind, targetId: string, note: string): Promise<AdminOutcome<unknown>> =>
  call(token, 'POST', '/api/admin/reports/escalate', anything, { targetKind, targetId, note });

export function childTrendsPath(query: ChildTrendsQuery): string {
  const params = new URLSearchParams({ metric: query.metric, field: query.field, dimension: query.dimension, period: query.period });
  return `/api/admin/child-trends?${params.toString()}`;
}
export const fetchChildTrends = (token: string, query: ChildTrendsQuery): Promise<AdminOutcome<ChildTrends>> => call(token, 'GET', childTrendsPath(query), childTrendsBody);

/** The Audit Log page with the filters (§9.10); `before` is the previous page's `next`. */
export function auditPath(filters: AuditFilters, before: string | null): string {
  const params = new URLSearchParams();
  if (before !== null) params.set('before', before);
  for (const [name, value] of Object.entries(filters)) if (typeof value === 'string' && value !== '') params.set(name, value);
  const query = params.toString();
  return query === '' ? '/api/admin/audit' : `/api/admin/audit?${query}`;
}
export const fetchAuditFiltered = (token: string, filters: AuditFilters, before: string | null): Promise<AdminOutcome<AuditPage>> =>
  call(token, 'GET', auditPath(filters, before), auditPageBody);
