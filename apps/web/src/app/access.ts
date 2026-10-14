import type { SessionState } from '@/services/session/session-source';
import { GUEST_LANDING, GUEST_PATHS, normalizePath, PROTECTED_PATHS, SIGNED_IN_LANDING } from './paths';

export type AccessDecision = { kind: 'loading' } | { kind: 'render' } | { kind: 'redirect'; to: string };

const RENDER: AccessDecision = { kind: 'render' };
const LOADING: AccessDecision = { kind: 'loading' };
const redirect = (to: string): AccessDecision => ({ kind: 'redirect', to });

// The route guard's decision (FR-AUTH-004), with no DOM: from the session state and the requested path to
// "render", "loading" or a redirect target. Deny by default: only the Guest allow-list is open to a Guest,
// and any state other than loading or signed-in is treated as signed-out.
export function decideAccess(state: SessionState, pathname: string): AccessDecision {
  if (state === 'loading') return LOADING;
  const path = normalizePath(pathname);
  const isGuestPath = GUEST_PATHS.includes(path);
  if (state === 'signed-in') {
    if (isGuestPath) return redirect(SIGNED_IN_LANDING);
    return PROTECTED_PATHS.includes(path) ? RENDER : redirect(SIGNED_IN_LANDING);
  }
  return isGuestPath ? RENDER : redirect(GUEST_LANDING);
}
