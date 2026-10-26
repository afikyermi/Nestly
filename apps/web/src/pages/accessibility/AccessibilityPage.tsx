import { LegalDocumentPage } from '@/pages/legal/LegalDocumentPage';
import { ACCESSIBILITY_INTRO, ACCESSIBILITY_SECTIONS, ACCESSIBILITY_TITLE, ACCESSIBILITY_UPDATED } from './accessibility-texts';

// The accessibility statement (NFR-A11Y-001, PG-061): public like the terms and the privacy policy.
export function AccessibilityPage() {
  return (
    <LegalDocumentPage
      id="accessibility"
      title={ACCESSIBILITY_TITLE}
      updated={ACCESSIBILITY_UPDATED}
      intro={ACCESSIBILITY_INTRO}
      sections={ACCESSIBILITY_SECTIONS}
    />
  );
}
