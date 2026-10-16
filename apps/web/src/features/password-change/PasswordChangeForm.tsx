import { useEffect, useRef, useState } from 'react';
import { RecoveryAnswerFields } from '@/components/domain/recovery-answer-fields';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { Button } from '@/components/ui/button';
import { useSessionAccount } from '@/hooks/use-session-account';
import { documentTitle } from '@/lib/document-title';
import { EMPTY_ANSWERS, type AnswerValues } from '@/lib/recovery-answers';
import { RECOVERY_UNAVAILABLE_TEXT } from '@/lib/recovery-texts';
import { changePassword } from '@/services/api/recovery';
import { CHANGED_TEXT, failureText, INTRO_TEXT, TITLE, validateChange, type ChangeErrors } from './password-change-form';

// The password-change screen (FR-AUTH-003, F2.0 c15), inside the shell's `main`, opened from the menu: the two current recovery
// answers, then a new password. The answers live in this component memory and the inputs, the password in its input only; both go only
// in the request body. The password is cleared after any answer, the answers after a success.
export function PasswordChangeForm() {
  const account = useSessionAccount();
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [current, setCurrent] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [typed, setTyped] = useState('');
  // True from the first refused submit until a valid one goes out: field errors then follow every keystroke.
  const [validating, setValidating] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [messageTick, setMessageTick] = useState(0);

  const checked = validating ? validateChange(current, typed) : null;
  const errors: ChangeErrors = checked !== null && !checked.ok ? checked.errors : {};

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
    setTyped('');
    if (passwordInput.current !== null) passwordInput.current.value = '';
  };

  async function submit() {
    if (running.current) return;
    // Read from the field itself, so an autofill without a change event still counts.
    const password = passwordInput.current?.value ?? typed;
    const result = validateChange(current, password);
    if (!result.ok) {
      setTyped(password);
      setValidating(true);
      setFocusTick((tick) => tick + 1);
      return;
    }
    setValidating(false);
    running.current = true;
    setBusy(true);
    setFailure(null);
    setChanged(false);
    try {
      const token = account === null ? null : await account.getAccessToken();
      const outcome = token === null ? null : await changePassword(token, result.current, result.password);
      clearPassword();
      if (outcome === 'done') {
        setCurrent(EMPTY_ANSWERS);
        setChanged(true);
      } else {
        setFailure(outcome === null ? RECOVERY_UNAVAILABLE_TEXT : failureText(outcome));
      }
      setMessageTick((tick) => tick + 1);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      {/* The confirmation takes the place of the intro, so the form does not move down by a line (as on the questions screen). */}
      {changed ? (
        <div ref={messageRef} tabIndex={-1} role="status" className="mt-1 mb-5 text-body">
          {CHANGED_TEXT}
        </div>
      ) : (
        <p className="mt-1 mb-5 text-body text-muted-foreground">{INTRO_TEXT}</p>
      )}
      {failure !== null ? (
        <div ref={messageRef} tabIndex={-1} className="mb-5">
          <InlineAlert>{failure}</InlineAlert>
        </div>
      ) : null}
      <form
        ref={formRef}
        noValidate
        className="flex max-w-md flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <RecoveryAnswerFields
          legend="ענו על השתיים ששמרתם עכשיו"
          values={current}
          onChange={(question, value) => setCurrent((values) => ({ ...values, [question]: value }))}
          {...(errors.current !== undefined ? { errors: errors.current } : {})}
        />
        <FormField label="סיסמה חדשה" {...(errors.password !== undefined ? { error: errors.password } : {})}>
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
          החלפת הסיסמה
        </Button>
        <span role="status" className="sr-only">
          {busy ? 'שולחים' : ''}
        </span>
      </form>
    </>
  );
}
