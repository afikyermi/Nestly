import { useEffect, useId, useRef, useState } from 'react';
import type { RegistrationStep1 } from '@nestly/shared';
import { AuthLayout } from '@/components/layout/auth-layout';
import { FormField } from '@/components/shared/form-field';
import { RegistrationIllustration } from '@/components/shared/illustrations';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { useSessionAccount } from '@/hooks/use-session-account';
import { useSessionEntry } from '@/hooks/use-session-entry';
import { setFirstPassword } from '@/services/api/password';
import { registerAccount, type RegisterOutcome } from '@/services/api/register-account';
import { ConsentField } from './ConsentField';
import { GENERIC_ERROR_TEXT, RETRY_TEXT, validatePassword } from './step2-form';

export interface RegisterGoogleCompletionStepProps {
  /** The parsed step-1 value, in memory only; it goes to the server with the consent declaration. Null with `submitAccount` (I11 follow-ups). */
  step1: RegistrationStep1 | null;
  /** I11 follow-ups (FR-REG-004, AC-100): creates another kind of account (a Professional's) with the held session instead of POST /api/register. */
  submitAccount?: (accessToken: string) => Promise<RegisterOutcome>;
  /** The email on the Auth user (Google's), shown and never edited or sent. */
  email: string;
  onBack: () => void;
  onSignOut: () => void;
  /** The server did not accept the held session (401): the page signs out and leads to the login screen. */
  onUnauthenticated: () => void;
}

type Notice = 'retry' | 'generic' | null;

// Step 2 of the completion for a user who came in through Google and has no account (F1.8 criteria 7-10): the password they will use
// from now on, and the consent. The final action has the server set the password first (POST /api/password/first, F2.0 c11, c16),
// signs in again with it (the set ends every session, DR-E), and calls POST /api/register only after that; the body of the register
// call has no password. The password lives in this field, that call and the sign-in to Auth, nowhere else.
export function RegisterGoogleCompletionStep({ step1, submitAccount, email, onBack, onSignOut, onUnauthenticated }: RegisterGoogleCompletionStepProps) {
  const account = useSessionAccount();
  const sessionEntry = useSessionEntry();
  const running = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const consentErrorId = `${useId()}-consent-error`;
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const passwordProblem = validatePassword(password);
  const ready = passwordProblem === null && consent;
  const consentError = submitted && !consent;

  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  function clearPassword() {
    if (passwordInput.current !== null) passwordInput.current.value = '';
    setPassword('');
    setTouched(false);
    setSubmitted(false);
  }

  async function submit() {
    if (running.current) return;
    setSubmitted(true);
    if (!ready) {
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
      // The password first: if it is not set, no account is created. The form keeps everything but the password.
      if ((await setFirstPassword(token, password)) === 'failed') {
        clearPassword();
        setNotice('generic');
        return;
      }
      // The server's set ended every session of the user, this one included (F2.0 DR-E): sign in again with the email and the
      // password just set, so the account is created with a live session. A failure here leaves the password set and no account;
      // the user can sign in with it later and finish (the email+password completion).
      const again = await account.signInWithPassword({ email, password });
      if (again.kind !== 'unregistered') {
        if (again.kind === 'failed') {
          clearPassword();
          setNotice('generic');
        } else {
          finished = true; // signed-in (the account exists after all) or stopped: the guard leads on
        }
        return;
      }
      const fresh = await account.getAccessToken();
      if (fresh === null) {
        finished = true;
        onUnauthenticated();
        return;
      }
      const outcome = submitAccount !== undefined ? await submitAccount(fresh) : step1 !== null ? await registerAccount(fresh, step1) : 'failed';
      if (outcome === 'created') {
        finished = true;
        sessionEntry.signIn();
      } else if (outcome === 'unauthenticated') {
        finished = true;
        onUnauthenticated();
      } else if (outcome === 'already_registered') {
        // The account exists after all: ask the server again. Signed-in goes to /feed, a stopped account to the login screen.
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
        <p className="mb-5 text-body text-muted-foreground">בוחרים סיסמה, ואפשר יהיה להתחבר גם בלי Google.</p>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-label text-foreground">אימייל</span>
            <p dir="ltr" className="text-body text-start">
              {email}
            </p>
          </div>
          <FormField label="סיסמה" hint="לפחות 8 תווים" {...((touched || submitted) && passwordProblem !== null ? { error: passwordProblem } : {})}>
            {(control) => (
              <PasswordInput
                {...control}
                autoComplete="new-password"
                toggleLabel="הצגת הסיסמה"
                ref={passwordInput}
                onBlur={() => setTouched(true)}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <ConsentField checked={consent} error={consentError} errorId={consentErrorId} onCheckedChange={setConsent} />
          {notice !== null ? <InlineAlert>{notice === 'retry' ? RETRY_TEXT : GENERIC_ERROR_TEXT}</InlineAlert> : null}
          <span role="status" className="sr-only">
            {busy ? 'יוצרים את החשבון' : ''}
          </span>
        </div>
      </AuthLayout>
    </form>
  );
}
