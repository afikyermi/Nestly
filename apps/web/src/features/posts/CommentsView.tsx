import { useEffect, useRef } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineAlert } from '@/components/shared/inline-alert';
import { LikeButton } from '@/components/shared/like-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';
import {
  COMMENTS_EMPTY_TEXT,
  COMMENTS_LIST_LABEL,
  COMMENTS_LOAD_FAILED_TEXT,
  COMMENTS_LOADING_TEXT,
  COMMENTS_TITLE,
  DELETE_COMMENT_CONFIRM_LABEL,
  DELETE_COMMENT_REPLIES_NOTE,
  DELETE_COMMENT_TITLE,
  LIKE_LABEL,
  LOADING_MORE_TEXT,
  MORE_FAILED_TEXT,
  MORE_LABEL,
} from './comments-texts';
import { DELETE_DESCRIPTION, DELETING_TEXT, DIALOG_CANCEL_LABEL, RETRY_LABEL } from './posts-texts';
import type { CommentWrites } from './use-comment-writes';
import type { ThreadFlow } from './use-comments';

export interface CommentsViewProps {
  flow: ThreadFlow;
  writes: CommentWrites;
  /** The page was opened at `#comments`: focus goes to the heading once, when the region first shows. */
  landOnHeading?: boolean;
}

// The comments region under a post (F3.3 w1; FR-FEED-003): the post's like, the thread (top-level comments, one level of replies), the
// comment box, and the delete confirmation. Display only: the requests come from the hooks. The heading is the focus target of the
// comments link, of a delete and of the pages that bring new comments.
export function CommentsView({ flow, writes, landOnHeading = false }: CommentsViewProps) {
  const { thread, focus } = flow;
  const { root, reply, confirm } = writes;
  const regionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const landed = useRef(false);

  useEffect(() => {
    if (landOnHeading && !landed.current) {
      landed.current = true;
      headingRef.current?.focus();
    }
  }, [landOnHeading]);

  useEffect(() => {
    if (focus.tick === 0) return;
    const { target } = focus;
    if (target.kind === 'heading') headingRef.current?.focus();
    else {
      const item = regionRef.current?.querySelector<HTMLElement>(`[data-comment-id="${target.id}"]`);
      (target.kind === 'comment' ? item : item?.querySelector<HTMLElement>('[data-reply-button]'))?.focus();
    }
  }, [focus]);

  if (thread.phase === 'denied') return null;
  const status = thread.phase === 'loading' ? COMMENTS_LOADING_TEXT : thread.status;
  const deleteButton = (id: string) => regionRef.current?.querySelector<HTMLElement>(`[data-comment-id="${id}"] [data-delete-button]`) ?? null;

  return (
    <section ref={regionRef} aria-labelledby="comments" data-testid="comments" className="flex min-w-0 flex-col gap-4">
      <h2 id="comments" ref={headingRef} tabIndex={-1} className="text-h3">
        {COMMENTS_TITLE}
      </h2>
      <div>
        <LikeButton label={LIKE_LABEL} count={thread.postLikes} liked={thread.postLiked} onToggle={() => flow.toggleLike('posts', '')} />
      </div>
      <p role="status" data-testid="comments-status" className={status !== '' && thread.phase !== 'loading' ? 'text-body text-muted-foreground' : 'sr-only'}>
        {status}
      </p>
      {thread.phase === 'loading' ? (
        <div data-testid="comments-loading" className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
          <Skeleton className="w-1/3" />
          <Skeleton className="w-2/3" />
        </div>
      ) : null}
      {thread.phase === 'error' ? (
        <div data-testid="comments-load-failed" className="flex flex-col items-start gap-3">
          <InlineAlert>{COMMENTS_LOAD_FAILED_TEXT}</InlineAlert>
          <Button variant="soft" onClick={flow.retry}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : null}
      {thread.phase === 'ready' && thread.items.length === 0 ? <p className="text-body text-muted-foreground">{COMMENTS_EMPTY_TEXT}</p> : null}
      {thread.phase === 'ready' && thread.items.length > 0 ? (
        <ul aria-label={COMMENTS_LIST_LABEL} className="flex flex-col gap-3">
          {thread.items.map((item) => (
            <CommentItem
              key={item.id}
              item={item}
              onLike={(id) => flow.toggleLike('comments', id)}
              onDelete={writes.askDelete}
              onReply={writes.openReply}
              onMoreReplies={flow.showMoreReplies}
              replyBox={
                reply !== null && reply.parentId === item.id ? (
                  <CommentComposer mode="reply" state={reply} onChange={writes.changeReply} onSend={writes.sendReply} onCancel={writes.cancelReply} />
                ) : undefined
              }
            />
          ))}
        </ul>
      ) : null}
      {thread.phase === 'ready' && thread.more === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{MORE_FAILED_TEXT}</InlineAlert>
        </div>
      ) : null}
      {thread.phase === 'ready' && thread.nextCursor !== null ? (
        <div>
          <Button
            variant="soft"
            pending={thread.more === 'loading'}
            aria-disabled={thread.more === 'loading' ? true : undefined}
            onClick={flow.loadMore}
          >
            {thread.more === 'loading' ? LOADING_MORE_TEXT : thread.more === 'error' ? RETRY_LABEL : MORE_LABEL}
          </Button>
        </div>
      ) : null}
      {thread.phase === 'ready' ? <CommentComposer mode="comment" state={root} onChange={writes.changeRoot} onSend={writes.sendRoot} /> : null}
      {confirm !== null ? (
        <ConfirmDialog
          open
          title={DELETE_COMMENT_TITLE}
          description={
            <>
              {DELETE_DESCRIPTION}
              {confirm.topLevel ? <span className="block">{DELETE_COMMENT_REPLIES_NOTE}</span> : null}
            </>
          }
          confirmLabel={confirm.saving ? DELETING_TEXT : DELETE_COMMENT_CONFIRM_LABEL}
          cancelLabel={DIALOG_CANCEL_LABEL}
          pending={confirm.saving}
          failure={confirm.failure}
          onConfirm={writes.confirmDelete}
          onCancel={writes.cancelDelete}
          finalFocus={() => deleteButton(confirm.commentId) ?? headingRef.current}
        />
      ) : null}
    </section>
  );
}
