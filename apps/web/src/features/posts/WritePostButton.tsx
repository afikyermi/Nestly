import { PATHS } from '@/app/paths';
import type { PostingRight } from '@/hooks/use-posting-right';
import { PostLinkButton } from './PostLinkButton';
import { NEW_POST_LABEL } from './posts-texts';

// "כתיבת פוסט" on the feed page (FR-FEED-002; F3.1b): only an account that writes posts sees it. While the check runs, or when it
// did not answer, the button is absent (the database refuses a post by anyone else in any case).
export function WritePostButton({ right }: { right: PostingRight }) {
  if (right !== 'allowed') return null;
  return (
    <div className="mt-4">
      <PostLinkButton to={PATHS.newPost}>{NEW_POST_LABEL}</PostLinkButton>
    </div>
  );
}
