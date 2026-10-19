import { useId, type ReactNode } from 'react';
import type { CommentView } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { LikeButton } from '@/components/shared/like-button';
import { Button } from '@/components/ui/button';
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
import { RETRY_LABEL } from './posts-texts';

/**
 * Who wrote it, as the server decided: the name it sent, else "מהקהילה"; the post author's own comment on an anonymous post has no
 * `author` and is "המחבר" (VAL-036). Nothing else decides it, and no name, avatar or link is ever drawn for "המחבר".
 */
const authorLine = (comment: CommentView): string =>
  comment.author !== undefined ? (comment.author.name ?? MEMBER_FALLBACK_LABEL) : comment.byAuthor ? AUTHOR_LABEL : MEMBER_FALLBACK_LABEL;

export interface CommentActions {
  onLike: (commentId: string) => void;
  onDelete: (commentId: string) => void;
}

interface CommentBlockProps extends CommentActions {
  comment: CommentView;
  /** The reply button; top-level comments only. */
  onReply?: (() => void) | undefined;
  children?: ReactNode;
}

// One comment or reply (F3.3 w1; FR-FEED-003): the author line, the time, the text and its actions. The text is the person's own, so it is
// plain text (never markup), keeps its line breaks and takes its own direction. The item is named by its author line.
function CommentBlock({ comment, onReply, onLike, onDelete, children }: CommentBlockProps) {
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
        <time dateTime={comment.createdAt} className="text-small text-muted-foreground">
          {formatPostTime(comment.createdAt)}
        </time>
      </div>
      <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">
        {comment.body}
      </p>
      <div className="flex flex-wrap items-center gap-x-2">
        <LikeButton label={LIKE_LABEL} count={comment.likeCount} liked={comment.likedByMe} onToggle={() => onLike(comment.id)} />
        {onReply !== undefined ? (
          <Button variant="text" data-reply-button onClick={onReply}>
            {REPLY_LABEL}
          </Button>
        ) : null}
        {comment.isMine ? (
          <Button variant="text" data-delete-button onClick={() => onDelete(comment.id)}>
            {COMMENT_DELETE_LABEL}
          </Button>
        ) : null}
      </div>
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
}

// A top-level comment with its replies (one level), the button for the replies not loaded yet, and the reply box when it is open here.
export function CommentItem({ item, onReply, onMoreReplies, onLike, onDelete, replyBox }: CommentItemProps) {
  const more = hasMoreReplies(item);
  return (
    <CommentBlock comment={item} onReply={() => onReply(item.id)} onLike={onLike} onDelete={onDelete}>
      {item.replies.length > 0 ? (
        <ul aria-label={REPLIES_LIST_LABEL} className="flex flex-col gap-2 border-s-2 border-border ps-3">
          {item.replies.map((reply) => (
            <CommentBlock key={reply.id} comment={reply} onLike={onLike} onDelete={onDelete} />
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
