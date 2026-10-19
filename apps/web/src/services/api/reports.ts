import { reportErrorBody, reportReceivedBody, type ReportReason, type ReportTargetKind } from '@nestly/shared';

// POST /api/reports (F3.7; FR-MOD-001). The body names the target, the reason and the text; never the reporter (the server acts on the token's
// user). Only the status and the error code are read; no response text reaches the screen, and nothing about a report is ever read back.
export type ReportOutcome =
  | { kind: 'received' } // 201 { received: true }
  | { kind: 'already-reported' } // 409 already_reported: the same person and target again
  | { kind: 'unavailable' } // 404 unavailable: not readable, own, unknown, or a post already reported (one answer)
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'failed' }; // 400, 403 not_allowed, 5xx, an unreadable answer, or the call did not reach the server

export interface ReportRequest {
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  /** Absent when the box is empty; the server trims it again. */
  details?: string;
}

const FAILED = { kind: 'failed' } as const;

/** Files one report. A repeat is 409, never a second row. */
export async function fileReport(accessToken: string, report: ReportRequest): Promise<ReportOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(report),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 201) return reportReceivedBody.safeParse(body).success ? { kind: 'received' } : FAILED;
  if (response.status === 403) {
    const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
    return code === 'account_unavailable' ? { kind: 'account-unavailable' } : FAILED;
  }
  const parsed = reportErrorBody.safeParse(body);
  if (!parsed.success) return FAILED;
  if (response.status === 404 && parsed.data.error === 'unavailable') return { kind: 'unavailable' };
  if (response.status === 409 && parsed.data.error === 'already_reported') return { kind: 'already-reported' };
  return FAILED;
}
