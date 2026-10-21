import { useCallback, useRef, useState } from 'react';
import type { FeedUnit } from '@nestly/shared';
import { fetchReplies, fetchThread } from '@/services/api/comments';
import { setLike } from '@/services/api/likes';
import { fetchPost } from '@/services/api/posts';
import { LIKE_FAILED_TEXT } from './comments-texts';
import { findComment, hasMoreReplies, itemOf, likeChange, mergeById, patchComment, type ThreadItem } from './comments-state';
import { firstHiddenLoaded, initialThread, repliesToOpen, type CardFocusTarget, type CardThread } from './card-comments-state';
import type { CommentApi } from './use-comment-api';

/** What a card's comments tell the feed: a count that moved (with what to say), or only what to say. */
export interface CommentsReport {
  onCount: (unitId: string, delta: number, status: string) => void;
  onStatus: (status: string) => void;
}

export interface FeedCommentsFlow {
  threadOf: (unit: FeedUnit) => CardThread;
  /** Changes a card's comments (created from the unit when the card has none yet). */
  edit: (unit: FeedUnit, change: (thread: CardThread) => CardThread) => void;
  /** The latest comments of a card, outside a render. */
  latestOf: (unit: FeedUnit) => CardThread;
  focusOn: (unit: FeedUnit, target: CardFocusTarget) => void;
  /** The card came within one viewport of the visible area: its one comments request (count > 0) and, anonymous, its one GET /posts/:id. */
  near: (unit: FeedUnit) => void;
  retry: (unit: FeedUnit) => void;
  /** "הצגת עוד תגובות": first the rest of the loaded page (no request), then the next page. */
  showMore: (unit: FeedUnit) => void;
  /** "הצגת עוד השבות": first the replies loaded with the comment (no request), then F3.3's pages. */
  showMoreReplies: (unit: FeedUnit, commentId: string) => void;
  toggleLike: (unit: FeedUnit, commentId: string) => void;
}

const FAILED = { kind: 'failed' } as const;

// The comments inside the feed's cards (ux-polish-a; FR-FEED-003, direction.md "תגובות"): per card, asked once when it comes near, then
// the reads and likes of F3.3's thread, through its endpoints as built. The server and RLS decide what is in a thread and what a like may
// touch; this asks and keeps what came (the service validates it). An anonymous card learns whether the viewer is its real author only from
// GET /posts/:id `isMine` (F3.4 c4–c5); nothing but that boolean is kept from the answer.
export function useFeedComments(api: CommentApi, report: CommentsReport, reviewGroupId?: string): FeedCommentsFlow {
  const [threads, setThreads] = useState<Readonly<Record<string, CardThread>>>({});
  const latest = useRef(threads);
  latest.current = threads;
  const asked = useRef(new Set<string>());
  const busy = useRef(new Set<string>());
  const { token, refused } = api;
  const said = useRef(report);
  said.current = report;

  const edit = useCallback((unit: FeedUnit, change: (thread: CardThread) => CardThread) => {
    setThreads((current) => ({ ...current, [unit.id]: change(current[unit.id] ?? initialThread(unit)) }));
  }, []);
  const latestOf = useCallback((unit: FeedUnit): CardThread => latest.current[unit.id] ?? initialThread(unit), []);
  const focusOn = useCallback(
    (unit: FeedUnit, target: CardFocusTarget) => edit(unit, (thread) => ({ ...thread, focus: { tick: thread.focus.tick + 1, target } })),
    [edit],
  );
  const patchItem = (unit: FeedUnit, id: string, change: (item: ThreadItem) => ThreadItem) =>
    edit(unit, (thread) => ({ ...thread, items: thread.items.map((item) => (item.id === id ? change(item) : item)) }));

  const load = async (unit: FeedUnit, cursor: string | null) => {
    const key = `${unit.id}:list`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    edit(unit, (thread) => (cursor === null ? { ...thread, phase: 'loading' } : { ...thread, more: 'loading' }));
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? FAILED : await fetchThread(accessToken, unit.id, cursor, reviewGroupId);
      if (outcome.kind === 'ok') {
        const arrived = outcome.value.items.map(itemOf);
        const shown = latestOf(unit).items;
        const first = cursor === null ? undefined : arrived.find((item) => !shown.some((known) => known.id === item.id));
        edit(unit, (thread) => ({
          ...thread,
          phase: 'ready',
          more: 'idle',
          items: mergeById(thread.items, arrived),
          nextCursor: outcome.value.nextCursor,
          expanded: thread.expanded || cursor !== null,
        }));
        if (first !== undefined) focusOn(unit, { kind: 'comment', id: first.id });
        return;
      }
      if (cursor === null && (outcome.kind === 'unavailable' || outcome.kind === 'not-allowed')) {
        edit(unit, (thread) => ({ ...thread, phase: outcome.kind === 'unavailable' ? 'gone' : 'denied' }));
        return;
      }
      const message = refused(outcome);
      if (message !== null) said.current.onStatus(message);
      edit(unit, (thread) => (cursor === null ? { ...thread, phase: 'error' } : { ...thread, more: 'error' }));
    } finally {
      busy.current.delete(key);
    }
  };

  const readAuthor = async (unit: FeedUnit) => {
    const key = `${unit.id}:author`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    edit(unit, (thread) => ({ ...thread, authorRead: 'loading' }));
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? FAILED : await fetchPost(accessToken, unit.id);
      if (outcome.kind === 'post') {
        const asAuthor = outcome.post.isMine;
        edit(unit, (thread) => ({ ...thread, authorRead: 'idle', asAuthor }));
        return;
      }
      if (outcome.kind === 'unavailable') {
        edit(unit, (thread) => ({ ...thread, authorRead: 'idle', phase: 'gone' }));
        return;
      }
      const message = refused(outcome);
      if (message !== null) said.current.onStatus(message);
      edit(unit, (thread) => ({ ...thread, authorRead: 'error' }));
    } finally {
      busy.current.delete(key);
    }
  };

  const near = (unit: FeedUnit) => {
    if (asked.current.has(unit.id)) return;
    asked.current.add(unit.id);
    const thread = latestOf(unit);
    if (unit.isAnonymous && thread.asAuthor === null) void readAuthor(unit);
    if (thread.phase === 'idle') void load(unit, null);
  };

  const retry = (unit: FeedUnit) => {
    const thread = latestOf(unit);
    if (thread.authorRead === 'error') void readAuthor(unit);
    if (thread.phase === 'error') void load(unit, null);
    else if (thread.more === 'error' && thread.nextCursor !== null) void load(unit, thread.nextCursor);
  };

  const showMore = (unit: FeedUnit) => {
    const thread = latestOf(unit);
    if (thread.more === 'loading') return;
    const first = thread.expanded ? undefined : firstHiddenLoaded(thread);
    if (first !== undefined) {
      edit(unit, (current) => ({ ...current, expanded: true }));
      focusOn(unit, { kind: 'comment', id: first.id });
      return;
    }
    if (thread.nextCursor !== null) void load(unit, thread.nextCursor);
  };

  const showMoreReplies = async (unit: FeedUnit, commentId: string) => {
    const thread = latestOf(unit);
    const item = thread.items.find((candidate) => candidate.id === commentId);
    if (item === undefined || item.replyState === 'loading') return;
    if (repliesToOpen(thread, item)) {
      const first = item.replies.find((reply) => !thread.added.includes(reply.id));
      edit(unit, (current) => ({ ...current, openReplies: [...current.openReplies, commentId] }));
      // The button goes when nothing is left to ask for: focus goes to the first reply it showed, not to nowhere.
      if (!hasMoreReplies(item) && first !== undefined) focusOn(unit, { kind: 'comment', id: first.id });
      return;
    }
    edit(unit, (current) => ({ ...current, openReplies: current.openReplies.includes(commentId) ? current.openReplies : [...current.openReplies, commentId] }));
    patchItem(unit, commentId, (current) => ({ ...current, replyState: 'loading' }));
    const accessToken = await token();
    const outcome = accessToken === null ? FAILED : await fetchReplies(accessToken, commentId, item.replyCursor, reviewGroupId);
    if (outcome.kind !== 'ok') {
      const message = refused(outcome);
      if (message !== null) said.current.onStatus(message);
      patchItem(unit, commentId, (current) => ({ ...current, replyState: outcome.kind === 'unavailable' ? 'gone' : 'error' }));
      return;
    }
    const arrived = outcome.value.items;
    const fresh = arrived.find((reply) => !item.replies.some((shown) => shown.id === reply.id));
    const done = outcome.value.nextCursor === null;
    const merged: ThreadItem = { ...item, replies: mergeById(item.replies, arrived), repliesDone: done };
    patchItem(unit, commentId, (current) => ({ ...current, replies: mergeById(current.replies, arrived), replyCursor: outcome.value.nextCursor, repliesDone: done, replyState: 'idle' }));
    if (!hasMoreReplies(merged) && fresh !== undefined) focusOn(unit, { kind: 'comment', id: fresh.id });
  };

  // F3.3 c13: the count moves at once, one request at a time per comment, reverted with the like status when it fails.
  const toggleLike = async (unit: FeedUnit, commentId: string) => {
    const key = `${unit.id}:like:${commentId}`;
    if (busy.current.has(key)) return;
    const before = findComment(latestOf(unit).items, commentId)?.likedByMe;
    if (before === undefined) return;
    busy.current.add(key);
    const apply = (liked: boolean) => edit(unit, (thread) => ({ ...thread, items: patchComment(thread.items, commentId, likeChange(liked)) }));
    apply(!before);
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? FAILED : await setLike(accessToken, 'comments', commentId, !before);
      if (outcome.kind === 'done') return;
      apply(before);
      said.current.onStatus(refused(outcome) ?? LIKE_FAILED_TEXT);
    } finally {
      busy.current.delete(key);
    }
  };

  return {
    threadOf: (unit) => threads[unit.id] ?? initialThread(unit),
    edit,
    latestOf,
    focusOn,
    near,
    retry,
    showMore,
    showMoreReplies: (unit, commentId) => void showMoreReplies(unit, commentId),
    toggleLike: (unit, commentId) => void toggleLike(unit, commentId),
  };
}
