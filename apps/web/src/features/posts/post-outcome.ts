import { STOPPED_TEXT } from '@/lib/auth-texts';
import type { PostsOutcome } from '@/services/api/posts';
import type { PostFormErrors } from './post-form';
import { BODY_REQUIRED_TEXT, BODY_TOO_LONG_TEXT } from './posts-texts';

/** A 422 from the server (the shared rule said no after the web's own check said yes): the field error; else null. */
export function refusedErrors(outcome: PostsOutcome<unknown>): PostFormErrors | null {
  if (outcome.kind !== 'refused') return null;
  return { body: outcome.reason === 'body_required' ? BODY_REQUIRED_TEXT : BODY_TOO_LONG_TEXT };
}

/** What a call that did not go through says (a 403 too: screen.md has one failure text per action): never a status, a code or a server text (conventions: user-facing errors). */
export function failureText(outcome: PostsOutcome<unknown>, fallback: string): string {
  if (outcome.kind === 'account-unavailable') return STOPPED_TEXT;
  return fallback;
}
