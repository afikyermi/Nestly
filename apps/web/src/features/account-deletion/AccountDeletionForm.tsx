import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/shared/field-message';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useSession } from '@/hooks/use-session';
import { useSessionAccount } from '@/hooks/use-session-account';
import {
  CONFIRM_LABEL,
  CONFIRM_REQUIRED_TEXT,
  DELETE_BUSY,
  DELETE_BUTTON,
  DELETE_GOES,
  DELETE_GOES_TITLE,
  DELETE_INTRO,
  DELETE_STAYS,
  DELETE_STAYS_TITLE,
  DELETE_TITLE,
  GROUP_OWNER_TEXT,
  NOT_ALLOWED_TEXT,
  PASSWORD_HINT,
  PASSWORD_LABEL,
  PASSWORD_REQUIRED_TEXT,
  PASSWORD_WRONG_TEXT,
  REAUTH_EXPIRED_TEXT,
} from '@/lib/account-deletion-texts';
import { GENERIC_ERROR_TEXT, RATE_LIMITED_TEXT } from '@/lib/auth-texts';
import { documentTitle } from '@/lib/document-title';
import { requestAccountDeletion, type DeletionOutcome } from '@/services/api/account-deletion';
import type { SignInProblem } from '@/services/auth/sign-in-problem';

interface Errors {
  confirm?: string;
  password?: string;
}

const PROBLEM_TEXTS: Record<SignInProblem, string> = {
  invalid_credentials: PASSWORD_WRONG_TEXT, // ERR-048
  rate_limited: RATE_LIMITED_TEXT,
  unavailable: GENERIC_ERROR_TEXT,
  unknown: GENERIC_ERROR_TEXT,
};

function refusalText(outcome: DeletionOutcome): string {
  if (outcome.kind !== 'refused') return GENERIC_ERROR_TEXT;
  if (outcome.error === 'group_owner') return GROUP_OWNER_TEXT; // ERR-026
  if (outcome.error === 'reauth_required') return REAUTH_EXPIRED_TEXT; // ERR-048
  return NOT_ALLOWED_TEXT;
}

// The account deletion screen (PG-060; FR-SET-002, BR-073, VAL-052), inside the shell, from Settings → Account. It says what goes and
// what stays, then asks for the box and the password. The password is checked with Auth as a separate sign-in (this session is not
// touched) and lives only in its input and that call; it is cleared after every answer. A success ends the session (FR-SET-002) and the
// login screen gives the date (router state, never the URL or storage).
export function AccountDeletionForm() {
  const account = useSessionAccount();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [validating, setValidating] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [messageTick, setMessageTick] = useState(0);

  const errors: Errors = validating
    ? { ...(confirmed ? {} : { confirm: CONFIRM_REQUIRED_TEXT }), ...(typed === '' ? { password: PASSWORD_REQUIRED_TEXT } : {}) }
    : {};

  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  useEffect(() => {
    if (messageTick === 0) return;
    messageRef.current?.focus();
  }, [messageTick]);

  const clearPassword = () => {
    setTyped('');
    if (passwordInput.current !== null) passwordInput.current.value = '';
  };

  const fail = (text: string) => {
    setFailure(text);
    setMessageTick((tick) => tick + 1);
  };

  async function submit() {
    if (running.current) return;
    // Read from the field itself, so an autofill without a change event still counts.
    const password = passwordInput.current?.value ?? typed;
    if (!confirmed || password === '') {
      setTyped(password);
      setValidating(true);
      setFocusTick((tick) => tick + 1);
      return;
    }
    setValidating(false);
    running.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const check = account?.checkPassword === undefined ? null : await account.checkPassword(password);
      clearPassword();
      if (check === null) return fail(GENERIC_ERROR_TEXT);
      if (check.kind === 'failed') return fail(PROBLEM_TEXTS[check.problem]);
      let outcome: DeletionOutcome;
      try {
        outcome = await requestAccountDeletion(check.accessToken);
      } finally {
        await check.release();
      }
      if (outcome.kind !== 'ok' || outcome.status.status !== 'scheduled') return fail(refusalText(outcome));
      // FR-SET-002: the session ends; the login screen says when the deletion runs and that it can still be cancelled.
      const dueAt = outcome.status.dueAt;
      await signOut();
      void navigate(PATHS.login, { replace: true, state: { loginNotice: 'deletion-scheduled', deletionDueAt: dueAt } });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <title>{documentTitle(DELETE_TITLE)}</title>
      <h1 className="text-h2">{DELETE_TITLE}</h1>
      <p className="mt-1 mb-5 max-w-prose text-body text-muted-foreground">{DELETE_INTRO}</p>
      <div className="mb-6 flex max-w-prose flex-col gap-4">
        <section aria-labelledby="deletion-goes">
          <h2 id="deletion-goes" className="text-h3">
            {DELETE_GOES_TITLE}
          </h2>
          <ul className="mt-2 list-disc ps-5 text-body">
            {DELETE_GOES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="deletion-stays">
          <h2 id="deletion-stays" className="text-h3">
            {DELETE_STAYS_TITLE}
          </h2>
          <ul className="mt-2 list-disc ps-5 text-body">
            {DELETE_STAYS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
      {failure !== null ? (
        <div ref={messageRef} tabIndex={-1} className="mb-5 max-w-md">
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
        <div className="flex flex-col gap-1.5">
          <Checkbox
            checked={confirmed}
            onCheckedChange={setConfirmed}
            aria-invalid={errors.confirm !== undefined ? true : undefined}
            aria-describedby={errors.confirm !== undefined ? 'deletion-confirm-error' : undefined}
          >
            {CONFIRM_LABEL}
          </Checkbox>
          {errors.confirm !== undefined ? <FieldError id="deletion-confirm-error">{errors.confirm}</FieldError> : null}
        </div>
        <FormField label={PASSWORD_LABEL} hint={PASSWORD_HINT} {...(errors.password !== undefined ? { error: errors.password } : {})}>
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="current-password"
              toggleLabel="הצגת הסיסמה"
              ref={passwordInput}
              onChange={(event) => setTyped(event.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
          {DELETE_BUTTON}
        </Button>
        <span role="status" className="sr-only">
          {busy ? DELETE_BUSY : ''}
        </span>
      </form>
    </>
  );
}
