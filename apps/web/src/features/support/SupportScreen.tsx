import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { chatTextProblem, SUPPORT_TOPICS, type SupportList, type SupportTopic } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { TextArea } from '@/components/ui/text-area';
import { useChatCall } from '@/hooks/use-chat-call';
import { supportThreadPath } from '@/lib/chat-link';
import { formatPostTime } from '@/lib/format-post-time';
import { createSupportRequest, fetchOwnSupport } from '@/services/api/chat';
import {
  ACTION_FAILED_TEXT,
  EMPTY_TEXT,
  LOAD_FAILED_TEXT,
  MY_REQUESTS_HEADING,
  MY_REQUESTS_LIST_LABEL,
  NO_REQUESTS_TEXT,
  OPEN_REQUEST_LABEL,
  RATE_LIMITED_TEXT,
  STATUS_LABELS,
  SUPPORT_INTRO,
  SUPPORT_SEND_LABEL,
  SUPPORT_SENT_TEXT,
  SUPPORT_STAFF_TEXT,
  SUPPORT_TEXT_LABEL,
  TOO_LONG_TEXT,
  TOPIC_LABEL,
  TOPIC_LABELS,
  TOPIC_PLACEHOLDER,
  TOPIC_REQUIRED_TEXT,
  unreadText,
} from '@/lib/chat-texts';

type Requests = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; requests: SupportList['requests'] };
const isTopic = (value: string): value is SupportTopic => SUPPORT_TOPICS.some((topic) => topic === value);

// The Support form (FR-ADMIN-001): a topic from the list (§9.1) and a text, for a signed-in Regular or Professional; and the caller's own requests,
// each opening its thread. The answer comes in Chat, as "Support" (BR-043). Staff accounts send none.
export function SupportScreen() {
  const call = useChatCall();
  const listId = useId();
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ topic?: string; text?: string }>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [requests, setRequests] = useState<Requests>({ kind: 'loading' });
  const busy = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchOwnSupport);
    setRequests(result.kind === 'ok' ? { kind: 'loaded', requests: result.value.requests } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const wrong = chatTextProblem(text);
    const found = {
      ...(topic === null ? { topic: TOPIC_REQUIRED_TEXT } : {}),
      ...(wrong === null ? {} : { text: wrong === 'long' ? TOO_LONG_TEXT : EMPTY_TEXT }),
    };
    setErrors(found);
    if (topic === null || wrong !== null) return;
    busy.current = true;
    setSending(true);
    setFailure(null);
    setStatus('');
    try {
      const result = await call((token) => createSupportRequest(token, topic, text));
      if (result.kind === 'ok') {
        setTopic(null);
        setText('');
        setStatus(SUPPORT_SENT_TEXT);
        await load();
      } else setFailure(result.kind === 'rate-limited' ? RATE_LIMITED_TEXT : result.kind === 'not-allowed' ? SUPPORT_STAFF_TEXT : ACTION_FAILED_TEXT);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">{SUPPORT_INTRO}</p>
      <form onSubmit={(event) => void send(event)} noValidate className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card">
        <FormField label={TOPIC_LABEL} {...(errors.topic === undefined ? {} : { error: errors.topic })}>
          {(control) => (
            <SelectInput
              {...control}
              placeholder={TOPIC_PLACEHOLDER}
              options={SUPPORT_TOPICS.map((value) => ({ value, label: TOPIC_LABELS[value] }))}
              {...(topic === null ? {} : { value: topic })}
              {...(errors.topic === undefined ? {} : { error: true })}
              onChange={(value) => setTopic(isTopic(value) ? value : null)}
            />
          )}
        </FormField>
        <FormField label={SUPPORT_TEXT_LABEL} {...(errors.text === undefined ? {} : { error: errors.text })}>
          {(control) => (
            <TextArea {...control} rows={5} dir="auto" value={text} {...(errors.text === undefined ? {} : { error: true })} onChange={(event) => setText(event.target.value)} />
          )}
        </FormField>
        {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
        <div>
          <Button type="submit" pending={sending}>
            {SUPPORT_SEND_LABEL}
          </Button>
        </div>
        <p role="status" className={status === '' ? 'sr-only' : 'text-label'}>
          {status}
        </p>
      </form>

      <section aria-labelledby={listId}>
        <h2 id={listId} className="text-h3">
          {MY_REQUESTS_HEADING}
        </h2>
        {requests.kind === 'failed' ? <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert> : null}
        {requests.kind === 'loaded' && requests.requests.length === 0 ? <p className="mt-2 text-muted-foreground">{NO_REQUESTS_TEXT}</p> : null}
        {requests.kind === 'loaded' && requests.requests.length > 0 ? (
          <ul aria-label={MY_REQUESTS_LIST_LABEL} className="mt-3 flex flex-col gap-2 rounded-lg bg-card p-3 shadow-card">
            {requests.requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 p-1">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label">{TOPIC_LABELS[request.topic]}</span>
                  <span className="text-small text-muted-foreground">
                    {STATUS_LABELS[request.status]} · {formatPostTime(request.createdAt)}
                    {request.unread > 0 ? ` · ${unreadText(request.unread)}` : ''}
                  </span>
                </span>
                <Link to={supportThreadPath(request.id)} className="inline-flex min-h-11 items-center text-label">
                  {OPEN_REQUEST_LABEL}
                  <span className="sr-only"> {TOPIC_LABELS[request.topic]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
