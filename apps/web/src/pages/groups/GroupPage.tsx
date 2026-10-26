import { useLocation } from 'react-router';
import type { GroupDetail, GroupPostView } from '@nestly/shared';
import { normalizePath } from '@/app/paths';
import { FeedScreen } from '@/features/posts/FeedScreen';
import { FeedSourceContext } from '@/features/posts/feed-source';
import { GroupScreen } from '@/features/groups/GroupScreen';
import { DISCUSSION_HEADING, GROUPS_TITLE } from '@/features/groups/groups-texts';
import { documentTitle } from '@/lib/document-title';
import { groupIdOfPath } from '@/lib/group-link';
import { managingRank } from '@/features/groups/managing-rank';

// One Group's page (PG-034, PG-035; I10), `/groups/<id>`. The page composes the Group's screen with the feed's screen over the Group's posts
// (the same cards, composer, comments and likes; feed-source.ts), so the two features never import each other.
export function GroupPage() {
  const { pathname } = useLocation();
  const groupId = groupIdOfPath(normalizePath(pathname));
  if (groupId === null) return null;
  const discussion = (group: GroupDetail, onPin: (postId: string | null) => void, view: GroupPostView) => {
    // a muted Group Moderator or Admin removes and pins nothing until the mute ends (OP-070)
    const rank = managingRank(group);
    return (
      <FeedSourceContext
        value={{
          kind: 'group',
          groupId: group.id,
          privacy: group.privacy,
          heading: DISCUSSION_HEADING,
          // I10-C (§11.16): a muted member reads only
          canPost: group.myRole !== null && group.myMute === null,
          canModerate: rank >= 2,
          canPin: rank >= 3,
          pinnedPostId: group.pinnedPostId,
          onPin,
          view,
          readOnly: group.myMute !== null,
        }}
      >
        <FeedScreen key={`${group.id}:${group.pinnedPostId ?? ""}:${view}`} />
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
