import type { FeedUnit } from '@nestly/shared';
import { EMPTY_COMPOSER, type ComposerState, type ThreadItem } from './comments-state';
import type { ReplyDraft } from './use-comment-writes';

/** The top-level comments a card shows before "הצגת עוד תגובות": the first ones of the thread's own order (oldest first). */
export const PREVIEW_COMMENTS = 2;

/** Where focus goes inside a card, once per tick: its field, its "תגובות" button, a comment (or reply), or a comment's "השבה". */
export type CardFocusTarget = { kind: 'field' } | { kind: 'comments-button' } | { kind: 'comment'; id: string } | { kind: 'reply-button'; id: string };

/** The comments of one feed card (ux-polish-a), kept while the feed screen stays mounted. */
export interface CardThread {
  /** idle: not asked yet · loading · ready · error: the first page failed · gone: the post is not available (404) · denied: 403 not_allowed. */
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'gone' | 'denied';
  items: ThreadItem[];
  nextCursor: string | null;
  /** The next page: none · in flight · failed (the same cursor is sent again). */
  more: 'idle' | 'loading' | 'error';
  /** "הצגת עוד תגובות" was pressed: every loaded top-level comment shows. */
  expanded: boolean;
  /** Comments and replies written here: they show also while the card is collapsed (c4, c5). */
  added: readonly string[];
  /** Top-level comments whose replies were opened by "הצגת עוד השבות". */
  openReplies: readonly string[];
  /**
   * The viewer is the real author of this anonymous post (F3.4 c14): known only from GET /posts/:id (`isMine`); null until it answers, and
   * the card shows no field meanwhile. A named card is false at once: the name notice.
   */
  asAuthor: boolean | null;
  /** That read: none or done · in flight · failed. */
  authorRead: 'idle' | 'loading' | 'error';
  root: ComposerState;
  /** The one reply box of the card. */
  reply: ReplyDraft | null;
  focus: { tick: number; target: CardFocusTarget };
}

/** A card's comments before anything was asked: a card without comments is ready at once, with the field only (c1). */
export function initialThread(unit: FeedUnit): CardThread {
  return {
    phase: unit.commentCount > 0 ? 'idle' : 'ready',
    items: [],
    nextCursor: null,
    more: 'idle',
    expanded: false,
    added: [],
    openReplies: [],
    asAuthor: unit.isAnonymous ? null : false,
    authorRead: 'idle',
    root: EMPTY_COMPOSER,
    reply: null,
    focus: { tick: 0, target: { kind: 'field' } },
  };
}

const hiddenWhileCollapsed = (thread: CardThread, item: ThreadItem, index: number): boolean =>
  !thread.expanded && index >= PREVIEW_COMMENTS && !thread.added.includes(item.id);

/** The first loaded top-level comment the collapsed card does not show, if any. */
export function firstHiddenLoaded(thread: CardThread): ThreadItem | undefined {
  return thread.items.find((item, index) => hiddenWhileCollapsed(thread, item, index));
}

/** Whether "הצגת עוד תגובות" shows: a top-level comment is loaded and not shown, or the server has another page (c2). */
export const hasHiddenComments = (thread: CardThread): boolean => thread.nextCursor !== null || firstHiddenLoaded(thread) !== undefined;

/** A comment's replies as the card shows them: all the loaded ones once opened, else only the ones written here (c2, c5). */
export function shownReplies(thread: CardThread, item: ThreadItem): ThreadItem {
  return thread.openReplies.includes(item.id) ? item : { ...item, replies: item.replies.filter((reply) => thread.added.includes(reply.id)) };
}

/** The top-level comments the card shows, each with the replies it shows (c1, c2). */
export function shownItems(thread: CardThread): ThreadItem[] {
  return thread.items.filter((item, index) => !hiddenWhileCollapsed(thread, item, index)).map((item) => shownReplies(thread, item));
}

/** Whether the first press of a comment's "הצגת עוד השבות" only shows the replies already loaded with it (no request). */
export const repliesToOpen = (thread: CardThread, item: ThreadItem): boolean =>
  !thread.openReplies.includes(item.id) && item.replies.some((reply) => !thread.added.includes(reply.id));
