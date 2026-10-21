import { useId, type ReactNode } from 'react';
import type { CommentView } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { LikeButton } from '@/components/shared/like-button';
import { Button } from '@/components/ui/button';
import { MoreActionsMenu } from '@/components/ui/more-actions-menu';
import { COMMENT_MORE_LABEL, REPORT_COMMENT_ITEM } from '@/lib/report-texts';
import { formatPostTime } from '@/lib/format-post-time';
import { hasMoreReplies, type ThreadItem } from './comments-state';
import {
  AUTHOR_LABEL,
  COMMENT_DELETE_LABEL,
  COMMENT_UNAVAILABLE_TEXT,
  LIKE_LABEL,
  LOADING_MORE_TEXT,
  MORE_REPLIES_LABEL,
  REPLIES_LIST_LABEL,
  REPLIES_LOAD_FAILED_TEXT,
  REPLY_LABEL,
} from './comments-texts';
import { MEMBER_FALLBACK_LABEL } from './feed-texts';
import { MORE_ACTIONS_MENU_LABEL } from './hide-texts';
import { RETRY_LABEL } from './posts-texts';

/**
 * Who wrote it, as the server decided: the name it sent, else "מהקהילה"; the post author's own comment on an anonymous post has no
 * `author` and is "המחבר" (VAL-036). Nothing else decides it, and no name, avatar or link is ever drawn for "המחבר".
 */
const authorLine = (comment: CommentView): string =>
  comment.author !== undefined ? (comment.author.name ?? MEMBER_FALLBACK_LABEL) : comment.byAuthor ? AUTHOR_LABEL : MEMBER_FALLBACK_LABEL;

/** The "⋯" menu of every comment and reply (F3.7 c9): one open at a time; the viewer's own has "מחיקה", anyone else's "דיווח על התגובה". */
export interface CommentMenu {
  openId: string | null;
  onOpenChange: (commentId: string, open: boolean) => void;
  /** A press outside the open menu, with what was pressed (it may be a link). */
  onPressOutside?: (target: EventTarget | null) => void;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
}

export interface CommentActions {
  onLike: (commentId: string) => void;
  menu: CommentMenu;
}

interface CommentBlockProps extends CommentActions {
  comment: CommentView;
  /** I14 completion: a staff account's review: the comment as it is, with no like, reply or menu. */
  readOnly?: boolean;
  /** The reply button; top-level comments only. */
  onReply?: (() => void) | undefined;
  children?: ReactNode;
}

// One comment or reply (F3.3 w1; FR-FEED-003): the author line, the time, the text and its actions. The text is the person's own, so it is
// plain text (never markup), keeps its line breaks and takes its own direction. The item is named by its author line. Its "⋯" sits in the
// author line, before the text and the replies, so it is the first menu button inside the item (focus returns to it after the menu's action).
function CommentBlock({ comment, onReply, onLike, menu, children, readOnly = false }: CommentBlockProps) {
  const authorId = useId();
  return (
    <li
      aria-labelledby={authorId}
      data-comment-id={comment.id}
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 outline-offset-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span id={authorId} className="text-label">
          {authorLine(comment)}
        </span>
        <div className="flex items-center gap-1">
          <time dateTime={comment.createdAt} className="text-small text-muted-foreground">
            {formatPostTime(comment.createdAt)}
          </time>
          {readOnly ? null : <MoreActionsMenu
            label={COMMENT_MORE_LABEL}
            menuLabel={MORE_ACTIONS_MENU_LABEL}
            items={
              comment.isMine
                ? [{ key: 'delete', label: COMMENT_DELETE_LABEL, onSelect: () => menu.onDelete(comment.id) }]
                : [{ key: 'report', label: REPORT_COMMENT_ITEM, onSelect: () => menu.onReport(comment.id) }]
            }
            open={menu.openId === comment.id}
            onOpenChange={(open) => menu.onOpenChange(comment.id, open)}
            {...(menu.onPressOutside === undefined ? {} : { onPressOutside: menu.onPressOutside })}
          />}
        </div>
      </div>
      <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
        {comment.body}
      </p>
      {readOnly ? null : <div className="flex flex-wrap items-center gap-x-2">
        <LikeButton label={LIKE_LABEL} count={comment.likeCount} liked={comment.likedByMe} onToggle={() => onLike(comment.id)} />
        {onReply !== undefined ? (
          <Button variant="text" data-reply-button onClick={onReply}>
            {REPLY_LABEL}
          </Button>
        ) : null}
      </div>}
      {children}
    </li>
  );
}

export interface CommentItemProps extends CommentActions {
  item: ThreadItem;
  onReply: (commentId: string) => void;
  onMoreReplies: (commentId: string) => void;
  /** The reply box, when it is open under this comment. */
  replyBox?: ReactNode;
  readOnly?: boolean;
}

// A top-level comment with its replies (one level), the button for the replies not loaded yet, and the reply box when it is open here.
export function CommentItem({ item, onReply, onMoreReplies, onLike, menu, replyBox, readOnly = false }: CommentItemProps) {
  const more = hasMoreReplies(item);
  return (
    <CommentBlock comment={item} onReply={() => onReply(item.id)} onLike={onLike} menu={menu} readOnly={readOnly}>
      {item.replies.length > 0 ? (
        <ul aria-label={REPLIES_LIST_LABEL} className="flex flex-col gap-2 border-s-2 border-border ps-3">
          {item.replies.map((reply) => (
            <CommentBlock key={reply.id} comment={reply} onLike={onLike} menu={menu} readOnly={readOnly} />
          ))}
        </ul>
      ) : null}
      {item.replyState === 'gone' ? <p className="text-small text-muted-foreground">{COMMENT_UNAVAILABLE_TEXT}</p> : null}
      {item.replyState === 'error' ? (
        <div className="flex flex-col items-start gap-2">
          <InlineAlert>{REPLIES_LOAD_FAILED_TEXT}</InlineAlert>
        </div>
      ) : null}
      {(more && item.replyState !== 'gone') || item.replyState === 'error' ? (
        <div>
          <Button
            variant="text"
            pending={item.replyState === 'loading'}
            aria-disabled={item.replyState === 'loading' ? true : undefined}
            onClick={() => onMoreReplies(item.id)}
          >
            {item.replyState === 'loading' ? LOADING_MORE_TEXT : item.replyState === 'error' ? RETRY_LABEL : MORE_REPLIES_LABEL}
          </Button>
        </div>
      ) : null}
      {replyBox}
    </CommentBlock>
  );
}
