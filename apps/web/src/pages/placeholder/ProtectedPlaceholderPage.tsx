import { documentTitle } from '@/lib/document-title';
import { PLACEHOLDER_TEXT } from './placeholder-text';

export interface ProtectedPlaceholderPageProps {
  /** The screen's h1, and its document title. */
  title: string;
}

// A protected screen not built yet (Home, Feed, Profile, Settings), inside the shell's `main`: its heading
// and one line, nothing else. It reads and sends no data (NFR-SEC-002).
export function ProtectedPlaceholderPage({ title }: ProtectedPlaceholderPageProps) {
  return (
    <>
      <title>{documentTitle(title)}</title>
      <h1 className="text-h2">{title}</h1>
      <p className="mt-1 text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p>
    </>
  );
}
