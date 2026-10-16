import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { RegistrationFlow, type GoogleLookup } from '@/features/registration/RegistrationFlow';
import { useSession } from '@/hooks/use-session';
import { useSessionAccount } from '@/hooks/use-session-account';

// PG-004 Registration. The page composes the flow and owns the navigation of its screen. A signed-in user without an account
// (F1.5, DR-2) gets the flow in completion mode; when that session ends, the page leads away from /register: to the login
// screen when the session ended by itself (a stopped account, expired) or the server refused it, otherwise (logout) to Welcome.
export function RegisterPage() {
  const { state, notice, signOut } = useSession();
  const navigate = useNavigate();
  const account = useSessionAccount();
  const [google, setGoogle] = useState<GoogleLookup>({ status: 'pending' });
  const [lookupTick, setLookupTick] = useState(0);
  const exitTo = useRef<string | null>(null);
  const previous = useRef(state);

  useEffect(() => {
    if (previous.current === 'signed-in-no-account' && state === 'signed-out') {
      void navigate(exitTo.current ?? (notice !== null ? PATHS.login : PATHS.welcome), { replace: true });
      exitTo.current = null;
    }
    previous.current = state;
  }, [state, notice, navigate]);

  // A user who came in through Google gets a password step in the completion (F1.8); Auth says who that is. A source that cannot tell
  // (the test-only one) has no Google user.
  const completing = state === 'signed-in-no-account';
  useEffect(() => {
    if (!completing) return;
    if (account === null) {
      setGoogle({ status: 'none' });
      return;
    }
    let current = true;
    setGoogle({ status: 'pending' });
    account.googleAccount().then(
      (found) => {
        if (current) setGoogle(found === null ? { status: 'none' } : { status: 'google', email: found.email });
      },
      () => {
        if (current) setGoogle({ status: 'failed', onRetry: () => setLookupTick((tick) => tick + 1) });
      },
    );
    return () => {
      current = false;
    };
  }, [completing, account, lookupTick]);

  const completion =
    state === 'signed-in-no-account'
      ? {
          onSignOut: () => void signOut(),
          google,
          onUnauthenticated: () => {
            exitTo.current = PATHS.login;
            void signOut();
          },
        }
      : undefined;
  return <RegistrationFlow {...(completion !== undefined ? { completion } : {})} />;
}
