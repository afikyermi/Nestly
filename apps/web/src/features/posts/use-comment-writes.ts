import { useRef, useState } from 'react';
import { checkCreateComment } from '@nestly/shared';
import { createComment, deleteComment } from '@/services/api/comments';
import { COMMENT_REQUIRED_TEXT, COMMENT_TOO_LONG_TEXT, REMOVED_STATUS, SENT_STATUS, SEND_FAILED_TEXT } from './comments-texts';
import { DELETE_FAILED_TEXT } from './posts-texts';
import { EMPTY_COMPOSER, freshItem, mergeById, withoutComment, type ComposerState, type ThreadItem } from './comments-state';
import type { CommentApi } from './use-comment-api';
import type { ThreadFlow } from './use-comments';

export interface ReplyDraft extends ComposerState {
  parentId: string;
}

export interface DeleteConfirm {
  commentId: string;
  /** A top-level comment: its replies go with it, and the dialog says so. */
  topLevel: boolean;
  saving: boolean;
  failure: string | null;
}

export interface CommentWrites {
  root: ComposerState;
  reply: ReplyDraft | null;
  confirm: DeleteConfirm | null;
  changeRoot: (text: string) => void;
  sendRoot: () => void;
  openReply: (parentId: string) => void;
  changeReply: (text: string) => void;
  sendReply: () => void;
  cancelReply: () => void;
  askDelete: (commentId: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

/** The text's check, by the same shared rule the server applies: what is wrong with it, or null. */
function problemOf(text: string): ComposerState['error'] {
  const checked = checkCreateComment({ body: text });
  if (checked.ok) return null;
  return checked.reason === 'body_required' ? 'required' : 'long';
}

export const composerMessage = (error: ComposerState['error']): string | undefined =>
  error === 'required' ? COMMENT_REQUIRED_TEXT : error === 'long' ? COMMENT_TOO_LONG_TEXT : undefined;

// The writes of the comments region (F3.3 w1): the comment box, the one reply box and deleting your own comment. The server and RLS decide
// who may comment and delete; this sends the text and the parent's id (never an author id), keeps what the server answers and, on a failure,
// keeps the text. One write at a time.
export function useCommentWrites(postId: string, flow: ThreadFlow, api: CommentApi): CommentWrites {
  const { thread, setThread, focusOn } = flow;
  const { token, refused } = api;
  const [root, setRoot] = useState<ComposerState>(EMPTY_COMPOSER);
  const [reply, setReply] = useState<ReplyDraft | null>(null);
  const [confirm, setConfirm] = useState<DeleteConfirm | null>(null);
  const busy = useRef(false);

  const edit = (current: ComposerState, text: string): ComposerState => ({
    ...current,
    text,
    failure: null,
    error: current.validating ? problemOf(text) : null,
  });

  // Sends the draft of the root box (parentId null) or of the reply box.
  async function send(draft: ComposerState, parentId: string | null) {
    if (busy.current) return;
    const set = (change: (current: ComposerState) => ComposerState) => {
      if (parentId === null) setRoot(change);
      else setReply((current) => (current === null ? null : { ...change(current), parentId: current.parentId }));
    };
    const problem = problemOf(draft.text);
    if (problem !== null) {
      set((current) => ({ ...current, error: problem, validating: true, focusTick: current.focusTick + 1 }));
      return;
    }
    busy.current = true;
    set((current) => ({ ...current, error: null, failure: null, sending: true }));
    setThread((current) => ({ ...current, status: '' }));
    try {
      const accessToken = await token();
      const outcome =
        accessToken === null ? ({ kind: 'failed' } as const) : await createComment(accessToken, postId, { body: draft.text, ...(parentId === null ? {} : { parentId }) });
      if (outcome.kind === 'ok') {
        const created = outcome.value;
        setThread((current) => ({
          ...current,
          status: SENT_STATUS,
          items:
            parentId === null
              ? mergeById(current.items, [freshItem(created)])
              : current.items.map((item: ThreadItem) =>
                  item.id === parentId ? { ...item, replies: mergeById(item.replies, [created]), replyCount: item.replyCount + 1 } : item,
                ),
        }));
        if (parentId === null) setRoot(EMPTY_COMPOSER);
        else {
          setReply(null);
          focusOn({ kind: 'comment', id: created.id });
        }
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
      busy.current = false;
    }
  }

  async function remove(current: DeleteConfirm) {
    if (busy.current) return;
    busy.current = true;
    setConfirm({ ...current, saving: true, failure: null });
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await deleteComment(accessToken, current.commentId);
      // A comment that is already gone (404) is what the person wanted.
      if (outcome.kind === 'deleted' || outcome.kind === 'unavailable') {
        setThread((state) => ({ ...state, status: REMOVED_STATUS, items: withoutComment(state.items, current.commentId) }));
        setReply((draft) => (draft?.parentId === current.commentId ? null : draft));
        setConfirm(null);
        focusOn({ kind: 'heading' });
        return;
      }
      setConfirm({ ...current, saving: false, failure: refused(outcome) ?? DELETE_FAILED_TEXT });
    } finally {
      busy.current = false;
    }
  }

  return {
    root,
    reply,
    confirm,
    changeRoot: (text) => setRoot((current) => edit(current, text)),
    sendRoot: () => void send(root, null),
    openReply: (parentId) => {
      if (busy.current) return;
      setReply((current) => (current?.parentId === parentId ? current : { ...EMPTY_COMPOSER, parentId, focusTick: 1 }));
    },
    changeReply: (text) => setReply((current) => (current === null ? null : { ...edit(current, text), parentId: current.parentId })),
    sendReply: () => {
      if (reply !== null) void send(reply, reply.parentId);
    },
    cancelReply: () => {
      if (busy.current || reply === null) return;
      const parentId = reply.parentId;
      setReply(null);
      focusOn({ kind: 'reply-button', id: parentId });
    },
    askDelete: (commentId) => {
      if (busy.current) return;
      setThread((current) => ({ ...current, status: '' }));
      setConfirm({ commentId, topLevel: thread.items.some((item) => item.id === commentId), saving: false, failure: null });
    },
    cancelDelete: () => {
      // Nothing is sent. The dialog stays while the delete is in flight.
      if (!busy.current) setConfirm(null);
    },
    confirmDelete: () => {
      if (confirm !== null) void remove(confirm);
    },
  };
}
