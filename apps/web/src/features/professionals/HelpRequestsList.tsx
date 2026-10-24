import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { chatTextProblem, type HelpRequestItem } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { useProCall } from '@/hooks/use-pro-call';
import { formatPostTime } from '@/lib/format-post-time';
import { postPath } from '@/lib/post-link';
import {
  ACTION_FAILED,
  ANONYMOUS_AUTHOR,
  CANCEL,
  HELP_HEADING,
  NO_HELP,
  OFFER_ALREADY,
  OFFER_HELP,
  OFFER_LIMIT,
  OFFER_NOT_ALLOWED,
  OFFER_SEND,
  OFFER_SENT,
  OFFER_TEXT_LABEL,
  OFFER_TEXT_REQUIRED,
  OFFERED,
  OPEN_POST,
} from '@/lib/professional-texts';
import { offerHelp } from '@/services/api/professionals';

const OFFER_REFUSALS: Readonly<Record<string, string>> = { 'rate-limited': OFFER_LIMIT, 'already-done': OFFER_ALREADY, 'not-allowed': OFFER_NOT_ALLOWED };

export interface HelpRequestsListProps {
  items: readonly HelpRequestItem[];
  /** Called after an offer was sent, so the owner reloads (the counter and the "sent" mark). */
  onSent: () => Promise<void>;
}

// The newest posts in the Professional's field it may Offer Help on (FR-SERV-005, §13.4), each with "הצעת עזרה" once (BR-008/009: one per post,
// at most 100 a day; the database holds both rules). Used by the Professional's home and by "בקשות עזרה" (reached from the home and the menu, §11.20).
export function HelpRequestsList({ items, onSent }: HelpRequestsListProps) {
  const call = useProCall();
  const [offering, setOffering] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function send(event: FormEvent, postId: string) {
    event.preventDefault();
    if (running.current) return;
    if (chatTextProblem(text) !== null) {
      setTextError(OFFER_TEXT_REQUIRED);
      return;
    }
    running.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = await call((token) => offerHelp(token, postId, text));
      if (result.kind === 'ok') {
        setOffering(null);
        setText('');
        setStatus(OFFER_SENT);
        await onSent();
      } else setFailure(OFFER_REFUSALS[result.kind] ?? ACTION_FAILED);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {failure === null ? null : (
        <div className="mt-3">
          <InlineAlert>{failure}</InlineAlert>
        </div>
      )}
      <p role="status" className={status === '' ? 'sr-only' : 'mt-2 text-label'}>
        {status}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{NO_HELP}</p>
      ) : (
        <ul aria-label={HELP_HEADING} className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.postId} className="rounded-lg bg-card p-4 shadow-card">
              <p className="text-small text-muted-foreground">
                {item.isAnonymous ? ANONYMOUS_AUTHOR : (item.authorName ?? '')} · {formatPostTime(item.at)}
              </p>
              <p className="mt-1 whitespace-pre-line">{item.excerpt}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link to={postPath(item.postId)} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
                  {OPEN_POST}
                </Link>
                {item.offered ? (
                  <span className="text-label text-muted-foreground">{OFFERED}</span>
                ) : offering === item.postId ? null : (
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => {
                      setOffering(item.postId);
                      setText('');
                      setTextError(null);
                      setFailure(null);
                    }}
                  >
                    {OFFER_HELP}
                  </Button>
                )}
              </div>
              {offering === item.postId ? (
                <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => void send(event, item.postId)}>
                  <FormField label={OFFER_TEXT_LABEL} {...(textError === null ? {} : { error: textError })}>
                    {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
                  </FormField>
                  <div className="flex gap-3">
                    <Button type="submit" pending={busy}>
                      {OFFER_SEND}
                    </Button>
                    <Button type="button" variant="text" onClick={() => setOffering(null)}>
                      {CANCEL}
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
