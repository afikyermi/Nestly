import { useParams } from 'react-router';
import { chatIdParams } from '@nestly/shared';
import { SupportThreadScreen } from '@/features/support/SupportThreadScreen';
import { CONVERSATION_GONE_TEXT, SUPPORT_THREAD_TITLE } from '@/lib/chat-texts';
import { documentTitle } from '@/lib/document-title';

// One Support thread, `/support/<id>` (FR-CHAT-004): the caller's own request only.
export function SupportThreadPage() {
  const { requestId = '' } = useParams();
  const id = chatIdParams.safeParse({ id: requestId });
  return (
    <>
      <title>{documentTitle(SUPPORT_THREAD_TITLE)}</title>
      {id.success ? <SupportThreadScreen key={id.data.id} requestId={id.data.id} /> : <p>{CONVERSATION_GONE_TEXT}</p>}
    </>
  );
}
