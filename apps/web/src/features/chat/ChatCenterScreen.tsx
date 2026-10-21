import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ChatOverview, ChatRequestItem } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatCall } from '@/hooks/use-chat-call';
import { conversationPath, supportThreadPath } from '@/lib/chat-link';
import { formatPostTime } from '@/lib/format-post-time';
import { acceptChatRequest, cancelChatRequest, declineChatRequest, fetchChatOverview, type ChatResult } from '@/services/api/chat';
import {
  ACCEPT_LABEL,
  acceptRest,
  ACTION_FAILED_TEXT,
  CANCEL_REQUEST_LABEL,
  cancelRest,
  CANCELLED_TEXT,
  CHAT_EMPTY_TEXT,
  CONVERSATIONS_HEADING,
  CONVERSATIONS_LIST_LABEL,
  DECLINE_LABEL,
  DECLINED_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  NEW_SUPPORT_LABEL,
  NO_NAME,
  NOT_ALLOWED_TEXT,
  REQUESTS_HEADING,
  REQUESTS_LIST_LABEL,
  RETRY_LABEL,
  SENT_HEADING,
  SENT_LIST_LABEL,
  STATUS_LABELS,
  SUPPORT_HEADING,
  SUPPORT_LIST_LABEL,
  SUPPORT_NAME,
  TOPIC_LABELS,
  unreadText,
  YOU_PREFIX,
} from '@/lib/chat-texts';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; overview: ChatOverview };

function Section({ title, listLabel, children }: { title: string; listLabel: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      <ul aria-label={listLabel} className="mt-3 flex flex-col gap-2 rounded-lg bg-card p-3 shadow-card">
        {children}
      </ul>
    </section>
  );
}

function Unread({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-primary px-2 text-caption text-primary-foreground">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{unreadText(count)}</span>
    </span>
  );
}

// The Chat Center (FR-CHAT-001, PG "מסך השיחות"): requests waiting for the caller's answer (accept opens the conversation, decline ends that request
// only, §9.3), the conversations with their latest message and unread count, the Support threads (BR-043: always "Support"), and the caller's own
// requests still waiting (which it may withdraw). No read receipt anywhere (§9.5).
export function ChatCenterScreen() {
  const call = useChatCall();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchChatOverview);
    setView(result.kind === 'ok' ? { kind: 'loaded', overview: result.value } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act<T>(requestId: string, run: (token: string) => Promise<ChatResult<T>>, done: (value: T) => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(requestId);
    setFailure(null);
    setStatus('');
    try {
      const result = await call(run);
      if (result.kind === 'ok') {
        done(result.value);
        await load();
      } else {
        setFailure(result.kind === 'not-allowed' ? NOT_ALLOWED_TEXT : ACTION_FAILED_TEXT);
        if (result.kind === 'unavailable') await load();
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{LOAD_FAILED_TEXT}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  const { overview } = view;
  const nameOf = (request: ChatRequestItem) => request.name ?? NO_NAME;
  const nothing = overview.conversations.length === 0 && overview.incoming.length === 0 && overview.support.length === 0 && overview.outgoing.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className={status === '' ? 'sr-only' : ''}>
        {status}
      </p>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      {nothing ? <p className="text-muted-foreground">{CHAT_EMPTY_TEXT}</p> : null}

      {overview.incoming.length === 0 ? null : (
        <Section title={REQUESTS_HEADING} listLabel={REQUESTS_LIST_LABEL}>
          {overview.incoming.map((request) => (
            <li key={request.id} className="flex flex-col gap-2 p-1">
              <div className="flex items-center gap-2">
                <Avatar name={nameOf(request)} decorative />
                <bdi dir="auto" className="text-label">
                  {nameOf(request)}
                </bdi>
                <span className="text-small text-muted-foreground">{formatPostTime(request.at)}</span>
              </div>
              <p dir="auto" className="whitespace-pre-wrap">
                {request.text}
              </p>
              <div className="flex gap-2">
                <Button
                  pending={busy === request.id}
                  onClick={() =>
                    void act(request.id, (token) => acceptChatRequest(token, request.id), (value) => {
                      void navigate(conversationPath(value.conversationId));
                    })
                  }
                >
                  {ACCEPT_LABEL}
                  <span className="sr-only"> {acceptRest(nameOf(request))}</span>
                </Button>
                <Button
                  variant="soft"
                  pending={busy === request.id}
                  onClick={() => void act(request.id, (token) => declineChatRequest(token, request.id), () => setStatus(DECLINED_TEXT))}
                >
                  {DECLINE_LABEL}
                  <span className="sr-only"> {acceptRest(nameOf(request))}</span>
                </Button>
              </div>
            </li>
          ))}
        </Section>
      )}

      {overview.conversations.length === 0 ? null : (
        <Section title={CONVERSATIONS_HEADING} listLabel={CONVERSATIONS_LIST_LABEL}>
          {overview.conversations.map((conversation) => {
            const name = conversation.otherName ?? NO_NAME;
            const last = conversation.lastMessage;
            return (
              <li key={conversation.id}>
                <Link to={conversationPath(conversation.id)} className="flex min-h-14 items-center gap-3 rounded-md p-2 text-card-foreground no-underline hover:bg-muted">
                  <Avatar name={name} decorative />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <bdi dir="auto" className="text-label">
                      {name}
                    </bdi>
                    {last === null ? null : (
                      <span dir="auto" className="truncate text-small text-muted-foreground">
                        {last.mine ? YOU_PREFIX : ''}
                        {last.text}
                      </span>
                    )}
                  </span>
                  <Unread count={conversation.unread} />
                </Link>
              </li>
            );
          })}
        </Section>
      )}

      {overview.support.length === 0 ? null : (
        <Section title={SUPPORT_HEADING} listLabel={SUPPORT_LIST_LABEL}>
          {overview.support.map((thread) => (
            <li key={thread.id}>
              <Link to={supportThreadPath(thread.id)} className="flex min-h-14 items-center gap-3 rounded-md p-2 text-card-foreground no-underline hover:bg-muted">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label">
                    {SUPPORT_NAME} · {TOPIC_LABELS[thread.topic]} · {STATUS_LABELS[thread.status]}
                  </span>
                  {thread.lastMessage === null ? null : (
                    <span dir="auto" className="truncate text-small text-muted-foreground">
                      {thread.lastMessage.fromSupport ? '' : YOU_PREFIX}
                      {thread.lastMessage.text}
                    </span>
                  )}
                </span>
                <Unread count={thread.unread} />
              </Link>
            </li>
          ))}
        </Section>
      )}

      {overview.outgoing.length === 0 ? null : (
        <Section title={SENT_HEADING} listLabel={SENT_LIST_LABEL}>
          {overview.outgoing.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-3 p-1">
              <Avatar name={nameOf(request)} decorative />
              <span className="flex min-w-0 flex-1 flex-col">
                <bdi dir="auto" className="text-label">
                  {nameOf(request)}
                </bdi>
                <span dir="auto" className="truncate text-small text-muted-foreground">
                  {request.text}
                </span>
              </span>
              <Button
                variant="soft"
                pending={busy === request.id}
                onClick={() => void act(request.id, (token) => cancelChatRequest(token, request.id), () => setStatus(CANCELLED_TEXT))}
              >
                {CANCEL_REQUEST_LABEL}
                <span className="sr-only"> {cancelRest(nameOf(request))}</span>
              </Button>
            </li>
          ))}
        </Section>
      )}

      <div>
        <Link to={PATHS.support} className="inline-flex min-h-11 items-center text-label">
          {NEW_SUPPORT_LABEL}
        </Link>
      </div>
    </div>
  );
}
