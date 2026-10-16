import { useEffect, useRef, useState } from 'react';
import { useLinkClickHandler, useLocation, useNavigate, useSearchParams } from 'react-router';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { useSessionAccount } from '@/hooks/use-session-account';
import { GOOGLE_FAILED_TEXT, STOPPED_TEXT } from '@/lib/auth-texts';
import { documentTitle } from '@/lib/document-title';
import { GOOGLE_CANCELLED_TEXT, readGoogleReturn } from './google-return';

type Outcome = 'working' | 'failed' | 'cancelled' | 'stopped';

const ALERT_TEXTS: Record<Exclude<Outcome, 'working'>, string> = {
  failed: GOOGLE_FAILED_TEXT,
  cancelled: GOOGLE_CANCELLED_TEXT,
  stopped: STOPPED_TEXT,
};

// The Guest-only return route (FR-AUTH-005, AC-087). It reads the address once, replaces it with the bare path at once (so the code
// and any error are in neither the address bar nor the history), and hands the code to the session source, which exchanges it and runs
// the same account check as a password sign-in. A success changes the session state and the route guard then replaces this screen
// (/feed, or the completion screen); only a failure stays here.
export function GoogleReturn() {
  const account = useSessionAccount();
  const navigate = useNavigate();
  const toLogin = useLinkClickHandler(PATHS.login);
  const toRegister = useLinkClickHandler(PATHS.register);
  const [searchParams] = useSearchParams();
  const { key } = useLocation();
  const [found] = useState(() => readGoogleReturn(searchParams));
  const [outcome, setOutcome] = useState<Outcome>(found.kind === 'code' && account !== null ? 'working' : found.kind === 'cancelled' ? 'cancelled' : 'failed');
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void navigate(PATHS.googleEntry, { replace: true });
    if (found.kind !== 'code') {
      account?.discardGoogleStart();
      return;
    }
    if (account === null) return;
    account.signInWithGoogle(found.code).then(
      (result) => {
        if (result.kind === 'stopped') setOutcome('stopped');
        else if (result.kind === 'failed') setOutcome('failed');
      },
      () => {
        setOutcome('failed');
      },
    );
  }, [account, found, navigate]);

  // The key is a dependency on purpose: the replace-navigation above changes the location, and FocusOnNavigation (an earlier sibling,
  // so its effect runs first in the same commit) then moves focus to `main`. Focusing again on the new key puts it on the heading.
  useEffect(() => {
    if (outcome !== 'working') heading.current?.focus();
  }, [outcome, key]);

  const message = outcome === 'working' ? null : ALERT_TEXTS[outcome];
  return (
    <main tabIndex={-1}>
      <title>{documentTitle('כניסה עם Google')}</title>
      <AuthLayout
        actions={
          message !== null ? (
            <>
              <Button size="lg" block href={PATHS.login} onClick={toLogin}>
                התחברות עם אימייל וסיסמה
              </Button>
              <Button variant="text" href={PATHS.register} onClick={toRegister} className="self-center">
                יצירת חשבון חדש
              </Button>
            </>
          ) : undefined
        }
      >
        <h1 ref={heading} tabIndex={-1} className="mt-4 mb-5 text-h1">
          כניסה עם Google
        </h1>
        {message !== null ? (
          <InlineAlert>{message}</InlineAlert>
        ) : (
          <p role="status" className="text-body text-muted-foreground">
            מתחברים עם Google
          </p>
        )}
      </AuthLayout>
    </main>
  );
}
