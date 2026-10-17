import { FriendsScreen } from '@/features/friends/FriendsScreen';
import { TITLE } from '@/features/friends/friends-texts';
import { documentTitle } from '@/lib/document-title';

// The Friends page (PG-036, FR-REL-001; F2.4b), reached from the side menu. The page only composes; the screen loads and fails on
// its own.
export function FriendsPage() {
  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <div className="mt-5">
        <FriendsScreen />
      </div>
    </>
  );
}
