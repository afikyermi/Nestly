import { userIdOfProfilePath } from '@/lib/profile-link';
import type { ReturnTargetStorage } from '@/platform/browser-return-target';

// A Guest who opened a profile link and signs in with Google leaves the app and comes back to a fresh page, so the router state that
// carries the link on the password path is gone (F2.4c2 c27). The link is held in one one-shot note until the return: `{path, at}`,
// the path being `/u/<uuid>` only, no profile data. Read once and removed at once; a note older than 10 minutes, or one that is not a
// profile link, is ignored. Blocked storage means no note, and the sign-in lands on the landing page.
const MAX_AGE_MS = 10 * 60 * 1000;

/** Notes `path` before the redirect to Google, only if it is a profile link. */
export function rememberReturnTarget(storage: ReturnTargetStorage, path: string, now: number): void {
  if (userIdOfProfilePath(path) === null) return;
  storage.write(JSON.stringify({ path, at: now }));
}

/** The noted profile link, once: the note is removed whatever it holds. Null when there is none, it is stale, or it is not valid. */
export function takeReturnTarget(storage: ReturnTargetStorage, now: number): string | null {
  const raw = storage.read();
  storage.remove();
  if (raw === null) return null;
  try {
    const note: unknown = JSON.parse(raw);
    const path: unknown = typeof note === 'object' && note !== null ? Reflect.get(note, 'path') : undefined;
    const at: unknown = typeof note === 'object' && note !== null ? Reflect.get(note, 'at') : undefined;
    if (typeof path !== 'string' || typeof at !== 'number' || now - at > MAX_AGE_MS || at > now) return null;
    return userIdOfProfilePath(path) === null ? null : path;
  } catch {
    return null;
  }
}

/** Drops the note (sign-out, or a Google start that failed). */
export function forgetReturnTarget(storage: ReturnTargetStorage): void {
  storage.remove();
}
