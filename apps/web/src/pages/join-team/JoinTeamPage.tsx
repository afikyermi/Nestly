import { useRef, useState } from 'react';
import { invitationCode } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PasswordInput } from '@/components/shared/password-input';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/text-input';
import { useAuthPort } from '@/hooks/use-auth-port';
import { useSessionAccount } from '@/hooks/use-session-account';
import { documentTitle } from '@/lib/document-title';
import { classifySignUpFailure, PASSWORD_LENGTH_TEXT, validateCredentials, type CredentialErrors } from '@/features/registration/step2-form';
import { joinTeam } from '@/services/api/team';
import { JOIN_BUSY, JOIN_FAILED, JOIN_HAS_ACCOUNT, JOIN_INTRO, JOIN_INVALID_CODE, JOIN_NO_CODE, JOIN_SUBMIT, JOIN_TITLE } from '@/features/admin/team-texts';

/** The code from the link's fragment (never sent to a server by the browser), or null when it is missing or not one. */
function codeOfLocation(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  return invitationCode.safeParse(raw).success ? raw : null;
}

// Joining the team with an invitation (FR-ADMIN-004): the invited person creates a new Auth account (a staff account, apart from any community
// account) and redeems the one-time code with that session; the server makes the account a Moderator with no keys. Then the admin shell opens.
export function JoinTeamPage() {
  const authPort = useAuthPort();
  const account = useSessionAccount();
  const [code] = useState(codeOfLocation);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const running = useRef(false);

  const submit = async () => {
    if (running.current || code === null) return;
    const checked = validateCredentials(email, password);
    // A session from an earlier try (signed up, not yet redeemed) is used again: no second Auth user for the email.
    const held = account === null ? null : await account.getAccessToken().catch(() => null);
    if (held === null && !checked.ok) {
      setErrors(checked.errors);
      return;
    }
    running.current = true;
    setBusy(true);
    setErrors({});
    setNotice(null);
    try {
      let token = held;
      if (token === null && checked.ok) {
        const response = await authPort.signUp(checked.value).catch(() => null);
        if (response === null) {
          setNotice(JOIN_FAILED);
          return;
        }
        if (response.failure !== null) {
          const problem = classifySignUpFailure(response.failure);
          if (problem === 'weak_password') setErrors({ password: PASSWORD_LENGTH_TEXT });
          else setNotice(problem === 'taken' ? JOIN_HAS_ACCOUNT : JOIN_FAILED);
          return;
        }
        token = response.accessToken;
      }
      if (token === null) {
        setNotice(JOIN_FAILED);
        return;
      }
      const outcome = await joinTeam(token, code);
      if (outcome === 'joined') {
        // a full load: the session then reads the new staff account and the admin shell opens
        window.location.assign(PATHS.admin);
        return;
      }
      setNotice(outcome === 'invalid-code' ? JOIN_INVALID_CODE : outcome === 'has-account' ? JOIN_HAS_ACCOUNT : JOIN_FAILED);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <main tabIndex={-1}>
      <title>{documentTitle(JOIN_TITLE)}</title>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <AuthLayout
          actions={
            code === null ? null : (
              <Button type="submit" size="lg" block pending={busy} aria-disabled={busy ? true : undefined}>
                {JOIN_SUBMIT}
              </Button>
            )
          }
        >
          <h1 className="mb-1 text-h1">{JOIN_TITLE}</h1>
          {code === null ? (
            <InlineAlert>{JOIN_NO_CODE}</InlineAlert>
          ) : (
            <>
              <p className="mb-5 text-body text-muted-foreground">{JOIN_INTRO}</p>
              <div className="flex flex-col gap-5">
                <FormField label="אימייל" htmlFor="join-email" {...(errors.email !== undefined ? { error: errors.email } : {})}>
                  {(control) => <TextInput {...control} type="email" dir="ltr" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />}
                </FormField>
                <FormField label="סיסמה" htmlFor="join-password" hint="לפחות 8 תווים" {...(errors.password !== undefined ? { error: errors.password } : {})}>
                  {(control) => (
                    <PasswordInput {...control} autoComplete="new-password" toggleLabel="הצגת הסיסמה" onChange={(event) => setPassword(event.target.value)} />
                  )}
                </FormField>
                {notice === null ? null : <InlineAlert>{notice}</InlineAlert>}
                <span role="status" className="sr-only">
                  {busy ? JOIN_BUSY : ''}
                </span>
              </div>
            </>
          )}
        </AuthLayout>
      </form>
    </main>
  );
}
