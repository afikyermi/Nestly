import type { App } from './identity-fixtures.js';

// The one place the F3.5 tests learn the share URL (.work/share-in-feed/spec.md Scope): POST /posts/:id/shares, under /api.

export const sharesUrl = (id: string): string => `/api/posts/${id}/shares`;

const headersOf = (header: string | null, json: boolean): Record<string, string> => ({
  ...(header === null ? {} : { authorization: header }),
  ...(json ? { 'content-type': 'application/json' } : {}),
});

export const createShare = (app: App, header: string | null, id: string, payload: unknown) =>
  app.inject({ method: 'POST', url: sharesUrl(id), headers: headersOf(header, true), payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
