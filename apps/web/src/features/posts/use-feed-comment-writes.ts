import { useRef } from 'react';
import type { FeedUnit } from '@nestly/shared';
import { createComment, deleteComment } from '@/services/api/comments';
import { REMOVED_STATUS, SEND_FAILED_TEXT, SENT_STATUS } from './comments-texts';
import { DELETE_FAILED_TEXT } from './posts-texts';
import { EMPTY_COMPOSER, freshItem, mergeById, withoutComment, type ComposerState } from './comments-state';
import type { CardThread } from './card-comments-state';
import type { CommentApi } from './use-comment-api';
import { problemOf } from './use-comment-writes';
import type { CommentsReport, FeedCommentsFlow } from './use-feed-comments';

export interface FeedCommentWrites {
  changeRoot: (unit: FeedUnit, text: string) => void;
  sendRoot: (unit: FeedUnit) => void;
  /** Opens F3.3's reply box under a comment of the card (one per card), focus in it. */
  openReply: (unit: FeedUnit, parentId: string) => void;
  changeReply: (unit: FeedUnit, text: string) => void;
  sendReply: (unit: FeedUnit) => void;
  cancelReply: (unit: FeedUnit) => void;
  /** Deletes the viewer's own comment (the feed's confirmation sends it): on 204 or 404 it leaves the card with its replies. */
  remove: (unit: FeedUnit, commentId: string) => Promise<{ ok: true } | { ok: false; failure: string }>;
}

const FAILED = { kind: 'failed' } as const;

// The writes of the feed cards' comments (ux-polish-a c4, c5, c7): each card's field, its one reply box and deleting one's own comment, as
// F3.3 does them on the post page. The server and RLS decide who may comment and delete; this sends the text and the parent's id (never an
// author id), keeps what the server answers and, on a failure, keeps the text. One write at a time per card; a count that moved goes to the feed.
export function useFeedCommentWrites(flow: FeedCommentsFlow, api: CommentApi, report: CommentsReport): FeedCommentWrites {
  const { token, refused } = api;
  const busy = useRef(new Set<string>());

  const edit = (current: ComposerState, text: string): ComposerState => ({ ...current, text, failure: null, error: current.validating ? problemOf(text) : null });

  // Sends the card's field (parentId null) or its reply box.
  async function send(unit: FeedUnit, parentId: string | null) {
    if (busy.current.has(unit.id)) return;
    const thread = flow.latestOf(unit);
    const draft = parentId === null ? thread.root : thread.reply;
    if (draft === null) return;
    const set = (change: (current: ComposerState) => ComposerState) =>
      flow.edit(unit, (current) =>
        parentId === null
          ? { ...current, root: change(current.root) }
          : { ...current, reply: current.reply === null ? null : { ...change(current.reply), parentId: current.reply.parentId } },
      );
    const problem = problemOf(draft.text);
    if (problem !== null) {
      set((current) => ({ ...current, error: problem, validating: true, focusTick: current.focusTick + 1 }));
      return;
    }
    busy.current.add(unit.id);
    set((current) => ({ ...current, error: null, failure: null, sending: true }));
    try {
      const accessToken = await token();
      const outcome =
        accessToken === null ? FAILED : await createComment(accessToken, unit.id, { body: draft.text, ...(parentId === null ? {} : { parentId }) });
      if (outcome.kind === 'ok') {
        const created = outcome.value;
        flow.edit(unit, (current): CardThread => ({
          ...current,
          added: [...current.added, created.id],
          items:
            parentId === null
              ? mergeById(current.items, [freshItem(created)])
              : current.items.map((item) =>
                  item.id === parentId ? { ...item, replies: mergeById(item.replies, [created]), replyCount: item.replyCount + 1 } : item,
                ),
          // c4: the field empties and keeps focus; c5: the reply box closes and focus goes to the new reply (F3.3).
          root: parentId === null ? { ...EMPTY_COMPOSER, focusTick: current.root.focusTick + 1 } : current.root,
          reply: parentId === null ? current.reply : null,
        }));
        if (parentId !== null) flow.focusOn(unit, { kind: 'comment', id: created.id });
        report.onCount(unit.id, 1, SENT_STATUS);
        return;
      }
      if (outcome.kind === 'refused') {
        const error = outcome.reason === 'body_required' ? 'required' : 'long';
        set((current) => ({ ...current, error, validating: true, sending: false, focusTick: current.focusTick + 1 }));
        return;
      }
      const failure = refused(outcome) ?? SEND_FAILED_TEXT;
      set((current) => ({ ...current, sending: false, failure }));
    } finally {
      busy.current.delete(unit.id);
    }
  }

  async function remove(unit: FeedUnit, commentId: string): Promise<{ ok: true } | { ok: false; failure: string }> {
    const accessToken = await token();
    const outcome = accessToken === null ? FAILED : await deleteComment(accessToken, commentId);
    // A comment that is already gone (404) is what the person wanted.
    if (outcome.kind !== 'deleted' && outcome.kind !== 'unavailable') return { ok: false, failure: refused(outcome) ?? DELETE_FAILED_TEXT };
    const topLevel = flow.latestOf(unit).items.find((item) => item.id === commentId);
    // A top-level comment takes its replies with it: the card's count drops by all of them (c7).
    const removed = topLevel === undefined ? 1 : 1 + topLevel.replyCount;
    flow.edit(unit, (current) => ({
      ...current,
      items: withoutComment(current.items, commentId),
      reply: current.reply?.parentId === commentId ? null : current.reply,
    }));
    flow.focusOn(unit, { kind: 'comments-button' });
    report.onCount(unit.id, -removed, REMOVED_STATUS);
    return { ok: true };
  }

  return {
    changeRoot: (unit, text) => flow.edit(unit, (current) => ({ ...current, root: edit(current.root, text) })),
    sendRoot: (unit) => void send(unit, null),
    openReply: (unit, parentId) => {
      // No reply box without its notice: an anonymous card before its authorship read answers keeps no draft.
      if (busy.current.has(unit.id) || flow.latestOf(unit).asAuthor === null) return;
      flow.edit(unit, (current) => ({ ...current, reply: current.reply?.parentId === parentId ? current.reply : { ...EMPTY_COMPOSER, parentId, focusTick: 1 } }));
    },
    changeReply: (unit, text) =>
      flow.edit(unit, (current) => ({ ...current, reply: current.reply === null ? null : { ...edit(current.reply, text), parentId: current.reply.parentId } })),
    sendReply: (unit) => {
      const parentId = flow.latestOf(unit).reply?.parentId;
      if (parentId !== undefined) void send(unit, parentId);
    },
    cancelReply: (unit) => {
      const parentId = flow.latestOf(unit).reply?.parentId;
      if (busy.current.has(unit.id) || parentId === undefined) return;
      flow.edit(unit, (current) => ({ ...current, reply: null }));
      flow.focusOn(unit, { kind: 'reply-button', id: parentId });
    },
    remove,
  };
}
