import { CONSENT_PRIVACY_VERSION } from '@nestly/shared';
import { LegalDocumentPage } from '@/pages/legal/LegalDocumentPage';
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_TITLE } from './privacy-texts';

// The privacy policy (BR-078, PG-061): the version a registration records is the day it shows as updated (AC-186).
export function PrivacyPage() {
  return <LegalDocumentPage id="privacy" title={PRIVACY_TITLE} updated={CONSENT_PRIVACY_VERSION} intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS} />;
}
