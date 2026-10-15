import { useEffect, useId, useRef, useState } from 'react';
import { useLinkClickHandler } from 'react-router';
import type { RegistrationStep1 } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { FormField } from '@/components/shared/form-field';
import { RegistrationIllustration } from '@/components/shared/illustrations';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { TextInput } from '@/components/ui/text-input';
import type { SignUpResponse } from '@/services/auth/auth-client';
import { useAuthPort } from '@/hooks/use-auth-port';
import { useSessionEntry } from '@/hooks/use-session-entry';
import { registerAccount, type RegisterOutcome } from '@/services/api/register-account';
import { ConsentField } from './ConsentField';
import {
  GENERIC_ERROR_TEXT,
  PASSWORD_LENGTH_TEXT,
  RATE_LIMITED_TEXT,
  HELD_TEXT,
  RETRY_TEXT,
  TAKEN_TEXT,
  classifySignUpFailure,
  type CredentialErrors,
  type SignUpProblem,
  validateCredentials,
} from './step2-form';

export interface RegisterStepTwoProps {
  /** The parsed step-1 value, in memory only; it goes to the server with the consent declaration. */
  step1: RegistrationStep1;
  /** The email lives in the flow, so it survives "חזרה" and a return to this step (criterion 19). The password does not. */
  email: string;
  onEmailChange: (email: string) => void;
  onBack: () => void;
}

// What sits above the actions after a submit. `retry` is the only one with a retry control (criteria 11, 12).
type Notice = 'taken' | 'rate_limited' | 'retry' | 'generic' | null;

const PROBLEM_NOTICE: Record<Exclude<SignUpProblem, 'weak_password'>, Notice> = {
  taken: 'taken',
  rate_limited: 'rate_limited',
  unavailable: 'retry',
  unknown: 'generic',
};
const OUTCOME_NOTICE: Record<Exclude<RegisterOutcome, 'created'>, Notice> = {
  already_registered: 'taken',
  unauthenticated: 'taken',
  unavailable: 'retry',
  failed: 'generic',
};

// Registration step 2 (FR-REG-004): email, password and one consent. Sign-up goes to Auth from here, then the new session
// calls our server. The session token and the password live in this component's memory only; nothing is stored (Q7).
export function RegisterStepTwo({ step1, email, onEmailChange, onBack }: RegisterStepTwoProps) {
  const authPort = useAuthPort();
  const sessionEntry = useSessionEntry();
  const toLogin = useLinkClickHandler(PATHS.login);
  const toRecovery = useLinkClickHandler(PATHS.recovery);
  const formRef = useRef<HTMLFormElement>(null);
  const running = useRef(false);
  const accessToken = useRef<string | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const consentErrorId = `${useId()}-consent-error`;
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  // True once Auth holds this email and password for us and the account is not created yet: both fields are then locked.
  const [held, setHeld] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Auth refused the password as too weak: shown as the password field's error until the password changes.
  const [passwordRefused, setPasswordRefused] = useState(false);

  const checked = submitted ? validateCredentials(email, password) : null;
  const errors: CredentialErrors = checked !== null && !checked.ok ? checked.errors : {};
  const passwordError = errors.password ?? (passwordRefused ? PASSWORD_LENGTH_TEXT : undefined);
  const consentError = submitted && !consent;

  // After a refused submit, focus goes to the first invalid control in document order.
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  // Signs up with Auth. Returns the session token, or null after setting what the screen shows instead.
  async function signUp(credentials: { email: string; password: string }): Promise<string | null> {
    let response: SignUpResponse;
    try {
      response = await authPort.signUp(credentials);
    } catch {
      // A call that never answered is a network failure: the same message and a retry that signs up again (Q8).
      setNotice('retry');
      return null;
    }
    if (response.failure === null) return response.accessToken;
    const problem = classifySignUpFailure(response.failure);
    if (problem === 'weak_password') {
      setPasswordRefused(true);
      setFocusTick((tick) => tick + 1);
    } else {
      setNotice(PROBLEM_NOTICE[problem]);
    }
    return null;
  }

  async function submit() {
    if (running.current) return;
    setSubmitted(true);
    // Read from the field itself (not mirrored into the markup), so an autofill without a change event still counts.
    const result = validateCredentials(email, passwordInput.current?.value ?? password);
    if (!result.ok || !consent) {
      setFocusTick((tick) => tick + 1);
      return;
    }
    running.current = true;
    setBusy(true);
    setNotice(null);
    setPasswordRefused(false);
    let finished = false;
    try {
      // A retry after a failed write keeps the session and skips sign-up: one Auth user for the email (criterion 11).
      const token = accessToken.current ?? (await signUp(result.value));
      if (token === null) return;
      accessToken.current = token;
      setHeld(true);
      const outcome = await registerAccount(token, step1);
      if (outcome === 'created') {
        finished = true;
        sessionEntry?.signIn();
        return;
      }
      if (outcome === 'already_registered' || outcome === 'unauthenticated') {
        accessToken.current = null;
        setHeld(false);
      }
      setNotice(OUTCOME_NOTICE[outcome]);
    } finally {
      running.current = false;
      if (!finished) setBusy(false);
    }
  }

  const noticeText = { taken: TAKEN_TEXT, rate_limited: RATE_LIMITED_TEXT, retry: RETRY_TEXT, generic: GENERIC_ERROR_TEXT };

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
          <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
            יצירת חשבון
          </Button>
        }
      >
        <StepIndicator current={2} total={2} />
        <div className="my-2 flex justify-center">
          <RegistrationIllustration />
        </div>
        <h1 className="mb-1 text-h1">פרטי התחברות</h1>
        <p className="mb-5 text-body text-muted-foreground">עוד רגע מסיימים.</p>
        {held ? <p className="mb-5 text-small text-muted-foreground">{HELD_TEXT}</p> : null}
        <div className="flex flex-col gap-5">
          <FormField label="אימייל" {...(errors.email !== undefined ? { error: errors.email } : {})}>
            {(control) => (
              <TextInput
                {...control}
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                readOnly={held}
                onChange={(event) => onEmailChange(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="סיסמה" hint="לפחות 8 תווים" {...(passwordError !== undefined ? { error: passwordError } : {})}>
            {(control) => (
              <PasswordInput
                {...control}
                autoComplete="new-password"
                toggleLabel="הצגת הסיסמה"
                ref={passwordInput}
                readOnly={held}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordRefused(false);
                }}
              />
            )}
          </FormField>
          <ConsentField checked={consent} error={consentError} errorId={consentErrorId} onCheckedChange={setConsent} />
          {notice !== null ? (
            <div className="flex flex-col items-start gap-2">
              <InlineAlert>{noticeText[notice]}</InlineAlert>
              {notice === 'taken' ? (
                <div className="flex flex-wrap gap-x-4">
                  <Button variant="text" href={PATHS.login} onClick={toLogin}>
                    התחברות
                  </Button>
                  <Button variant="text" href={PATHS.recovery} onClick={toRecovery}>
                    שחזור סיסמה
                  </Button>
                </div>
              ) : null}
              {notice === 'retry' ? (
                <Button
                  variant="soft"
                  onClick={() => {
                    // The retry control disappears when the answer arrives: focus waits on the submit button (WCAG 2.4.3).
                    formRef.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus();
                    void submit();
                  }}
                >
                  ניסיון חוזר
                </Button>
              ) : null}
            </div>
          ) : null}
          <span role="status" className="sr-only">
            {busy ? 'יוצרים את החשבון' : ''}
          </span>
        </div>
      </AuthLayout>
    </form>
  );
}
