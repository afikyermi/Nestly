// Shared by the public documents (BR-078, NFR-A11Y-001; PG-061): the section shape, the "updated" line and the links' name.
export type LegalDocumentId = 'terms' | 'privacy' | 'accessibility';

export interface LegalSection {
  /** The section's h2, and the name of its region. */
  readonly title: string;
  readonly text?: string;
  readonly items?: readonly string[];
}

export const LEGAL_LINKS_LABEL = 'מסמכים';

/** "עודכן לאחרונה: 26 באוקטובר 2026" from a YYYY-MM-DD day (the document's version, AC-186); the day itself when it cannot be read. */
export function updatedLine(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const shown = Number.isNaN(date.getTime())
    ? day
    : new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeZone: 'Asia/Jerusalem' }).format(date);
  return `עודכן לאחרונה: ${shown}`;
}
