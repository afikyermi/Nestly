import { useRef, useState } from 'react';
import { PATHS } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { takeStatus } from './flash-status';
import { CHECKING_TEXT, DELETED_STATUS, FEED_TITLE } from './posts-texts';
import { WritePostButton } from './WritePostButton';
import { usePostingRight } from '@/hooks/use-posting-right';
import { cn } from '@/lib/cn';
import { PLACEHOLDER_TEXT } from '@/pages/placeholder/placeholder-text';
import { FeedContent } from './FeedContent';
import { TO_TOP_LABEL } from './feed-texts';
import { useFeed } from './use-feed';
import { useFeedScroll } from './feed-scroll';
import { useSentinel } from './use-sentinel';

// The feed screen of a Regular account (FR-FEED-001; F3.2b, F3.1b): the heading, one polite region, "כתיבת פוסט", and the cards in the
// server's order with infinite scroll. A Professional keeps the placeholder line and no list. A post just deleted leaves "הפוסט נמחק"
// here, handed over in memory, once. The posting right only decides the button and the placeholder; the server decides who has a feed.
export function FeedScreen() {
  const right = usePostingRight();
  const professional = right === 'not-allowed';
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toTopRef = useRef<() => void>(() => undefined);
  // A new snapshot replaces the list: focus that was inside it would drop to the page, so it goes to the heading, at the top.
  const { state, loadMore, retry, restoredScroll } = useFeed(() => {
    if (rootRef.current?.querySelector('[role="feed"]')?.contains(document.activeElement) !== true) return;
    headingRef.current?.focus();
    toTopRef.current();
  });
  // Taken once: Back or a reload does not say it again.
  const [deleted] = useState(() => takeStatus(PATHS.feed, DELETED_STATUS));
  const { far, toTop } = useFeedScroll(rootRef, restoredScroll, right !== 'checking');
  toTopRef.current = toTop;
  const sentinelRef =useSentinel(state.phase === 'ready' && !state.loading && state.nextCursor !== null, loadMore);

  // One polite region: the check in progress, else the page just loaded (a no-break space after every other one makes equal texts speak
  // again), else what just happened.
  const loaded = state.announcement === '' ? '' : state.announcement + (state.announcementTick % 2 === 0 ? ' ' : '');
  const status = right === 'checking' ? CHECKING_TEXT : loaded !== '' ? loaded : deleted;
  const visible = right === 'checking' ? deleted !== '' : loaded === '' && deleted !== '';
  const none = professional || state.phase === 'blocked';
  const empty = state.phase === 'ready' && state.items.length === 0;
  const write = <WritePostButton right={right} />;

  return (
    <div ref={rootRef}>
      <h1 ref={headingRef} tabIndex={-1} className="text-h2">
        {FEED_TITLE}
      </h1>
      <p role="status" data-testid="feed-status" className={cn(visible ? 'mt-1 text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      {none ? <p className="mt-1 text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p> : null}
      {empty ? null : write}
      {none ? null : <FeedContent state={state} emptyAction={write} sentinelRef={sentinelRef} onRetry={retry} />}
      {far ? (
        <div className="sticky bottom-4 mt-4 flex justify-end">
          <Button
            variant="soft"
            className="shadow-card"
            onClick={() => {
              toTop();
              headingRef.current?.focus();
            }}
          >
            {TO_TOP_LABEL}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
