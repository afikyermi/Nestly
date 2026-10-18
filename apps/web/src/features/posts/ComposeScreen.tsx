import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudienceMemory, type AudienceMemory } from '@/hooks/use-audience-memory';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { usePostingRight } from '@/hooks/use-posting-right';
import { useSessionAccount } from '@/hooks/use-session-account';
import { documentTitle } from '@/lib/document-title';
import { postPath } from '@/lib/post-link';
import { createPost } from '@/services/api/posts';
import { checkPostForm, type PostFormErrors, type PostFormValues } from './post-form';
import { handOverStatus } from './flash-status';
import { failureText, refusedErrors } from './post-outcome';
import { PostForm, type PostFormFocus } from './PostForm';
import { PostLinkButton } from './PostLinkButton';
import { BACK_TO_FEED_LABEL, CHECKING_TEXT, NEW_POST_LABEL, PUBLISH_FAILED_TEXT, PUBLISHED_STATUS, UNAVAILABLE_ACTION_TEXT } from './posts-texts';

// The composer, which starts on the audience stored for this user (OP-033, Afik 1א). The typed values live in this component's memory only.
function Composer({ memory }: { memory: AudienceMemory }) {
  const account = useSessionAccount();
  const navigate = useNavigate();
  const [values, setValues] = useState<PostFormValues>(() => ({ body: '', audience: memory.read() ?? 'everyone', stageTag: '' }));
  const [errors, setErrors] = useState<PostFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<PostFormFocus>({ target: 'body', tick: 0 });
  // True from the first refused submit: the errors then follow every keystroke. `sending` is set synchronously: a second press sends nothing.
  const validating = useRef(false);
  const sending = useRef(false);

  const focusOn = (target: PostFormFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  function change(next: PostFormValues) {
    setValues(next);
    if (validating.current) {
      const checked = checkPostForm(next);
      setErrors(checked.ok ? {} : checked.errors);
    }
  }

  async function submit() {
    if (sending.current) return;
    const checked = checkPostForm(values);
    if (!checked.ok) {
      validating.current = true;
      setErrors(checked.errors);
      setFailure(checked.errors.other ?? null);
      focusOn(checked.errors.body !== undefined ? 'invalid' : 'message');
      return;
    }
    sending.current = true;
    setFailure(null);
    setErrors({});
    setSaving(true);
    const token = account === null ? null : await account.getAccessToken().catch(() => null);
    const outcome = token === null ? ({ kind: 'failed' } as const) : await createPost(token, checked.value);
    if (outcome.kind === 'post') {
      // A failed post stores nothing: the choice is remembered only here (c15). The composer stays "sending" until the page is left.
      memory.write(values.audience);
      handOverStatus(postPath(outcome.post.id), PUBLISHED_STATUS);
      void navigate(postPath(outcome.post.id));
      return;
    }
    if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
    const refused = refusedErrors(outcome);
    if (refused !== null) validating.current = true;
    setErrors(refused ?? {});
    setFailure(refused === null ? failureText(outcome, PUBLISH_FAILED_TEXT) : null);
    focusOn(refused === null ? 'message' : 'invalid');
    sending.current = false;
    setSaving(false);
  }

  return (
    <PostForm mode="create" values={values} errors={errors} saving={saving} failure={failure} focus={focus} onChange={change} onSubmit={() => void submit()} />
  );
}

// The composer page's content (FR-FEED-002; F3.1b): the form for a Regular account; "הפעולה אינה זמינה" for an account that cannot
// write a post (a Professional). A check that did not answer lets the form open: the database refuses a post by anyone else.
export function ComposeScreen() {
  const right = usePostingRight();
  const own = useOwnUserId();
  const memory = useAudienceMemory(own.kind === 'known' ? own.userId : null);
  const ready = right !== 'checking' && own.kind !== 'loading';

  if (right === 'not-allowed') {
    return (
      <>
        <title>{documentTitle(NEW_POST_LABEL)}</title>
        <h1 tabIndex={-1} className="text-h2">
          {NEW_POST_LABEL}
        </h1>
        <p className="mt-1 text-body text-muted-foreground">{UNAVAILABLE_ACTION_TEXT}</p>
        <div className="mt-4">
          <PostLinkButton to={PATHS.feed} variant="text">
            {BACK_TO_FEED_LABEL}
          </PostLinkButton>
        </div>
      </>
    );
  }
  return (
    <div className="flex min-w-0 max-w-md flex-col gap-6">
      <title>{documentTitle(NEW_POST_LABEL)}</title>
      <h1 className="text-h2">{NEW_POST_LABEL}</h1>
      {ready ? (
        <Composer memory={memory} />
      ) : (
        <div data-testid="post-checking" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
          <p role="status" className="sr-only">
            {CHECKING_TEXT}
          </p>
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      )}
    </div>
  );
}
