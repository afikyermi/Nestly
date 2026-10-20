import { AdminGuidesScreen } from '@/features/admin-guides/AdminGuidesScreen';
import { documentTitle } from '@/lib/document-title';
import { GUIDES_TEXT } from '@/lib/admin-guides-texts';

// The Admin's guide management (FR-ADMIN-012). The page composes; the screen loads and fails on its own. Reaching the path takes a signed-in
// session only; what an Admin may do is the database's (a non-Admin is told there is no permission).
export function AdminGuidesPage() {
  return (
    <>
      <title>{documentTitle(GUIDES_TEXT.title)}</title>
      <h1 className="text-h2">{GUIDES_TEXT.title}</h1>
      <div className="mt-5">
        <AdminGuidesScreen />
      </div>
    </>
  );
}
