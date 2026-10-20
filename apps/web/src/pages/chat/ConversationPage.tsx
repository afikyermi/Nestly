import { useParams } from 'react-router';
import { chatIdParams } from '@nestly/shared';
import { ConversationScreen } from '@/features/chat/ConversationScreen';
import { CHAT_TITLE, CONVERSATION_GONE_TEXT } from '@/lib/chat-texts';
import { documentTitle } from '@/lib/document-title';

// One conversation, `/chat/<id>` (FR-CHAT-001). The document title is generic: no name outlives the screen. Keyed by the conversation.
export function ConversationPage() {
  const { conversationId = '' } = useParams();
  const id = chatIdParams.safeParse({ id: conversationId });
  return (
    <>
      <title>{documentTitle(CHAT_TITLE)}</title>
      {id.success ? <ConversationScreen key={id.data.id} conversationId={id.data.id} /> : <p>{CONVERSATION_GONE_TEXT}</p>}
    </>
  );
}
