import { createContext, useContext } from 'react';
import type { GroupPrivacy } from '@nestly/shared';

// Where the feed's cards come from (I10). The community feed (the default) or one Group's discussion (FR-GRP-001): the same cards, the same
// composer, the same comments and likes, with the Group's own differences:
//   - the page comes from GET /api/groups/:id/posts and is never remembered for Back (the remembered pages are the community feed's)
//   - the composer writes into the Group (`groupId`), only for a member, and its post is always for everyone (no audience choice)
//   - a Group Moderator or higher may remove another member's post, and the Owner or a Group Admin may pin one
//   - a Private Group's post is never shared (the database refuses it), so a card there offers no sharing
export type FeedSource =
  | { readonly kind: 'feed' }
  | {
      readonly kind: 'group';
      readonly groupId: string;
      readonly privacy: GroupPrivacy;
      /** The heading of the discussion (the page's h1 is the Group's name). */
      readonly heading: string;
      readonly canPost: boolean;
      /** A Group Moderator or higher: "הסרה מהקבוצה" on others' posts (the database checks the Role of the author). */
      readonly canModerate: boolean;
      /** The Owner or a Group Admin: "הצמדה לראש הקבוצה". */
      readonly canPin: boolean;
      readonly pinnedPostId: string | null;
      readonly onPin: (postId: string | null) => void;
    };

export const COMMUNITY_FEED: FeedSource = { kind: 'feed' };

export const FeedSourceContext = createContext<FeedSource>(COMMUNITY_FEED);

export const useFeedSource = (): FeedSource => useContext(FeedSourceContext);
