import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReplies, fetchThread } from '@/services/api/comments';
import { setLike, type LikeTarget } from '@/services/api/likes';
import { LIKE_FAILED_TEXT } from './comments-texts';
import {
  findComment,
  hasMoreReplies,
  itemOf,
  likeChange,
  mergeById,
  patchComment,
  type CommentFocus,
  type ThreadItem,
  type ThreadState,
} from './comments-state';
import type { CommentApi } from './use-comment-api';

export interface ThreadFlow {
  thread: ThreadState;
  setThread: (change: (current: ThreadState) => ThreadState) => void;
  focus: CommentFocus;
  focusOn: (target: CommentFocus['target']) => void;
  retry: () => void;
  loadMore: () => void;
  showMoreReplies: (commentId: string) => void;
  toggleLike: (target: LikeTarget, id: string) => void;
}

// The thread's flow (F3.3 w1): the first page, the next ones on demand (one request at a time, the same cursor again after a failure), a
// comment's remaining replies, and likes (the count moves at once, one request at a time per target, reverted when it fails). The server
// and RLS decide what is in the thread and what a like may touch; this only asks and keeps what came (the service validates it).
export function useComments(postId: string, post: { liked: boolean; likes: number }, api: CommentApi): ThreadFlow {
  const [thread, setThread] = useState<ThreadState>({
    phase: 'loading',
    items: [],
    nextCursor: null,
    more: 'idle',
    postLiked: post.liked,
    postLikes: post.likes,
    status: '',
  });
  const [focus, setFocus] = useState<CommentFocus>({ tick: 0, target: { kind: 'heading' } });
  const latest = useRef(thread);
  latest.current = thread;
  const busy = useRef(false);
  const flying = useRef(new Set<string>());
  const { token, refused } = api;

  const focusOn = useCallback((target: CommentFocus['target']) => setFocus((current) => ({ tick: current.tick + 1, target })), []);

  const load = useCallback(
    async (cursor: string | null) => {
      if (busy.current) return;
      busy.current = true;
      setThread((current) => (cursor === null ? { ...current, phase: 'loading' } : { ...current, more: 'loading' }));
      try {
        const accessToken = await token();
        const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await fetchThread(accessToken, postId, cursor);
        if (outcome.kind === 'ok') {
          const arrived = outcome.value.items.map(itemOf);
          const first = cursor === null ? undefined : arrived.find((item) => !latest.current.items.some((shown) => shown.id === item.id));
          setThread((current) => ({ ...current, phase: 'ready', more: 'idle', items: mergeById(current.items, arrived), nextCursor: outcome.value.nextCursor }));
          // "עוד תגובות" disappears with the last page: focus goes to the first new comment, not to nowhere.
          if (first !== undefined && outcome.value.nextCursor === null) focusOn({ kind: 'comment', id: first.id });
          return;
        }
        const message = refused(outcome);
        setThread((current) => ({ ...current, ...(cursor === null ? { phase: 'error' as const } : { more: 'error' as const }), ...(message === null ? {} : { status: message }) }));
      } finally {
        busy.current = false;
      }
    },
    [token, refused, postId, focusOn],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const showMoreReplies = useCallback(
    async (commentId: string) => {
      const item = latest.current.items.find((candidate) => candidate.id === commentId);
      if (item === undefined || item.replyState === 'loading') return;
      const patch = (change: (current: ThreadItem) => ThreadItem) =>
        setThread((current) => ({ ...current, items: current.items.map((candidate) => (candidate.id === commentId ? change(candidate) : candidate)) }));
      patch((current) => ({ ...current, replyState: 'loading' }));
      const accessToken = await token();
      const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await fetchReplies(accessToken, commentId, item.replyCursor);
      if (outcome.kind !== 'ok') {
        void refused(outcome);
        patch((current) => ({ ...current, replyState: outcome.kind === 'unavailable' ? 'gone' : 'error' }));
        return;
      }
      const arrived = outcome.value.items;
      const fresh = arrived.find((reply) => !item.replies.some((shown) => shown.id === reply.id));
      const done = outcome.value.nextCursor === null;
      const merged: ThreadItem = { ...item, replies: mergeById(item.replies, arrived), repliesDone: done };
      patch((current) => ({ ...current, replies: mergeById(current.replies, arrived), replyCursor: outcome.value.nextCursor, repliesDone: done, replyState: 'idle' }));
      // The button disappears when nothing is left to ask for: focus goes to the first new reply, not to nowhere.
      if (!hasMoreReplies(merged) && fresh !== undefined) focusOn({ kind: 'comment', id: fresh.id });
    },
    [token, refused, focusOn],
  );

  const toggleLike = useCallback(
    async (target: LikeTarget, commentId: string) => {
      const id = target === 'posts' ? postId : commentId;
      const key = `${target}:${id}`;
      if (flying.current.has(key)) return;
      const current = latest.current;
      const before = target === 'posts' ? current.postLiked : findComment(current.items, id)?.likedByMe;
      if (before === undefined) return;
      flying.current.add(key);
      const apply = (liked: boolean) =>
        setThread((state) =>
          target === 'posts'
            ? { ...state, status: '', postLiked: liked, postLikes: Math.max(0, state.postLikes + (liked ? 1 : -1)) }
            : { ...state, status: '', items: patchComment(state.items, id, likeChange(liked)) },
        );
      apply(!before);
      try {
        const accessToken = await token();
        const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await setLike(accessToken, target, id, !before);
        if (outcome.kind === 'done') return;
        apply(before);
        setThread((state) => ({ ...state, status: refused(outcome) ?? LIKE_FAILED_TEXT }));
      } finally {
        flying.current.delete(key);
      }
    },
    [token, refused, postId],
  );

  return {
    thread,
    setThread,
    focus,
    focusOn,
    retry: () => void load(latest.current.phase === 'error' ? null : latest.current.nextCursor),
    loadMore: () => void load(latest.current.nextCursor),
    showMoreReplies: (commentId) => void showMoreReplies(commentId),
    toggleLike: (target, id) => void toggleLike(target, id),
  };
}
