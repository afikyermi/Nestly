import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { EmptyFeedIllustration } from '@/components/shared/illustrations';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RETRY_LABEL } from './posts-texts';
import { FeedCard } from './FeedCard';
import type { FeedState } from './feed-state';
import { EMPTY_FEED_TEXT, FEED_LIST_LABEL } from './feed-texts';

export interface FeedContentProps {
  state: Pick<FeedState, 'phase' | 'loading' | 'items' | 'message' | 'focusIndex'>;
  /** The empty state's one action ("כתיבת פוסט"), or nothing when the account may not write. */
  emptyAction?: ReactNode;
  /** Put on the hidden element after the last card; the screen watches it to ask for the next page. */
  sentinelRef?: Ref<HTMLDivElement>;
  onRetry?: () => void;
}

function SkeletonCards() {
  return (
    <div data-testid="feed-loading" className="flex flex-col gap-4">
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card md:p-5">
          <Skeleton className="w-1/3" />
          <Skeleton className="w-3/4" />
          <Skeleton className="w-1/2" />
        </div>
      ))}
    </div>
  );
}

// The feed's list and its states (F3.2b c14, c18, c19): skeleton cards, the cards as a `feed`, the empty state, and the errors. Display
// only: the requests come from the screen. There is no "more" button and no footer; the page after the last card is asked for when the
// hidden sentinel comes near. Focus never moves when a page loads; after a retry that worked it goes to the first card it brought.
export function FeedContent({ state, emptyAction, sentinelRef, onRetry }: FeedContentProps) {
  const { phase, loading, items, message, focusIndex } = state;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusIndex !== null) listRef.current?.querySelectorAll<HTMLElement>('article')[focusIndex]?.focus();
  }, [focusIndex]);

  if (phase === 'blocked') return null;
  if (phase === 'ready' && items.length === 0) {
    return (
      <div data-testid="feed-empty" className="mt-8 flex flex-col items-center gap-4 text-center">
        <EmptyFeedIllustration />
        <p className="text-body text-muted-foreground">{EMPTY_FEED_TEXT}</p>
        {emptyAction}
      </div>
    );
  }
  const retry = (
    <Button variant="soft" pending={loading} onClick={onRetry}>
      {RETRY_LABEL}
    </Button>
  );
  const failure = (testId: string) => (
    <div data-testid={testId} className="flex flex-col items-start gap-4">
      <div className="w-full">
        <InlineAlert>{message}</InlineAlert>
      </div>
      {retry}
    </div>
  );
  // The `feed` holds cards only (an alert inside it fails the ARIA required-children rule): the failure follows right after it.
  return (
    <div ref={listRef} className="mt-4 flex flex-col gap-4">
      <div
        {...(items.length > 0 ? { role: 'feed', 'aria-label': FEED_LIST_LABEL } : {})}
        aria-busy={loading || phase === 'initial' ? true : undefined}
        className="flex flex-col gap-4"
      >
        {phase === 'initial' ? <SkeletonCards /> : null}
        {items.map((unit, index) => (
          <FeedCard key={unit.id} unit={unit} position={index + 1} />
        ))}
        {phase === 'ready' ? <div ref={sentinelRef} aria-hidden="true" data-testid="feed-sentinel" className="h-px" /> : null}
      </div>
      {phase === 'first-error' ? failure('feed-load-failed') : null}
      {phase === 'more-error' ? failure('feed-more-failed') : null}
    </div>
  );
}
