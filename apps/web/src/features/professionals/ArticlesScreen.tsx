import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  articleSchema,
  PROFESSIONAL_FIELDS,
  PROFESSIONAL_FIELD_LABELS,
  type ProfessionalArticleItem,
  type ProfessionalField,
} from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { useProCall } from '@/hooks/use-pro-call';
import { PublishedTime } from '@/components/domain/published-time';
import {
  ACTION_FAILED,
  ARTICLE_BODY_LABEL,
  ARTICLE_DELETE,
  ARTICLE_DELETE_CONFIRM,
  ARTICLE_DISCLAIMER,
  ARTICLE_EDIT,
  ARTICLE_ERRORS,
  ARTICLE_FIELD_LABEL,
  ARTICLE_HIDDEN_BADGE,
  ARTICLE_TAKEN_DOWN,
  ARTICLE_HIDDEN_LABEL,
  ARTICLE_PUBLISH,
  ARTICLE_SAVE,
  ARTICLE_TITLE_LABEL,
  ARTICLES_HEADING,
  CANCEL,
  FIELD_PLACEHOLDER,
  LOAD_FAILED,
  NEW_ARTICLE,
  NO_ARTICLES,
  RETRY,
  SAVED,
} from '@/lib/professional-texts';
import { createArticle, deleteArticle, editArticle, fetchProfessional } from '@/services/api/professionals';

interface Draft {
  id: string | null;
  title: string;
  body: string;
  field: string;
  hidden: boolean;
}

const EMPTY: Draft = { id: null, title: '', body: '', field: '', hidden: false };
const FIELD_OPTIONS = PROFESSIONAL_FIELDS.map((value) => ({ value, label: PROFESSIONAL_FIELD_LABELS[value] }));
const isField = (value: string): value is ProfessionalField => PROFESSIONAL_FIELDS.some((field) => field === value);

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; articles: ProfessionalArticleItem[] };

// The owner's articles (FR-PRO-003, AC-094): write, edit, hide and delete; every article shows the responsibility note (BR-071). Only the owner
// edits or deletes one (the database).
export function ArticlesScreen() {
  const call = useProCall();
  const own = useOwnUserId();
  const userId = own.kind === 'known' ? own.userId : null;
  const listId = useId();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<{ title?: string; body?: string; field?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ProfessionalArticleItem | null>(null);
  const running = useRef(false);

  const load = useCallback(async () => {
    if (userId === null) return;
    const result = await call((token) => fetchProfessional(token, userId));
    setLoaded(result.kind === 'ok' ? { kind: 'loaded', articles: result.value.articles } : { kind: 'failed' });
  }, [call, userId]);

  useEffect(() => {
    if (own.kind === 'known' && own.userId === null) setLoaded({ kind: 'failed' });
    void load();
  }, [load, own]);

  async function once(work: () => Promise<boolean>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      if (await work()) {
        setStatus(SAVED);
        await load();
      } else setFailure(ACTION_FAILED);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (draft === null) return;
    const parsed = articleSchema.safeParse({
      title: draft.title,
      body: draft.body,
      field: isField(draft.field) ? draft.field : '',
      status: draft.hidden ? 'hidden' : 'published',
    });
    if (!parsed.success) {
      const keys = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setErrors({
        ...(keys.has('title') ? { title: ARTICLE_ERRORS.title } : {}),
        ...(keys.has('body') ? { body: ARTICLE_ERRORS.body } : {}),
        ...(keys.has('field') ? { field: FIELD_PLACEHOLDER } : {}),
      });
      return;
    }
    setErrors({});
    const { id } = draft;
    void once(async () => {
      const result = await call((token) => (id === null ? createArticle(token, parsed.data) : editArticle(token, id, parsed.data)));
      if (result.kind === 'ok') setDraft(null);
      return result.kind === 'ok';
    });
  }

  if (loaded.kind === 'loading') return <Skeleton className="h-64 w-full" />;
  if (loaded.kind === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{LOAD_FAILED}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {RETRY}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {draft === null ? (
        <div>
          <Button type="button" onClick={() => setDraft(EMPTY)}>
            {NEW_ARTICLE}
          </Button>
        </div>
      ) : (
        <form noValidate aria-label={draft.id === null ? NEW_ARTICLE : ARTICLE_EDIT} className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card" onSubmit={save}>
          <FormField label={ARTICLE_TITLE_LABEL} {...(errors.title === undefined ? {} : { error: errors.title })}>
            {(control) => <TextInput {...control} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />}
          </FormField>
          <FormField label={ARTICLE_FIELD_LABEL} {...(errors.field === undefined ? {} : { error: errors.field })}>
            {(control) => <SelectInput {...control} options={FIELD_OPTIONS} placeholder={FIELD_PLACEHOLDER} value={draft.field} onChange={(value) => setDraft({ ...draft, field: value })} />}
          </FormField>
          <FormField label={ARTICLE_BODY_LABEL} {...(errors.body === undefined ? {} : { error: errors.body })}>
            {(control) => <TextArea {...control} rows={10} dir="auto" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />}
          </FormField>
          <Checkbox checked={draft.hidden} onCheckedChange={(checked) => setDraft({ ...draft, hidden: checked })}>
            {ARTICLE_HIDDEN_LABEL}
          </Checkbox>
          <p className="text-small text-muted-foreground">{ARTICLE_DISCLAIMER}</p>
          <div className="flex gap-3">
            <Button type="submit" pending={busy}>
              {draft.id === null ? ARTICLE_PUBLISH : ARTICLE_SAVE}
            </Button>
            <Button type="button" variant="text" onClick={() => setDraft(null)}>
              {CANCEL}
            </Button>
          </div>
        </form>
      )}
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      <p role="status" className={status === '' ? 'sr-only' : 'text-label'}>
        {status}
      </p>
      <section aria-labelledby={listId}>
        <h2 id={listId} className="text-h3">
          {ARTICLES_HEADING}
        </h2>
        {loaded.articles.length === 0 ? (
          <p className="mt-2 text-muted-foreground">{NO_ARTICLES}</p>
        ) : (
          <ul aria-label={ARTICLES_HEADING} className="mt-3 flex flex-col gap-3">
            {loaded.articles.map((article) => (
              <li key={article.id} className="rounded-lg bg-card p-4 shadow-card">
                <h3 className="text-h3">{article.title}</h3>
                <p className="text-small text-muted-foreground">
                  {PROFESSIONAL_FIELD_LABELS[article.field]} · <PublishedTime iso={article.at} />
                  {article.status === 'hidden' ? ` · ${ARTICLE_HIDDEN_BADGE}` : ''}
                  {article.isTakenDown ? ` · ${ARTICLE_TAKEN_DOWN}` : ''}
                </p>
                <p className="mt-2 line-clamp-3 whitespace-pre-line">{article.body}</p>
                <div className="mt-3 flex gap-3">
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => setDraft({ id: article.id, title: article.title, body: article.body, field: article.field, hidden: article.status === 'hidden' })}
                  >
                    {ARTICLE_EDIT}
                    <span className="sr-only"> {article.title}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => setDeleting(article)}
                  >
                    {ARTICLE_DELETE}
                    <span className="sr-only"> {article.title}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={deleting !== null}
        title={ARTICLE_DELETE_CONFIRM}
        description={deleting?.title}
        confirmLabel={ARTICLE_DELETE}
        cancelLabel={CANCEL}
        pending={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          if (target === null) return;
          void once(async () => {
            const ok = (await call((token) => deleteArticle(token, target.id))).kind === 'ok';
            setDeleting(null);
            return ok;
          });
        }}
      />
    </div>
  );
}
