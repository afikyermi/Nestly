import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { forgetDraft } from '@/features/posts/compose-draft';
import { forgetFeed } from '@/features/posts/feed-memory';
import { CurrentReturnContext, ReturnTargetContext } from '@/hooks/use-return-target';
import { useSession } from '@/hooks/use-session';
import { forgetReturnTarget } from '@/services/auth/return-target';
import { decideAccess } from './access';
import { normalizePath, PATHS } from './paths';
import { SessionLoading } from './SessionLoading';

/** The profile or post link a Guest opened, carried to Login in router state (memory and history only; never storage). */
function returnToOf(state: unknown): string | null {
  const value: unknown = typeof state === 'object' && state !== null ? Reflect.get(state, 'returnTo') : undefined;
  return typeof value === 'string' ? value : null;
}

// Wraps every route (FR-AUTH-004). The decision is made before anything renders, so a protected screen
// never reaches the DOM for a Guest, not for one render. A redirect replaces the history entry. This is a
// UX control: the data stays protected by the server and RLS.
// A Guest who opens a profile or post link goes to Login and back to it after signing in (F2.4c2 c27, F3.6 c8); this holds only for a visitor
// who has not had a session in this page load, so signing out never leads to the profile that was open.
export function RouteGuard({ children }: { children: ReactNode }) {
  const { state, notice, needsRecoveryQuestions, mustSetPassword } = useSession();
  const location = useLocation();
  const { storage, landed } = useContext(ReturnTargetContext);
  const hadSession = useRef(false);
  // The password path carries the link in router state; the Google path comes back to a fresh page and finds it in the one-shot note.
  const returnTo = returnToOf(location.state) ?? (normalizePath(location.pathname) === PATHS.googleEntry ? landed : null);
  const decision = decideAccess(state, location.pathname, notice !== null, needsRecoveryQuestions, mustSetPassword, {
    fromGuest: !hadSession.current,
    returnTo,
  });
  useEffect(() => {
    if (state === 'signed-in' || state === 'signed-in-no-account') hadSession.current = true;
    // Signing out leaves no note of a profile or post link and no remembered feed behind.
    else if (state === 'signed-out' && hadSession.current) {
      forgetReturnTarget(storage);
      forgetFeed();
      forgetDraft();
    }
  }, [state, storage]);
  if (decision.kind === 'loading') return <SessionLoading />;
  if (decision.kind === 'redirect') {
    return <Navigate to={decision.to} replace {...(decision.returnTo !== undefined ? { state: { returnTo: decision.returnTo } } : {})} />;
  }
  return <CurrentReturnContext value={returnTo}>{children}</CurrentReturnContext>;
}
