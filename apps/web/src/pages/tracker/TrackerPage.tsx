import { useLocation } from 'react-router';
import { PATHS } from '@/app/paths';
import { CycleScreen } from '@/features/trackers/CycleScreen';
import { TrackerScreen } from '@/features/trackers/TrackerScreen';
import { documentTitle } from '@/lib/document-title';
import { isCyclePage, trackerPageOfPath } from '@/lib/tracker-link';
import { PAGE_LABEL } from '@/lib/tracker-texts';
import { Button } from '@/components/ui/button';

// One tracker's page (PG-009 "Tracker Menu" → FR-TRACK-001/002), `/trackers/<kind>`. The page composes; the screens load and fail
// on their own. The route guard lets only the nine known kinds in, so an unknown kind never gets here.
export function TrackerPage() {
  const { pathname } = useLocation();
  const page = trackerPageOfPath(pathname.replace(/\/+$/, ''));
  if (page === null) return null;
  const label = PAGE_LABEL[page];
  return (
    <>
      <title>{documentTitle(label)}</title>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h2">{label}</h1>
        <Button href={PATHS.home} variant="text">
          חזרה לבית
        </Button>
      </div>
      <div className="mt-5">{isCyclePage(page) ? <CycleScreen /> : <TrackerScreen kind={page} />}</div>
    </>
  );
}
