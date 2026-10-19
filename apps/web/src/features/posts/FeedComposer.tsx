import { useEffect, useRef, useState } from 'react';
import type { PostView } from '@nestly/shared';
import { useAudienceMemory, type AudienceMemory } from '@/hooks/use-audience-memory';
import type { OwnUserId } from '@/hooks/use-own-user-id';
import type { PostingRight } from '@/hooks/use-posting-right';
import { useSessionAccount } from '@/hooks/use-session-account';
import { createPost } from '@/services/api/posts';
import { forgetDraft, isSending, keepDraft, recallDraft, setSending, watchSending } from './compose-draft';
import { checkPostForm, type PostFormErrors, type PostFormValues } from './post-form';
import { failureText, refusedErrors } from './post-outcome';
import { PostForm, type PostFormFocus } from './PostForm';
import { PUBLISH_FAILED_TEXT } from './posts-texts';

interface ComposerProps {
  owner: string | null;
  memory: AudienceMemory;
  /** Put focus in the text field on mount (the old /posts/new address, D3). */
  focusText: boolean;
  onPublished: (post: PostView) => void;
}

// The form, always on the feed (feed-composer c1-c4, c7, c10). A new composition starts on the audience stored for this user (OP-033,
// Afik 1א) with "פרסום אנונימי" unchecked and never stored (F3.4 c11); a kept one (left in-app, c5) comes back whole, the box too. Idle it
// shows the text and "פרסום"; the rest appears while focus is in the form or the text is non-blank (D2). While checked, the audience
// choice is kept aside, not sent. Every change is kept in memory (compose-draft); a success clears it.
function Composer({ owner, memory, focusText, onPublished }: ComposerProps) {
  const account = useSessionAccount();
  const [kept] = useState(() => recallDraft(owner));
  const [values, setValues] = useState<PostFormValues>(() => kept?.values ?? { body: '', audience: memory.read() ?? 'everyone', stageTag: '' });
  const [anonymous, setAnonymous] = useState(kept?.anonymous ?? false);
  const [errors, setErrors] = useState<PostFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(isSending);
  const [focus, setFocus] = useState<PostFormFocus>({ target: 'body', tick: focusText ? 1 : 0 });
  const [within, setWithin] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A press on an option blurs the text before the option takes focus (no related target): the options stay until the press is over.
  const pressing = useRef(false);
  // True from the first refused submit: the errors then follow every keystroke.
  const validating = useRef(false);
  // "Sending" is module-level (compose-draft): set synchronously, a second press sends nothing, even after leaving and returning.
  useEffect(() => watchSending(setSaving), []);

  const focusOn = (target: PostFormFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  function revalidate(next: PostFormValues, nextAnonymous: boolean) {
    if (!validating.current) return;
    const checked = checkPostForm(next, nextAnonymous ? 'create' : 'none');
    setErrors(checked.ok ? {} : checked.errors);
  }

  function change(next: PostFormValues) {
    setValues(next);
    keepDraft(owner, { values: next, anonymous });
    revalidate(next, anonymous);
  }

  function toggleAnonymous(checked: boolean) {
    setAnonymous(checked);
    keepDraft(owner, { values, anonymous: checked });
    revalidate(values, checked);
  }

  async function submit() {
    if (isSending()) return;
    const checked = checkPostForm(values, anonymous ? 'create' : 'none');
    if (!checked.ok) {
      validating.current = true;
      setErrors(checked.errors);
      setFailure(checked.errors.other ?? null);
      focusOn(checked.errors.body !== undefined ? 'invalid' : 'message');
      return;
    }
    setSending(true);
    forgetDraft();
    setFailure(null);
    setErrors({});
    const token = account === null ? null : await account.getAccessToken().catch(() => null);
    const outcome = token === null ? ({ kind: 'failed' } as const) : await createPost(token, checked.value);
    if (outcome.kind === 'post') {
      // A failed post stores nothing: the choice is remembered only here (c15), and never by an anonymous post (F3.4 c11).
      if (!anonymous) memory.write(values.audience);
      setSending(false);
      onPublished(outcome.post);
      return;
    }
    if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
    const refused = refusedErrors(outcome);
    if (refused !== null) validating.current = true;
    setErrors(refused ?? {});
    setFailure(refused === null ? failureText(outcome, PUBLISH_FAILED_TEXT) : null);
    focusOn(refused === null ? 'message' : 'invalid');
    if (recallDraft(owner) === null) keepDraft(owner, { values, anonymous });
    setSending(false);
  }

  const engaged = within || values.body.trim() !== '' || failure !== null || errors.body !== undefined;

  return (
    <div
      className="rounded-lg bg-card p-4 shadow-card md:p-5"
      ref={box}
      onFocus={(event) => {
        // Pressing "פרסום" on an idle, blank form must not open the options above it before the click lands (F3.1 c14).
        const onSubmit = event.target instanceof HTMLButtonElement && event.target.type === 'submit';
        if (!onSubmit || values.body.trim() !== '') setWithin(true);
      }}
      onPointerDown={() => {
        pressing.current = true;
        const over = () => {
          window.removeEventListener('pointerup', over);
          window.removeEventListener('pointercancel', over);
          setTimeout(() => {
            pressing.current = false;
            if (box.current?.contains(document.activeElement) !== true) setWithin(false);
          }, 0);
        };
        window.addEventListener('pointerup', over);
        window.addEventListener('pointercancel', over);
      }}
      onBlur={(event) => {
        if (!pressing.current && !event.currentTarget.contains(event.relatedTarget)) setWithin(false);
      }}
    >
      <PostForm
        mode="create"
        values={values}
        errors={errors}
        saving={saving}
        failure={failure}
        focus={focus}
        anonymous={anonymous}
        compact={!engaged}
        onAnonymousChange={toggleAnonymous}
        onChange={change}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

export interface FeedComposerProps {
  right: PostingRight;
  /** The caller's user id, read by the screen: it also holds the scroll restore until the composer has its place (F3.2 c20). */
  own: OwnUserId;
  focusText: boolean;
  onPublished: (post: PostView) => void;
}

// The composer at the top of the feed (FR-FEED-002; feed-composer c1): one fixed place, no button. Only an account that writes posts
// sees it. While the check runs, or when it did not answer, nothing shows (the database refuses a post by anyone else in any case).
// A success starts a new composition (a new key), which is empty, unchecked and idle.
export function FeedComposer({ right, own, focusText, onPublished }: FeedComposerProps) {
  const [round, setRound] = useState(0);
  const owner = own.kind === 'known' ? own.userId : null;
  const memory = useAudienceMemory(owner);
  if (right !== 'allowed' || own.kind === 'loading') return null;
  return (
    <div className="mt-4 w-full max-w-md">
      <Composer
        key={round}
        owner={owner}
        memory={memory}
        focusText={focusText && round === 0}
        onPublished={(post) => {
          setRound((current) => current + 1);
          onPublished(post);
        }}
      />
    </div>
  );
}
