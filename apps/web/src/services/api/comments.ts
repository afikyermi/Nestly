import { commentReplyPage, commentThreadPage, commentView, type CommentReplyPage, type CommentThreadPage, type CommentView } from '@nestly/shared';

// GET|POST /api/posts/:id/comments, GET /api/comments/:id/replies, DELETE /api/comments/:id (F3.3 w1; FR-FEED-003). No author id or user id is
// ever sent: the server acts on the token's user, and a comment is named by its row id in the path. The cursor is opaque: it goes back exactly
// as the server gave it, in the query only. Only the status, the one `error` code and a body that passes the shared response schema are read;
// no response text reaches the screen. The comment text goes in the request body only: not a URL, not storage, not a log line.
export type CommentsOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'deleted' } // 204
  | { kind: 'unavailable' } // 404: missing, not readable, or (a delete) not the caller's
  | { kind: 'refused'; reason: 'body_required' | 'body_too_long' } // 422
  | { kind: 'not-allowed' } // 403 not_allowed
  | { kind: 'muted' } // 403 muted: muted in the post's Group (I10-C)
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'failed' }; // anything else: 5xx, 400, an unreadable answer, or the call did not reach the server

const FAILED = { kind: 'failed' } as const;

type Call = { method: 'GET' | 'DELETE'; path: string } | { method: 'POST'; path: string; body: { body: string; parentId?: string } };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
}

type Parse<T> = (body: unknown) => { success: true; data: T } | { success: false };

async function call<T>(accessToken: string, init: Call, parse: Parse<T>): Promise<CommentsOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(init.path, {
      method: init.method,
      headers: { authorization: `Bearer ${accessToken}`, ...('body' in init ? { 'content-type': 'application/json' } : {}) },
      ...('body' in init ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 204) return init.method === 'DELETE' ? { kind: 'deleted' } : FAILED;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return FAILED;
  }
  const code = errorCode(body);
  if (response.status === 403) {
    if (code === 'account_unavailable') return { kind: 'account-unavailable' };
    if (code === 'muted') return { kind: 'muted' };
    return code === 'not_allowed' ? { kind: 'not-allowed' } : FAILED;
  }
  if (response.status === 404) return { kind: 'unavailable' };
  if (response.status === 422) return code === 'body_required' || code === 'body_too_long' ? { kind: 'refused', reason: code } : FAILED;
  if (response.status !== 200 && response.status !== 201) return FAILED;
  const parsed = parse(body);
  return parsed.success ? { kind: 'ok', value: parsed.data } : FAILED;
}

/** The thread's query: the cursor, and the Private Group a staff member reviews (I14 completion B: its comments open with it, audited). */
const threadQuery = (cursor: string | null, reviewGroupId: string | undefined): string => {
  const params = new URLSearchParams();
  if (cursor !== null) params.set('cursor', cursor);
  if (reviewGroupId !== undefined) params.set('group', reviewGroupId);
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
};
const created: Parse<CommentView> = (body) => commentView.safeParse(typeof body === 'object' && body !== null ? Reflect.get(body, 'comment') : undefined);

/** GET /api/posts/:id/comments: one page of the thread, oldest first. */
export const fetchThread = (accessToken: string, postId: string, cursor: string | null, reviewGroupId?: string): Promise<CommentsOutcome<CommentThreadPage>> =>
  call(
    accessToken,
    { method: 'GET', path: `/api/posts/${encodeURIComponent(postId)}/comments${threadQuery(cursor, reviewGroupId)}` },
    (body) => commentThreadPage.safeParse(body),
  );

/** GET /api/comments/:id/replies: one page of a comment's replies, the first call from the oldest. */
export const fetchReplies = (accessToken: string, commentId: string, cursor: string | null, reviewGroupId?: string): Promise<CommentsOutcome<CommentReplyPage>> =>
  call(accessToken, { method: 'GET', path: `/api/comments/${encodeURIComponent(commentId)}/replies${threadQuery(cursor, reviewGroupId)}` }, (body) => commentReplyPage.safeParse(body));

/** POST /api/posts/:id/comments with the checked text (and the parent's id for a reply). The answer is the stored comment. */
export const createComment = (accessToken: string, postId: string, write: { body: string; parentId?: string }): Promise<CommentsOutcome<CommentView>> =>
  call(accessToken, { method: 'POST', path: `/api/posts/${encodeURIComponent(postId)}/comments`, body: write }, created);

/** DELETE /api/comments/:id: immediate and permanent; its replies and likes go with it. */
export const deleteComment = (accessToken: string, commentId: string): Promise<CommentsOutcome<never>> =>
  call(accessToken, { method: 'DELETE', path: `/api/comments/${encodeURIComponent(commentId)}` }, () => ({ success: false }));
