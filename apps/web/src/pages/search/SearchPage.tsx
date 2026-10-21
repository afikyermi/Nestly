import { SearchResultsScreen } from '@/features/search/SearchResultsScreen';
import { TITLE } from '@/features/search/search-texts';
import { documentTitle } from '@/lib/document-title';

// The search results page (PG-017, FR-SEARCH-001), reached from the top bar. The page only composes.
export function SearchPage() {
  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <div className="mt-5">
        <SearchResultsScreen />
      </div>
    </>
  );
}
