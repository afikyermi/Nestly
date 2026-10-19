import { useRef, useState } from 'react';
import type { FeedUnit } from '@nestly/shared';
import type { MoreActionsItem } from '@/components/ui/more-actions-menu';
import { useBackCloses } from '@/hooks/use-back-closes';
import { postPath } from '@/lib/post-link';
import { PATHS } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { handOverEdit, takeStatus } from './flash-status';
import { CHECKING_TEXT, CONFIRM_DELETE_LABEL, DELETED_STATUS, FEED_TITLE } from './posts-texts';
import { EDIT_ITEM_LABEL, HIDE_LABEL } from './hide-texts';
import { WritePostButton } from './WritePostButton';
import { usePostingRight } from '@/hooks/use-posting-right';
import { cn } from '@/lib/cn';
import { PLACEHOLDER_TEXT } from '@/pages/placeholder/placeholder-text';
import { FeedContent } from './FeedContent';
import { TO_TOP_LABEL } from './feed-texts';
import { useFeed } from './use-feed';
import { useFeedScroll } from './feed-scroll';
import { useSentinel } from './use-sentinel';

/** What is open over the feed: one card's menu, or its delete confirmation (with its request state). */
type Overlay = { kind: 'menu'; unitId: string } | { kind: 'confirm'; unitId: string; saving: boolean; failure: string | null } | null;

// The feed screen of a Regular account (FR-FEED-001; F3.2b, F3.1b): the heading, one polite region, "כתיבת פוסט", and the cards in the
// server's order with infinite scroll. A Professional keeps the placeholder line and no list. A post just deleted leaves "הפוסט נמחק"
// here, handed over in memory, once. Every card has a "⋯" menu (F3.9): edit and delete on the viewer's own named card, else hide (with
// undo in place). The posting right only decides the button and the placeholder; the server decides who has a feed.

export function FeedScreen() {
  const right = usePostingRight();
  const professional = right === 'not-allowed';
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toTopRef = useRef<() => void>(() => undefined);
  // A new snapshot replaces the list: focus that was inside it would drop to the page, so it goes to the heading, at the top.
  const { state, loadMore, retry, toggleLike, hide, undoHide, remove, restoredScroll } = useFeed(() => {
    if (rootRef.current?.querySelector('[role="feed"]')?.contains(document.activeElement) !== true) return;
    headingRef.current?.focus();
    toTopRef.current();
  });
  // Taken once: Back or a reload does not say it again.
  const [deleted] = useState(() => takeStatus(PATHS.feed, DELETED_STATUS));
  const { far, toTop } = useFeedScroll(rootRef, restoredScroll, right !== 'checking');
  toTopRef.current = toTop;
  const sentinelRef =useSentinel(state.phase === 'ready' && !state.loading && state.nextCursor !== null, loadMore);

  // A card's menu and its confirmation (F3.9 c8, c13; direction.md): one open at a time; Back closes it and stays in the feed. Closing
  // the confirmation while its delete is in flight is not possible (the dialog stays).
  const [overlay, setOverlay] = useState<Overlay>(null);
  const saving = overlay?.kind === 'confirm' && overlay.saving;
  const { leaveTo } = useBackCloses(overlay !== null, () => setOverlay((now) => (now?.kind === 'confirm' && now.saving ? now : null)));
  const confirmDelete = async (unitId: string) => {
    setOverlay({ kind: 'confirm', unitId, saving: true, failure: null });
    const result = await remove(unitId);
    setOverlay((now) => (now?.kind !== 'confirm' || now.unitId !== unitId ? now : result.ok ? null : { ...now, saving: false, failure: result.failure }));
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
  const status = right === 'checking' ? CHECKING_TEXT : action !== '' ? action : loaded !== '' ? loaded : deleted;
  const visible = right === 'checking' ? deleted !== '' : action !== '' || (loaded === '' && deleted !== '');
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
      {none ? null : (
        <FeedContent
          state={state}
          emptyAction={write}
          sentinelRef={sentinelRef}
          onRetry={retry}
          onToggleLike={toggleLike}
          actionsFor={actionsFor}
          onUndoHide={undoHide}
          headingRef={headingRef}
          openMenuId={overlay?.kind === 'menu' ? overlay.unitId : null}
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
      )}
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
