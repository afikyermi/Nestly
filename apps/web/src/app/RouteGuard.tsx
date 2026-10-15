import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/hooks/use-session';
import { decideAccess } from './access';
import { SessionLoading } from './SessionLoading';

// Wraps every route (FR-AUTH-004). The decision is made before anything renders, so a protected screen
// never reaches the DOM for a Guest, not for one render. A redirect replaces the history entry. This is a
// UX control: the data stays protected by the server and RLS.
export function RouteGuard({ children }: { children: ReactNode }) {
  const { state, notice, needsRecoveryQuestions } = useSession();
  const { pathname } = useLocation();
  const decision = decideAccess(state, pathname, notice !== null, needsRecoveryQuestions);
  if (decision.kind === 'loading') return <SessionLoading />;
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  return children;
}
