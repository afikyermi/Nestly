import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { deletePost, editPost, fetchPost, type PostsOutcome } from '@/services/api/posts';
import { flashStatus } from './flash-status';
import { checkPostForm, type PostFormValues } from './post-form';
import { failureText, refusedErrors } from './post-outcome';
import { PostContent, type PostEdit, type PostFocus, type PostScreenView } from './PostContent';
import { DELETE_FAILED_TEXT, DELETED_STATUS, LOAD_FAILED_TEXT, PUBLISHED_STATUS, SAVE_FAILED_TEXT, UPDATED_STATUS } from './posts-texts';

type Loaded = Extract<PostScreenView, { kind: 'loaded' }>;

// One post's flow (FR-FEED-002, Afik 3א; F3.1b): open it, and for its author edit it or delete it after a confirmation. The server and
// RLS decide who may read, edit or delete; this screen sends the post id in the path and never an author id. A post that is missing,
// not readable or not the caller's is one 404 and one text. A refused token (401) or a stopped account (403) asks the session for the
// account state again, and the session guard ends the session with its notice (ERR-038, ERR-037).
export function PostScreen({ postId }: { postId: string }) {
  const account = useSessionAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<PostScreenView>({ kind: 'loading' });
  const [focus, setFocus] = useState<PostFocus>({ target: 'actions', tick: 0 });
  const validating = useRef(false);
  const busy = useRef(false);
  const loads = useRef(0);
  // "הפוסט פורסם", handed over by the composer: said once, when the post first shows.
  const arrival = useRef(flashStatus(location.state, PUBLISHED_STATUS));

  const focusOn = (target: PostFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // What a refused answer means beyond this screen: the session guard is told to look again.
  const refused = useCallback(
    (outcome: PostsOutcome<unknown>): string | null => {
      if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
      return outcome.kind === 'account-unavailable' ? STOPPED_TEXT : null;
    },
    [account],
  );

  const token = useCallback(async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);

  const load = useCallback(
    async (afterRetry: boolean) => {
      const run = (loads.current += 1);
      setView({ kind: 'loading' });
      const accessToken = await token();
      const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await fetchPost(accessToken, postId);
      if (run !== loads.current) return;
      if (outcome.kind === 'post') {
        setView({ kind: 'loaded', post: outcome.post, status: arrival.current, failure: null, edit: null, confirm: null });
        arrival.current = '';
        if (afterRetry) focusOn('actions');
        return;
      }
      setView(outcome.kind === 'unavailable' ? { kind: 'unavailable' } : { kind: 'load-failed', message: refused(outcome) ?? LOAD_FAILED_TEXT });
      if (afterRetry) focusOn('message');
    },
    [token, refused, postId],
  );

  useEffect(() => {
    void load(false);
    return () => {
      loads.current += 1;
    };
  }, [load]);

  function startEdit(current: Loaded) {
    if (busy.current || current.post.body === null) return;
    validating.current = false;
    const values: PostFormValues = { body: current.post.body, audience: current.post.audience, stageTag: current.post.stageTag ?? '' };
    setView({ ...current, status: '', failure: null, edit: { values, errors: {}, saving: false, failure: null } });
    setFocus((latest) => ({ target: 'body', tick: latest.tick + 1 }));
  }

  function changeEdit(current: Loaded, edit: PostEdit, values: PostFormValues) {
    const checked = validating.current ? checkPostForm(values) : null;
    setView({ ...current, edit: { ...edit, values, errors: checked !== null && !checked.ok ? checked.errors : {} } });
  }

  async function saveEdit(current: Loaded, edit: PostEdit) {
    if (busy.current) return;
    const checked = checkPostForm(edit.values);
    if (!checked.ok) {
      validating.current = true;
      setView({ ...current, edit: { ...edit, errors: checked.errors, failure: checked.errors.other ?? null } });
      focusOn(checked.errors.body !== undefined ? 'invalid' : 'message');
      return;
    }
    busy.current = true;
    setView({ ...current, edit: { ...edit, errors: {}, failure: null, saving: true } });
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await editPost(accessToken, postId, checked.value);
      if (outcome.kind === 'post') {
        // The editor is the author: the stored post answers without `isMine`.
        setView({ ...current, post: { ...outcome.post, isMine: true }, status: UPDATED_STATUS, failure: null, edit: null, confirm: null });
        focusOn('actions');
        return;
      }
      if (outcome.kind === 'unavailable') {
        setView({ kind: 'unavailable' });
        return;
      }
      const fieldErrors = refusedErrors(outcome);
      const failure = fieldErrors === null ? (refused(outcome) ?? failureText(outcome, SAVE_FAILED_TEXT)) : null;
      setView({ ...current, edit: { ...edit, errors: fieldErrors ?? {}, failure, saving: false } });
      focusOn(fieldErrors === null ? 'message' : 'invalid');
    } finally {
      busy.current = false;
    }
  }

  async function confirmDelete(current: Loaded) {
    if (busy.current) return;
    busy.current = true;
    setView({ ...current, confirm: { saving: true, failure: null } });
    try {
      const accessToken = await token();
      const outcome = accessToken === null ? ({ kind: 'failed' } as const) : await deletePost(accessToken, postId);
      if (outcome.kind === 'deleted') {
        void navigate(PATHS.feed, { state: { status: DELETED_STATUS } });
        return;
      }
      if (outcome.kind === 'unavailable') {
        setView({ kind: 'unavailable' });
        return;
      }
      const failure = refused(outcome) ?? failureText(outcome, DELETE_FAILED_TEXT);
      setView({ ...current, confirm: { saving: false, failure } });
    } finally {
      busy.current = false;
    }
  }

  const loaded = view.kind === 'loaded' ? view : null;
  const edit = loaded?.edit ?? null;
  const actions =
    loaded === null
      ? {}
      : {
          onEdit: () => startEdit(loaded),
          onDelete: () => {
            if (!busy.current) setView({ ...loaded, status: '', failure: null, confirm: { saving: false, failure: null } });
          },
          onConfirmDelete: () => void confirmDelete(loaded),
          onCancelDelete: () => {
            // Nothing is sent. The dialog stays while the delete is in flight.
            if (!busy.current) setView({ ...loaded, confirm: null });
          },
          ...(edit === null
            ? {}
            : {
                onEditChange: (values: PostFormValues) => changeEdit(loaded, edit, values),
                onEditSave: () => void saveEdit(loaded, edit),
                onEditCancel: () => {
                  if (busy.current) return;
                  setView({ ...loaded, edit: null });
                  focusOn('actions');
                },
              }),
        };

  return <PostContent view={view} focus={focus} onRetry={() => void load(true)} {...actions} />;
}
