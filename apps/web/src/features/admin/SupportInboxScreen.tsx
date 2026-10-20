import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { chatTextProblem, SUPPORT_STATUSES, type PermissionKey, type SupportDetail, type SupportInbox, type SupportStatus } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { useChatCall } from '@/hooks/use-chat-call';
import { EMPTY_TEXT, NO_NAME, STATUS_LABELS, SUPPORT_NAME, TOO_LONG_TEXT, TOPIC_LABELS } from '@/lib/chat-texts';
import { fetchSupportDetail, fetchSupportInbox, sendSupportStaffMessage, setSupportStatus, type ChatResult } from '@/services/api/chat';
import { formatAdminTime } from './admin-format';
import {
  ACTION_FAILED_TEXT,
  FORBIDDEN_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  NOT_APPLICABLE_TEXT,
  NOT_FOUND_TEXT,
  RETRY_LABEL,
  SUPPORT_ALL_LABEL,
  SUPPORT_BACK_LABEL,
  SUPPORT_EMPTY_TEXT,
  SUPPORT_FILTER_LABEL,
  SUPPORT_INTERNAL_LABEL,
  SUPPORT_INTERNAL_NOTE,
  SUPPORT_LIST_LABEL,
  SUPPORT_NOTE_SAVED_TEXT,
  SUPPORT_OPEN_LABEL,
  SUPPORT_REPLY_LABEL,
  SUPPORT_REPLY_SENT_TEXT,
  SUPPORT_SEND_LABEL,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_SAVED_TEXT,
  SUPPORT_THREAD_LABEL,
  SUPPORT_USER_LABEL,
} from './admin-texts';

type List = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; items: SupportInbox['items'] };
type Filter = SupportStatus | 'all';
const isFilter = (value: string): value is Filter => value === 'all' || SUPPORT_STATUSES.some((status) => status === value);
const isStatus = (value: string): value is SupportStatus => SUPPORT_STATUSES.some((status) => status === value);

const refusal = (kind: ChatResult<unknown>['kind']): string =>
  kind === 'forbidden' ? FORBIDDEN_TEXT : kind === 'not-found' ? NOT_FOUND_TEXT : kind === 'not-applicable' ? NOT_APPLICABLE_TEXT : ACTION_FAILED_TEXT;

// The Support inbox (FR-ADMIN-002, AC-024): every request with its topic, text, user, time and status, by status; a request opens with its whole
// thread, internal notes included. SUPPORT_VIEW reads; SUPPORT_HANDLE replies in the name of "Support" (no staff identity reaches the user, BR-043),
// adds an internal note and changes the status (closed is final). Every handling action is in the Audit Log (the database writes it).
export function SupportInboxScreen({ permissions }: { permissions: readonly PermissionKey[] }) {
  const call = useChatCall();
  const [filter, setFilter] = useState<Filter>('open');
  const [list, setList] = useState<List>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList({ kind: 'loading' });
    const result = await call((token) => fetchSupportInbox(token, filter === 'all' ? null : filter));
    setList(result.kind === 'ok' ? { kind: 'loaded', items: result.value.items } : { kind: 'failed' });
  }, [call, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (selected !== null) {
    return (
      <SupportRequestPanel
        requestId={selected}
        canHandle={permissions.includes('SUPPORT_HANDLE')}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <FormField label={SUPPORT_FILTER_LABEL} className="max-w-xs">
        {(control) => (
          <SelectInput
            {...control}
            placeholder={SUPPORT_FILTER_LABEL}
            value={filter}
            options={[...SUPPORT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })), { value: 'all', label: SUPPORT_ALL_LABEL }]}
            onChange={(value) => {
              if (isFilter(value)) setFilter(value);
            }}
          />
        )}
      </FormField>
      {list.kind === 'loading' ? (
        <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}
      {list.kind === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert>
          <Button variant="soft" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : null}
      {list.kind === 'loaded' && list.items.length === 0 ? <p>{SUPPORT_EMPTY_TEXT}</p> : null}
      {list.kind === 'loaded' && list.items.length > 0 ? (
        <ul aria-label={SUPPORT_LIST_LABEL} className="flex flex-col gap-3">
          {list.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-label">
                  {TOPIC_LABELS[item.topic]} · {STATUS_LABELS[item.status]}
                </p>
                <p className="text-small text-muted-foreground">
                  <bdi dir="auto">{item.userName ?? NO_NAME}</bdi> · {formatAdminTime(item.createdAt)}
                </p>
                <p dir="auto" className="truncate text-small">
                  {item.text}
                </p>
              </div>
              <Button variant="soft" onClick={() => setSelected(item.id)}>
                {SUPPORT_OPEN_LABEL}
                <span className="sr-only"> {TOPIC_LABELS[item.topic]}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Detail = { kind: 'loading' } | { kind: 'failed'; text: string } | { kind: 'loaded'; detail: SupportDetail };

function SupportRequestPanel({ requestId, canHandle, onBack }: { requestId: string; canHandle: boolean; onBack: () => void }) {
  const call = useChatCall();
  const headingId = useId();
  const [view, setView] = useState<Detail>({ kind: 'loading' });
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const result = await call((token) => fetchSupportDetail(token, requestId));
    setView(result.kind === 'ok' ? { kind: 'loaded', detail: result.value } : { kind: 'failed', text: result.kind === 'failed' ? LOAD_FAILED_TEXT : refusal(result.kind) });
  }, [call, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(work: (token: string) => Promise<ChatResult<unknown>>, said: string) {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setFailure(null);
    setStatus('');
    try {
      const result = await call(work);
      if (result.kind !== 'ok') {
        setFailure(refusal(result.kind));
        return false;
      }
      setStatus(said);
      await load();
      return true;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function reply(event: FormEvent) {
    event.preventDefault();
    const wrong = chatTextProblem(text);
    if (wrong !== null) {
      setProblem(wrong === 'long' ? TOO_LONG_TEXT : EMPTY_TEXT);
      return;
    }
    setProblem(null);
    const done = await run((token) => sendSupportStaffMessage(token, requestId, text, internal), internal ? SUPPORT_NOTE_SAVED_TEXT : SUPPORT_REPLY_SENT_TEXT);
    if (done) {
      setText('');
      setInternal(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="text" onClick={onBack}>
          {SUPPORT_BACK_LABEL}
        </Button>
      </div>
      <p role="status" className={status === '' ? 'sr-only' : ''}>
        {status}
      </p>
      {view.kind === 'loading' ? <p role="status">{LOADING_TEXT}</p> : null}
      {view.kind === 'failed' ? <InlineAlert>{view.text}</InlineAlert> : null}
      {view.kind === 'loaded' ? (
        <section aria-labelledby={headingId} className="flex flex-col gap-4">
          <h3 id={headingId} className="text-h2">
            {TOPIC_LABELS[view.detail.topic]} · {STATUS_LABELS[view.detail.status]}
          </h3>
          <p className="text-small text-muted-foreground">
            {SUPPORT_USER_LABEL}: <bdi dir="auto">{view.detail.userName ?? NO_NAME}</bdi> · {formatAdminTime(view.detail.createdAt)}
          </p>
          <p dir="auto" className="whitespace-pre-wrap rounded-lg bg-muted p-4">
            {view.detail.text}
          </p>
          <ol aria-label={SUPPORT_THREAD_LABEL} className="flex flex-col gap-2">
            {view.detail.messages.map((message) => (
              <li key={message.id} className={`rounded-md border p-3 text-small ${message.internal ? 'border-dashed border-border bg-muted' : 'border-border'}`}>
                <p className="text-label">
                  {message.internal ? SUPPORT_INTERNAL_NOTE : message.author === 'support' ? SUPPORT_NAME : (view.detail.userName ?? NO_NAME)} ·{' '}
                  {formatAdminTime(message.at)}
                </p>
                <p dir="auto" className="whitespace-pre-wrap">
                  {message.text}
                </p>
              </li>
            ))}
          </ol>
          {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
          {canHandle ? (
            <>
              <form onSubmit={(event) => void reply(event)} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <FormField label={SUPPORT_REPLY_LABEL} {...(problem === null ? {} : { error: problem })}>
                  {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
                </FormField>
                <Checkbox checked={internal} onCheckedChange={setInternal}>
                  {SUPPORT_INTERNAL_LABEL}
                </Checkbox>
                <div>
                  <Button type="submit" pending={pending}>
                    {SUPPORT_SEND_LABEL}
                  </Button>
                </div>
              </form>
              {view.detail.status === 'closed' ? null : (
                <FormField label={SUPPORT_STATUS_LABEL} className="max-w-xs">
                  {(control) => (
                    <SelectInput
                      {...control}
                      placeholder={SUPPORT_STATUS_LABEL}
                      value={view.detail.status}
                      disabled={pending}
                      options={SUPPORT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
                      onChange={(value) => {
                        if (isStatus(value) && value !== view.detail.status) void run((token) => setSupportStatus(token, requestId, value), SUPPORT_STATUS_SAVED_TEXT);
                      }}
                    />
                  )}
                </FormField>
              )}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
