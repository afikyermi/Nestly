import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/hooks/use-session';
import { decideAccess } from './access';
import { SessionLoading } from './SessionLoading';

/** The profile link a Guest opened, carried to Login in router state (memory and history only; never storage). */
function returnToOf(state: unknown): string | null {
  const value: unknown = typeof state === 'object' && state !== null ? Reflect.get(state, 'returnTo') : undefined;
  return typeof value === 'string' ? value : null;
}

// Wraps every route (FR-AUTH-004). The decision is made before anything renders, so a protected screen
// never reaches the DOM for a Guest, not for one render. A redirect replaces the history entry. This is a
// UX control: the data stays protected by the server and RLS.
// A Guest who opens a profile link goes to Login and back to the profile after signing in (F2.4c2 c27); this holds only for a visitor
// who has not had a session in this page load, so signing out never leads to the profile that was open.
export function RouteGuard({ children }: { children: ReactNode }) {
  const { state, notice, needsRecoveryQuestions, mustSetPassword } = useSession();
  const location = useLocation();
  const hadSession = useRef(false);
  const decision = decideAccess(state, location.pathname, notice !== null, needsRecoveryQuestions, mustSetPassword, {
    fromGuest: !hadSession.current,
    returnTo: returnToOf(location.state),
  });
  useEffect(() => {
    if (state === 'signed-in' || state === 'signed-in-no-account') hadSession.current = true;
  }, [state]);
  if (decision.kind === 'loading') return <SessionLoading />;
  if (decision.kind === 'redirect') {
    return <Navigate to={decision.to} replace {...(decision.returnTo !== undefined ? { state: { returnTo: decision.returnTo } } : {})} />;
  }
  return children;
}
