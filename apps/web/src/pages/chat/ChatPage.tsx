import { ChatCenterScreen } from '@/features/chat/ChatCenterScreen';
import { CHAT_TITLE } from '@/lib/chat-texts';
import { documentTitle } from '@/lib/document-title';

// The Chat Center (FR-CHAT-001), from the Top Bar's "כל ההודעות". The page only composes; the screen loads and fails on its own.
export function ChatPage() {
  return (
    <>
      <title>{documentTitle(CHAT_TITLE)}</title>
      <h1 className="text-h2">{CHAT_TITLE}</h1>
      <div className="mt-5">
        <ChatCenterScreen />
      </div>
    </>
  );
}
