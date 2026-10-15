import { useEffect, useId, useRef, useState } from 'react';
import type { RegistrationStep1 } from '@nestly/shared';
import { AuthLayout } from '@/components/layout/auth-layout';
import { RegistrationIllustration } from '@/components/shared/illustrations';
import { InlineAlert } from '@/components/shared/inline-alert';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { useSessionAccount } from '@/hooks/use-session-account';
import { useSessionEntry } from '@/hooks/use-session-entry';
import { registerAccount } from '@/services/api/register-account';
import { ConsentField } from './ConsentField';
import { GENERIC_ERROR_TEXT, RETRY_TEXT } from './step2-form';

export interface RegisterConsentStepProps {
  /** The parsed step-1 value, in memory only; it goes to the server with the consent declaration. */
  step1: RegistrationStep1;
  onBack: () => void;
  onSignOut: () => void;
  /** The server did not accept the held session (401): the page signs out and leads to the login screen. */
  onUnauthenticated: () => void;
}

type Notice = 'retry' | 'generic' | null;

// The completion step (F1.5 criterion 16): the user signed in with Auth but the account was never created. Only the consent is
// asked again (it is recorded at creation); the held session goes to POST /api/register, with no sign-up and no email or password.
export function RegisterConsentStep({ step1, onBack, onSignOut, onUnauthenticated }: RegisterConsentStepProps) {
  const account = useSessionAccount();
  const sessionEntry = useSessionEntry();
  const formRef = useRef<HTMLFormElement>(null);
  const running = useRef(false);
  const consentErrorId = `${useId()}-consent-error`;
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const consentError = submitted && !consent;

  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  async function submit() {
    if (running.current) return;
    setSubmitted(true);
    if (!consent) {
      setFocusTick((tick) => tick + 1);
      return;
    }
    running.current = true;
    setBusy(true);
    setNotice(null);
    let finished = false;
    try {
      if (account === null || sessionEntry === null) {
        setNotice('retry');
        return;
      }
      const token = await account.getAccessToken();
      if (token === null) {
        finished = true;
        onUnauthenticated();
        return;
      }
      const outcome = await registerAccount(token, step1);
      if (outcome === 'created') {
        finished = true;
        sessionEntry.signIn();
      } else if (outcome === 'unauthenticated') {
        finished = true;
        onUnauthenticated();
      } else if (outcome === 'already_registered') {
        // The account exists after all: ask the server again. Signed-in goes to /feed, a stopped account to the login screen;
        // if the server cannot answer, the user stays here and may press the button again.
        await account.recheck();
        setNotice('retry');
      } else {
        setNotice(outcome === 'unavailable' ? 'retry' : 'generic');
      }
    } finally {
      running.current = false;
      if (!finished) setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <AuthLayout
        back={
          <Button iconOnly label="חזרה" onClick={onBack}>
            <ArrowBackIcon />
          </Button>
        }
        actions={
          <>
            <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
              יצירת חשבון
            </Button>
            <Button variant="text" onClick={onSignOut} className="self-center">
              התנתקות
            </Button>
          </>
        }
      >
        <StepIndicator current={2} total={2} />
        <div className="my-2 flex justify-center">
          <RegistrationIllustration />
        </div>
        <h1 className="mb-1 text-h1">השלמת ההרשמה</h1>
        <p className="mb-5 text-body text-muted-foreground">עוד רגע מסיימים.</p>
        <div className="flex flex-col gap-5">
          <ConsentField checked={consent} error={consentError} errorId={consentErrorId} onCheckedChange={setConsent} />
          {notice !== null ? (
            <InlineAlert>{notice === 'retry' ? RETRY_TEXT : GENERIC_ERROR_TEXT}</InlineAlert>
          ) : null}
          <span role="status" className="sr-only">
            {busy ? 'יוצרים את החשבון' : ''}
          </span>
        </div>
      </AuthLayout>
    </form>
  );
}
