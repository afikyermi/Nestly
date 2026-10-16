import { useEffect, useRef, useState } from 'react';
import { useLinkClickHandler } from 'react-router';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { FormField } from '@/components/shared/form-field';
import { GoogleButton } from '@/components/shared/google-button';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { TextInput } from '@/components/ui/text-input';
import { useGoogleSignIn } from '@/hooks/use-google-sign-in';
import { useSession } from '@/hooks/use-session';
import { useSessionAccount } from '@/hooks/use-session-account';
import { documentTitle } from '@/lib/document-title';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { noticeText, problemText, validateLogin, type LoginErrors } from './login-form';

// The login screen (FR-AUTH-002, UC-02): email and password. The password goes to Auth through the session source and nowhere
// else; it lives in this component's memory and in the input, and is cleared after a refused sign-in (criterion 5). A success
// changes the session state, and the route guard then replaces /login with /feed (or with the completion screen).
export function LoginForm() {
  const account = useSessionAccount();
  const { notice } = useSession();
  const google = useGoogleSignIn();
  const toWelcome = useLinkClickHandler(PATHS.welcome);
  const toRecovery = useLinkClickHandler(PATHS.recovery);
  const toRegister = useLinkClickHandler(PATHS.register);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // True from the first refused submit until a valid one goes out: field errors then follow every keystroke.
  const [validating, setValidating] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  // What the last sign-in answered; it wins over the session's own notice (expired, stopped) until the next attempt.
  const [message, setMessage] = useState<string | null>(null);
  const [messageTick, setMessageTick] = useState(0);

  const checked = validating ? validateLogin(email, password) : null;
  const errors: LoginErrors = checked !== null && !checked.ok ? checked.errors : {};
  const shownMessage = message ?? (notice !== null ? noticeText(notice) : null);

  // After a refused submit, focus goes to the first invalid control in document order.
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  // After a refused sign-in, focus goes to the message (criterion 5).
  useEffect(() => {
    if (messageTick === 0) return;
    messageRef.current?.focus();
  }, [messageTick]);

  async function submit() {
    if (running.current) return;
    // Read from the field itself, so an autofill without a change event still counts.
    const typed = passwordInput.current?.value ?? password;
    const result = validateLogin(email, typed);
    if (!result.ok) {
      setValidating(true);
      setFocusTick((tick) => tick + 1);
      return;
    }
    setValidating(false);
    if (account === null) {
      setMessage(problemText('unavailable'));
      setMessageTick((tick) => tick + 1);
      return;
    }
    running.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await account.signInWithPassword(result.value);
      if (outcome.kind === 'signed-in' || outcome.kind === 'unregistered') return;
      setMessage(outcome.kind === 'stopped' ? STOPPED_TEXT : problemText(outcome.problem));
      if (outcome.kind === 'failed' && outcome.problem === 'invalid_credentials') {
        setPassword('');
        if (passwordInput.current !== null) passwordInput.current.value = '';
      }
      setMessageTick((tick) => tick + 1);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <main tabIndex={-1}>
      <title>{documentTitle('התחברות')}</title>
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
            <Button iconOnly label="חזרה" href={PATHS.welcome} onClick={toWelcome}>
              <ArrowBackIcon />
            </Button>
          }
          actions={
            <>
              <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
                התחברות
              </Button>
              <GoogleButton busy={google.busy} message={google.message} onPress={google.onPress} buttonRef={google.buttonRef} />
              <Button variant="text" href={PATHS.register} onClick={toRegister} className="self-center">
                יצירת חשבון חדש
              </Button>
            </>
          }
        >
          <h1 className="mt-4 mb-5 text-h1">התחברות</h1>
          {shownMessage !== null ? (
            <div ref={messageRef} tabIndex={-1} className="mb-5">
              <InlineAlert>{shownMessage}</InlineAlert>
            </div>
          ) : null}
          <div className="flex flex-col gap-5">
            <FormField label="אימייל" {...(errors.email !== undefined ? { error: errors.email } : {})}>
              {(control) => (
                <TextInput
                  {...control}
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="סיסמה" {...(errors.password !== undefined ? { error: errors.password } : {})}>
              {(control) => (
                <PasswordInput
                  {...control}
                  autoComplete="current-password"
                  toggleLabel="הצגת הסיסמה"
                  ref={passwordInput}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </FormField>
            <Button variant="text" href={PATHS.recovery} onClick={toRecovery} className="self-start">
              שכחתי סיסמה
            </Button>
          </div>
          <span role="status" className="sr-only">
            {busy ? 'מתחברים' : ''}
          </span>
        </AuthLayout>
      </form>
    </main>
  );
}
