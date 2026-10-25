import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';
import { useSessionAccount } from '@/hooks/use-session-account';
import {
  CANCEL_BUSY,
  CANCEL_BUTTON,
  CANCEL_CLOSED_TEXT,
  SCHEDULED_HIDDEN,
  SCHEDULED_TITLE,
  SIGN_OUT_BUTTON,
  formatDeletionDate,
  scheduledText,
} from '@/lib/account-deletion-texts';
import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { documentTitle } from '@/lib/document-title';
import { cancelAccountDeletion, fetchDeletionStatus } from '@/services/api/account-deletion';

// PG-050 (FR-SET-002, AC-108): the session of an account scheduled for deletion is held here, outside the shell, until it cancels or signs
// out; nothing else opens. The date comes from the server (a failed read shows the text without it). "ביטול המחיקה" makes the account
// active again; the session is then asked again, the hold ends and the guard leads to the feed. The deletion never cancels silently.
export function ScheduledDeletionScreen() {
  const account = useSessionAccount();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const messageRef = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? null : await fetchDeletionStatus(token);
      if (live && outcome?.kind === 'ok' && outcome.status.status === 'scheduled') setDate(formatDeletionDate(outcome.status.dueAt));
    })();
    return () => {
      live = false;
    };
  }, [account]);

  useEffect(() => {
    if (failure !== null) messageRef.current?.focus();
  }, [failure]);

  async function cancel() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = token === null ? null : await cancelAccountDeletion(token);
      if (outcome?.kind === 'ok') {
        // The account is active again: the state is asked again, the hold ends and the guard leads on.
        await account?.recheck();
        return;
      }
      setFailure(outcome?.kind === 'refused' && outcome.error === 'not_scheduled' ? CANCEL_CLOSED_TEXT : GENERIC_ERROR_TEXT);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function leave() {
    await signOut();
    void navigate(PATHS.login, { replace: true });
  }

  return (
    <main tabIndex={-1}>
      <title>{documentTitle(SCHEDULED_TITLE)}</title>
      <AuthLayout
        actions={
          <>
            <Button type="button" size="lg" block pending={busy} aria-disabled={busy ? true : undefined} onClick={() => void cancel()}>
              {CANCEL_BUTTON}
            </Button>
            <Button type="button" size="lg" block variant="soft" onClick={() => void leave()}>
              {SIGN_OUT_BUTTON}
            </Button>
            <span role="status" className="sr-only">
              {busy ? CANCEL_BUSY : ''}
            </span>
          </>
        }
      >
        <h1 className="mt-4 mb-5 text-h1">{SCHEDULED_TITLE}</h1>
        {failure !== null ? (
          <div ref={messageRef} tabIndex={-1} className="mb-5">
            <InlineAlert>{failure}</InlineAlert>
          </div>
        ) : null}
        <p className="text-body" aria-live="polite">
          {scheduledText(date)}
        </p>
        <p className="mt-3 text-body text-muted-foreground">{SCHEDULED_HIDDEN}</p>
      </AuthLayout>
    </main>
  );
}
