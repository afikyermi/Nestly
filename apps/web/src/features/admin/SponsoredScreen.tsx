import { useCallback, useEffect, useId, useState } from 'react';
import { LISTING_CATEGORIES, LISTING_CATEGORY_LABELS, sponsoredSchema, type SponsoredInput, type SponsoredItem } from '@nestly/shared';
import { ImagesPicker } from '@/components/domain/images-picker';
import { MarketplaceCard } from '@/components/domain/marketplace-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { usePickedImages } from '@/hooks/use-picked-images';
import {
  CANCEL_LABEL,
  CATEGORY_LABEL,
  CHOOSE,
  SPONSORED_BADGE,
  SPONSORED_CREATE,
  SPONSORED_DESCRIPTION_LABEL,
  SPONSORED_EDIT,
  SPONSORED_EMPTY,
  SPONSORED_ERRORS,
  SPONSORED_IMAGE_LABEL,
  SPONSORED_INTRO,
  SPONSORED_LINK_LABEL,
  SPONSORED_NEW_HEADING,
  SPONSORED_PAUSE,
  SPONSORED_PUBLISH,
  SPONSORED_REMOVE,
  SPONSORED_REMOVE_CONFIRM_TEXT,
  SPONSORED_REMOVE_CONFIRM_TITLE,
  SPONSORED_SAVE,
  SPONSORED_SAVED,
  SPONSORED_SPONSOR_LABEL,
  SPONSORED_STATUS_LABELS,
  SPONSORED_TITLE_LABEL,
  categoryText,
  imageAltOf,
  sponsorText,
} from '@/lib/marketplace-texts';
import type { AdminOutcome } from '@/services/api/admin';
import { createSponsored, editSponsored, fetchSponsored, setSponsoredStatus } from '@/services/api/marketplace';
import { ACTION_FAILED_TEXT, FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, NOT_FOUND_TEXT, RETRY_LABEL } from './admin-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; items: SponsoredItem[] };
interface Values {
  sponsorName: string;
  title: string;
  description: string;
  category: string;
  linkUrl: string;
}
type Field = keyof Values;
const FIELDS: readonly Field[] = ['sponsorName', 'title', 'description', 'category', 'linkUrl'];
const fieldOf = (value: unknown): Field | undefined => FIELDS.find((field) => field === value);
const EMPTY: Values = { sponsorName: '', title: '', description: '', category: '', linkUrl: '' };
const CATEGORY_OPTIONS = LISTING_CATEGORIES.map((value) => ({ value, label: LISTING_CATEGORY_LABELS[value] }));

const failureText = (outcome: AdminOutcome<unknown>): string =>
  outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : outcome.kind === 'not-found' ? NOT_FOUND_TEXT : ACTION_FAILED_TEXT;

const inputOf = (values: Values, imageId: string | null): unknown => ({
  sponsorName: values.sponsorName,
  title: values.title,
  description: values.description.trim() === '' ? null : values.description,
  category: values.category,
  linkUrl: values.linkUrl.trim() === '' ? null : values.linkUrl.trim(),
  imageId,
});

function check(input: unknown): { body: SponsoredInput } | { problems: Partial<Record<Field, string>> } {
  const parsed = sponsoredSchema.safeParse(input);
  if (parsed.success) return { body: parsed.data };
  const problems: Partial<Record<Field, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = fieldOf(issue.path[0]);
    if (field !== undefined && problems[field] === undefined) problems[field] = SPONSORED_ERRORS[issue.message] ?? ACTION_FAILED_TEXT;
  }
  return { problems };
}

// Sponsored Products (FR-ADMIN-009, BR-046, AC-058; SPONSORED_PRODUCT_MANAGE, Admin Only): create a draft with one picture, edit, publish, pause and
// remove (final, asked first). The Marketplace shows a published one marked "ממומן", apart from the users' listings (BR-005, AC-020). Every change
// is audited by the database. A demo coupon is an ordinary product whose description says "דוגמה" (OP-023).
export function SponsoredScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const outcome = await call((token) => fetchSponsored(token));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', items: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaced = (item: SponsoredItem) => {
    setNotice(SPONSORED_SAVED);
    setView((now) => (now.kind === 'loaded' ? { kind: 'loaded', items: now.items.map((row) => (row.id === item.id ? item : row)) } : now));
  };

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <p className="text-small text-muted-foreground">{SPONSORED_INTRO}</p>
      <ProductForm
        heading={SPONSORED_NEW_HEADING}
        submitLabel={SPONSORED_CREATE}
        initial={EMPTY}
        onSubmit={(body) => call((token) => createSponsored(token, body))}
        onSaved={(item) => {
          setNotice(SPONSORED_SAVED);
          setView((now) => (now.kind === 'loaded' ? { kind: 'loaded', items: [item, ...now.items] } : now));
        }}
      />
      <p role="status" className="text-small">
        {notice}
      </p>
      {view.items.length === 0 ? (
        <p>{SPONSORED_EMPTY}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {view.items.map((item) => (
            <li key={item.id}>
              <ProductCard item={item} onChanged={replaced} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductForm({
  heading,
  submitLabel,
  initial,
  hasImage = false,
  onSubmit,
  onSaved,
  onCancel,
}: {
  heading?: string;
  submitLabel: string;
  initial: Values;
  hasImage?: boolean;
  onSubmit: (body: SponsoredInput) => Promise<AdminOutcome<SponsoredItem>>;
  onSaved: (item: SponsoredItem) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<Values>(initial);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picture = usePickedImages('sponsored', hasImage ? 0 : 1);
  const input = inputOf(values, picture.ids[0] ?? null);
  const result = check(input);
  const problems = checked && 'problems' in result ? result.problems : {};
  const set = (key: Field) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setChecked(true);
    if (!('body' in result) || busy || picture.busy) return;
    setBusy(true);
    setError('');
    const outcome = await onSubmit(result.body);
    setBusy(false);
    if (outcome.kind === 'ok') {
      setValues(initial);
      setChecked(false);
      onSaved(outcome.value);
    } else {
      setError(failureText(outcome));
    }
  };

  return (
    <section aria-labelledby={heading === undefined ? undefined : `${id}-h`} className="flex flex-col gap-3">
      {heading === undefined ? null : (
        <h3 id={`${id}-h`} className="text-h4">
          {heading}
        </h3>
      )}
      <FormField label={SPONSORED_SPONSOR_LABEL} {...(problems.sponsorName === undefined ? {} : { error: problems.sponsorName })}>
        {(control) => <TextInput {...control} value={values.sponsorName} onChange={(event) => set('sponsorName')(event.target.value)} />}
      </FormField>
      <FormField label={SPONSORED_TITLE_LABEL} {...(problems.title === undefined ? {} : { error: problems.title })}>
        {(control) => <TextInput {...control} value={values.title} onChange={(event) => set('title')(event.target.value)} />}
      </FormField>
      <FormField label={SPONSORED_DESCRIPTION_LABEL} optional {...(problems.description === undefined ? {} : { error: problems.description })}>
        {(control) => <TextArea {...control} rows={3} dir="auto" value={values.description} onChange={(event) => set('description')(event.target.value)} />}
      </FormField>
      <FormField label={CATEGORY_LABEL} {...(problems.category === undefined ? {} : { error: problems.category })}>
        {(control) => <SelectInput {...control} options={CATEGORY_OPTIONS} placeholder={CHOOSE} value={values.category} onChange={set('category')} />}
      </FormField>
      <FormField label={SPONSORED_LINK_LABEL} optional {...(problems.linkUrl === undefined ? {} : { error: problems.linkUrl })}>
        {(control) => <TextInput {...control} dir="ltr" value={values.linkUrl} onChange={(event) => set('linkUrl')(event.target.value)} />}
      </FormField>
      {hasImage ? null : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label">{SPONSORED_IMAGE_LABEL}</legend>
          <ImagesPicker items={picture.items} error={picture.error} full={picture.items.length >= 1} onAdd={picture.add} onRemove={picture.remove} />
        </fieldset>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" pending={busy} disabled={busy || picture.busy} onClick={() => void submit()}>
          {submitLabel}
        </Button>
        {onCancel === undefined ? null : (
          <Button variant="text" onClick={onCancel}>
            {CANCEL_LABEL}
          </Button>
        )}
      </div>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
    </section>
  );
}

function ProductCard({ item, onChanged }: { item: SponsoredItem; onChanged: (item: SponsoredItem) => void }) {
  const call = useAdminCall();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const status = async (next: 'published' | 'paused' | 'removed') => {
    setBusy(true);
    setError('');
    const outcome = await call((token) => setSponsoredStatus(token, item.id, next));
    setBusy(false);
    setConfirming(false);
    if (outcome.kind === 'ok') onChanged(outcome.value);
    else setError(failureText(outcome));
  };

  if (editing) {
    return (
      <ProductForm
        submitLabel={SPONSORED_SAVE}
        initial={{ sponsorName: item.sponsorName, title: item.title, description: item.description ?? '', category: item.category, linkUrl: item.linkUrl ?? '' }}
        hasImage={item.image !== null}
        onSubmit={(body) => call((token) => editSponsored(token, item.id, body))}
        onSaved={(saved) => {
          setEditing(false);
          onChanged(saved);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <MarketplaceCard
        variant="sponsored"
        title={<h4 dir="auto">{item.title}</h4>}
        image={item.image}
        imageAlt={imageAltOf(item.title, 0, 1)}
        meta={`${sponsorText(item.sponsorName)} · ${categoryText(item.category)}`}
        badges={[SPONSORED_BADGE, SPONSORED_STATUS_LABELS[item.status]]}
        footer={
          <>
            {item.description === null ? null : (
              <p className="text-small whitespace-pre-wrap" dir="auto">
                {item.description}
              </p>
            )}
            {item.status === 'removed' ? null : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="soft" disabled={busy} onClick={() => setEditing(true)}>
                  {SPONSORED_EDIT}
                </Button>
                {item.status === 'published' ? (
                  <Button variant="soft" pending={busy} disabled={busy} onClick={() => void status('paused')}>
                    {SPONSORED_PAUSE}
                  </Button>
                ) : (
                  <Button variant="primary" pending={busy} disabled={busy} onClick={() => void status('published')}>
                    {SPONSORED_PUBLISH}
                  </Button>
                )}
                <Button variant="text" disabled={busy} onClick={() => setConfirming(true)}>
                  {SPONSORED_REMOVE}
                </Button>
              </div>
            )}
            {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
          </>
        }
      />
      <ConfirmDialog
        open={confirming}
        title={SPONSORED_REMOVE_CONFIRM_TITLE}
        description={SPONSORED_REMOVE_CONFIRM_TEXT}
        confirmLabel={SPONSORED_REMOVE}
        cancelLabel={CANCEL_LABEL}
        pending={busy}
        onConfirm={() => void status('removed')}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </>
  );
}
