import { useEffect, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import type { FeedUnit } from '@nestly/shared';
import { EmptyFeedIllustration } from '@/components/shared/illustrations';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ReportSheet, type ReportSheetProps } from '@/components/domain/report-sheet';
import { ShareLinkSheet, type ShareLinkSheetProps } from '@/components/domain/share-link-sheet';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import type { MoreActionsItem } from '@/components/ui/more-actions-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { CONFIRM_DELETE_LABEL, DELETE_DESCRIPTION, DELETE_TITLE, DELETING_TEXT, DIALOG_CANCEL_LABEL, RETRY_LABEL } from './posts-texts';
import { DELETE_COMMENT_CONFIRM_LABEL, DELETE_COMMENT_REPLIES_NOTE, DELETE_COMMENT_TITLE } from './comments-texts';
import { FeedCard } from './FeedCard';
import { HiddenPostCard } from './HiddenPostCard';
import { ShareFeedSheet, type ShareFeedSheetProps } from './ShareFeedSheet';
import type { FeedState, HideFocus } from './feed-state';
import type { CardEdit } from './use-card-edit';
import { EMPTY_FEED_TEXT, FEED_LIST_LABEL } from './feed-texts';

export interface FeedContentProps {
  state: Pick<FeedState, 'phase' | 'loading' | 'items' | 'message' | 'focusIndex' | 'hiddenIds' | 'pendingHideIds' | 'hideFocus'>;
  /** Put on the hidden element after the last card; the screen watches it to ask for the next page. */
  sentinelRef?: Ref<HTMLDivElement>;
  onRetry?: () => void;
  /** The like of a card; without it the cards carry no action row. */
  onToggleLike?: (unitId: string) => void;
  /** The "more actions" items of a card (F3.9 c8); without it, or with none, the card has no menu. */
  actionsFor?: (unit: FeedUnit) => readonly MoreActionsItem[];
  /** Undo a hide from a card's placeholder (F3.9 c9). */
  onUndoHide?: (unitId: string) => void;
  /** The screen's heading: focus goes there when a removed card was the last one (F3.9 screen.md, hide 404, deleted). */
  headingRef?: RefObject<HTMLElement | null>;
  /** The card whose menu is open (one at a time; the screen also closes it on Back), and the change a menu asks for. */
  openMenuId?: string | null;
  onMenuOpenChange?: (unitId: string, open: boolean) => void;
  /** A press outside an open menu closed it (the press may be a link: the screen must not undo it). */
  onMenuPressOutside?: (target: EventTarget | null) => void;
  /** The edit form open in a card (ux-polish-b c1); one card at a time. */
  edit?: CardEdit | null;
  onEditChange?: (values: CardEdit['values']) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  /**
   * The delete confirmation of the viewer's own card (F3.9 c13), or of the viewer's own comment in a card (`comment`; ux-polish-a c7, F3.3's
   * texts): one dialog over the feed, open while set.
   */
  confirm?: { unitId: string; saving: boolean; failure: string | null; comment?: { id: string; topLevel: boolean } | undefined } | null;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  /**
   * The report window of a card (F3.7 c10), open while set; it closes onto the card's "⋯", or where the card's removal sends focus. A comment's
   * (ux-polish-a c7) closes onto that comment's "⋯".
   */
  report?: { unitId: string; sheet: Omit<ReportSheetProps, 'finalFocus'> } | { commentId: string; sheet: Omit<ReportSheetProps, 'finalFocus'> } | null;
  /** A card's comment area (ux-polish-a), drawn inside the card with its like control. */
  commentsFor?: (unit: FeedUnit) => ReactNode;
  /** A card's share actions (F3.5 c9, F3.6 c3): each given only when the unit can be shared or linked. */
  shareActionsFor?: (unit: FeedUnit) => { onShareInFeed?: (() => void) | undefined; onShareLink?: (() => void) | undefined };
  /** The share-in-feed window of a card (F3.5 c10), open while set; it closes onto the card's "שיתוף בפיד". */
  shareFeed?: { unitId: string; sheet: Omit<ShareFeedSheetProps, 'finalFocus'> } | null;
  /** The share-link window of a card (F3.6 c4), open while set; it closes onto the card's "שיתוף קישור". */
  shareLink?: { unitId: string; sheet: Omit<ShareLinkSheetProps, 'finalFocus'> } | null;
}

function cardOf(list: HTMLElement | null, unitId: string): HTMLElement | undefined {
  return Array.from(list?.querySelectorAll<HTMLElement>('article') ?? []).find((element) => element.dataset.unitId === unitId);
}

/** Where a hide, an undo or a removal sends focus: the undo, a card's "⋯", or the first control of the card now at the index (null: none). */
function hideFocusElement(list: HTMLElement | null, focus: HideFocus): HTMLElement | null {
  if (focus.target === 'index') {
    const card = list?.querySelectorAll<HTMLElement>('article')[focus.index];
    return card === undefined ? null : (card.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? card);
  }
  return cardOf(list, focus.unitId)?.querySelector<HTMLElement>(focus.target === 'undo' ? '[data-hide-undo]' : '[data-more-actions]') ?? null;
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
// F3.9: a card the viewer hid here is drawn as its placeholder in the same place; after a hide or an undo, focus goes where hideFocus says.
export function FeedContent(props: FeedContentProps) {
  const { state, sentinelRef, onRetry, onToggleLike, actionsFor, onUndoHide, headingRef, openMenuId = null, onMenuOpenChange } = props;
  const { edit = null, onEditChange, onEditSave, onEditCancel } = props;
  const { confirm = null, onConfirmDelete, onCancelDelete, onMenuPressOutside, report = null, shareActionsFor, shareFeed = null, shareLink = null, commentsFor } = props;
  const { phase, loading, items, message, focusIndex, hiddenIds, pendingHideIds, hideFocus } = state;
  const listRef = useRef<HTMLDivElement>(null);
  const latestFocus = useRef(hideFocus);
  latestFocus.current = hideFocus;

  useEffect(() => {
    if (focusIndex !== null) listRef.current?.querySelectorAll<HTMLElement>('article')[focusIndex]?.focus();
  }, [focusIndex]);

  useEffect(() => {
    if (hideFocus !== null) (hideFocusElement(listRef.current, hideFocus) ?? headingRef?.current)?.focus();
  }, [hideFocus, headingRef]);

  // The confirmation (and the report window) closes onto its card's "⋯" (cancel, Esc, Back), or, the card gone, where the removal sends focus.
  const afterConfirm = (unitId: string): HTMLElement | null => {
    const more = cardOf(listRef.current, unitId)?.querySelector<HTMLElement>('[data-more-actions]');
    if (more !== null && more !== undefined) return more;
    const focus = latestFocus.current;
    return (focus === null ? null : hideFocusElement(listRef.current, focus)) ?? headingRef?.current ?? null;
  };

  // A comment's confirmation or report window closes onto its "⋯"; the comment gone (a delete), onto its card's "תגובות" (ux-polish-a c7).
  const afterComment = (commentId: string, unitId: string | null): HTMLElement | null => {
    const more = listRef.current?.querySelector<HTMLElement>(`[data-comment-id="${commentId}"] [data-more-actions]`);
    if (more !== null && more !== undefined) return more;
    return (unitId === null ? null : cardOf(listRef.current, unitId)?.querySelector<HTMLElement>('[data-comments-button]')) ?? headingRef?.current ?? null;
  };

  // A share window closes onto the button that opened it (its card stays), else where a removal sends focus.
  const afterShare = (unitId: string, selector: string): HTMLElement | null =>
    cardOf(listRef.current, unitId)?.querySelector<HTMLElement>(selector) ?? afterConfirm(unitId);

  if (phase === 'blocked') return null;
  if (phase === 'ready' && items.length === 0) {
    return (
      <div data-testid="feed-empty" className="mt-8 flex flex-col items-center gap-4 text-center">
        <EmptyFeedIllustration />
        <p className="text-body text-muted-foreground">{EMPTY_FEED_TEXT}</p>
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
        {items.map((unit, index) =>
          hiddenIds.includes(unit.id) ? (
            <HiddenPostCard
              key={unit.id}
              unitId={unit.id}
              position={index + 1}
              pending={pendingHideIds.includes(unit.id)}
              onUndo={() => onUndoHide?.(unit.id)}
            />
          ) : (
            <FeedCard
              key={unit.id}
              unit={unit}
              position={index + 1}
              {...(onToggleLike === undefined || (unit.kind === 'post' && unit.group?.muted === true) ? {} : { onToggleLike: () => onToggleLike(unit.id) })}
              {...(actionsFor === undefined ? {} : { actions: actionsFor(unit) })}
              {...(shareActionsFor === undefined ? {} : shareActionsFor(unit))}
              {...(edit !== null && edit.unitId === unit.id
                ? {
                    edit,
                    ...(onEditChange === undefined ? {} : { onEditChange }),
                    ...(onEditSave === undefined ? {} : { onEditSave }),
                    ...(onEditCancel === undefined ? {} : { onEditCancel }),
                  }
                : {})}
              menuOpen={openMenuId === unit.id}
              {...(onMenuOpenChange === undefined ? {} : { onMenuOpenChange: (open: boolean) => onMenuOpenChange(unit.id, open) })}
              {...(onMenuPressOutside === undefined ? {} : { onMenuPressOutside })}
              {...(commentsFor === undefined ? {} : { comments: commentsFor(unit) })}
            />
          ),
        )}
        {phase === 'ready' ? <div ref={sentinelRef} aria-hidden="true" data-testid="feed-sentinel" className="h-px" /> : null}
      </div>
      {phase === 'first-error' ? failure('feed-load-failed') : null}
      {phase === 'more-error' ? failure('feed-more-failed') : null}
      {confirm !== null ? (
        <ConfirmDialog
          open
          title={confirm.comment === undefined ? DELETE_TITLE : DELETE_COMMENT_TITLE}
          description={
            <>
              {DELETE_DESCRIPTION}
              {confirm.comment?.topLevel === true ? <span className="block">{DELETE_COMMENT_REPLIES_NOTE}</span> : null}
            </>
          }
          confirmLabel={confirm.saving ? DELETING_TEXT : confirm.comment === undefined ? CONFIRM_DELETE_LABEL : DELETE_COMMENT_CONFIRM_LABEL}
          cancelLabel={DIALOG_CANCEL_LABEL}
          pending={confirm.saving}
          failure={confirm.failure}
          onConfirm={() => onConfirmDelete?.()}
          onCancel={() => onCancelDelete?.()}
          finalFocus={() => (confirm.comment === undefined ? afterConfirm(confirm.unitId) : afterComment(confirm.comment.id, confirm.unitId))}
        />
      ) : null}
      {report !== null ? (
        <ReportSheet {...report.sheet} finalFocus={() => ('commentId' in report ? afterComment(report.commentId, null) : afterConfirm(report.unitId))} />
      ) : null}
      {shareFeed !== null ? <ShareFeedSheet {...shareFeed.sheet} finalFocus={() => afterShare(shareFeed.unitId, '[data-share-feed]')} /> : null}
      {shareLink !== null ? <ShareLinkSheet {...shareLink.sheet} finalFocus={() => afterShare(shareLink.unitId, '[data-share-link]')} /> : null}
    </div>
  );
}
