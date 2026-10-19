import type { App } from './identity-fixtures.js';

// The one place the F3.3-b1 tests learn the comment URLs (.work/comments-likes/spec.md c3, c8, c9). Every route sits under `/api`.

const headersOf = (header: string | null, json: boolean): Record<string, string> => ({
  ...(header === null ? {} : { authorization: header }),
  ...(json ? { 'content-type': 'application/json' } : {}),
});

export const commentsUrl = (postId: string): string => `/api/posts/${postId}/comments`;
export const commentUrl = (id: string): string => `/api/comments/${id}`;

export const addComment = (app: App, header: string | null, postId: string, payload: unknown) =>
  app.inject({ method: 'POST', url: commentsUrl(postId), headers: headersOf(header, true), payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
export const listComments = (app: App, header: string | null, postId: string, cursor?: string) =>
  app.inject({ method: 'GET', url: cursor === undefined ? commentsUrl(postId) : `${commentsUrl(postId)}?cursor=${encodeURIComponent(cursor)}`, headers: headersOf(header, false) });
export const deleteComment = (app: App, header: string | null, id: string) =>
  app.inject({ method: 'DELETE', url: commentUrl(id), headers: headersOf(header, false) });
