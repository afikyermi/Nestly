import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ANONYMOUS_AUTHOR_LABEL, type FeedUnit } from '@nestly/shared';
import { LikeButton } from '@/components/shared/like-button';
import { Button } from '@/components/ui/button';
import { ShareInFeedIcon, ShareLinkIcon } from '@/components/ui/icons';
import { SHARE_LINK_LABEL } from '@/lib/share-link-texts';
import { MoreActionsMenu, type MoreActionsItem } from '@/components/ui/more-actions-menu';
import { AUDIENCE_LABELS, fromGroup, HELP_REQUEST_BADGE } from './posts-texts';
import { groupPath } from '@/lib/group-link';
import { COMMENTS_TITLE, LIKE_LABEL } from './comments-texts';
import { STAGE_LABELS } from '@/lib/child-fields';
import { formatPostTime } from '@/lib/format-post-time';
import { postPath } from '@/lib/post-link';
import { MEMBER_FALLBACK_LABEL } from './feed-texts';
import { OriginalQuote } from './OriginalQuote';
import { MORE_ACTIONS_LABEL, MORE_ACTIONS_MENU_LABEL } from './hide-texts';
import { PostForm } from './PostForm';
import type { CardEdit } from './use-card-edit';
import { SHARE_IN_FEED_LABEL } from './share-texts';
import { PostImages } from './PostImages';

const AUDIENCE_CLASS = 'text-small text-muted-foreground';

/** The text of a post, as the person wrote it: plain text, line breaks kept, its own direction. */
function Text({ children }: { children: string }) {
  return (
    <p dir="auto" className="order-3 w-full whitespace-pre-wrap wrap-anywhere">
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
  const { edit, onEditChange, onEditSave, onEditCancel, comments } = props;
  const authorId = useId();
  const author = unit.isAnonymous ? ANONYMOUS_AUTHOR_LABEL : (unit.author.name ?? MEMBER_FALLBACK_LABEL);
  return (
    <article
      aria-labelledby={authorId}
      aria-posinset={position}
      aria-setsize={-1}
      data-unit-id={unit.id}
      tabIndex={0}
      className="flex flex-wrap items-start gap-x-3 gap-y-3 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card md:p-5"
    >
      <header className="order-1 flex min-w-0 flex-1 flex-col gap-1">
        <span id={authorId} className="text-label">
          {author}
          {/* I11: a Professional author's "יועץ · תחום" tag (decisions-in-force §4) */}
          {!unit.isAnonymous && unit.author.tag !== undefined ? <span className="text-small font-normal text-primary-strong"> · {unit.author.tag}</span> : null}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* I10-C (§11.13): a Group's Highlight says where it is from instead of its audience (the Group decides who reads it) */}
          {unit.kind === 'post' && unit.group !== undefined ? (
            <Link to={groupPath(unit.group.id)} className="text-small font-semibold text-primary-strong underline underline-offset-4">
              {fromGroup(unit.group.name)}
            </Link>
          ) : (
            <span className={AUDIENCE_CLASS}>{AUDIENCE_LABELS[unit.audience]}</span>
          )}
          {unit.kind === 'post' && unit.isHelpRequest === true ? (
            <span className="rounded-full bg-badge px-2.5 text-small text-badge-foreground">{HELP_REQUEST_BADGE}</span>
          ) : null}
          {unit.stageTag !== null ? (
            <span className="rounded-full bg-badge px-2.5 text-small text-badge-foreground">{STAGE_LABELS[unit.stageTag]}</span>
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
          {onToggleLike === undefined ? null : (
            <div className="order-3 w-full flex flex-wrap items-center gap-x-2">
              <LikeButton label={LIKE_LABEL} count={unit.likeCount} liked={unit.likedByMe} onToggle={onToggleLike} />
              {/* ux-polish-a c9: a button (no navigation): focus goes to this card's comment field; without one (an anonymous card before
                  its read, a failed read, a post gone), to what the comment area shows instead. */}
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
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-label text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted"
              >
                {COMMENTS_TITLE}
                {unit.commentCount > 0 ? ` ${unit.commentCount.toLocaleString('en-US')}` : null}
              </button>
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
          )}
          <Link
            to={postPath(unit.id)}
            className="order-2 inline-flex min-h-11 min-w-11 items-center rounded-sm text-small text-muted-foreground underline underline-offset-4"
          >
            <time dateTime={unit.createdAt}>{formatPostTime(unit.createdAt)}</time>
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
