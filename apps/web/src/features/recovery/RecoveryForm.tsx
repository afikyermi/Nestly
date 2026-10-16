import { useEffect, useRef, useState } from 'react';
import { useLinkClickHandler } from 'react-router';
import { PATHS } from '@/app/paths';
import { RecoveryAnswerFields } from '@/components/domain/recovery-answer-fields';
import { AuthLayout } from '@/components/layout/auth-layout';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { TextInput } from '@/components/ui/text-input';
import { documentTitle } from '@/lib/document-title';
import { EMPTY_ANSWERS, type AnswerValues } from '@/lib/recovery-answers';
import { resetPassword } from '@/services/api/recovery';
import { failureText, RESET_DONE_TEXT, validateReset, type ResetErrors } from './recovery-form';

// The password recovery screen (FR-AUTH-003, F1.6 criterion 16): the email, the two answers the user chose at registration, and a
// new password. The form is the same for everyone and a mismatch is one text, so nothing here tells whether an email is
// registered. The answers and the password live in this component memory and the inputs, go only in the request body, and are
// cleared when the request is done (the password after any failure).
export function RecoveryForm() {
  const toLogin = useLinkClickHandler(PATHS.login);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [password, setPassword] = useState('');
  // True from the first refused submit until a valid one goes out: field errors then follow every keystroke.
  const [validating, setValidating] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTick, setMessageTick] = useState(0);

  const checked = validating ? validateReset(email, answers, password) : null;
  const errors: ResetErrors = checked !== null && !checked.ok ? checked.errors : {};

  // After a refused submit, focus goes to the first invalid control in document order.
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  // After an answer from the server, focus goes to the message.
  useEffect(() => {
    if (messageTick === 0) return;
    messageRef.current?.focus();
  }, [messageTick]);

  const clearPassword = () => {
    setPassword('');
    if (passwordInput.current !== null) passwordInput.current.value = '';
  };

  async function submit() {
    if (running.current) return;
    // Read from the field itself, so an autofill without a change event still counts.
    const typed = passwordInput.current?.value ?? password;
    const result = validateReset(email, answers, typed);
    if (!result.ok) {
      setValidating(true);
      setFocusTick((tick) => tick + 1);
      return;
    }
    setValidating(false);
    running.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await resetPassword(result.value);
      if (outcome === 'done') {
        setAnswers(EMPTY_ANSWERS);
        setPassword('');
        setDone(true);
      } else {
        clearPassword();
        setMessage(failureText(outcome));
      }
      setMessageTick((tick) => tick + 1);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <main tabIndex={-1}>
      <title>{documentTitle('שחזור סיסמה')}</title>
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
            <Button iconOnly label="חזרה" href={PATHS.login} onClick={toLogin}>
              <ArrowBackIcon />
            </Button>
          }
          actions={
            done ? (
              <Button size="lg" block href={PATHS.login} onClick={toLogin}>
                להתחברות
              </Button>
            ) : (
              <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
                עדכון הסיסמה
              </Button>
            )
          }
        >
          <h1 className="mt-4 mb-5 text-h1">שחזור סיסמה</h1>
          {done ? (
            <div ref={messageRef} tabIndex={-1} role="status" className="text-body">
              {RESET_DONE_TEXT}
            </div>
          ) : (
            <>
              {message !== null ? (
                <div ref={messageRef} tabIndex={-1} className="mb-5">
                  <InlineAlert>{message}</InlineAlert>
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
                <RecoveryAnswerFields
                  legend="ענו על השתיים שבחרתם בהרשמה"
                  values={answers}
                  onChange={(question, value) => setAnswers((current) => ({ ...current, [question]: value }))}
                  {...(errors.answers !== undefined ? { errors: errors.answers } : {})}
                />
                <FormField label="סיסמה חדשה" {...(errors.password !== undefined ? { error: errors.password } : {})}>
                  {(control) => (
                    <PasswordInput
                      {...control}
                      autoComplete="new-password"
                      toggleLabel="הצגת הסיסמה"
                      ref={passwordInput}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  )}
                </FormField>
              </div>
            </>
          )}
          <span role="status" className="sr-only">
            {busy ? 'שולחים' : ''}
          </span>
        </AuthLayout>
      </form>
    </main>
  );
}
