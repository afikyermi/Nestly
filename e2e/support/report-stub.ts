// Shared by e2e/report.spec.ts and e2e/report-profile-rules.spec.ts (I3 F3.7). The stub plays POST /api/reports as .work/report/spec.md c1-c5 define it:
// 201 {received:true}; 404 {error:'unavailable'}; 409 {error:'already_reported'}; 400 {error:'invalid'}; 401 {error:'unauthenticated'}; 5xx
// {error:'server_error'}; or a dropped connection. Every body sent is kept as parsed JSON. It is registered after a surface's own stub (later wins).
import type { Page } from '@playwright/test';
import { CORS, json } from './journeys-stub';

export type ReportAnswer = 201 | 400 | 401 | 404 | 409 | 500 | 503 | 'abort';
export interface ReportsNet {
  /** The JSON body of every POST /api/reports, in order. */
  sent: Array<Record<string, unknown>>;
  /** Methods of every request to /api/reports (all must be POST). */
  methods: string[];
  /** What the next requests answer. */
  answer: ReportAnswer;
  /** While set, every answer waits for it. */
  hold: Promise<void> | null;
}

const BODIES: Record<Exclude<ReportAnswer, 201 | 'abort'>, unknown> = {
  400: { error: 'invalid' },
  401: { error: 'unauthenticated' },
  404: { error: 'unavailable' },
  409: { error: 'already_reported' },
  500: { error: 'server_error' },
  503: { error: 'unavailable' },
};

export const gate = (): { promise: Promise<void>; release: () => void } => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

export async function stubReports(page: Page): Promise<ReportsNet> {
  const net: ReportsNet = { sent: [], methods: [], answer: 201, hold: null };
  await page.route('**/api/reports', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.methods.push(req.method());
    const parsed: unknown = JSON.parse(req.postData() ?? 'null');
    net.sent.push(typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {});
    if (net.hold !== null) await net.hold;
    if (net.answer === 'abort') return route.abort('connectionreset');
    if (net.answer === 201) return json(route, 201, { received: true });
    return route.fulfill({
      status: net.answer,
      headers: { ...CORS, 'content-type': 'application/json', ...(net.answer === 401 ? { 'www-authenticate': 'Bearer' } : {}) },
      body: JSON.stringify(BODIES[net.answer]),
    });
  });
  return net;
}
