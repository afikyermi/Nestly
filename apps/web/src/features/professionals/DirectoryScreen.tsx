import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  DIRECTORY_SORTS,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_AREA_LABELS,
  PROFESSIONAL_FIELDS,
  PROFESSIONAL_FIELD_LABELS,
  type DirectoryQuery,
  type DirectorySort,
  type ProfessionalArea,
  type ProfessionalCard,
  type ProfessionalField,
} from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { useProCall } from '@/hooks/use-pro-call';
import { professionalPagePath } from '@/lib/professional-link';
import {
  ANY_AREA,
  ANY_FIELD,
  ANY_RATING,
  APPLY_FILTERS,
  AREA_LABEL,
  CLEAR_FILTERS,
  FIELD_LABEL,
  FILTERS_LABEL,
  LOAD_FAILED,
  MAX_PRICE_LABEL,
  MIN_RATING_LABEL,
  MIN_YEARS_LABEL,
  NO_RESULTS,
  RESULTS_LABEL,
  RETRY,
  SORT_LABEL,
  SORT_LABELS,
  areaText,
  fieldText,
  priceText,
  ratingText,
  yearsText,
} from '@/lib/professional-texts';
import { fetchDirectory } from '@/services/api/professionals';

interface Filters {
  field: string;
  area: string;
  minRating: string;
  maxPrice: string;
  minYears: string;
  sort: string;
}

const NO_FILTERS: Filters = { field: '', area: '', minRating: '', maxPrice: '', minYears: '', sort: 'match' };

const isField = (value: string): value is ProfessionalField => PROFESSIONAL_FIELDS.some((field) => field === value);
const isArea = (value: string): value is ProfessionalArea => PROFESSIONAL_AREAS.some((area) => area === value);
const isSort = (value: string): value is DirectorySort => DIRECTORY_SORTS.some((sort) => sort === value);
const digits = (value: string): string | undefined => (/^\d{1,6}$/.test(value.trim()) ? value.trim() : undefined);

/** The query the server takes; an empty or malformed filter is no filter. */
function queryOf(filters: Filters): DirectoryQuery {
  const query: DirectoryQuery = {};
  if (isField(filters.field)) query.field = filters.field;
  if (isArea(filters.area)) query.area = filters.area;
  const rating = digits(filters.minRating);
  if (rating !== undefined) query.minRating = Number(rating);
  const price = digits(filters.maxPrice);
  if (price !== undefined) query.maxPrice = Number(price);
  const years = digits(filters.minYears);
  if (years !== undefined) query.minYears = Number(years);
  if (isSort(filters.sort)) query.sort = filters.sort;
  return query;
}

const FIELD_OPTIONS = PROFESSIONAL_FIELDS.map((value) => ({ value, label: PROFESSIONAL_FIELD_LABELS[value] }));
const AREA_OPTIONS = PROFESSIONAL_AREAS.map((value) => ({ value, label: PROFESSIONAL_AREA_LABELS[value] }));
const RATING_OPTIONS = [4, 3, 2].map((value) => ({ value: String(value), label: `${value} ומעלה` }));
const SORT_OPTIONS = DIRECTORY_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }));

type Results = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; cards: ProfessionalCard[] };

// The directory of Professionals (FR-SERV-001/002, AC-009, FR-ALG-005): filters by field, area (a city or area from a list, §12), minimum rating,
// maximum price and minimum experience, and the order; the list is the server's (the organic order never weighs a payment). The filters live in
// this screen's memory while browsing (FR-SERV-002).
export function DirectoryScreen() {
  const call = useProCall();
  const listId = useId();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [results, setResults] = useState<Results>({ kind: 'loading' });

  const load = useCallback(
    async (next: Filters) => {
      setResults({ kind: 'loading' });
      const result = await call((token) => fetchDirectory(token, queryOf(next)));
      setResults(result.kind === 'ok' ? { kind: 'loaded', cards: result.value } : { kind: 'failed' });
    },
    [call],
  );

  useEffect(() => {
    void load(applied);
  }, [load, applied]);

  const set = (key: keyof Filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied({ ...filters });
  }

  return (
    <div className="flex flex-col gap-6">
      <form aria-label={FILTERS_LABEL} onSubmit={apply} className="grid grid-cols-1 gap-4 rounded-lg bg-card p-4 shadow-card sm:grid-cols-2">
        <FormField label={FIELD_LABEL}>
          {(control) => <SelectInput {...control} options={FIELD_OPTIONS} placeholder={ANY_FIELD} value={filters.field} onChange={set('field')} />}
        </FormField>
        <FormField label={AREA_LABEL}>
          {(control) => <SelectInput {...control} options={AREA_OPTIONS} placeholder={ANY_AREA} value={filters.area} onChange={set('area')} />}
        </FormField>
        <FormField label={MIN_RATING_LABEL}>
          {(control) => <SelectInput {...control} options={RATING_OPTIONS} placeholder={ANY_RATING} value={filters.minRating} onChange={set('minRating')} />}
        </FormField>
        <FormField label={MAX_PRICE_LABEL}>
          {(control) => <TextInput {...control} dir="ltr" value={filters.maxPrice} onChange={(event) => set('maxPrice')(event.target.value)} />}
        </FormField>
        <FormField label={MIN_YEARS_LABEL}>
          {(control) => <TextInput {...control} dir="ltr" value={filters.minYears} onChange={(event) => set('minYears')(event.target.value)} />}
        </FormField>
        <FormField label={SORT_LABEL}>
          {(control) => <SelectInput {...control} options={SORT_OPTIONS} placeholder={SORT_LABELS.match} value={filters.sort} onChange={set('sort')} />}
        </FormField>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit">{APPLY_FILTERS}</Button>
          <Button
            type="button"
            variant="soft"
            onClick={() => {
              setFilters(NO_FILTERS);
              setApplied(NO_FILTERS);
            }}
          >
            {CLEAR_FILTERS}
          </Button>
        </div>
      </form>

      <section aria-labelledby={listId} aria-busy={results.kind === 'loading'}>
        <h2 id={listId} className="text-h3">
          {RESULTS_LABEL}
        </h2>
        {results.kind === 'failed' ? (
          <div className="mt-3 flex flex-col gap-3">
            <InlineAlert>{LOAD_FAILED}</InlineAlert>
            <Button type="button" variant="soft" className="self-start" onClick={() => void load(applied)}>
              {RETRY}
            </Button>
          </div>
        ) : null}
        {results.kind === 'loaded' && results.cards.length === 0 ? <p className="mt-2 text-muted-foreground">{NO_RESULTS}</p> : null}
        {results.kind === 'loaded' && results.cards.length > 0 ? (
          <ul aria-label={RESULTS_LABEL} className="mt-3 flex flex-col gap-3">
            {results.cards.map((card) => (
              <li key={card.id} className="rounded-lg bg-card p-4 shadow-card">
                <Link to={professionalPagePath(card.id)} className="text-h3 text-primary-strong underline-offset-4 hover:underline">
                  {card.fullName}
                </Link>
                {card.businessName === null ? null : <p className="text-small text-muted-foreground">{card.businessName}</p>}
                <p className="mt-1 text-label">{fieldText(card.field, card.fieldOther)}</p>
                <p className="mt-1 text-small text-muted-foreground">
                  {[yearsText(card.yearsExperience), areaText(card.area), priceText(card.priceFrom)].filter((part) => part !== null).join(' · ')}
                </p>
                <p className="mt-1 text-small">{ratingText(card.rating, card.reviewCount)}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
