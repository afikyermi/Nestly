import { AdminGuidesScreen } from '@/features/admin-guides/AdminGuidesScreen';
import { documentTitle } from '@/lib/document-title';
import { GUIDES_TEXT } from '@/lib/admin-guides-texts';

// The Admin's guide management (FR-ADMIN-012), a tab of the admin shell (shown to the Admin role only) with one heading under the shell's h1. The
// page composes; the screen loads and fails on its own. What an Admin may do is the database's (anyone else is told there is no permission).
export function AdminGuidesPage() {
  return (
    <>
      <title>{documentTitle(GUIDES_TEXT.title)}</title>
      <h2 className="mb-4 text-h3">{GUIDES_TEXT.title}</h2>
      <AdminGuidesScreen />
    </>
  );
}
