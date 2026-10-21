import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITIONS,
  LISTING_CONDITION_LABELS,
  LISTING_MAX_IMAGES,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_AREA_LABELS,
  listingSchema,
  type ListingInput,
  type MediaImage,
} from '@nestly/shared';
import { ImagesPicker } from '@/components/domain/images-picker';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { MediaTile } from '@/components/shared/media-tile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CloseIcon } from '@/components/ui/icons';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextInput } from '@/components/ui/text-input';
import { usePickedImages } from '@/hooks/use-picked-images';
import { useProCall } from '@/hooks/use-pro-call';
import { listingPath } from '@/lib/marketplace-link';
import {
  CATEGORY_LABEL,
  CHOOSE,
  CITY_LABEL,
  CONDITION_LABEL,
  FORM_ERRORS,
  GIVE_AWAY_LABEL,
  IMAGES_HINT,
  IMAGE_IN_REVIEW,
  IMAGES_LABEL,
  LISTING_GONE,
  LOAD_FAILED,
  NOT_REGULAR_TEXT,
  PRICE_HINT,
  PRICE_LABEL,
  REMOVE_EXISTING_IMAGE,
  SAVE_CHANGES,
  SAVE_FAILED,
  SAVE_LISTING,
  TITLE_LABEL,
  imageAltOf,
} from '@/lib/marketplace-texts';
import { createListing, deleteListingImage, editListing, fetchListing } from '@/services/api/marketplace';

interface Values {
  title: string;
  category: string;
  condition: string;
  price: string;
  free: boolean;
  city: string;
}
type Field = 'title' | 'category' | 'condition' | 'price' | 'city' | 'imageIds';
const FIELDS: readonly Field[] = ['title', 'category', 'condition', 'price', 'city', 'imageIds'];
const fieldOf = (value: unknown): Field | undefined => FIELDS.find((field) => field === value);
const EMPTY: Values = { title: '', category: '', condition: '', price: '', free: false, city: '' };

const CATEGORY_OPTIONS = LISTING_CATEGORIES.map((value) => ({ value, label: LISTING_CATEGORY_LABELS[value] }));
const CONDITION_OPTIONS = LISTING_CONDITIONS.map((value) => ({ value, label: LISTING_CONDITION_LABELS[value] }));
const CITY_OPTIONS = PROFESSIONAL_AREAS.map((value) => ({ value, label: PROFESSIONAL_AREA_LABELS[value] }));

/** The body the server takes, as the shared schema reads it (a typed number; "למסירה" is null). */
function inputOf(values: Values, imageIds: string[]): unknown {
  const price = values.free ? null : /^\d{1,6}$/.test(values.price.trim()) ? Number(values.price.trim()) : values.price.trim() === '' ? undefined : NaN;
  return { title: values.title, category: values.category, condition: values.condition, price, city: values.city, imageIds };
}

/** The shared rule's problems, by field (the message is the code the form shows). */
function problemsOf(input: unknown): Partial<Record<Field, string>> {
  const checked = listingSchema.safeParse(input);
  if (checked.success) return {};
  const out: Partial<Record<Field, string>> = {};
  for (const issue of checked.error.issues) {
    const field = fieldOf(issue.path[0]);
    if (field !== undefined && out[field] === undefined) out[field] = FORM_ERRORS[issue.message] ?? FORM_ERRORS[`${field}_required`] ?? FORM_ERRORS.price_invalid ?? SAVE_FAILED;
  }
  return out;
}

type Loaded = { kind: 'loading' } | { kind: 'gone' } | { kind: 'failed' } | { kind: 'ready'; images: MediaImage[] };

// Create or edit a listing (FR-MKT-002, VAL-041; decisions §3 item 11): title, category, condition, a price or "למסירה", a city or area from the
// list (§12) and up to 6 pictures, each checked before others see it. No description field (§3.11). The shared rule checks before sending and
// the server checks again; the database decides who may publish (a Regular account) and edit (the owner).
export function ListingFormScreen({ listingId }: { listingId?: string }) {
  const call = useProCall();
  const navigate = useNavigate();
  const editing = listingId !== undefined;
  const [values, setValues] = useState<Values>(EMPTY);
  const [loaded, setLoaded] = useState<Loaded>(editing ? { kind: 'loading' } : { kind: 'ready', images: [] });
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const existing = loaded.kind === 'ready' ? loaded.images : [];
  const pictures = usePickedImages('listing', Math.max(0, LISTING_MAX_IMAGES - existing.length));

  const load = useCallback(async () => {
    if (listingId === undefined) return;
    const result = await call((token) => fetchListing(token, listingId));
    if (result.kind !== 'ok') return setLoaded(result.kind === 'unavailable' ? { kind: 'gone' } : { kind: 'failed' });
    const page = result.value;
    if (!page.isMine) return setLoaded({ kind: 'gone' });
    setValues({ title: page.title, category: page.category, condition: page.condition, price: page.price === null ? '' : String(page.price), free: page.price === null, city: page.city });
    setLoaded({ kind: 'ready', images: page.images });
  }, [call, listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const input = inputOf(values, pictures.ids);
  const problems = checked ? problemsOf(input) : {};
  const set = (key: keyof Values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setChecked(true);
    const parsed = listingSchema.safeParse(input);
    if (busy || pictures.busy || !parsed.success) return;
    setBusy(true);
    setFailure('');
    const body: ListingInput = parsed.data;
    const result = listingId === undefined ? await call((token) => createListing(token, body)) : await call((token) => editListing(token, listingId, body));
    setBusy(false);
    if (result.kind === 'ok') {
      void navigate(listingPath(typeof result.value === 'string' ? result.value : (listingId ?? '')), { replace: true });
      return;
    }
    setFailure(result.kind === 'not-allowed' ? NOT_REGULAR_TEXT : SAVE_FAILED);
  }

  async function dropExisting(imageId: string) {
    if (listingId === undefined) return;
    const result = await call((token) => deleteListingImage(token, listingId, imageId));
    if (result.kind === 'ok') setLoaded((now) => (now.kind === 'ready' ? { kind: 'ready', images: now.images.filter((image) => image.id !== imageId) } : now));
    else setFailure(result.kind === 'unavailable' ? IMAGE_IN_REVIEW : SAVE_FAILED);
  }

  if (loaded.kind === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (loaded.kind !== 'ready') return <InlineAlert>{loaded.kind === 'gone' ? LISTING_GONE : LOAD_FAILED}</InlineAlert>;

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card">
      <FormField label={TITLE_LABEL} {...(problems.title === undefined ? {} : { error: problems.title })}>
        {(control) => <TextInput {...control} value={values.title} onChange={(event) => set('title')(event.target.value)} />}
      </FormField>
      <FormField label={CATEGORY_LABEL} {...(problems.category === undefined ? {} : { error: problems.category })}>
        {(control) => <SelectInput {...control} options={CATEGORY_OPTIONS} placeholder={CHOOSE} value={values.category} onChange={set('category')} />}
      </FormField>
      <FormField label={CONDITION_LABEL} {...(problems.condition === undefined ? {} : { error: problems.condition })}>
        {(control) => <SelectInput {...control} options={CONDITION_OPTIONS} placeholder={CHOOSE} value={values.condition} onChange={set('condition')} />}
      </FormField>
      <Checkbox checked={values.free} onCheckedChange={(free) => setValues((current) => ({ ...current, free }))}>
        {GIVE_AWAY_LABEL}
      </Checkbox>
      {values.free ? null : (
        <FormField label={PRICE_LABEL} hint={PRICE_HINT} {...(problems.price === undefined ? {} : { error: problems.price })}>
          {(control) => <TextInput {...control} dir="ltr" value={values.price} onChange={(event) => set('price')(event.target.value)} />}
        </FormField>
      )}
      <FormField label={CITY_LABEL} {...(problems.city === undefined ? {} : { error: problems.city })}>
        {(control) => <SelectInput {...control} options={CITY_OPTIONS} placeholder={CHOOSE} value={values.city} onChange={set('city')} />}
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label">{IMAGES_LABEL}</legend>
        <p className="text-small text-muted-foreground">{IMAGES_HINT}</p>
        {existing.length === 0 ? null : (
          <ul className="grid grid-cols-3 gap-2">
            {existing.map((image, index) => (
              <li key={image.id} className="relative">
                <MediaTile image={image} alt={imageAltOf(values.title, index, existing.length)} className="aspect-square w-full" />
                {image.state === 'rejected' ? null : (
                  <Button iconOnly label={`${REMOVE_EXISTING_IMAGE} ${index + 1}`} className="absolute end-2 bottom-2 bg-card" onClick={() => void dropExisting(image.id)}>
                    <CloseIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <ImagesPicker
          items={pictures.items}
          error={pictures.error ?? problems.imageIds ?? null}
          full={existing.length + pictures.items.length >= LISTING_MAX_IMAGES}
          onAdd={pictures.add}
          onRemove={pictures.remove}
        />
      </fieldset>
      {failure === '' ? null : <InlineAlert>{failure}</InlineAlert>}
      <Button type="submit" className="self-start" pending={busy} disabled={busy || pictures.busy}>
        {editing ? SAVE_CHANGES : SAVE_LISTING}
      </Button>
    </form>
  );
}
