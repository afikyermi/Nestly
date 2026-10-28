import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { chatTextProblem, type ConversationThread } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { MessageComposer } from '@/components/domain/message-composer';
import { ReportSheet } from '@/components/domain/report-sheet';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreActionsMenu } from '@/components/ui/more-actions-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatCall } from '@/hooks/use-chat-call';
import { reportSheetProps, useReport } from '@/hooks/use-report';
import { formatPostTime } from '@/lib/format-post-time';
import { userProfilePath } from '@/lib/profile-link';
import { fetchConversation, sendChatMessage, setChatBlock } from '@/services/api/chat';
import {
  ACTION_FAILED_TEXT,
  BACK_TO_CHAT_LABEL,
  CANNOT_SEND_TEXT,
  CHAT_BLOCK_LABEL,
  CHAT_BLOCKED_TEXT,
  CHAT_UNBLOCK_LABEL,
  CHAT_UNBLOCKED_TEXT,
  CONVERSATION_GONE_TEXT,
  CONVERSATION_MENU_LABEL,
  EMPTY_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  MESSAGE_LABEL,
  messageFrom,
  NO_NAME,
  OPENING_NOTE,
  RATE_LIMITED_TEXT,
  REPORT_MESSAGE_LABEL,
  REPORTED_TEXT,
  RETRY_LABEL,
  SEND_LABEL,
  SENDING_TEXT,
  THREAD_LABEL,
  TOO_LONG_TEXT,
} from '@/lib/chat-texts';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'gone' } | { kind: 'loaded'; thread: ConversationThread };

/** How often an open conversation asks for new messages while the page is visible (the MVP polls). */
const POLL_MS = 15_000;

// One conversation (FR-CHAT-001, FR-CHAT-002): the messages oldest first (the opening message of an accepted request first), the composer, and the
// conversation's actions: a Chat Block (FR-SERV-009; while one stands either way, neither side sends: "לא ניתן לשלוח הודעות בשיחה הזו", §9.4) and a
// report on a message from the other side (§9.6: staff see that message only). No read receipt (§9.5).
export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const call = useChatCall();
  const headingId = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const busy = useRef(false);
  const listEnd = useRef<HTMLLIElement>(null);
  const report = useReport((_target, result) => setStatus(result === 'received' || result === 'already-reported' ? REPORTED_TEXT : ACTION_FAILED_TEXT));

  const load = useCallback(async () => {
    const result = await call((token) => fetchConversation(token, conversationId));
    if (result.kind === 'ok') setView({ kind: 'loaded', thread: result.value });
    else setView((now) => (now.kind === 'loaded' && result.kind === 'failed' ? now : result.kind === 'unavailable' ? { kind: 'gone' } : { kind: 'failed' }));
  }, [call, conversationId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const count = view.kind === 'loaded' ? view.thread.messages.length : 0;
  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: 'end' });
  }, [count]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy.current || view.kind !== 'loaded') return;
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
      const result = await call((token) => sendChatMessage(token, conversationId, text));
      if (result.kind === 'ok') {
        setText('');
        await load();
      } else if (result.kind === 'blocked') await load();
      else setFailure(ACTION_FAILED_TEXT);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function toggleBlock(thread: ConversationThread) {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    setStatus('');
    try {
      const block = !thread.blockedByMe;
      const result = await call((token) => setChatBlock(token, thread.otherUserId, block));
      if (result.kind === 'ok') {
        setStatus(block ? CHAT_BLOCKED_TEXT : CHAT_UNBLOCKED_TEXT);
        await load();
      } else setFailure(result.kind === 'rate-limited' ? RATE_LIMITED_TEXT : ACTION_FAILED_TEXT);
    } finally {
      busy.current = false;
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
  if (view.kind === 'gone' || view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.kind === 'gone' ? CONVERSATION_GONE_TEXT : LOAD_FAILED_TEXT}</InlineAlert>
        {view.kind === 'failed' ? (
          <Button variant="soft" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        ) : null}
        <Link to={PATHS.chat}>{BACK_TO_CHAT_LABEL}</Link>
      </div>
    );
  }
  const { thread } = view;
  const name = thread.otherName ?? NO_NAME;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to={PATHS.chat} className="inline-flex min-h-11 items-center">
          {BACK_TO_CHAT_LABEL}
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <Avatar name={name} decorative />
        <h1 id={headingId} className="min-w-0 flex-1 text-h2">
          {thread.otherName === null ? (
            <bdi dir="auto">{name}</bdi>
          ) : (
            <Link to={userProfilePath(thread.otherUserId)} className="text-foreground">
              <bdi dir="auto">{name}</bdi>
            </Link>
          )}
        </h1>
        <MoreActionsMenu
          label={CONVERSATION_MENU_LABEL}
          menuLabel={CONVERSATION_MENU_LABEL}
          items={[{ key: 'block', label: thread.blockedByMe ? CHAT_UNBLOCK_LABEL : CHAT_BLOCK_LABEL, onSelect: () => void toggleBlock(thread) }]}
        />
      </div>
      <p role="status" className={status === '' ? 'sr-only' : 'text-small text-muted-foreground'}>
        {status}
      </p>
      <ol aria-label={THREAD_LABEL} className="flex flex-col gap-2 py-2">
        {thread.messages.map((message) => (
          <li key={message.id} className={`flex items-start gap-1 ${message.mine ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-sm rounded-xl px-3.5 py-2 text-foreground ${message.mine ? 'rounded-es-sm bg-primary-soft' : 'rounded-ee-sm border border-border bg-card'}`}>
              <span className="sr-only">{messageFrom(message.mine, name)}: </span>
              <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
                {message.text}
              </p>
              <p className="text-caption text-muted-foreground">
                {message.isOpening ? `${OPENING_NOTE} · ` : ''}
                {formatPostTime(message.at)}
              </p>
            </div>
            {!message.mine && !message.isOpening ? (
              <MoreActionsMenu
                label={`${REPORT_MESSAGE_LABEL}: ${message.text.slice(0, 30)}`}
                menuLabel={REPORT_MESSAGE_LABEL}
                items={[{ key: 'report', label: REPORT_MESSAGE_LABEL, onSelect: () => report.start({ kind: 'message', id: message.id }) }]}
              />
            ) : null}
          </li>
        ))}
        <li ref={listEnd} aria-hidden="true" />
      </ol>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      {thread.canSend ? (
        <MessageComposer
          label={MESSAGE_LABEL}
          sendLabel={SEND_LABEL}
          text={text}
          onTextChange={setText}
          problem={problem}
          sending={sending}
          sendingText={SENDING_TEXT}
          labelledBy={headingId}
          onSubmit={(event) => void send(event)}
        />
      ) : (
        <p data-testid="chat-cannot-send" className="rounded-md bg-muted p-3 text-label">
          {CANNOT_SEND_TEXT}
        </p>
      )}
      {report.draft !== null ? <ReportSheet {...reportSheetProps(report, report.draft, PATHS.communityRules)} /> : null}
    </div>
  );
}
