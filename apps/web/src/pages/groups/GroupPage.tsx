import { useLocation } from 'react-router';
import type { GroupDetail } from '@nestly/shared';
import { normalizePath } from '@/app/paths';
import { FeedScreen } from '@/features/posts/FeedScreen';
import { FeedSourceContext } from '@/features/posts/feed-source';
import { GroupScreen } from '@/features/groups/GroupScreen';
import { DISCUSSION_HEADING, GROUPS_TITLE } from '@/features/groups/groups-texts';
import { documentTitle } from '@/lib/document-title';
import { groupIdOfPath } from '@/lib/group-link';
import { groupRoleRank } from '@nestly/shared';

// One Group's page (PG-034, PG-035; I10), `/groups/<id>`. The page composes the Group's screen with the feed's screen over the Group's posts
// (the same cards, composer, comments and likes; feed-source.ts), so the two features never import each other.
export function GroupPage() {
  const { pathname } = useLocation();
  const groupId = groupIdOfPath(normalizePath(pathname));
  if (groupId === null) return null;
  const discussion = (group: GroupDetail, onPin: (postId: string | null) => void) => {
    const rank = groupRoleRank(group.myRole);
    return (
      <FeedSourceContext
        value={{
          kind: 'group',
          groupId: group.id,
          privacy: group.privacy,
          heading: DISCUSSION_HEADING,
          canPost: group.myRole !== null,
          canModerate: rank >= 2,
          canPin: rank >= 3,
          pinnedPostId: group.pinnedPostId,
          onPin,
        }}
      >
        <FeedScreen key={`${group.id}:${group.pinnedPostId ?? ""}`} />
      </FeedSourceContext>
    );
  };
  return (
    <>
      <title>{documentTitle(GROUPS_TITLE)}</title>
      <GroupScreen key={groupId} groupId={groupId} discussion={discussion} />
    </>
  );
}
