import type { App } from './identity-fixtures.js';

// The one place the F3.7 tests learn the report URL (.work/report/spec.md c1): POST /api/reports, under /api. The body is sent as given, so a
// test can send a key the schema must refuse.

export const REPORTS_URL = '/api/reports';

const headersOf = (header: string | null, json: boolean): Record<string, string> => ({
  ...(header === null ? {} : { authorization: header }),
  ...(json ? { 'content-type': 'application/json' } : {}),
});

export const postReport = (app: App, header: string | null, payload: unknown) =>
  app.inject({ method: 'POST', url: REPORTS_URL, headers: headersOf(header, true), payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
export const sendReportMethod = (app: App, header: string | null, method: 'GET' | 'PUT' | 'PATCH' | 'DELETE', url: string = REPORTS_URL) =>
  app.inject({ method, url, headers: headersOf(header, false) });
