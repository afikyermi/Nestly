import {
  mediaImage,
  profilePhotoResponse,
  storiesResponse,
  storyCreatedResponse,
  type MediaImage,
  type MediaKind,
  type StoriesResponse,
  type StoryAudience,
} from '@nestly/shared';

// Images, the profile photo and Stories (I5; the approval queue's calls are services/api/admin.ts). Only the status, the one `error` code and a body that passes the shared
// schema are read; no response text reaches the screen. An image travels as its own bytes (already shrunk by the browser), never in a URL.
export type MediaOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'unsupported' } // 415: not a picture the server reads (ERR-039)
  | { kind: 'too-large' } // 413
  | { kind: 'story-limit' } // 429 story_limit (ERR-040)
  | { kind: 'caption-too-long' } // 422 caption_too_long
  | { kind: 'not-available' } // 422 image_not_available, 404
  | { kind: 'not-allowed' } // 403 not_allowed | forbidden
  | { kind: 'unauthenticated' } // 401
  | { kind: 'account-unavailable' } // 403 account_unavailable (ERR-037)
  | { kind: 'failed' };

const FAILED = { kind: 'failed' } as const;

async function call<T>(accessToken: string, path: string, init: { method: string; body?: Blob | string; type?: string }, read: (body: unknown) => T | undefined): Promise<MediaOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method,
      headers: { authorization: `Bearer ${accessToken}`, ...(init.type === undefined ? {} : { 'content-type': init.type }) },
      ...(init.body === undefined ? {} : { body: init.body }),
      cache: 'no-store',
    });
  } catch {
    return FAILED;
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 413) return { kind: 'too-large' };
  if (response.status === 204) {
    const value = read(undefined);
    return value === undefined ? FAILED : { kind: 'ok', value };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return FAILED;
  }
  const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
  if (response.status === 415) return { kind: 'unsupported' };
  if (response.status === 429) return code === 'story_limit' ? { kind: 'story-limit' } : FAILED;
  if (response.status === 422) return code === 'caption_too_long' ? { kind: 'caption-too-long' } : { kind: 'not-available' };
  if (response.status === 404) return { kind: 'not-available' };
  if (response.status === 403) return code === 'account_unavailable' ? { kind: 'account-unavailable' } : { kind: 'not-allowed' };
  if (response.status !== 200 && response.status !== 201) return FAILED;
  const value = read(body);
  return value === undefined ? FAILED : { kind: 'ok', value };
}

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
const parse =
  <T>(schema: Schema<T>) =>
  (body: unknown): T | undefined => {
    const parsed = schema.safeParse(body);
    return parsed.success ? parsed.data : undefined;
  };

/** POST /api/media?kind=: the shrunk picture; the answer is the new image (pending). */
export const uploadImage = (accessToken: string, kind: MediaKind, blob: Blob): Promise<MediaOutcome<MediaImage>> =>
  call(accessToken, `/api/media?kind=${kind}`, { method: 'POST', body: blob, type: blob.type === '' ? 'image/jpeg' : blob.type }, parse(mediaImage));

export const fetchProfilePhoto = (accessToken: string): Promise<MediaOutcome<MediaImage | null>> =>
  call(accessToken, '/api/profile/photo', { method: 'GET' }, (body) => parse(profilePhotoResponse)(body)?.photo);
export const setProfilePhoto = (accessToken: string, mediaId: string): Promise<MediaOutcome<MediaImage | null>> =>
  call(accessToken, '/api/profile/photo', { method: 'PUT', body: JSON.stringify({ mediaId }), type: 'application/json' }, (body) => parse(profilePhotoResponse)(body)?.photo);
export const removeProfilePhoto = (accessToken: string): Promise<MediaOutcome<null>> =>
  call(accessToken, '/api/profile/photo', { method: 'DELETE' }, () => null);

export const fetchStories = (accessToken: string): Promise<MediaOutcome<StoriesResponse>> =>
  call(accessToken, '/api/stories', { method: 'GET' }, parse(storiesResponse));
export const createStory = (accessToken: string, input: { mediaId: string; caption?: string; audience: StoryAudience }): Promise<MediaOutcome<string>> =>
  call(accessToken, '/api/stories', { method: 'POST', body: JSON.stringify(input), type: 'application/json' }, (body) => parse(storyCreatedResponse)(body)?.id);
