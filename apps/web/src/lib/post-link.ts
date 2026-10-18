import { postPathParams } from '@nestly/shared';

// The address of a post (F3.1b): `/posts/<post id>` and nothing else in it. `/posts/new` is the composer, a fixed path of its own.
export const POST_PATTERN = '/posts/:postId';

export const postPath = (postId: string): string => `/posts/${postId}`;

/** The post id of a `/posts/<id>` path (any trailing slash already removed), else null: only a uuid counts. */
export function postIdOfPath(path: string): string | null {
  const match = /^\/posts\/([^/]+)$/.exec(path);
  const checked = postPathParams.safeParse({ id: match?.[1] });
  return checked.success ? checked.data.id : null;
}
