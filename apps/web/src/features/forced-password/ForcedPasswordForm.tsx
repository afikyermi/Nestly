import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { Button } from '@/components/ui/button';
import { useSessionAccount } from '@/hooks/use-session-account';
import { documentTitle } from '@/lib/document-title';
import { RECOVERY_UNAVAILABLE_TEXT } from '@/lib/recovery-texts';
import { setForcedPassword } from '@/services/api/password';
import { INTRO_TEXT, passwordError, TITLE } from './forced-password-form';

// The forced new-password screen (F2.0 c14), inside the shell's `main`: after a takeover clear the guard holds the session here until
// a new password is set. The set ends every session (DR-E), so the user is sent to sign in, and then meets the recovery questions
// setup (PG-052). The password lives in the input only (uncontrolled, so React
// never copies it into the markup), goes only in the request body, and is cleared after any failure.
export function ForcedPasswordForm() {
  const account = useSessionAccount();
  const navigate = useNavigate();
  const passwordInput = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  // True from the first refused submit until a valid one goes out: the field error then follows every keystroke.
  const [validating, setValidating] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [messageTick, setMessageTick] = useState(0);

  const fieldError = validating ? passwordError(typed) : null;

  useEffect(() => {
    if (messageTick === 0) return;
    messageRef.current?.focus();
  }, [messageTick]);

  const fail = () => {
    setTyped('');
    if (passwordInput.current !== null) passwordInput.current.value = '';
    setFailure(RECOVERY_UNAVAILABLE_TEXT); // ERR-044
    setMessageTick((tick) => tick + 1);
  };

  async function submit() {
    if (running.current) return;
    // Read from the field itself, so an autofill without a change event still counts.
    const password = passwordInput.current?.value ?? typed;
    if (passwordError(password) !== null) {
      setTyped(password);
      setValidating(true);
      passwordInput.current?.focus();
      return;
    }
    setValidating(false);
    running.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const token = account === null ? null : await account.getAccessToken();
      if (account === null || token === null) {
        fail();
        return;
      }
      const outcome = await setForcedPassword(token, password);
      if (outcome === 'set') {
        // DR-E: the set ended every session, this one included. Signed out here; the login screen says the password changed, and
        // the next sign-in (with the new password) meets the recovery questions setup, since the clear removed the answers (c8). The
        // notice travels in router state only.
        if (passwordInput.current !== null) passwordInput.current.value = '';
        await account.endAfterPasswordChange();
        void navigate(PATHS.login, { replace: true, state: { loginNotice: 'password-set' } });
        return;
      }
      fail();
      // The server does not hold this session here (a token from before the clear, or another session): the state is asked again, and
      // the guard follows the answer.
      if (outcome === 'not-held') void account.recheck();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <p className="mt-1 mb-5 text-body text-muted-foreground">{INTRO_TEXT}</p>
      {failure !== null ? (
        <div ref={messageRef} tabIndex={-1} className="mb-5">
          <InlineAlert>{failure}</InlineAlert>
        </div>
      ) : null}
      <form
        noValidate
        className="flex max-w-md flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label="סיסמה חדשה" {...(fieldError !== null ? { error: fieldError } : {})}>
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              toggleLabel="הצגת הסיסמה"
              ref={passwordInput}
              onChange={(event) => setTyped(event.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
          שמירת הסיסמה
        </Button>
        <span role="status" className="sr-only">
          {busy ? 'שומרים' : ''}
        </span>
      </form>
    </>
  );
}
