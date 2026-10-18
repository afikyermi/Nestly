import { useLocation } from 'react-router';
import { flashStatus } from '@/features/posts/flash-status';
import { CHECKING_TEXT, DELETED_STATUS, FEED_TITLE } from '@/features/posts/posts-texts';
import { WritePostButton } from '@/features/posts/WritePostButton';
import { usePostingRight } from '@/hooks/use-posting-right';
import { documentTitle } from '@/lib/document-title';
import { PLACEHOLDER_TEXT } from '@/pages/placeholder/placeholder-text';

// The feed page (protected; the list arrives with F3.2): its heading, the placeholder line, and "כתיבת פוסט" for a Regular account
// (F3.1b). A post just deleted leaves "הפוסט נמחק" here, handed over in the navigation state.
export function FeedPage() {
  const right = usePostingRight();
  const deleted = flashStatus(useLocation().state, DELETED_STATUS);
  // One polite region: the check in progress, else what just happened.
  const status = right === 'checking' ? CHECKING_TEXT : deleted;
  return (
    <>
      <title>{documentTitle(FEED_TITLE)}</title>
      <h1 className="text-h2">{FEED_TITLE}</h1>
      <p role="status" data-testid="feed-status" className={deleted === '' ? 'sr-only' : 'mt-1 text-body text-muted-foreground'}>
        {status}
      </p>
      <p className="mt-1 text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p>
      <WritePostButton right={right} />
    </>
  );
}
