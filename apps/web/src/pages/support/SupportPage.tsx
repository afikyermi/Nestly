import { SupportScreen } from '@/features/support/SupportScreen';
import { SUPPORT_TITLE } from '@/lib/chat-texts';
import { documentTitle } from '@/lib/document-title';

// The Support form and the caller's requests (FR-ADMIN-001), from the side menu and the Chat Center. Signed in only (ERR-043 has no link here).
export function SupportPage() {
  return (
    <>
      <title>{documentTitle(SUPPORT_TITLE)}</title>
      <h1 className="text-h2">{SUPPORT_TITLE}</h1>
      <div className="mt-5">
        <SupportScreen />
      </div>
    </>
  );
}
