import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { useBackCloses } from '@/hooks/use-back-closes';
import { reportSheetProps, useReport, type ReportResult } from '@/hooks/use-report';
import { ALREADY_REPORTED_STATUS, POST_REPORTED_STATUS, REPORT_POST_ITEM, REPORT_UNAVAILABLE_STATUS } from '@/lib/report-texts';
import { postPath } from '@/lib/post-link';
import { useSessionAccount } from '@/hooks/use-session-account';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { deletePost, editPost, fetchPost, type PostsOutcome } from '@/services/api/posts';
import { handOverStatus, takeEdit } from './flash-status';
import { checkPostForm, type AnonymousMode, type PostFormValues } from './post-form';
import { failureText, refusedErrors } from './post-outcome';
import { CommentsSection } from './CommentsSection';
import { outsidePressHandler } from './outside-press';
import { PostContent, type PostEdit, type PostFocus, type PostScreenView } from './PostContent';
import { DELETE_FAILED_TEXT, DELETED_STATUS, LOAD_FAILED_TEXT, SAVE_FAILED_TEXT, UPDATED_STATUS } from './posts-texts';

type Loaded = Extract<PostScreenView, { kind: 'loaded' }>;

/** An anonymous post's edit sends the text and the tag only: its audience and anonymity never change (F3.4 c13). */
const anonymousMode = (current: Loaded): AnonymousMode => (current.post.isAnonymous ? 'edit' : 'none');

// One post's flow (FR-FEED-002, Afik 3א; F3.1b): open it, and for its author edit it or delete it after a confirmation. The server and
// RLS decide who may read, edit or delete; this screen sends the post id in the path and never an author id. A post that is missing,
// not readable or not the caller's is one 404 and one text. A refused token (401) or a stopped account (403) asks the session for the
// account state again, and the session guard ends the session with its notice (ERR-038, ERR-037).
export function PostScreen({ postId }: { postId: string }) {
  const account = useSessionAccount();
  const navigate = useNavigate();
  const [view, setView] = useState<PostScreenView>({ kind: 'loading' });
  const [focus, setFocus] = useState<PostFocus>({ target: 'actions', tick: 0 });
  const validating = useRef(false);
  const busy = useRef(false);
  const loads = useRef(0);
  // "עריכת הפוסט" from a feed card's menu (F3.9 c13): the post opens with its edit form, once.
  const [editAsked] = useState(() => takeEdit(postPath(postId)));
  const wantsEdit = useRef(editAsked);

  const focusOn = (target: PostFocus['target']) => setFocus((current) => ({ target, tick: current.tick + 1 }));

  // F3.7: a post the viewer did not write has a "⋯" with "דיווח על הפוסט". Filed (or filed before), the post is not shown to them again
  // (7א): it is replaced by the paragraph and "חזרה לפיד", focus on it. 404: the post stays and the status says so (focus back on "⋯").
  const [menuOpen, setMenuOpen] = useState(false);
  const report = useReport((_target, result: ReportResult) => {
    if (result === 'unavailable') {
      setView((current) => (current.kind === 'loaded' ? { ...current, status: REPORT_UNAVAILABLE_STATUS } : current));
      return;
    }
    setView({ kind: 'reported', text: result === 'received' ? POST_REPORTED_STATUS : ALREADY_REPORTED_STATUS });
    focusOn('message');
  });
  // Back while the report is in flight keeps the window (the hook adds its entry again). A press outside the menu: as the feed's (F3.9).
  const back = useBackCloses(menuOpen || report.draft !== null, () => {
    if (report.draft?.sending === true) return false;
    setMenuOpen(false);
    report.cancel();
    return true;
  });
  const pressedOutside = outsidePressHandler(back);

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
        const loaded: Loaded = { kind: 'loaded', post: outcome.post, status: '', failure: null, edit: null, confirm: null };
        setView(loaded);
        if (wantsEdit.current) {
          wantsEdit.current = false;
          if (outcome.post.isMine) startEdit(loaded);
          return;
        }
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
    const checked = validating.current ? checkPostForm(values, anonymousMode(current)) : null;
    setView({ ...current, edit: { ...edit, values, errors: checked !== null && !checked.ok ? checked.errors : {} } });
  }

  async function saveEdit(current: Loaded, edit: PostEdit) {
    if (busy.current) return;
    const checked = checkPostForm(edit.values, anonymousMode(current));
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
        // The editor is the author: the stored post answers without `isMine` or the counts, which stay as read.
        setView({ ...current, post: { ...current.post, ...outcome.post, isMine: true }, status: UPDATED_STATUS, failure: null, edit: null, confirm: null });
        focusOn('actions');
        return;
      }
      if (outcome.kind === 'unavailable') {
        setView({ kind: 'unavailable' });
        return;
      }
      const fieldErrors = refusedErrors(outcome);
      if (fieldErrors !== null) validating.current = true;
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
        handOverStatus(PATHS.feed, DELETED_STATUS);
        void navigate(PATHS.feed);
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

  const thread =
    loaded === null ? undefined : (
      <CommentsSection
        postId={postId}
        liked={loaded.post.likedByMe}
        likes={loaded.post.likeCount}
        asAnonymousAuthor={loaded.post.isAnonymous && loaded.post.isMine}
      />
    );
  // F3.7 c9: a post the viewer did not write (isMine is the server's: an anonymous post's own author has it too, and gets no report).
  const moreActions =
    loaded === null || loaded.post.isMine || loaded.edit !== null
      ? []
      : [{ key: 'report', label: REPORT_POST_ITEM, onSelect: () => report.start({ kind: 'post', id: postId }) }];
  return (
    <PostContent
      view={view}
      focus={focus}
      onRetry={() => void load(true)}
      {...actions}
      thread={thread}
      moreActions={moreActions}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onMenuPressOutside={pressedOutside}
      report={report.draft === null ? null : reportSheetProps(report, report.draft, PATHS.communityRules)}
    />
  );
}
