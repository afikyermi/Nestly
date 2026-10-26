import { CONSENT_TERMS_VERSION } from '@nestly/shared';
import { LegalDocumentPage } from '@/pages/legal/LegalDocumentPage';
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_TITLE } from './terms-texts';

// The terms of use (BR-078, PG-061): the version a registration records is the day it shows as updated (AC-186).
export function TermsPage() {
  return <LegalDocumentPage id="terms" title={TERMS_TITLE} updated={CONSENT_TERMS_VERSION} intro={TERMS_INTRO} sections={TERMS_SECTIONS} />;
}
