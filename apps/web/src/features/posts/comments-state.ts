import { codePointLength, COMMENT_BODY_MAX, type CommentThreadItem, type CommentView } from '@nestly/shared';

/** A top-level comment as the screen holds it: what the server sent, plus where its replies stand. */
export interface ThreadItem extends CommentView {
  replies: CommentView[];
  /** All the replies the viewer can read under it (the server's count). */
  replyCount: number;
  /** The last "הצגת עוד השבות" request: none · in flight · failed (the same cursor is sent again) · the parent is gone (404). */
  replyState: 'idle' | 'loading' | 'error' | 'gone';
  /** Where the next replies page continues; null until the first page after the inline ones was read. */
  replyCursor: string | null;
  /** The last replies page was read: no more to ask for, whatever `replyCount` says. */
  repliesDone: boolean;
}

/** `denied`: the server answered 403 not_allowed (an account that does not take part in comments): the region shows nothing. */
export type Phase = 'loading' | 'ready' | 'error' | 'denied';

export interface ThreadState {
  phase: Phase;
  items: ThreadItem[];
  nextCursor: string | null;
  /** "עוד תגובות": none · in flight · failed (the same cursor is sent again). */
  more: 'idle' | 'loading' | 'error';
  postLiked: boolean;
  postLikes: number;
  /** The polite status line: what just happened. Empty: nothing. */
  status: string;
}

export interface ComposerState {
  text: string;
  error: 'required' | 'long' | 'invalid' | null;
  sending: boolean;
  failure: string | null;
  /** Counts the requests to focus the box; 0: none. */
  focusTick: number;
  /** After a first failed check the box is checked again on every change. */
  validating: boolean;
}

export const EMPTY_COMPOSER: ComposerState = { text: '', error: null, sending: false, failure: null, focusTick: 0, validating: false };

/** What focus moves to once, when `tick` changes. */
export type CommentFocus = { tick: number; target: { kind: 'heading' } | { kind: 'comment'; id: string } | { kind: 'reply-button'; id: string } };

export const itemOf = (comment: CommentThreadItem): ThreadItem => ({ ...comment, replyState: 'idle', replyCursor: null, repliesDone: false });
export const freshItem = (comment: CommentView): ThreadItem => ({ ...comment, replies: [], replyCount: 0, replyState: 'idle', replyCursor: null, repliesDone: false });

/** Whether "הצגת עוד השבות" shows: the server counts more replies than are loaded and the last page was not read yet. */
export const hasMoreReplies = (item: ThreadItem): boolean => item.replyCount > item.replies.length && !item.repliesDone;

/** Characters left before the limit, in code points like the server counts them (negative: over) of the trimmed text, the one the rule checks. */
export const commentCharactersLeft = (text: string): number => COMMENT_BODY_MAX - codePointLength(text.trim());

const older = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

/** What is shown plus what arrived, each id once (the one already shown wins: it may carry a like in flight), oldest first. */
export function mergeById<T extends { createdAt: string; id: string }>(shown: readonly T[], arrived: readonly T[]): T[] {
  const seen = new Set(shown.map((comment) => comment.id));
  return [...shown, ...arrived.filter((comment) => !seen.has(comment.id))].sort(older);
}

export function findComment(items: readonly ThreadItem[], id: string): CommentView | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const reply = item.replies.find((candidate) => candidate.id === id);
    if (reply !== undefined) return reply;
  }
  return undefined;
}

/** Applies `change` to the comment `id`, wherever it is (top level or a reply). */
export function patchComment(items: readonly ThreadItem[], id: string, change: (comment: CommentView) => CommentView): ThreadItem[] {
  return items.map((item) =>
    item.id === id
      ? { ...item, ...change(item) }
      : item.replies.some((reply) => reply.id === id)
        ? { ...item, replies: item.replies.map((reply) => (reply.id === id ? change(reply) : reply)) }
        : item,
  );
}

/** Removes the comment `id` (a top-level one takes its replies with it); a reply lowers its parent's count. */
export function withoutComment(items: readonly ThreadItem[], id: string): ThreadItem[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) =>
      item.replies.some((reply) => reply.id === id)
        ? { ...item, replies: item.replies.filter((reply) => reply.id !== id), replyCount: Math.max(0, item.replyCount - 1) }
        : item,
    );
}

export const likeChange = (liked: boolean) => (comment: CommentView): CommentView => ({
  ...comment,
  likedByMe: liked,
  likeCount: Math.max(0, comment.likeCount + (liked ? 1 : -1)),
});
