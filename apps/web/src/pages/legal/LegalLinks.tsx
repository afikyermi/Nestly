import { Link } from 'react-router';
import { PATHS } from '@/app/paths';
import { LEGAL_LINKS_LABEL, type LegalDocumentId } from './legal-texts';

const DOCUMENTS: ReadonlyArray<{ id: LegalDocumentId; to: string; label: string }> = [
  { id: 'terms', to: PATHS.terms, label: 'תנאי השימוש' },
  { id: 'privacy', to: PATHS.privacy, label: 'מדיניות הפרטיות' },
  { id: 'accessibility', to: PATHS.accessibility, label: 'הצהרת נגישות' },
];

export interface LegalLinksProps {
  /** The document the links sit in: its own link is left out. */
  exclude?: LegalDocumentId;
  className?: string;
}

// The links to the public documents (BR-078, NFR-A11Y-001): at the end of each document, on Welcome and on PG-050, so a Guest, a held
// account and a signed-in one reach them without the menu. Same tab, through the router; each target is at least 44px high.
export function LegalLinks({ exclude, className }: LegalLinksProps) {
  return (
    <nav aria-label={LEGAL_LINKS_LABEL} className={className}>
      <ul className="flex flex-wrap justify-center gap-x-4">
        {DOCUMENTS.filter((document) => document.id !== exclude).map((document) => (
          <li key={document.id}>
            <Link to={document.to} className="inline-flex min-h-11 items-center text-small text-primary-strong underline underline-offset-4">
              {document.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
