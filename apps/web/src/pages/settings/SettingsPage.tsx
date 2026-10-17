import { PrivacySettingsSection } from '@/features/privacy/PrivacySettingsSection';
import { documentTitle } from '@/lib/document-title';

const TITLE = 'הגדרות';

// Settings (PG-038, FR-SET-001; F2.3a, Gate 1 DR-2 A): for now only the Privacy & Security section. F2.5 adds the other sections and
// the menu entries. The page only composes; the section loads and fails on its own.
export function SettingsPage() {
  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <div className="mt-5">
        <PrivacySettingsSection />
      </div>
    </>
  );
}
