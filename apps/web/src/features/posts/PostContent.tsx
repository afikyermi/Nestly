import { useEffect, useRef, type ReactNode } from 'react';
import { ANONYMOUS_AUTHOR_LABEL, type PostPageView } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ReportSheet, type ReportSheetProps } from '@/components/domain/report-sheet';
import { ShareLinkSheet, type ShareLinkSheetProps } from '@/components/domain/share-link-sheet';
import { ShareInFeedIcon, ShareLinkIcon } from '@/components/ui/icons';
import { SHARE_LINK_LABEL } from '@/lib/share-link-texts';
import { MoreActionsMenu, type MoreActionsItem } from '@/components/ui/more-actions-menu';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_LABELS } from '@/lib/child-fields';
import { cn } from '@/lib/cn';
import { documentTitle } from '@/lib/document-title';
import type { PostFormErrors, PostFormValues } from './post-form';
import { PostForm, type PostFormFocus } from './PostForm';
import { PostLinkButton } from './PostLinkButton';
import { PostShareView } from './PostShareView';
import { ShareFeedSheet, type ShareFeedSheetProps } from './ShareFeedSheet';
import { SHARE_IN_FEED_LABEL } from './share-texts';
import { MORE_ACTIONS_LABEL, MORE_ACTIONS_MENU_LABEL } from './hide-texts';
import { PostImages } from './PostImages';
import { OfferHelpSheet, type OfferHelpSheetProps } from '@/components/domain/offer-help-sheet';
import { OFFER_HELP, OFFERED } from '@/lib/professional-texts';
import {
  ANONYMOUS_OWN_NOTE,
  audienceLine,
  BACK_TO_FEED_LABEL,
  CONFIRM_DELETE_LABEL,
  DELETE_DESCRIPTION,
  DELETING_TEXT,
  DELETE_TITLE,
  DIALOG_CANCEL_LABEL,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  POST_TITLE,
  POST_UNAVAILABLE_TEXT,
  RETRY_LABEL,
  tagLine,
} from './posts-texts';

export interface PostEdit {
  values: PostFormValues;
  errors: PostFormErrors;
  saving: boolean;
  failure: string | null;
}

/** What the screen shows. The container (PostScreen) owns the flow; this draws one state. */
export type PostScreenView =
  | { kind: 'loading' }
  | { kind: 'unavailable' } // 404: one text for every reason
  | { kind: 'load-failed'; message: string }
  | { kind: 'reported'; text: string } // F3.7 c13: the viewer reported this post; it is not shown to them again
  | {
      kind: 'loaded';
      post: PostPageView;
      /** The polite status line: what just happened. Empty: nothing. */
      status: string;
      /** The last action's failure (a delete that did not go through). */
      failure: string | null;
      edit: PostEdit | null;
      confirm: { saving: boolean; failure: string | null } | null;
    };

/** Where focus goes after a change, once per `tick`. */
export type PostFocus = PostFormFocus | { target: 'actions'; tick: number };

export interface PostContentProps {
  view: PostScreenView;
  focus?: PostFocus;
  onRetry?: () => void;
  onEditChange?: (values: PostFormValues) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  /** The viewer's posts are for everyone only (a Professional): the edit form shows "הפוסט יוצג לכולם", no audience or tag group (c11). */
  everyoneOnly?: boolean;
  /** The comments region, drawn below the post (F3.3); it keeps its own state while the post is edited. */
  thread?: ReactNode;
  /** The "more actions" items of a post the viewer did not write (F3.7 c9: report). None or empty: no menu. */
  moreActions?: readonly MoreActionsItem[];
  /** Controlled menu: open, and the change it asks for (the screen closes it on Back too). */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** A press outside the open menu, with what was pressed (it may be a link). */
  onMenuPressOutside?: (target: EventTarget | null) => void;
  /** The report window (F3.7 c10), open while set; it closes onto the "⋯", or onto the reported paragraph. */
  report?: Omit<ReportSheetProps, 'finalFocus'> | null;
  /** "שיתוף בפיד" (F3.5 c9) and "שיתוף קישור" (F3.6 c3): each given only when the post can be shared or linked. */
  onShareInFeed?: (() => void) | undefined;
  onShareLink?: (() => void) | undefined;
  /** The share-in-feed window (F3.5 c10) and the share-link window (F3.6 c4), open while set; each closes onto its button. */
  shareFeed?: Omit<ShareFeedSheetProps, 'finalFocus'> | null;
  shareLink?: Omit<ShareLinkSheetProps, 'finalFocus'> | null;
  /** A page-level alert (F3.5 c11: the share was refused for the caller). Empty: none. */
  pageAlert?: string;
  /** I11 completion C (FR-SERV-005, §13.2): a Professional's "הצעת עזרה" on a post it may offer on; `sent`: "נשלחה הצעה". */
  offerHelp?: { sent: boolean; onOffer: () => void } | undefined;
  /** The Offer Help window, open while set; it closes onto the post's offer control. */
  offerSheet?: Omit<OfferHelpSheetProps, 'finalFocus'> | null;
}

// The author's "⋯" of the post (ux-polish-b c3): where focus returns after an edit, a cancelled delete.
const FOCUS_ACTION = '[data-post-own] [data-more-actions]';
const FOCUS_MORE = '[data-more-actions]';

// One post (FR-FEED-002; F3.1b) inside the shell's `main`: its text, who sees it and its tag; for the author "עריכת הפוסט" and "מחיקת הפוסט" under "⋯",
// an anonymous post's "אנונימי" header for every reader and, for its author only, the note that only they see it (F3.4 c12);
// the edit form and the delete confirmation; for anyone else the "⋯" menu with "דיווח על הפוסט" and its window (F3.7). A share shows its
// sharer, text and original (F3.5 c12) and has "מחיקה" only; a post or share that can be shared has "שיתוף בפיד" and "שיתוף קישור". Display only: what
// the actions do comes in as props. The text is the user's own, so it is isolated and keeps its line breaks.
export function PostContent(props: PostContentProps) {
  const { view, focus, onRetry, onEditChange, onEditSave, onEditCancel, onConfirmDelete, onCancelDelete, thread } = props;
  const { moreActions = [], menuOpen, onMenuOpenChange, onMenuPressOutside, report = null, everyoneOnly = false } = props;
  const { onShareInFeed, onShareLink, shareFeed = null, shareLink = null, pageAlert = '', offerHelp, offerSheet = null } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus === undefined || focus.tick === 0 || focus.target === 'body' || focus.target === 'invalid') return;
    const root = rootRef.current;
    if (root === null) return;
    const selector = focus.target === 'actions' ? FOCUS_ACTION : '[data-post-message]';
    (root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('h1'))?.focus();
  }, [focus]);

  const loaded = view.kind === 'loaded' ? view : null;
  const editing = loaded?.edit ?? null;
  const status = view.kind === 'loading' ? LOADING_TEXT : (loaded?.status ?? '');
  const heading = POST_TITLE;

  return (
    <div ref={rootRef} className="flex min-w-0 max-w-md flex-col gap-6">
      <title>{documentTitle(heading)}</title>
      <h1 tabIndex={-1} className="text-h2">
        {heading}
      </h1>
      {/* One polite region for the screen, present from the first render so its changes are announced. */}
      <p role="status" data-testid="post-status" className={cn(status !== '' && view.kind === 'loaded' ? 'text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      {pageAlert !== '' ? <InlineAlert>{pageAlert}</InlineAlert> : null}
      {view.kind === 'loading' ? (
        <div data-testid="post-loading" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
          <Skeleton className="w-3/4" />
        </div>
      ) : null}
      {view.kind === 'unavailable' ? (
        <div data-testid="post-unavailable" className="flex flex-col items-start gap-4">
          <p className="text-body">{POST_UNAVAILABLE_TEXT}</p>
          <PostLinkButton to={PATHS.feed} variant="text">
            {BACK_TO_FEED_LABEL}
          </PostLinkButton>
        </div>
      ) : null}
      {view.kind === 'load-failed' ? (
        <div data-testid="post-load-failed" className="flex flex-col items-start gap-4">
          <div data-post-message tabIndex={-1} className="w-full">
            <InlineAlert>{view.message}</InlineAlert>
          </div>
          {view.message === LOAD_FAILED_TEXT ? (
            <Button variant="soft" onClick={onRetry}>
              {RETRY_LABEL}
            </Button>
          ) : null}
        </div>
      ) : null}
      {view.kind === 'reported' ? (
        <div data-testid="post-reported" className="flex flex-col items-start gap-4">
          <p data-post-message tabIndex={-1} className="text-body">
            {view.text}
          </p>
          <PostLinkButton to={PATHS.feed} variant="text">
            {BACK_TO_FEED_LABEL}
          </PostLinkButton>
        </div>
      ) : null}
      {loaded !== null && editing !== null ? (
        <PostForm
          mode="edit"
          values={editing.values}
          errors={editing.errors}
          saving={editing.saving}
          failure={editing.failure}
          {...(focus !== undefined && focus.target !== 'actions' ? { focus } : {})}
          onChange={(values) => onEditChange?.(values)}
          onSubmit={() => onEditSave?.()}
          {...(onEditCancel !== undefined ? { onCancel: onEditCancel } : {})}
          anonymous={loaded.post.isAnonymous}
          everyoneOnly={everyoneOnly}
        />
      ) : null}
      {loaded !== null && editing === null ? (
        <>
          {loaded.failure !== null ? (
            <div data-post-message tabIndex={-1}>
              <InlineAlert>{loaded.failure}</InlineAlert>
            </div>
          ) : null}
          <article data-testid="post" className="flex flex-col gap-3 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card md:p-5">
            {moreActions.length > 0 ? (
              <div {...(loaded.post.isMine ? { 'data-post-own': '' } : {})} className="-mt-2 -me-2 flex justify-end">
                <MoreActionsMenu
                  label={MORE_ACTIONS_LABEL}
                  menuLabel={MORE_ACTIONS_MENU_LABEL}
                  items={moreActions}
                  {...(menuOpen === undefined ? {} : { open: menuOpen })}
                  {...(onMenuOpenChange === undefined ? {} : { onOpenChange: onMenuOpenChange })}
                  {...(onMenuPressOutside === undefined ? {} : { onPressOutside: onMenuPressOutside })}
                />
              </div>
            ) : null}
            {loaded.post.isAnonymous ? (
              <p data-testid="post-author" className="text-label">
                {ANONYMOUS_AUTHOR_LABEL}
              </p>
            ) : null}
            {loaded.post.isAnonymous && loaded.post.isMine ? (
              <p data-testid="post-own-note" className="text-small text-muted-foreground">
                {ANONYMOUS_OWN_NOTE}
              </p>
            ) : null}
            {loaded.post.kind === 'share' ? (
              <PostShareView share={loaded.post} />
            ) : (
              <>
                <p data-testid="post-body" dir="rtl" className="whitespace-pre-wrap wrap-anywhere">
                  {loaded.post.body ?? ''}
                </p>
                <PostImages images={loaded.post.images} />
              </>
            )}
            <p data-testid="post-audience" className="text-small text-muted-foreground">
              {audienceLine(loaded.post.audience)}
            </p>
            {loaded.post.stageTag !== null ? (
              <p data-testid="post-tag" className="text-small text-muted-foreground">
                {tagLine(STAGE_LABELS[loaded.post.stageTag])}
              </p>
            ) : null}
            {onShareInFeed !== undefined || onShareLink !== undefined || offerHelp !== undefined ? (
              <div className="flex flex-wrap items-center gap-x-2">
                {offerHelp === undefined ? null : offerHelp.sent ? (
                  <span tabIndex={-1} className="inline-flex min-h-11 items-center px-2 text-label text-muted-foreground" data-offer-sent="">
                    {OFFERED}
                  </span>
                ) : (
                  <Button variant="soft" data-offer-help="" onClick={offerHelp.onOffer}>
                    {OFFER_HELP}
                  </Button>
                )}
                {onShareInFeed === undefined ? null : (
                  <Button iconOnly label={SHARE_IN_FEED_LABEL} data-share-feed onClick={onShareInFeed}>
                    <ShareInFeedIcon className="size-5" />
                  </Button>
                )}
                {onShareLink === undefined ? null : (
                  <Button iconOnly label={SHARE_LINK_LABEL} data-share-link onClick={onShareLink}>
                    <ShareLinkIcon className="size-5" />
                  </Button>
                )}
              </div>
            ) : null}
          </article>
          <div>
            <PostLinkButton to={PATHS.feed} variant="text">
              {BACK_TO_FEED_LABEL}
            </PostLinkButton>
          </div>
          {loaded.confirm !== null ? (
            <ConfirmDialog
              open
              title={DELETE_TITLE}
              description={DELETE_DESCRIPTION}
              confirmLabel={loaded.confirm.saving ? DELETING_TEXT : CONFIRM_DELETE_LABEL}
              cancelLabel={DIALOG_CANCEL_LABEL}
              pending={loaded.confirm.saving}
              failure={loaded.confirm.failure}
              onConfirm={() => onConfirmDelete?.()}
              onCancel={() => onCancelDelete?.()}
              finalFocus={() => rootRef.current?.querySelector<HTMLElement>(FOCUS_ACTION) ?? null}
            />
          ) : null}
        </>
      ) : null}
      {loaded !== null ? thread : null}
      {report !== null ? (
        <ReportSheet
          {...report}
          finalFocus={() => rootRef.current?.querySelector<HTMLElement>(`[data-post-message], ${FOCUS_MORE}`) ?? rootRef.current?.querySelector<HTMLElement>('h1') ?? null}
        />
      ) : null}
      {shareFeed !== null ? <ShareFeedSheet {...shareFeed} finalFocus={() => rootRef.current?.querySelector<HTMLElement>('[data-share-feed]') ?? null} /> : null}
      {offerSheet !== null ? (
        <OfferHelpSheet {...offerSheet} finalFocus={() => rootRef.current?.querySelector<HTMLElement>('[data-offer-help], [data-offer-sent]') ?? null} />
      ) : null}
      {shareLink !== null ? <ShareLinkSheet {...shareLink} finalFocus={() => rootRef.current?.querySelector<HTMLElement>('[data-share-link]') ?? null} /> : null}
    </div>
  );
}
