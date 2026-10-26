import { GuestPlaceholderPage } from '@/pages/placeholder/GuestPlaceholderPage';
import { LegalLinks } from './LegalLinks';
import { updatedLine, type LegalDocumentId, type LegalSection } from './legal-texts';

export interface LegalDocumentPageProps {
  /** Which document: its own link is left out of the links at the end. */
  id: LegalDocumentId;
  title: string;
  /** The day the text last changed (YYYY-MM-DD): the consent version for terms and privacy (BR-078, AC-186). */
  updated: string;
  intro?: string;
  sections: readonly LegalSection[];
}

// One public document (BR-078, NFR-A11Y-001; PG-061): the terms, the privacy policy or the accessibility statement. Static: no request, no
// state; a Guest, a signed-in account and every hold read it (access.ts DOCUMENT_PATHS). Each section is a region named by its h2, so a
// screen reader lists them; the other documents are linked at the end.
export function LegalDocumentPage({ id, title, updated, intro, sections }: LegalDocumentPageProps) {
  return (
    <GuestPlaceholderPage title={title}>
      <div className="flex flex-col gap-5 text-body">
        <p className="text-muted-foreground">{updatedLine(updated)}</p>
        {intro !== undefined ? <p>{intro}</p> : null}
        {sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h2 className="mb-2 text-h3">{section.title}</h2>
            {section.text !== undefined ? <p>{section.text}</p> : null}
            {section.items !== undefined ? (
              <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <LegalLinks exclude={id} />
      </div>
    </GuestPlaceholderPage>
  );
}
