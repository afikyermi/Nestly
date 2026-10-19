import { postPageView, postView, type PostCreate, type PostPageView, type PostView, type PostWrite } from '@nestly/shared';

// POST /api/posts, GET|PATCH|DELETE /api/posts/:id (F3.1b; FR-FEED-002, OP-033). No author id is ever sent: the server acts on the
// token's user. A post is named by its row id in the path only. Only the status, the one `error` code and a body that passes the
// shared response schema are read; no response text reaches the screen. The post text goes in the request body only: not a URL,
// not storage, not a log line.
export type PostsOutcome<T = PostView> =
  | { kind: 'post'; post: T }
  | { kind: 'deleted' } // 204
  | { kind: 'unavailable' } // 404 not_found: one answer for missing, not readable and not yours
  | { kind: 'refused'; reason: 'body_required' | 'body_too_long' } // 422 (audience_not_allowed is 'failed': the form cannot send it)
  | { kind: 'not-allowed' } // 403 not_allowed: the database refused (a Professional, a stopped account)
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable: the session guard (ERR-037)
  | { kind: 'failed' }; // anything else: 5xx, 400, an unreadable answer, or the call did not reach the server

const FAILED = { kind: 'failed' } as const;

type Call =
  | { method: 'GET' | 'DELETE'; path: string }
  | { method: 'POST' | 'PATCH'; path: string; body: PostCreate };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
}

async function call<T extends PostView>(accessToken: string, init: Call, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): Promise<PostsOutcome<T>> {
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
    return code === 'not_allowed' ? { kind: 'not-allowed' } : FAILED;
  }
  if (response.status === 404) return code === 'not_found' ? { kind: 'unavailable' } : FAILED;
  if (response.status === 422) return code === 'body_required' || code === 'body_too_long' ? { kind: 'refused', reason: code } : FAILED;
  if (response.status !== 200 && response.status !== 201) return FAILED;
  const parsed = schema.safeParse(body);
  return parsed.success ? { kind: 'post', post: parsed.data } : FAILED;
}

/** POST /api/posts with the checked values (`isAnonymous` only for an anonymous post). The answer is the stored post. */
export const createPost = (accessToken: string, write: PostCreate): Promise<PostsOutcome> =>
  call(accessToken, { method: 'POST', path: '/api/posts', body: write }, postView);

/** GET /api/posts/:id. The answer says whether the post is the caller's; a share answers its sharer, text and original (F3.5 c7). */
export const fetchPost = (accessToken: string, postId: string): Promise<PostsOutcome<PostPageView>> =>
  call(accessToken, { method: 'GET', path: `/api/posts/${encodeURIComponent(postId)}` }, postPageView);

/** PATCH /api/posts/:id with the changed values. The answer is the stored post (without `isMine`). */
export const editPost = (accessToken: string, postId: string, write: PostWrite): Promise<PostsOutcome> =>
  call(accessToken, { method: 'PATCH', path: `/api/posts/${encodeURIComponent(postId)}`, body: write }, postView);

/** DELETE /api/posts/:id: immediate and permanent (Afik 3א). */
export const deletePost = (accessToken: string, postId: string): Promise<PostsOutcome> =>
  call(accessToken, { method: 'DELETE', path: `/api/posts/${encodeURIComponent(postId)}` }, postView);
