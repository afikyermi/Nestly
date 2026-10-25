import { CHATS_NAV_UNREAD } from '@/lib/professional-texts';
import { useChatUnread } from './chat-unread';

// The unread count on a Professional's "שיחות" tab (§11.20, ⭐ brief I11-C (d) 2): quiet (design-system: `badge`, no red, no pulse), "99+"
// above 99, and said to a screen reader after the tab's label. Nothing at 0.
export function ChatsNavBadge() {
  const unread = useChatUnread();
  if (unread <= 0) return null;
  const shown = unread > 99 ? '99+' : String(unread);
  return (
    <>
      <span aria-hidden="true" className="absolute top-0 start-1/2 ms-2 min-w-5 rounded-full bg-badge px-1 text-center text-caption text-badge-foreground">
        {shown}
      </span>
      <span className="sr-only">{CHATS_NAV_UNREAD(shown)}</span>
    </>
  );
}
