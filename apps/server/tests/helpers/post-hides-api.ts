import type { App } from './identity-fixtures.js';

// The one place the F3.9 tests learn the hide URLs (.work/hide-post/spec.md c1, c4): PUT|DELETE /posts/:id/hide, under /api.

export const hideUrl = (id: string): string => `/api/posts/${id}/hide`;

const headersOf = (header: string | null): Record<string, string> => (header === null ? {} : { authorization: header });

export const putHide = (app: App, header: string | null, id: string) => app.inject({ method: 'PUT', url: hideUrl(id), headers: headersOf(header) });
export const deleteHide = (app: App, header: string | null, id: string) => app.inject({ method: 'DELETE', url: hideUrl(id), headers: headersOf(header) });
