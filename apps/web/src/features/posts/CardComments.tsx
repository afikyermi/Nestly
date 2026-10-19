import { useEffect, useRef } from 'react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommentComposer } from './CommentComposer';
import { CommentItem, type CommentMenu } from './CommentItem';
import { hasHiddenComments, shownItems, type CardThread } from './card-comments-state';
import {
  CARD_MORE_LABEL,
  COMMENT_AUTHOR_NOTICE_TEXT,
  COMMENT_NAME_NOTICE_TEXT,
  COMMENTS_LIST_LABEL,
  COMMENTS_LOAD_FAILED_TEXT,
  COMMENTS_LOADING_TEXT,
  LOADING_MORE_TEXT,
  MORE_FAILED_TEXT,
} from './comments-texts';
import { POST_UNAVAILABLE_TEXT, RETRY_LABEL } from './posts-texts';

/** What the card's comment area asks for; the screen decides what each does. */
export interface CardCommentsActions {
  onRetry: () => void;
  onMore: () => void;
  onMoreReplies: (commentId: string) => void;
  onLike: (commentId: string) => void;
  onReply: (commentId: string) => void;
  onRootChange: (text: string) => void;
  onRootSend: () => void;
  onReplyChange: (text: string) => void;
  onReplySend: () => void;
  onReplyCancel: () => void;
}

export interface CardCommentsProps {
  thread: CardThread;
  /** The comments' "⋯" menus (F3.7 c9): which one is open, and their items' actions. */
  menu: CommentMenu;
  actions: CardCommentsActions;
}

// The comments inside a feed card (ux-polish-a; direction.md "תגובות | בתוך הכרטיס"): the first two top-level comments, "הצגת עוד תגובות",
// replies in place and the field at the bottom, drawn with F3.3's comment, reply box and composer. Display only: the requests come from the
// screen. An anonymous card shows no field until the viewer's authorship is known (F3.4 c14): the real author gets the "המחבר" notice, everyone
// else the name notice. No region landmark: the list sits inside the card's article.
export function CardComments({ thread, menu, actions }: CardCommentsProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const { focus } = thread;

  useEffect(() => {
    if (focus.tick === 0) return;
    const area = areaRef.current;
    const { target } = focus;
    let element: HTMLElement | null | undefined;
    if (target.kind === 'field') element = area?.querySelector<HTMLElement>('[data-comment-field] textarea');
    else if (target.kind === 'comments-button') element = area?.closest('article')?.querySelector<HTMLElement>('[data-comments-button]');
    else {
      const item = area?.querySelector<HTMLElement>(`[data-comment-id="${target.id}"]`);
      element = target.kind === 'comment' ? item : item?.querySelector<HTMLElement>('[data-reply-button]');
    }
    element?.focus();
  }, [focus]);

  if (thread.phase === 'denied') return null;
  const notice = thread.asAuthor === null ? null : thread.asAuthor ? COMMENT_AUTHOR_NOTICE_TEXT : COMMENT_NAME_NOTICE_TEXT;
  const items = shownItems(thread);
  const { reply } = thread;
  const failed = thread.phase === 'error' || thread.authorRead === 'error';

  return (
    <div ref={areaRef} data-card-comments="" className="order-4 flex w-full min-w-0 flex-col gap-3">
      {thread.phase === 'gone' ? <p className="text-body text-muted-foreground">{POST_UNAVAILABLE_TEXT}</p> : null}
      {thread.phase === 'idle' || thread.phase === 'loading' ? (
        <div className="flex flex-col gap-3">
          <span className="sr-only">{COMMENTS_LOADING_TEXT}</span>
          <Skeleton className="w-1/3" />
          <Skeleton className="w-2/3" />
        </div>
      ) : null}
      {failed && thread.phase !== 'gone' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{COMMENTS_LOAD_FAILED_TEXT}</InlineAlert>
          <Button variant="soft" onClick={actions.onRetry}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : null}
      {thread.phase !== 'gone' && items.length > 0 ? (
        <ul aria-label={COMMENTS_LIST_LABEL} className="flex flex-col gap-3">
          {items.map((item) => (
            <CommentItem
              key={item.id}
              item={item}
              onLike={actions.onLike}
              menu={menu}
              onReply={actions.onReply}
              onMoreReplies={actions.onMoreReplies}
              replyBox={
                reply !== null && reply.parentId === item.id && notice !== null ? (
                  <CommentComposer
                    mode="reply"
                    named={false}
                    state={reply}
                    notice={notice}
                    onChange={actions.onReplyChange}
                    onSend={actions.onReplySend}
                    onCancel={actions.onReplyCancel}
                  />
                ) : undefined
              }
            />
          ))}
        </ul>
      ) : null}
      {thread.phase === 'ready' && thread.more === 'error' ? <InlineAlert>{MORE_FAILED_TEXT}</InlineAlert> : null}
      {thread.phase === 'ready' && hasHiddenComments(thread) ? (
        <div>
          <Button
            variant="soft"
            pending={thread.more === 'loading'}
            aria-disabled={thread.more === 'loading' ? true : undefined}
            onClick={actions.onMore}
          >
            {thread.more === 'loading' ? LOADING_MORE_TEXT : thread.more === 'error' ? RETRY_LABEL : CARD_MORE_LABEL}
          </Button>
        </div>
      ) : null}
      {notice !== null && thread.phase !== 'gone' ? (
        <div data-comment-field="">
          <CommentComposer mode="comment" named={false} state={thread.root} notice={notice} onChange={actions.onRootChange} onSend={actions.onRootSend} />
        </div>
      ) : null}
    </div>
  );
}
