import type { App } from './identity-fixtures.js';

// The one place the F3.3-b2 tests learn the like URLs (.work/comments-likes/spec.md c10): PUT|DELETE /posts/:id/like and /comments/:id/like, under /api.

export type LikeKind = 'post' | 'comment';
export const likeUrl = (kind: LikeKind, id: string): string => `/api/${kind === 'post' ? 'posts' : 'comments'}/${id}/like`;

const headersOf = (header: string | null): Record<string, string> => (header === null ? {} : { authorization: header });

export const putLike = (app: App, header: string | null, kind: LikeKind, id: string) =>
  app.inject({ method: 'PUT', url: likeUrl(kind, id), headers: headersOf(header) });
export const deleteLike = (app: App, header: string | null, kind: LikeKind, id: string) =>
  app.inject({ method: 'DELETE', url: likeUrl(kind, id), headers: headersOf(header) });
