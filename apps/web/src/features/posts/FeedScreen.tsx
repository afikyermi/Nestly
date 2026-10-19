import { useEffect, useRef, useState } from 'react';
import type { FeedUnit, PostView } from '@nestly/shared';
import type { MoreActionsItem } from '@/components/ui/more-actions-menu';
import { useBackCloses } from '@/hooks/use-back-closes';
import { postPath } from '@/lib/post-link';
import { PATHS } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { handOverEdit, takeStatus } from './flash-status';
import { CHECKING_TEXT, CONFIRM_DELETE_LABEL, DELETED_STATUS, FEED_TITLE, PUBLISHED_STATUS } from './posts-texts';
import { EDIT_ITEM_LABEL, HIDE_LABEL } from './hide-texts';
import { FeedComposer } from './FeedComposer';
import { takeComposerRequest } from './compose-draft';
import { publishedUnit } from './post-unit';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { usePostingProfile } from '@/hooks/use-posting-right';
import { cn } from '@/lib/cn';
import { PLACEHOLDER_TEXT } from '@/pages/placeholder/placeholder-text';
import { FeedContent } from './FeedContent';
import { TO_TOP_LABEL } from './feed-texts';
import { useFeed } from './use-feed';
import { useFeedScroll } from './feed-scroll';
import { useSentinel } from './use-sentinel';

/** What is open over the feed: one card's menu, or its delete confirmation (with its request state). */
type Overlay = { kind: 'menu'; unitId: string } | { kind: 'confirm'; unitId: string; saving: boolean; failure: string | null } | null;

// The feed screen of a Regular account (FR-FEED-001; F3.2b, feed-composer): the heading, one polite region, the composer (always open), and
// the cards in the server's order with infinite scroll. A Professional keeps the placeholder line and no list. A post just deleted leaves
// "הפוסט נמחק" here, handed over in memory, once. Every card has a "⋯" menu (F3.9): edit and delete on the viewer's own named card, else hide
// (with undo in place). The posting right only decides the composer and the placeholder; the server decides who has a feed.
export function FeedScreen() {
  const { right, fullName } = usePostingProfile();
  const own = useOwnUserId();
  const professional = right === 'not-allowed';
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toTopRef = useRef<() => void>(() => undefined);
  // A new snapshot replaces the list: focus that was inside it would drop to the page, so it goes to the heading, at the top.
  const { state, loadMore, retry, toggleLike, hide, undoHide, remove, addPublished, restoredScroll } = useFeed(() => {
    if (rootRef.current?.querySelector('[role="feed"]')?.contains(document.activeElement) !== true) return;
    headingRef.current?.focus();
    toTopRef.current();
  });
  // Taken once: Back or a reload does not say it again.
  const [deleted] = useState(() => takeStatus(PATHS.feed, DELETED_STATUS));
  // The composer: focus in the text when /posts/new sent here (taken once, so a reload shows it idle). A success moves focus to the new
  // card (D6). "הפוסט פורסם" is this visit's only: Back and reload do not repeat it.
  const [focusText] = useState(() => takeComposerRequest());
  const [published, setPublished] = useState(false);
  const [cardFocus, setCardFocus] = useState(0);
  useEffect(() => {
    if (cardFocus === 0) return;
    // No list yet (the first page has not come): focus goes to the heading, not to the page.
    (rootRef.current?.querySelector<HTMLElement>('[role="feed"] article') ?? headingRef.current)?.focus();
  }, [cardFocus]);
  // A post sent while the first page had failed leaves focus on the heading, also after the retry brought the list (c9).
  const headingAfterRetry = useRef(false);
  useEffect(() => {
    if (headingAfterRetry.current && state.phase === 'ready') {
      headingAfterRetry.current = false;
      headingRef.current?.focus();
    }
  }, [state.phase]);
  const onPublished = (post: PostView) => {
    headingAfterRetry.current = state.phase === 'first-error';
    addPublished(publishedUnit(post, fullName));
    setPublished(true);
    setCardFocus((tick) => tick + 1);
  };
  const { far, toTop } = useFeedScroll(rootRef, restoredScroll, right !== 'checking' && own.kind !== 'loading');
  toTopRef.current = toTop;
  const sentinelRef =useSentinel(state.phase === 'ready' && !state.loading && state.nextCursor !== null, loadMore);

  // A card's menu and its confirmation (F3.9 c8, c13; direction.md): one open at a time; Back closes it and stays in the feed. Closing
  // the confirmation while its delete is in flight is not possible (the dialog stays).
  const [overlay, setOverlay] = useState<Overlay>(null);
  const saving = overlay?.kind === 'confirm' && overlay.saving;
  // Back while the delete is in flight keeps the dialog (and the hook adds its entry again, so the next Back still closes it).
  const { leaveTo, closingByPointer, followAfterClose } = useBackCloses(overlay !== null, () => {
    if (saving) return false;
    setOverlay(null);
    return true;
  });
  const confirmDelete = async (unitId: string) => {
    setOverlay({ kind: 'confirm', unitId, saving: true, failure: null });
    const result = await remove(unitId);
    setOverlay((now) => (now?.kind !== 'confirm' || now.unitId !== unitId ? now : result.ok ? null : { ...now, saving: false, failure: result.failure }));
  };
  // A press outside an open menu closes it. When the press is an in-app link (another card's time link, a navigation item), its click is
  // held and replayed once the menu's history entry is gone, so the link is never undone and no dead entry stays under it.
  const pressedOutside = (target: EventTarget | null) => {
    closingByPointer();
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin || link.target !== '') return;
    const hold = (event: MouseEvent) => {
      document.removeEventListener('click', hold, true);
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Node) || !link.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      followAfterClose(`${link.pathname}${link.search}${link.hash}`);
    };
    document.addEventListener('click', hold, true);
  };
  const actionsFor = (unit: FeedUnit): MoreActionsItem[] =>
    unit.isMine
      ? [
          // A share's text cannot be edited (F3.5, NS005): its own menu offers delete only.
          ...(unit.kind === 'share'
            ? []
            : [
                {
                  key: 'edit',
                  label: EDIT_ITEM_LABEL,
                  onSelect: () => {
                    handOverEdit(postPath(unit.id));
                    leaveTo(postPath(unit.id));
                  },
                },
              ]),
          { key: 'delete', label: CONFIRM_DELETE_LABEL, onSelect: () => setOverlay({ kind: 'confirm', unitId: unit.id, saving: false, failure: null }) },
        ]
      : [{ key: 'hide', label: HIDE_LABEL, onSelect: () => hide(unit.id), disabled: state.pendingHideIds.includes(unit.id) }];

  // One polite region: the check in progress, else the page just loaded (a no-break space after every other one makes equal texts speak
  // again), else what just happened.
  const loaded = state.announcement === '' ? '' : state.announcement + (state.announcementTick % 2 === 0 ? ' ' : '');
  const failedLike = state.likeStatus;
  // A hide or an undo (F3.9): what happened, in the same region; the tick makes two equal texts in a row speak again.
  const hidden = state.hideStatus === '' ? '' : state.hideStatus + (state.hideStatusTick % 2 === 0 ? ' ' : '');
  const action = failedLike !== '' ? failedLike : hidden;
  const status = right === 'checking' ? CHECKING_TEXT : action !== '' ? action : loaded !== '' ? loaded : published ? PUBLISHED_STATUS : deleted;
  const visible = right === 'checking' ? deleted !== '' : action !== '' || (loaded === '' && (published || deleted !== ''));
  const none = professional || state.phase === 'blocked';
  const content = none ? null : (
    <FeedContent
      state={state}
      sentinelRef={sentinelRef}
      onRetry={retry}
      onToggleLike={toggleLike}
      actionsFor={actionsFor}
      onUndoHide={undoHide}
      headingRef={headingRef}
      openMenuId={overlay?.kind === 'menu' ? overlay.unitId : null}
      onMenuPressOutside={pressedOutside}
      onMenuOpenChange={(unitId, open) =>
        setOverlay((now) => (open ? { kind: 'menu', unitId } : now?.kind === 'menu' && now.unitId === unitId ? null : now))
      }
      confirm={overlay?.kind === 'confirm' ? overlay : null}
      onConfirmDelete={() => {
        if (overlay?.kind === 'confirm' && !saving) void confirmDelete(overlay.unitId);
      }}
      onCancelDelete={() => {
        if (!saving) setOverlay(null);
      }}
    />
  );
  const write = (
    <FeedComposer
      right={right}
      own={own}
      focusText={focusText}
      onPublished={onPublished}
    />
  );

  return (
    <div ref={rootRef}>
      <h1 ref={headingRef} tabIndex={-1} className="text-h2">
        {FEED_TITLE}
      </h1>
      <p role="status" data-testid="feed-status" className={cn(visible ? 'mt-1 text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      {none ? <p className="mt-1 text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p> : null}
      {/* One fixed place, before the list or the empty state: a form sending a post survives the feed changing phase. */}
      {write}
      {content}
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
