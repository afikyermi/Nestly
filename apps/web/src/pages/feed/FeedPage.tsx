import { FeedScreen } from '@/features/posts/FeedScreen';
import { StoriesTray } from '@/features/stories/StoriesTray';
import { FEED_TITLE } from '@/features/posts/posts-texts';
import { documentTitle } from '@/lib/document-title';

// The feed page (protected; FR-FEED-001, F3.2b): the document title and the feed screen, with the Stories tray (FR-FEED-008) at its top.
export function FeedPage() {
  return (
    <>
      <title>{documentTitle(FEED_TITLE)}</title>
      <FeedScreen stories={<StoriesTray />} />
    </>
  );
}
