import { useId, useRef, useState } from 'react';
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
import { registerAccount } from '@/services/api/register-account';
import { ConsentField } from './ConsentField';
import { GENERIC_ERROR_TEXT, RETRY_TEXT, validatePassword } from './step2-form';

export interface RegisterGoogleCompletionStepProps {
  /** The parsed step-1 value, in memory only; it goes to the server with the consent declaration. */
  step1: RegistrationStep1;
  /** The email on the Auth user (Google's), shown and never edited or sent. */
  email: string;
  onBack: () => void;
  onSignOut: () => void;
  /** The server did not accept the held session (401): the page signs out and leads to the login screen. */
  onUnauthenticated: () => void;
}

type Notice = 'retry' | 'generic' | null;

// Step 2 of the completion for a user who came in through Google and has no account (F1.8 criteria 7-10): the password they will use
// from now on, and the consent. The final action sets the password with Auth first and calls POST /api/register only after that
// has answered; the body of the register call has no password. The password lives in this field and in a call to Auth, nowhere else.
export function RegisterGoogleCompletionStep({ step1, email, onBack, onSignOut, onUnauthenticated }: RegisterGoogleCompletionStepProps) {
  const account = useSessionAccount();
  const sessionEntry = useSessionEntry();
  const running = useRef(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const consentErrorId = `${useId()}-consent-error`;
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const passwordProblem = validatePassword(password);
  const ready = passwordProblem === null && consent;

  function clearPassword() {
    if (passwordInput.current !== null) passwordInput.current.value = '';
    setPassword('');
    setTouched(false);
  }

  async function submit() {
    if (running.current || !ready) return;
    running.current = true;
    setBusy(true);
    setNotice(null);
    let finished = false;
    try {
      if (account === null || sessionEntry === null) {
        setNotice('retry');
        return;
      }
      // Auth first: if the password is not set, no account is created. The form keeps everything but the password.
      if ((await account.setPassword(password)) === 'failed') {
        clearPassword();
        setNotice('generic');
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
            <Button type="submit" size="lg" block pending={busy} disabled={!ready}>
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
          <FormField label="סיסמה" hint="לפחות 8 תווים" {...(touched && passwordProblem !== null ? { error: passwordProblem } : {})}>
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
          <ConsentField checked={consent} error={false} errorId={consentErrorId} onCheckedChange={setConsent} />
          {notice !== null ? <InlineAlert>{notice === 'retry' ? RETRY_TEXT : GENERIC_ERROR_TEXT}</InlineAlert> : null}
          <span role="status" className="sr-only">
            {busy ? 'יוצרים את החשבון' : ''}
          </span>
        </div>
      </AuthLayout>
    </form>
  );
}
