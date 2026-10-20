import { useCallback, useRef, useState } from 'react';
import type { FeedUnit, PostView } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { editPost } from '@/services/api/posts';
import type { PostFormFocus } from './PostForm';
import { checkPostForm, type PostFormErrors, type PostFormValues } from './post-form';
import { failureText, refusedErrors } from './post-outcome';
import { SAVE_FAILED_TEXT } from './posts-texts';

/** The edit form open inside one feed card (ux-polish-b c1, c2): the card, the values, and the save's state. */
export interface CardEdit {
  unitId: string;
  values: PostFormValues;
  errors: PostFormErrors;
  saving: boolean;
  failure: string | null;
  focus: PostFormFocus;
}

export interface CardEditFlow {
  edit: CardEdit | null;
  /** Open the form in `unit`'s card (a named post of the viewer's own); a card already in edit closes without a request. Ignored while a save is in flight. */
  start: (unit: FeedUnit) => void;
  change: (values: PostFormValues) => void;
  save: () => void;
  /** Close the form, nothing sent (ignored while a save is in flight). */
  cancel: () => void;
}

// The in-place edit of a feed card (ux-polish-b c1, c2; F3.1's edit form and PATCH /api/posts/:id as built). One card at a time. The server and
// RLS decide who may edit; the post id goes in the path and never an author id. The result goes out through `onSaved` (the stored post) or
// `onGone` (404: the post is no longer there); a refusal keeps the form with the text.
export function useCardEdit(onSaved: (unitId: string, post: PostView) => void, onGone: (unitId: string) => void, onClosed: (unitId: string) => void): CardEditFlow {
  const account = useSessionAccount();
  const [edit, setEdit] = useState<CardEdit | null>(null);
  const latest = useRef(edit);
  latest.current = edit;
  const sending = useRef(false);
  const validating = useRef(false);

  const start = useCallback((unit: FeedUnit) => {
    if (sending.current || unit.kind !== 'post') return;
    validating.current = false;
    setEdit({
      unitId: unit.id,
      values: { body: unit.body, audience: unit.audience, stageTag: unit.stageTag ?? '' },
      errors: {},
      saving: false,
      failure: null,
      focus: { target: 'body', tick: 1 },
    });
  }, []);

  const change = useCallback((values: PostFormValues) => {
    const current = latest.current;
    if (current === null) return;
    const checked = validating.current ? checkPostForm(values) : null;
    setEdit({ ...current, values, errors: checked !== null && !checked.ok ? checked.errors : {} });
  }, []);

  const cancel = useCallback(() => {
    const current = latest.current;
    if (current === null || sending.current) return;
    setEdit(null);
    onClosed(current.unitId);
  }, [onClosed]);

  const save = useCallback(() => {
    const current = latest.current;
    if (current === null || sending.current) return;
    const checked = checkPostForm(current.values);
    if (!checked.ok) {
      validating.current = true;
      setEdit({ ...current, errors: checked.errors, failure: checked.errors.other ?? null, focus: { target: checked.errors.body !== undefined ? 'invalid' : 'message', tick: current.focus.tick + 1 } });
      return;
    }
    sending.current = true;
    setEdit({ ...current, errors: {}, failure: null, saving: true });
    void (async () => {
      try {
        const token = account === null ? null : await account.getAccessToken().catch(() => null);
        const outcome = token === null ? ({ kind: 'failed' } as const) : await editPost(token, current.unitId, checked.value);
        if (outcome.kind === 'post') {
          setEdit(null);
          onSaved(current.unitId, outcome.post);
          return;
        }
        if (outcome.kind === 'unavailable') {
          setEdit(null);
          onGone(current.unitId);
          return;
        }
        if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
        const fieldErrors = refusedErrors(outcome);
        if (fieldErrors !== null) validating.current = true;
        const failure = fieldErrors === null ? (outcome.kind === 'account-unavailable' ? STOPPED_TEXT : failureText(outcome, SAVE_FAILED_TEXT)) : null;
        setEdit((now) =>
          now === null ? now : { ...now, errors: fieldErrors ?? {}, failure, saving: false, focus: { target: fieldErrors === null ? 'message' : 'invalid', tick: now.focus.tick + 1 } },
        );
      } finally {
        sending.current = false;
      }
    })();
  }, [account, onSaved, onGone]);

  return { edit, start, change, save, cancel };
}
