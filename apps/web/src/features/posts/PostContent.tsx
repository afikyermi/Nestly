import { useEffect, useRef, type ReactNode } from 'react';
import { ANONYMOUS_AUTHOR_LABEL, type PostReadView } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_LABELS } from '@/lib/child-fields';
import { cn } from '@/lib/cn';
import { documentTitle } from '@/lib/document-title';
import type { PostFormErrors, PostFormValues } from './post-form';
import { PostForm, type PostFormFocus } from './PostForm';
import { PostLinkButton } from './PostLinkButton';
import {
  ANONYMOUS_OWN_NOTE,
  audienceLine,
  BACK_TO_FEED_LABEL,
  CONFIRM_DELETE_LABEL,
  DELETE_DESCRIPTION,
  DELETING_TEXT,
  DELETE_LABEL,
  DELETE_TITLE,
  DIALOG_CANCEL_LABEL,
  EDIT_LABEL,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  POST_TITLE,
  POST_UNAVAILABLE_TEXT,
  RETRY_LABEL,
  tagLine,
} from './posts-texts';

export interface PostEdit {
  values: PostFormValues;
  errors: PostFormErrors;
  saving: boolean;
  failure: string | null;
}

/** What the screen shows. The container (PostScreen) owns the flow; this draws one state. */
export type PostScreenView =
  | { kind: 'loading' }
  | { kind: 'unavailable' } // 404: one text for every reason
  | { kind: 'load-failed'; message: string }
  | {
      kind: 'loaded';
      post: PostReadView;
      /** The polite status line: what just happened. Empty: nothing. */
      status: string;
      /** The last action's failure (a delete that did not go through). */
      failure: string | null;
      edit: PostEdit | null;
      confirm: { saving: boolean; failure: string | null } | null;
    };

/** Where focus goes after a change, once per `tick`. */
export type PostFocus = PostFormFocus | { target: 'actions'; tick: number };

export interface PostContentProps {
  view: PostScreenView;
  focus?: PostFocus;
  onRetry?: () => void;
  onEdit?: () => void;
  onEditChange?: (values: PostFormValues) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onDelete?: () => void;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  /** The comments region, drawn below the post (F3.3); it keeps its own state while the post is edited. */
  thread?: ReactNode;
}

const FOCUS_ACTION = '[data-post-action] button';

// One post (FR-FEED-002; F3.1b) inside the shell's `main`: its text, who sees it and its tag; for the author "עריכה" and "מחיקה",
// an anonymous post's "אנונימי" header for every reader and, for its author only, the note that only they see it (F3.4 c12);
// the edit form and the delete confirmation. Display only: what the actions do comes in as props. The text is the user's own, so it
// is isolated and keeps its line breaks.
export function PostContent(props: PostContentProps) {
  const { view, focus, onRetry, onEdit, onEditChange, onEditSave, onEditCancel, onDelete, onConfirmDelete, onCancelDelete, thread } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus === undefined || focus.tick === 0 || focus.target === 'body' || focus.target === 'invalid') return;
    const root = rootRef.current;
    if (root === null) return;
    const selector = focus.target === 'actions' ? FOCUS_ACTION : '[data-post-message]';
    (root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('h1'))?.focus();
  }, [focus]);

  const loaded = view.kind === 'loaded' ? view : null;
  const editing = loaded?.edit ?? null;
  const status = view.kind === 'loading' ? LOADING_TEXT : (loaded?.status ?? '');
  const heading = POST_TITLE;
  const locked = loaded !== null && loaded.confirm?.saving === true;

  return (
    <div ref={rootRef} className="flex min-w-0 max-w-md flex-col gap-6">
      <title>{documentTitle(heading)}</title>
      <h1 tabIndex={-1} className="text-h2">
        {heading}
      </h1>
      {/* One polite region for the screen, present from the first render so its changes are announced. */}
      <p role="status" data-testid="post-status" className={cn(status !== '' && view.kind === 'loaded' ? 'text-body text-muted-foreground' : 'sr-only')}>
        {status}
      </p>
      {view.kind === 'loading' ? (
        <div data-testid="post-loading" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
          <Skeleton className="w-3/4" />
        </div>
      ) : null}
      {view.kind === 'unavailable' ? (
        <div data-testid="post-unavailable" className="flex flex-col items-start gap-4">
          <p className="text-body">{POST_UNAVAILABLE_TEXT}</p>
          <PostLinkButton to={PATHS.feed} variant="text">
            {BACK_TO_FEED_LABEL}
          </PostLinkButton>
        </div>
      ) : null}
      {view.kind === 'load-failed' ? (
        <div data-testid="post-load-failed" className="flex flex-col items-start gap-4">
          <div data-post-message tabIndex={-1} className="w-full">
            <InlineAlert>{view.message}</InlineAlert>
          </div>
          {view.message === LOAD_FAILED_TEXT ? (
            <Button variant="soft" onClick={onRetry}>
              {RETRY_LABEL}
            </Button>
          ) : null}
        </div>
      ) : null}
      {loaded !== null && editing !== null ? (
        <PostForm
          mode="edit"
          values={editing.values}
          errors={editing.errors}
          saving={editing.saving}
          failure={editing.failure}
          {...(focus !== undefined && focus.target !== 'actions' ? { focus } : {})}
          onChange={(values) => onEditChange?.(values)}
          onSubmit={() => onEditSave?.()}
          {...(onEditCancel !== undefined ? { onCancel: onEditCancel } : {})}
          anonymous={loaded.post.isAnonymous}
        />
      ) : null}
      {loaded !== null && editing === null ? (
        <>
          {loaded.failure !== null ? (
            <div data-post-message tabIndex={-1}>
              <InlineAlert>{loaded.failure}</InlineAlert>
            </div>
          ) : null}
          <article data-testid="post" className="flex flex-col gap-3 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card md:p-5">
            {loaded.post.isAnonymous ? (
              <p data-testid="post-author" className="text-label">
                {ANONYMOUS_AUTHOR_LABEL}
              </p>
            ) : null}
            {loaded.post.isAnonymous && loaded.post.isMine ? (
              <p data-testid="post-own-note" className="text-small text-muted-foreground">
                {ANONYMOUS_OWN_NOTE}
              </p>
            ) : null}
            <p data-testid="post-body" dir="rtl" className="whitespace-pre-wrap wrap-anywhere">
              {loaded.post.body ?? ''}
            </p>
            <p data-testid="post-audience" className="text-small text-muted-foreground">
              {audienceLine(loaded.post.audience)}
            </p>
            {loaded.post.stageTag !== null ? (
              <p data-testid="post-tag" className="text-small text-muted-foreground">
                {tagLine(STAGE_LABELS[loaded.post.stageTag])}
              </p>
            ) : null}
          </article>
          {loaded.post.isMine ? (
            <div data-post-action className="flex flex-wrap items-center gap-2">
              <Button variant="soft" aria-disabled={locked ? true : undefined} onClick={onEdit}>
                {EDIT_LABEL}
              </Button>
              <Button variant="text" aria-disabled={locked ? true : undefined} onClick={onDelete}>
                {DELETE_LABEL}
              </Button>
            </div>
          ) : null}
          <div>
            <PostLinkButton to={PATHS.feed} variant="text">
              {BACK_TO_FEED_LABEL}
            </PostLinkButton>
          </div>
          {loaded.confirm !== null ? (
            <ConfirmDialog
              open
              title={DELETE_TITLE}
              description={DELETE_DESCRIPTION}
              confirmLabel={loaded.confirm.saving ? DELETING_TEXT : CONFIRM_DELETE_LABEL}
              cancelLabel={DIALOG_CANCEL_LABEL}
              pending={loaded.confirm.saving}
              failure={loaded.confirm.failure}
              onConfirm={() => onConfirmDelete?.()}
              onCancel={() => onCancelDelete?.()}
              finalFocus={() => rootRef.current?.querySelector<HTMLElement>(FOCUS_ACTION) ?? null}
            />
          ) : null}
        </>
      ) : null}
      {loaded !== null ? thread : null}
    </div>
  );
}
