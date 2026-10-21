import { GroupsScreen } from '@/features/groups/GroupsScreen';
import { GROUPS_TITLE } from '@/features/groups/groups-texts';
import { documentTitle } from '@/lib/document-title';

// The Groups page (PG-033, PG-043; I10), from the side menu: my Groups, discovery and creating a Group. The page only composes.
export function GroupsPage() {
  return (
    <>
      <title>{documentTitle(GROUPS_TITLE)}</title>
      <h1 className="text-h2">{GROUPS_TITLE}</h1>
      <div className="mt-5">
        <GroupsScreen />
      </div>
    </>
  );
}
