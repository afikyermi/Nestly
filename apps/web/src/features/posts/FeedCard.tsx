import { useId, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Link } from 'react-router';
import { ANONYMOUS_AUTHOR_LABEL, type FeedUnit } from '@nestly/shared';
import { LikeButton } from '@/components/shared/like-button';
import { Avatar } from '@/components/ui/avatar';
import { CommentIcon, NestFilledIcon, ShareInFeedIcon, ShareLinkIcon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { SHARE_LINK_LABEL } from '@/lib/share-link-texts';
import { MoreActionsMenu, type MoreActionsItem } from '@/components/ui/more-actions-menu';
import { AUDIENCE_LABELS, fromGroup } from './posts-texts';
import { OfferHelpControl } from '@/components/domain/offer-help-sheet';
import { groupPath } from '@/lib/group-link';
import { COMMENTS_TITLE, LIKE_LABEL, MUTED_IN_GROUP_TEXT } from './comments-texts';
import { STAGE_LABELS } from '@/lib/child-fields';
import { PublishedTime } from '@/components/domain/published-time';
import { postPath } from '@/lib/post-link';
import { MEMBER_FALLBACK_LABEL } from './feed-texts';
import { OriginalQuote } from './OriginalQuote';
import { MORE_ACTIONS_LABEL, MORE_ACTIONS_MENU_LABEL } from './hide-texts';
import { PostForm } from './PostForm';
import type { CardEdit } from './use-card-edit';
import { SHARE_IN_FEED_LABEL } from './share-texts';
import { PostImages } from './PostImages';
import { SPONSORED_LABEL } from '@/lib/promotion-texts';
import { useProCall } from '@/hooks/use-pro-call';
import { reportPromotionClick } from '@/services/api/promotions';
import { promotionOf } from './promoted-feed';

const AUDIENCE_CLASS = 'text-caption text-muted-foreground';

// A short post (about 120 characters, no line break) is set larger, in `lead` (redesign 27.10.2026).
const SHORT_POST = 120;

// An action of the row: the icon alone below 1024 (its name is the label, also its tooltip), the icon and the word from 1024, equal widths.
const ACTION_CLASS =
  'inline-flex size-11 items-center justify-center gap-2 rounded-full text-label text-foreground transition-colors duration-fast ease-standard hover:bg-muted lg:w-auto lg:flex-1 lg:rounded-md';

/** The text of a post, as the person wrote it: plain text, line breaks kept, its own direction. */
function Text({ children }: { children: string }) {
  const short = children.length <= SHORT_POST && !children.includes('\n');
  return (
    <p dir="auto" className={cn('order-3 w-full whitespace-pre-wrap wrap-anywhere', short && 'text-lead')}>
      {children}
    </p>
  );
}

export interface FeedCardProps {
  unit: FeedUnit;
  /** 1-based place in the list so far (`aria-posinset`). */
  position: number;
  /** The like. Without it the card has no action row (the viewer may not like or comment). */
  onToggleLike?: () => void;
  /** "שיתוף בפיד" (F3.5 c9): given only when the unit can be shared (shareTargetOf); absent, never disabled, otherwise. */
  onShareInFeed?: (() => void) | undefined;
  /** "שיתוף קישור" (F3.6 c3): given only when the unit has a link (postLinkOf); absent, never disabled, otherwise. */
  onShareLink?: (() => void) | undefined;
  /** The items of this card's "more actions" menu (F3.9 c8; per card: the screen decides them). None or empty: no menu. */
  actions?: readonly MoreActionsItem[];
  /** Controlled menu: open, and the change it asks for (the screen closes it on Back too). Unset: the menu keeps its own state. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** A press outside the open menu closed it. */
  onMenuPressOutside?: (target: EventTarget | null) => void;
  /** The edit form open in this card (ux-polish-b c1): it replaces the body and the action row; the header stays. */
  edit?: Omit<CardEdit, 'unitId'> | undefined;
  onEditChange?: Parameters<typeof PostForm>[0]['onChange'];
  onEditSave?: () => void;
  onEditCancel?: () => void;
  /** The card's comment area (ux-polish-a), drawn after the "⋯" (last in the tab order), only with the like control. */
  comments?: ReactNode;
  /**
   * I11 completion C (FR-SERV-005, §13.2): a Professional's "הצעת עזרה" in the action row, given only on a post it may offer on; `sent`: the
   * offer went (one per post), so the row says "נשלחה הצעה" instead.
   */
  offerHelp?: { sent: boolean; onOffer: () => void } | undefined;
}

// One unit of the feed (F3.2b c14-c17; F3.3 c13; ux-polish-a): a post, an anonymous post (only "אנונימי": no name, avatar or link) or a share with its
// original, and after the body an action row: the like, the "תגובות" button (to the card's comment field; a share's counts are its own) and, where the unit
// can be shared, "שיתוף בפיד" and "שיתוף קישור" (F3.5 c9, F3.6 c3: tab order like, comments, share in feed, share link, time). Display
// only: the like comes in as onToggleLike. The time link follows the row in the DOM (tab order: like, comments, time) and is placed
// beside the author line by flex order. The card is a tab stop so a screen reader's feed navigation can reach it; its name is its author
// line. The text is the user's own, so it is plain text (never markup). F3.9 c8: the card ends with the "more actions" menu, last in the
// tab order before the comment area (ux-polish-a c9); its items come in as actions.
export function FeedCard(props: FeedCardProps) {
  const { unit, position, onToggleLike, onShareInFeed, onShareLink, actions = [], menuOpen, onMenuOpenChange, onMenuPressOutside } = props;
  const { edit, onEditChange, onEditSave, onEditCancel, comments, offerHelp } = props;
  const authorId = useId();
  const author = unit.isAnonymous ? ANONYMOUS_AUTHOR_LABEL : (unit.author.name ?? MEMBER_FALLBACK_LABEL);
  const call = useProCall();
  // I13 (FR-PRO-002): opening a link of a promoted post is the promotion's paid click (best effort; the navigation never waits on it)
  const onLinkOpen = (event: MouseEvent<HTMLElement>) => {
    const promotionId = unit.source === 'promoted' ? promotionOf(unit.id) : undefined;
    if (promotionId === undefined || !(event.target instanceof Element) || event.target.closest('a') === null) return;
    void call((token) => reportPromotionClick(token, promotionId));
  };
  return (
    <article
      onClickCapture={unit.source === 'promoted' ? onLinkOpen : undefined}
      aria-labelledby={authorId}
      aria-posinset={position}
      aria-setsize={-1}
      data-unit-id={unit.id}
      tabIndex={0}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 bg-card px-4 pt-3 pb-1 text-body text-card-foreground lg:rounded-lg lg:p-5 lg:pb-2 lg:shadow-card"
    >
      <Avatar decorative size="md" className="order-1" {...(unit.isAnonymous ? { anonymous: true } : { name: author })} />
      <header className="order-1 flex min-w-0 flex-1 flex-col">
        <span id={authorId} className="flex flex-wrap items-center gap-x-2 text-h3">
          <bdi>{author}</bdi>
          {/* I11: a Professional author's "יועץ · תחום" tag (decisions-in-force §4): grey, the words in plum (redesign 27.10.2026) */}
          {!unit.isAnonymous && unit.author.tag !== undefined ? (
            <span className="rounded-sm bg-muted px-1.5 text-caption font-bold text-primary-strong">
              <span className="sr-only"> · </span>
              {unit.author.tag}
            </span>
          ) : null}
        </span>
        <div className="flex flex-wrap items-center gap-x-2">
          {/* I13 (BR-005, VAL-012, §11.5): a promoted post is always marked "ממומן" */}
          {unit.source === 'promoted' ? <span className="rounded-sm bg-foreground px-1.5 text-caption font-bold text-background">{SPONSORED_LABEL}</span> : null}
          {/* I10-C (§11.13): a Group's Highlight says where it is from instead of its audience (the Group decides who reads it) */}
          {unit.kind === 'post' && unit.group !== undefined ? (
            <Link to={groupPath(unit.group.id)} className="text-caption font-bold text-primary-strong underline underline-offset-4">
              {fromGroup(unit.group.name)}
            </Link>
          ) : (
            <span className={AUDIENCE_CLASS}>{AUDIENCE_LABELS[unit.audience]}</span>
          )}
          {unit.stageTag !== null ? (
            <span className="text-caption font-bold text-primary-strong">{STAGE_LABELS[unit.stageTag]}</span>
          ) : null}
        </div>
      </header>
      {edit !== undefined && unit.kind === 'post' ? (
        <div className="order-3 w-full">
          <PostForm
            mode="edit"
            values={edit.values}
            errors={edit.errors}
            saving={edit.saving}
            failure={edit.failure}
            focus={edit.focus}
            onChange={(values) => onEditChange?.(values)}
            onSubmit={() => onEditSave?.()}
            {...(onEditCancel === undefined ? {} : { onCancel: onEditCancel })}
          />
        </div>
      ) : (
        <>
          {unit.kind === 'post' ? <Text>{unit.body}</Text> : null}
          {unit.kind === 'post' ? <PostImages images={unit.images} className="order-3" /> : null}
          {unit.kind === 'share' ? (
            <>
              {unit.sharerText !== null ? <Text>{unit.sharerText}</Text> : null}
              <OriginalQuote className="order-3 w-full" quote={unit.original.available ? unit.original : null} />
            </>
          ) : null}
          {/* I10-C (§11.16): a member muted in the Group reads its Highlight only: no like, no comments to write */}
          {unit.kind === 'post' && unit.group?.muted === true ? (
            <p role="note" className="order-3 w-full text-small text-muted-foreground">
              {MUTED_IN_GROUP_TEXT}
            </p>
          ) : null}
          {onToggleLike === undefined || (unit.likeCount === 0 && unit.commentCount === 0) ? null : (
            // The counts (redesign 27.10.2026): the nest bubble and the likes at the start, "N תגובות" at the end. Their numbers are in the
            // actions' names too, so a screen reader skips this line.
            <div aria-hidden="true" className="order-3 flex w-full items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
              {unit.likeCount > 0 ? (
                <>
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <NestFilledIcon className="size-3.5" />
                  </span>
                  {unit.likeCount.toLocaleString('en-US')}
                </>
              ) : null}
              {unit.commentCount > 0 ? (
                <span className="ms-auto">
                  {unit.commentCount.toLocaleString('en-US')} {COMMENTS_TITLE}
                </span>
              ) : null}
            </div>
          )}
          {onToggleLike === undefined ? null : (
            <div className="order-3 -mx-1 flex w-full items-center gap-1 lg:mx-0 lg:border-t lg:border-divider lg:pt-1">
              <LikeButton variant="action" label={LIKE_LABEL} count={unit.likeCount} liked={unit.likedByMe} onToggle={onToggleLike} />
              {/* ux-polish-a c9: a button (no navigation): focus goes to this card's comment field; without one (an anonymous card before
                  its read, a failed read, a post gone), to what the comment area shows instead. */}
              <Tooltip label={unit.commentCount > 0 ? `${COMMENTS_TITLE}, ${unit.commentCount.toLocaleString('en-US')}` : COMMENTS_TITLE}>
              <button
                type="button"
                data-comments-button=""
                aria-label={unit.commentCount > 0 ? `${COMMENTS_TITLE}, ${unit.commentCount.toLocaleString('en-US')}` : COMMENTS_TITLE}
                onClick={(event) => {
                  const area = event.currentTarget.closest('article')?.querySelector<HTMLElement>('[data-card-comments]');
                  const target =
                    area?.querySelector<HTMLElement>('[data-comment-field] textarea') ??
                    area?.querySelector<HTMLElement>('[data-comments-fallback]') ??
                    area?.querySelector<HTMLElement>('[data-comment-id]');
                  target?.focus();
                }}
                className={ACTION_CLASS}
              >
                <CommentIcon />
                <span aria-hidden="true" className="hidden lg:inline">
                  {COMMENTS_TITLE}
                </span>
              </button>
              </Tooltip>
              {onShareInFeed === undefined ? null : (
                <Tooltip label={SHARE_IN_FEED_LABEL}>
                  <button type="button" aria-label={SHARE_IN_FEED_LABEL} data-share-feed="" onClick={onShareInFeed} className={ACTION_CLASS}>
                    <ShareInFeedIcon />
                    <span aria-hidden="true" className="hidden lg:inline">
                      {SHARE_IN_FEED_LABEL}
                    </span>
                  </button>
                </Tooltip>
              )}
              {onShareLink === undefined ? null : (
                <Tooltip label={SHARE_LINK_LABEL}>
                  <button type="button" aria-label={SHARE_LINK_LABEL} data-share-link="" onClick={onShareLink} className={ACTION_CLASS}>
                    <ShareLinkIcon />
                    <span aria-hidden="true" className="hidden lg:inline">
                      {SHARE_LINK_LABEL}
                    </span>
                  </button>
                </Tooltip>
              )}
              {/* FR-SERV-005: the Professional's offer is the last action, at the row's far end */}
              {offerHelp === undefined ? null : <OfferHelpControl {...offerHelp} />}
            </div>
          )}
          <Link
            to={postPath(unit.id)}
            className="order-2 inline-flex min-h-11 min-w-11 items-center justify-end rounded-sm text-caption text-muted-foreground no-underline hover:underline"
          >
            <PublishedTime iso={unit.createdAt} />
          </Link>
          {actions.length === 0 ? null : (
            <div className="order-2">
              <MoreActionsMenu
                label={MORE_ACTIONS_LABEL}
                menuLabel={MORE_ACTIONS_MENU_LABEL}
                items={actions}
                {...(menuOpen === undefined ? {} : { open: menuOpen })}
                {...(onMenuOpenChange === undefined ? {} : { onOpenChange: onMenuOpenChange })}
                {...(onMenuPressOutside === undefined ? {} : { onPressOutside: onMenuPressOutside })}
              />
            </div>
          )}
          {onToggleLike === undefined ? null : comments}
        </>
      )}
    </article>
  );
}
