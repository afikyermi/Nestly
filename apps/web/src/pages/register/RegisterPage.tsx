import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { RegistrationFlow } from '@/features/registration/RegistrationFlow';
import { useSession } from '@/hooks/use-session';

// PG-004 Registration. The page composes the flow and owns the navigation of its screen. A signed-in user without an account
// (F1.5, DR-2) gets the flow in completion mode; when that session ends, the page leads away from /register: to the login
// screen when the session ended by itself (a stopped account, expired) or the server refused it, otherwise (logout) to Welcome.
export function RegisterPage() {
  const { state, notice, signOut } = useSession();
  const navigate = useNavigate();
  const exitTo = useRef<string | null>(null);
  const previous = useRef(state);

  useEffect(() => {
    if (previous.current === 'signed-in-no-account' && state === 'signed-out') {
      void navigate(exitTo.current ?? (notice !== null ? PATHS.login : PATHS.welcome), { replace: true });
      exitTo.current = null;
    }
    previous.current = state;
  }, [state, notice, navigate]);

  const completion =
    state === 'signed-in-no-account'
      ? {
          onSignOut: () => void signOut(),
          onUnauthenticated: () => {
            exitTo.current = PATHS.login;
            void signOut();
          },
        }
      : undefined;
  return <RegistrationFlow {...(completion !== undefined ? { completion } : {})} />;
}
