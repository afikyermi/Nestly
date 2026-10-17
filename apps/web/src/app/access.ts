import type { SessionState } from '@/services/session/session-source';
import { GUEST_LANDING, GUEST_PATHS, normalizePath, PATHS, PROTECTED_PATHS, SIGNED_IN_LANDING } from './paths';

export type AccessDecision = { kind: 'loading' } | { kind: 'render' } | { kind: 'redirect'; to: string };

const COMPLETION_PATHS: readonly string[] = [PATHS.register, PATHS.terms, PATHS.privacy];
const QUESTIONS_HELD_PATHS: readonly string[] = [PATHS.recoveryQuestions, PATHS.terms, PATHS.privacy];
const NEW_PASSWORD_HELD_PATHS: readonly string[] = [PATHS.setNewPassword, PATHS.terms, PATHS.privacy];
const RENDER: AccessDecision = { kind: 'render' };
const LOADING: AccessDecision = { kind: 'loading' };
const redirect = (to: string): AccessDecision => ({ kind: 'redirect', to });

// The route guard's decision (FR-AUTH-004), with no DOM: from the session state and the requested path to
// "render", "loading" or a redirect target. Deny by default: only the Guest allow-list is open to a Guest,
// and any state other than loading, signed-in or signed-in-no-account is treated as signed-out.
// `sessionEnded`: the session ended by itself (expired, or the account is stopped); a protected path then leads to the login
// screen, which says why, instead of to Welcome (F1.5 criteria 11, 13).
// `needsQuestions` (F1.6): the account is active but has no recovery questions; everything except the questions screen and the two
// documents leads to that screen, so there is no way past it.
// `mustSetPassword` (F2.0 c14): the session must set a new password after a takeover clear; it holds before the questions do, and the
// new-password screen opens only while it holds.
export function decideAccess(
  state: SessionState,
  pathname: string,
  sessionEnded = false,
  needsQuestions = false,
  mustSetPassword = false,
): AccessDecision {
  if (state === 'loading') return LOADING;
  const path = normalizePath(pathname);
  const isGuestPath = GUEST_PATHS.includes(path);
  if (state === 'signed-in') {
    if (mustSetPassword) return NEW_PASSWORD_HELD_PATHS.includes(path) ? RENDER : redirect(PATHS.setNewPassword);
    if (needsQuestions) return QUESTIONS_HELD_PATHS.includes(path) ? RENDER : redirect(PATHS.recoveryQuestions);
    if (isGuestPath) return redirect(SIGNED_IN_LANDING);
    return PROTECTED_PATHS.includes(path) ? RENDER : redirect(SIGNED_IN_LANDING);
  }
  // Signed in with Auth but no account yet (DR-2): the registration screen (completion mode) and the two documents its consent
  // step links to.
  if (state === 'signed-in-no-account') return COMPLETION_PATHS.includes(path) ? RENDER : redirect(PATHS.register);
  if (isGuestPath) return RENDER;
  return redirect(sessionEnded ? PATHS.login : GUEST_LANDING);
}
