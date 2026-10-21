import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { chatTextProblem, type SupportThread } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { useChatCall } from '@/hooks/use-chat-call';
import { formatPostTime } from '@/lib/format-post-time';
import { fetchSupportThread, replySupport } from '@/services/api/chat';
import {
  ACTION_FAILED_TEXT,
  BACK_TO_CHAT_LABEL,
  CONVERSATION_GONE_TEXT,
  EMPTY_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  REPLY_LABEL,
  REQUEST_TEXT_LABEL,
  RETRY_LABEL,
  SEND_LABEL,
  STATUS_LABELS,
  SUPPORT_CLOSED_TEXT,
  SUPPORT_NAME,
  SUPPORT_THREAD_TITLE,
  THREAD_LABEL,
  TOO_LONG_TEXT,
  TOPIC_LABELS,
} from '@/lib/chat-texts';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'gone' } | { kind: 'loaded'; thread: SupportThread };

// A Support thread (FR-CHAT-004, AC-053): the request, Support's replies (always "Support": no staff identity, BR-043) and the user's own, oldest
// first. The user replies while the request is not closed; a closed one takes no reply, and a new topic is a new request (no free chat with staff).
export function SupportThreadScreen({ requestId }: { requestId: string }) {
  const call = useChatCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const result = await call((token) => fetchSupportThread(token, requestId));
    setView(result.kind === 'ok' ? { kind: 'loaded', thread: result.value } : result.kind === 'unavailable' ? { kind: 'gone' } : { kind: 'failed' });
  }, [call, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const wrong = chatTextProblem(text);
    if (wrong !== null) {
      setProblem(wrong === 'long' ? TOO_LONG_TEXT : EMPTY_TEXT);
      return;
    }
    busy.current = true;
    setSending(true);
    setProblem(null);
    setFailure(null);
    try {
      const result = await call((token) => replySupport(token, requestId, text));
      if (result.kind === 'ok') setText('');
      else if (result.kind !== 'closed') setFailure(ACTION_FAILED_TEXT);
      await load();
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
      </div>
    );
  }
  if (view.kind !== 'loaded') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.kind === 'gone' ? CONVERSATION_GONE_TEXT : LOAD_FAILED_TEXT}</InlineAlert>
        {view.kind === 'failed' ? (
          <Button variant="soft" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        ) : null}
      </div>
    );
  }
  const { thread } = view;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to={PATHS.chat} className="inline-flex min-h-11 items-center">
          {BACK_TO_CHAT_LABEL}
        </Link>
      </div>
      <h1 className="text-h2">
        {SUPPORT_THREAD_TITLE} · {TOPIC_LABELS[thread.topic]}
      </h1>
      <p className="text-small text-muted-foreground">
        {STATUS_LABELS[thread.status]} · {formatPostTime(thread.createdAt)}
      </p>
      <div className="rounded-lg bg-muted p-3">
        <p className="text-label">{REQUEST_TEXT_LABEL}</p>
        <p dir="auto" className="whitespace-pre-wrap">
          {thread.text}
        </p>
      </div>
      <ol aria-label={THREAD_LABEL} className="flex flex-col gap-2">
        {thread.messages.map((message) => (
          <li key={message.id} className={`flex ${message.fromSupport ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-sm rounded-lg px-3 py-2 ${message.fromSupport ? 'bg-muted' : 'bg-primary-soft text-primary-strong'}`}>
              {message.fromSupport ? <p className="text-label">{SUPPORT_NAME}</p> : null}
              <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
                {message.text}
              </p>
              <p className="text-caption text-muted-foreground">{formatPostTime(message.at)}</p>
            </div>
          </li>
        ))}
      </ol>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      {thread.status === 'closed' ? (
        <p className="rounded-md bg-muted p-3 text-label">{SUPPORT_CLOSED_TEXT}</p>
      ) : (
        <form onSubmit={(event) => void send(event)} className="flex flex-col gap-2">
          <FormField label={REPLY_LABEL} {...(problem === null ? {} : { error: problem })}>
            {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
          </FormField>
          <div>
            <Button type="submit" pending={sending}>
              {SEND_LABEL}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
