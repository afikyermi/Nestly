import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ChatOverview } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { useChatCall } from '@/hooks/use-chat-call';
import { CHAT_ALL_LABEL, CHAT_DROPDOWN_LABEL } from '@/lib/chat-texts';
import { fetchChatOverview } from '@/services/api/chat';
import { RecentList } from './ChatTopBarButton';

/** An overview this recent is shown as it is (no request): server load, Afik 28.10.2026. */
const FRESH_MS = 2 * 60_000;
let cached: { at: number; overview: ChatOverview } | null = null;

// "שיחות אחרונות" in the desktop end column (redesign 27.10.2026, NFR-USE-001): the same list as the Chat Center's button. It asks once, only
// when the column is on screen (a wide desktop), and reuses an answer from the last two minutes. Nothing is drawn while it loads or fails.
export function RecentChatsCard() {
  const call = useChatCall();
  const ref = useRef<HTMLElement>(null);
  const [overview, setOverview] = useState<ChatOverview | null>(() => (cached !== null && Date.now() - cached.at < FRESH_MS ? cached.overview : null));

  useEffect(() => {
    if (overview !== null) return;
    // The column is hidden below 1280: an element that takes no space is not shown, so nothing is asked.
    if (ref.current === null || ref.current.getClientRects().length === 0) return;
    let cancelled = false;
    void call(fetchChatOverview).then((result) => {
      if (cancelled || result.kind !== 'ok') return;
      cached = { at: Date.now(), overview: result.value };
      setOverview(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [call, overview]);

  return (
    <section ref={ref} aria-labelledby="side-chats" className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="side-chats" className="text-label font-bold">
          {CHAT_DROPDOWN_LABEL}
        </h2>
        <Link to={PATHS.chat} className="inline-flex min-h-11 items-center text-caption text-primary-strong underline underline-offset-4">
          {CHAT_ALL_LABEL}
        </Link>
      </div>
      {overview === null ? null : <RecentList overview={overview} />}
    </section>
  );
}
