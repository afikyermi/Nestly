import { HomeScreen } from '@/features/home/HomeScreen';
import { documentTitle } from '@/lib/document-title';
import { HOME_TEXT } from '@/lib/tracker-texts';

// The home (PG-009, FR-HOME-001..004). A Regular parent's tracking and planning; the page only composes.
export function HomePage() {
  return (
    <>
      <title>{documentTitle(HOME_TEXT.title)}</title>
      <h1 className="text-h2">{HOME_TEXT.title}</h1>
      <p className="mt-2 text-body text-muted-foreground">{HOME_TEXT.lead}</p>
      <div className="mt-5">
        <HomeScreen />
      </div>
    </>
  );
}
