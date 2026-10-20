import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ChatOverview } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { Avatar } from '@/components/ui/avatar';
import { MessageIcon } from '@/components/ui/icons';
import { Popover } from '@/components/ui/popover';
import { useChatCall } from '@/hooks/use-chat-call';
import { conversationPath, supportThreadPath } from '@/lib/chat-link';
import { fetchChatOverview, fetchChatUnread } from '@/services/api/chat';
import {
  CHAT_ALL_LABEL,
  CHAT_DROPDOWN_LABEL,
  CHAT_EMPTY_TEXT,
  chatButtonLabel,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  NO_NAME,
  REQUESTS_HEADING,
  SUPPORT_NAME,
  unreadText,
  YOU_PREFIX,
} from '@/lib/chat-texts';

/** How often the badge asks again while the page is visible (the MVP polls; no Realtime yet). */
const POLL_MS = 30_000;
const RECENT = 5;

type Recent = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; overview: ChatOverview };

// The Chat icon in the Top Bar (FR-CHAT-001, BR-036): the unread badge (messages, Support replies and requests waiting for an answer), and a
// dropdown of the latest conversations with a link to the whole Chat Center. A chat message is never also a notification.
export function ChatTopBarButton({ current }: { current: string }) {
  const call = useChatCall();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<Recent>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    const result = await call(fetchChatUnread);
    if (result.kind === 'ok') setUnread(result.value.count);
  }, [call]);

  // The badge: on every screen change (a thread just read) and every POLL_MS while the page is visible.
  useEffect(() => {
    void refresh();
    // A thread opened by this screen change is marked read by its own GET: ask again once that has had its turn.
    const settle = window.setTimeout(() => void refresh(), 1500);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => {
      window.clearTimeout(settle);
      window.clearInterval(timer);
    };
  }, [refresh, current]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRecent({ kind: 'loading' });
    void call(fetchChatOverview).then((result) => {
      if (!alive) return;
      if (result.kind === 'ok') {
        setRecent({ kind: 'loaded', overview: result.value });
        setUnread(result.value.unreadTotal);
      } else setRecent({ kind: 'failed' });
    });
    return () => {
      alive = false;
    };
  }, [open, call]);

  const label = chatButtonLabel(unread);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={CHAT_DROPDOWN_LABEL}
      className="flex w-80 max-w-full flex-col gap-2 p-3 text-body"
      trigger={
        <button
          type="button"
          aria-label={label}
          data-testid="chat-button"
          className="relative inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
        >
          <MessageIcon className="size-6" />
          {unread > 0 ? (
            <span aria-hidden="true" className="absolute end-1 top-1 min-w-5 rounded-full bg-primary px-1 text-center text-caption text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      }
    >
          <p className="text-label">{CHAT_DROPDOWN_LABEL}</p>
          {recent.kind === 'loading' ? <p role="status">{LOADING_TEXT}</p> : null}
          {recent.kind === 'failed' ? <p role="status">{LOAD_FAILED_TEXT}</p> : null}
          {recent.kind === 'loaded' ? <RecentList overview={recent.overview} onPick={() => setOpen(false)} /> : null}
          <Link to={PATHS.chat} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center text-label">
            {CHAT_ALL_LABEL}
          </Link>
    </Popover>
  );
}

function RecentList({ overview, onPick }: { overview: ChatOverview; onPick: () => void }) {
  const items = [
    ...overview.conversations.map((c) => ({
      key: c.id,
      to: conversationPath(c.id),
      name: c.otherName ?? NO_NAME,
      preview: c.lastMessage === null ? '' : `${c.lastMessage.mine ? YOU_PREFIX : ''}${c.lastMessage.text}`,
      at: c.lastMessage?.at ?? '',
      unread: c.unread,
    })),
    ...overview.support.map((s) => ({
      key: s.id,
      to: supportThreadPath(s.id),
      name: SUPPORT_NAME,
      preview: s.lastMessage?.text ?? '',
      at: s.lastMessage?.at ?? '',
      unread: s.unread,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT);
  return (
    <>
      {overview.incoming.length > 0 ? (
        <Link to={PATHS.chat} onClick={onPick} className="rounded-md bg-primary-soft p-2 text-label text-primary-strong no-underline">
          {REQUESTS_HEADING}: {overview.incoming.length}
        </Link>
      ) : null}
      {items.length === 0 ? (
        <p className="text-small text-muted-foreground">{CHAT_EMPTY_TEXT}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link to={item.to} onClick={onPick} className="flex min-h-11 items-center gap-2 rounded-md p-1 text-card-foreground no-underline hover:bg-muted">
                <Avatar name={item.name === SUPPORT_NAME ? '' : item.name} decorative size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi dir="auto" className="text-label">
                    {item.name}
                  </bdi>
                  <span dir="auto" className="truncate text-small text-muted-foreground">
                    {item.preview}
                  </span>
                </span>
                {item.unread > 0 ? (
                  <span className="rounded-full bg-primary px-2 text-caption text-primary-foreground">
                    <span aria-hidden="true">{item.unread}</span>
                    <span className="sr-only">{unreadText(item.unread)}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
