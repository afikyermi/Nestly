import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { JourneyRow } from '@/components/domain/journey-row';
import { ArrowUpIcon } from '@/components/ui/icons';
import { useJourneyContexts } from '@/hooks/use-journey-contexts';
import { useNewPosts } from './use-new-posts';
import { newPostsText } from './feed-texts';
import { ShellActionBarContext } from '@/components/layout/app-shell';
import { postLinkOf, shareTargetOf, type FeedUnit, type PostView } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { shareLinkSheetProps, useShareLink } from '@/hooks/use-share-link';
import { SHARE_LINK_LABEL } from '@/lib/share-link-texts';
import type { MoreActionsItem } from '@/components/ui/more-actions-menu';
import { useBackCloses } from '@/hooks/use-back-closes';
import { reportSheetProps, useReport } from '@/hooks/use-report';
import { REPORT_POST_ITEM } from '@/lib/report-texts';
import { PATHS } from '@/app/paths';
import { takeStatus } from './flash-status';
import { CHECKING_TEXT, CONFIRM_DELETE_LABEL, DELETED_STATUS, FEED_TITLE, PUBLISHED_STATUS } from './posts-texts';
import { EDIT_ITEM_LABEL, HIDE_LABEL } from './hide-texts';
import { FeedComposer } from './FeedComposer';
import { SystemNotices } from './SystemNotices';
import { GroupSuggestions } from './GroupSuggestions';
import { takeComposerRequest } from './compose-draft';
import { publishedUnit, sharedUnit } from './post-unit';
import { SHARE_FAILED_TEXT, SHARED_STATUS } from './share-texts';
import { shareFeedSheetValues, useShareInFeed } from './use-share-in-feed';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { usePostingProfile } from '@/hooks/use-posting-right';
import { cn } from '@/lib/cn';
import { PLACEHOLDER_TEXT } from '@/pages/placeholder/placeholder-text';
import { FeedContent } from './FeedContent';
import { holdLinksWhileClosing, outsidePressHandler } from './outside-press';
import { ToTopButton } from './ToTopButton';
import { useFeed } from './use-feed';
import { useCardEdit } from './use-card-edit';
import { useFeedScroll } from './feed-scroll';
import { useSentinel } from './use-sentinel';
import { CardComments } from './CardComments';
import { COMMENT_REPORT_STATUS } from './CommentsSection';
import { useCommentApi } from './use-comment-api';
import { useFeedComments } from './use-feed-comments';
import { useFeedCommentWrites } from './use-feed-comment-writes';
import { useNearCards } from './use-near-cards';
import { useFeedSource } from './feed-source';
import { PIN_LABEL, REMOVE_FROM_GROUP_LABEL, UNPIN_LABEL } from '@/lib/group-post-texts';
import { useStaffAccess } from '@/hooks/use-staff-access';
import { STAFF_REVIEW_NOTE } from '@/lib/staff-review-texts';
import { OFFER_CONTROL_SELECTOR, OfferHelpSheet } from '@/components/domain/offer-help-sheet';
import { Toast } from '@/components/domain/toast';
import { useOfferHelp } from '@/hooks/use-offer-help';

/**
 * What is open over the feed: one card's menu, one comment's menu (ux-polish-a c10), or the delete confirmation of a card or of a comment in it
 * (with its request state).
 */
type Overlay =
  | { kind: 'menu'; unitId: string }
  | { kind: 'comment-menu'; unitId: string; commentId: string }
  | { kind: 'confirm'; unitId: string; saving: boolean; failure: string | null; comment?: { id: string; topLevel: boolean } | undefined }
  | null;

// The feed screen of a Regular or a Professional account (FR-FEED-001; F3.2b, feed-composer, professional-posting): the heading, one polite
// region, the composer (always open), and the cards in the server's order with infinite scroll. An account the server gives no feed keeps
// the placeholder line, no composer and no list. A post just deleted leaves "הפוסט נמחק" here, handed over in memory, once. Every card has a
// "⋯" menu (F3.9): edit and delete on the viewer's own named card, else hide (with undo in place; not offered to a Professional, F3.9 c7) and
// report (F3.7). The posting right only decides the composer and the hide item; the server decides who has a feed.
// A card that can be shared has "שיתוף בפיד" (F3.5: the window over the feed, the new share first in the list at once) and one with a link
// "שיתוף קישור" (F3.6); a Professional has neither. Every card with the like control holds its comments (ux-polish-a): asked when it comes near.
/** I5: the page passes the Stories tray (a feature of its own), shown under the heading. */
export function FeedScreen({ stories }: { stories?: ReactNode } = {}) {
  const { right, fullName } = usePostingProfile();
  const own = useOwnUserId();
  // I14 completion (§9.7, Afik 21.10.2026): a staff account reads the feed for independent review and writes nothing (no composer, like, comment,
  // share, hide or report here; the server and RLS refuse those writes too)
  const reviewing = useStaffAccess().kind === 'staff';
  // A Professional (no parent profile, D1) may not hide a post (post_hides_insert_guard): the item is not offered.
  const professional = right === 'everyone-only';
  // I10: the same screen shows one Group's discussion (feed-source.ts).
  const source = useFeedSource();
  const group = source.kind === 'group' ? source : null;
  const canHide = !professional;
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toTopRef = useRef<() => void>(() => undefined);
  // A new snapshot replaces the list: focus that was inside it would drop to the page, so it goes to the heading, at the top.
  const { state, loadMore, retry, refresh, toggleLike, hide, undoHide, remove, addPublished, addShared, reported, edited, gone, editClosed, commented, said, restoredScroll } = useFeed(() => {
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
  const actionBar = useContext(ShellActionBarContext);
  const { far, away, toTop } = useFeedScroll(rootRef, restoredScroll, right !== 'checking' && own.kind !== 'loading');
  toTopRef.current = toTop;
  // AC-207: new posts while the reader is away from the top of the community feed; a press brings the new snapshot, nothing moves by itself.
  const newPosts = useNewPosts(state.items, away, group === null && !reviewing && state.phase === 'ready');
  const showNewPosts = () => {
    newPosts.clear();
    toTop();
    refresh();
    headingRef.current?.focus();
  };
  // AC-209: a Regular account's journeys, on the phone only; a Professional, a staff account and a Group have no row.
  const navigate = useNavigate();
  const journeys = useJourneyContexts(group === null && !reviewing && right === 'allowed');
  const sentinelRef =useSentinel(state.phase === 'ready' && !state.loading && state.nextCursor !== null, loadMore);

  // The edit form of an own card, in place (ux-polish-b c1, c2): the saved post, a post found gone and a closed form go back into the feed's state.
  const cardEdit = useCardEdit(edited, gone, editClosed);
  // A card's menu and its confirmation (F3.9 c8, c13; direction.md): one open at a time; Back closes it and stays in the feed. Closing
  // the confirmation while its delete is in flight is not possible (the dialog stays).
  const [overlay, setOverlay] = useState<Overlay>(null);
  const saving = overlay?.kind === 'confirm' && overlay.saving;
  // ux-polish-a: the comments inside the cards; what they change in a card's count, and what they say, goes to the feed.
  const commentApi = useCommentApi();
  const commentsReport = { onCount: commented, onStatus: said };
  // I14 completion B (§10.3): a staff member reviewing a Private Group reads its comments too (the thread opens the Group again, audited)
  const comments = useFeedComments(commentApi, commentsReport, reviewing && group !== null && group.privacy === 'private' ? group.groupId : undefined);
  const commentWrites = useFeedCommentWrites(comments, commentApi, commentsReport);
  // F3.7: the report window of a card or of a comment (from its menu) shares the menu's one history entry. A reported comment stays (c13).
  const report = useReport((target, result) => (target.kind === 'comment' ? said(COMMENT_REPORT_STATUS[result]) : reported(target.id, result)));
  const reportSending = report.draft?.sending === true;
  // F3.5: the share-in-feed window; a share that went through is first in the list at once. A refusal of the caller closes it onto a page alert.
  const [pageAlert, setPageAlert] = useState('');
  const shareFeed = useShareInFeed(
    own.kind === 'known' ? own.userId : null,
    (share) => addShared(sharedUnit(share), SHARED_STATUS),
    () => setPageAlert(SHARE_FAILED_TEXT),
  );
  const shareSending = shareFeed.draft?.sending === true;
  // F3.6: the share-link window of a card; nothing is sent.
  const shareLink = useShareLink();
  // I11 completion C (FR-SERV-005, §13.2): a Professional offers help from a card the server marked; the window over the feed, once per post.
  const offer = useOfferHelp((_postId, text) => said(text));
  const offerSending = offer.draft?.sending === true;
  const sheetOpen = report.draft !== null || shareFeed.draft !== null || shareLink.sheet !== null || offer.draft !== null;
  // Back while the delete, the report or the share is in flight keeps its dialog (and the hook adds its entry again, so the next Back still closes it).
  const { closingByPointer, followAfterClose, closing } = useBackCloses(overlay !== null || sheetOpen, () => {
    if (saving || reportSending || shareSending || offerSending) return false;
    setOverlay(null);
    report.cancel();
    shareFeed.cancel();
    shareLink.close();
    offer.cancel();
    return true;
  });
  const confirmDelete = async (unitId: string, comment: { id: string; topLevel: boolean } | undefined) => {
    const unit = state.items.find((candidate) => candidate.id === unitId);
    if (comment !== undefined && unit === undefined) return;
    setOverlay({ kind: 'confirm', unitId, saving: true, failure: null, comment });
    const result = comment === undefined || unit === undefined ? await remove(unitId) : await commentWrites.remove(unit, comment.id);
    setOverlay((now) => (now?.kind !== 'confirm' || now.unitId !== unitId ? now : result.ok ? null : { ...now, saving: false, failure: result.failure }));
  };
  const pressedOutside = outsidePressHandler({ closingByPointer, followAfterClose });
  useEffect(() => holdLinksWhileClosing({ closing, followAfterClose }), [closing, followAfterClose]);
  const pinItems = (unit: FeedUnit): MoreActionsItem[] =>
    group === null || !group.canPin || unit.kind !== 'post'
      ? []
      : [
          group.pinnedPostId === unit.id
            ? { key: 'unpin', label: UNPIN_LABEL, onSelect: () => group.onPin(null) }
            : { key: 'pin', label: PIN_LABEL, onSelect: () => group.onPin(unit.id) },
        ];
  const actionsFor = (unit: FeedUnit): MoreActionsItem[] => [...pinItems(unit), ...ownOrOther(unit)];
  const ownOrOther = (unit: FeedUnit): MoreActionsItem[] =>
    unit.isMine
      ? [
          // A share's text cannot be edited (F3.5, NS005): its own menu offers delete only.
          ...(unit.kind === 'share'
            ? []
            : [
                {
                  key: 'edit',
                  label: EDIT_ITEM_LABEL,
                  onSelect: () => cardEdit.start(unit),
                },
              ]),
          { key: 'delete', label: CONFIRM_DELETE_LABEL, onSelect: () => setOverlay({ kind: 'confirm', unitId: unit.id, saving: false, failure: null }) },
        ]
      : [
          ...(canHide ? [{ key: 'hide', label: HIDE_LABEL, onSelect: () => hide(unit.id), disabled: state.pendingHideIds.includes(unit.id) }] : []),
          // F3.7 c9: every card the viewer did not write, an anonymous one included (its isMine is false); a share is reported as itself.
          { key: 'report', label: REPORT_POST_ITEM, onSelect: () => report.start({ kind: 'post', id: unit.id }) },
          // I10: a Group Moderator or higher removes a member's post (the database refuses a higher Role's: the card then stays, with the failure text)
          ...(group?.canModerate === true
            ? [{ key: 'remove', label: REMOVE_FROM_GROUP_LABEL, onSelect: () => setOverlay({ kind: 'confirm', unitId: unit.id, saving: false, failure: null }) }]
            : []),
        ];

  const shareActionsFor = (unit: FeedUnit) => {
    // I10-C: a Private Group's Highlight in the main feed is never shared either (only its members may read it)
    if (professional || group?.privacy === 'private' || (unit.kind === 'post' && unit.group?.privacy === 'private')) return {};
    const link = postLinkOf(shareLink.origin, unit);
    return {
      onShareInFeed:
        shareTargetOf(unit) === null
          ? undefined
          : () => {
              setPageAlert('');
              shareFeed.start(unit);
            },
      onShareLink: link === null ? undefined : () => shareLink.openPost(link, unit.id),
    };
  };

  const offerHelpFor = (unit: FeedUnit) =>
    unit.kind === 'post' && unit.offerHelp !== undefined
      ? { sent: unit.offerHelp === 'sent' || offer.isSent(unit.id), onOffer: () => offer.start(unit.id, unit.isAnonymous, unit.body) }
      : undefined;

  // ux-polish-a c1: a card asks for its comments once, when it first comes near (a hidden card's placeholder has no comment area).
  const nearKey = state.items.map((unit) => `${unit.id}${state.hiddenIds.includes(unit.id) ? '-' : ''}`).join(' ') + (cardEdit.edit?.unitId ?? '');
  useNearCards(rootRef, nearKey, (unitId) => {
    const unit = state.items.find((candidate) => candidate.id === unitId);
    if (unit !== undefined && !state.hiddenIds.includes(unitId)) comments.near(unit);
  });
  // A card's comment area: its comments' "⋯" share the feed's one overlay (c10): one open at a time, Back closes it.
  const commentsFor = (unit: FeedUnit) => {
    const thread = comments.threadOf(unit);
    return (
      <CardComments
        thread={thread}
        menu={{
          openId: overlay?.kind === 'comment-menu' && overlay.unitId === unit.id ? overlay.commentId : null,
          onPressOutside: pressedOutside,
          onOpenChange: (commentId, open) =>
            setOverlay((now) => (open ? { kind: 'comment-menu', unitId: unit.id, commentId } : now?.kind === 'comment-menu' && now.commentId === commentId ? null : now)),
          onDelete: (commentId) =>
            setOverlay({ kind: 'confirm', unitId: unit.id, saving: false, failure: null, comment: { id: commentId, topLevel: thread.items.some((item) => item.id === commentId) } }),
          onReport: (commentId) => report.start({ kind: 'comment', id: commentId }),
        }}
        actions={{
          onRetry: () => comments.retry(unit),
          onMore: () => comments.showMore(unit),
          onMoreReplies: (commentId) => comments.showMoreReplies(unit, commentId),
          onLike: (commentId) => comments.toggleLike(unit, commentId),
          onReply: (commentId) => commentWrites.openReply(unit, commentId),
          onRootChange: (text) => commentWrites.changeRoot(unit, text),
          onRootSend: () => commentWrites.sendRoot(unit),
          onReplyChange: (text) => commentWrites.changeReply(unit, text),
          onReplySend: () => commentWrites.sendReply(unit),
          onReplyCancel: () => commentWrites.cancelReply(unit),
        }}
      />
    );
  };

  // One polite region: the check in progress, else the page just loaded (a no-break space after every other one makes equal texts speak
  // again), else what just happened.
  const loaded = state.announcement === '' ? '' : state.announcement + (state.announcementTick % 2 === 0 ? ' ' : '');
  const failedLike = state.likeStatus;
  // A hide or an undo (F3.9): what happened, in the same region; the tick makes two equal texts in a row speak again.
  const hidden = state.hideStatus === '' ? '' : state.hideStatus + (state.hideStatusTick % 2 === 0 ? ' ' : '');
  const action = failedLike !== '' ? failedLike : hidden;
  const status = right === 'checking' ? CHECKING_TEXT : action !== '' ? action : loaded !== '' ? loaded : published ? PUBLISHED_STATUS : deleted;
  const visible = right === 'checking' ? deleted !== '' : action !== '' || (loaded === '' && (published || deleted !== ''));
  const none = state.phase === 'blocked';
  const content = none ? null : (
    <FeedContent
      state={state}
      sentinelRef={sentinelRef}
      onRetry={retry}
      {...(reviewing || group?.readOnly === true ? {} : { onToggleLike: toggleLike })}
      actionsFor={reviewing ? () => [] : actionsFor}
      edit={cardEdit.edit}
      onEditChange={cardEdit.change}
      onEditSave={cardEdit.save}
      onEditCancel={cardEdit.cancel}
      onUndoHide={undoHide}
      headingRef={headingRef}
      openMenuId={overlay?.kind === 'menu' ? overlay.unitId : null}
      onMenuPressOutside={pressedOutside}
      onMenuOpenChange={(unitId, open) =>
        setOverlay((now) => (open ? { kind: 'menu', unitId } : now?.kind === 'menu' && now.unitId === unitId ? null : now))
      }
      confirm={overlay?.kind === 'confirm' ? overlay : null}
      onConfirmDelete={() => {
        if (overlay?.kind === 'confirm' && !saving) void confirmDelete(overlay.unitId, overlay.comment);
      }}
      onCancelDelete={() => {
        if (!saving) setOverlay(null);
      }}
      report={
        report.draft === null
          ? null
          : report.draft.target.kind === 'comment'
            ? { commentId: report.draft.target.id, sheet: reportSheetProps(report, report.draft, PATHS.communityRules) }
            : { unitId: report.draft.target.id, sheet: reportSheetProps(report, report.draft, PATHS.communityRules) }
      }
      {...(reviewing ? {} : { commentsFor, shareActionsFor, offerHelpFor })}
      shareFeed={
        shareFeed.draft === null
          ? null
          : {
              unitId: shareFeed.draft.openerId,
              sheet: {
                ...shareFeedSheetValues(shareFeed.draft),
                onTextChange: shareFeed.changeText,
                onAudienceChange: shareFeed.changeAudience,
                onSend: shareFeed.send,
                onCancel: shareFeed.cancel,
              },
            }
      }
      shareLink={
        shareLink.sheet === null
          ? null
          : {
              unitId: shareLink.sheet.openerId ?? '',
              sheet: shareLinkSheetProps(shareLink, shareLink.sheet, SHARE_LINK_LABEL),
            }
      }
    />
  );
  // An account without a parent profile (D1 reads it as a Professional) gets the composer only after the feed's first answer, so an
  // account the server gives no feed (403, `blocked`: Admin, Moderator) never sees it, not even briefly. A Regular's composer stays from
  // the first paint (feed-composer c1, c7). The phase never returns to `initial`; a focus asked by /posts/new is taken when it mounts.
  const write = reviewing ? (
    <p className="mt-3 rounded-md bg-muted p-3 text-small">{STAFF_REVIEW_NOTE}</p>
  ) : none || (right === 'everyone-only' && state.phase === 'initial') ? null : (
    <FeedComposer
      right={right}
      own={own}
      focusText={focusText}
      onPublished={onPublished}
    />
  );

  return (
    <div ref={rootRef}>
      {group === null ? (
        <h1 ref={headingRef} tabIndex={-1} className="text-h2">
          {FEED_TITLE}
        </h1>
      ) : (
        <h2 ref={headingRef} tabIndex={-1} className="text-h3">
          {group.heading}
        </h2>
      )}
      <p role="status" data-testid="feed-status" className={cn(visible ? 'mt-1 text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      {pageAlert !== '' ? (
        <div className="mt-2">
          <InlineAlert>{pageAlert}</InlineAlert>
        </div>
      ) : null}
      {none ? <p className="mt-1 text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p> : null}
      {group === null ? <SystemNotices notices={state.notices} /> : null}
      {group === null ? <GroupSuggestions groups={state.groupSuggestions} /> : null}
      {journeys === null || none ? null : (
        <JourneyRow contexts={journeys} href={PATHS.home} onNavigate={(href) => void navigate(href)} className="mt-1 lg:hidden" />
      )}
      {none ? null : stories}
      {/* One fixed place, before the list or the empty state: a form sending a post survives the feed changing phase. */}
      {write}
      {newPosts.count > 0 && away ? (
        <div className="sticky top-2 z-sticky mt-3 flex justify-center lg:top-20">
          <button
            type="button"
            onClick={showNewPosts}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-4 text-label font-bold text-background shadow-raised"
          >
            <ArrowUpIcon className="size-4" />
            {newPostsText(newPosts.count)}
          </button>
        </div>
      ) : null}
      {content}
      {offer.draft !== null ? (
        <OfferHelpSheet
          {...offer.draft}
          onTextChange={offer.change}
          onSend={offer.send}
          onCancel={offer.cancel}
          finalFocus={() =>
            rootRef.current?.querySelector<HTMLElement>(`article[data-unit-id="${offer.draft?.postId ?? ''}"] :is(${OFFER_CONTROL_SELECTOR})`) ?? null
          }
        />
      ) : null}
      <Toast text={offer.toast} />
      {/* F3.2b c20: in the shell's action bar (never over a card's controls), only after a long scroll. */}
      {far && actionBar !== null
        ? createPortal(
            <ToTopButton
              onClick={() => {
                toTop();
                headingRef.current?.focus();
              }}
            />,
            actionBar,
          )
        : null}
    </div>
  );
}
