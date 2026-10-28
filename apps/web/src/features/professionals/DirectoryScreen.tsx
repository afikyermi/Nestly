import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { RatingLine } from '@/components/domain/star-rating';
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
  type PromotedProfessional,
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
  yearsText,
} from '@/lib/professional-texts';
import { PROMOTED_PROFESSIONALS_HEADING, SPONSORED_LABEL } from '@/lib/promotion-texts';
import { fetchDirectoryPage } from '@/services/api/professionals';
import { reportPromotionClick } from '@/services/api/promotions';

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

type Results = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; cards: ProfessionalCard[]; promoted: PromotedProfessional[] };

/** One Professional's card on the directory (the organic list and, apart, a promoted one). */
function Card({ card, badge, onOpen, promotionId }: { card: ProfessionalCard; badge?: string; onOpen?: () => void; promotionId?: string }) {
  return (
    <>
      {badge === undefined ? null : <p className="mb-1 inline-flex h-5.5 items-center rounded-sm bg-foreground px-2 text-caption font-bold text-background">{badge}</p>}
      <Link to={professionalPagePath(card.id) + (promotionId === undefined ? '' : `?promotion=${encodeURIComponent(promotionId)}`)} onClick={onOpen} className="block text-h3 text-foreground no-underline underline-offset-4 hover:underline">
        {card.fullName}
      </Link>
      {card.businessName === null ? null : <p className="text-small text-muted-foreground">{card.businessName}</p>}
      <p className="mt-1 inline-flex h-5.5 items-center rounded-sm bg-muted px-2 text-caption font-bold text-primary-strong">{fieldText(card.field, card.fieldOther)}</p>
      <p className="mt-1 text-small text-muted-foreground">
        {[yearsText(card.yearsExperience), areaText(card.area), priceText(card.priceFrom)].filter((part) => part !== null).join(' · ')}
      </p>
      <RatingLine rating={card.rating} count={card.reviewCount} className="mt-1" />
    </>
  );
}

// The directory of Professionals (FR-SERV-001/002, AC-009, FR-ALG-005): filters by field, area (a city or area from a list, §12), minimum rating,
// maximum price and minimum experience, and the order; the list is the server's (the organic order never weighs a payment). The filters live in
// this screen's memory while browsing (FR-SERV-002).
export function DirectoryScreen() {
  const call = useProCall();
  const listId = useId();
  const promotedId = useId();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [results, setResults] = useState<Results>({ kind: 'loading' });

  const latest = useRef(0);
  const load = useCallback(
    async (next: Filters) => {
      const ticket = ++latest.current;
      setResults({ kind: 'loading' });
      const result = await call((token) => fetchDirectoryPage(token, queryOf(next)));
      if (ticket !== latest.current) return;
      setResults(result.kind === 'ok' ? { kind: 'loaded', cards: result.value.professionals, promoted: result.value.promoted } : { kind: 'failed' });
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
      <form aria-label={FILTERS_LABEL} onSubmit={apply} className="grid grid-cols-1 gap-4 border-b border-divider pb-5 sm:grid-cols-2">
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

      {results.kind === 'loaded' && results.promoted.length > 0 ? (
        // FR-ALG-007, BR-005, §11.5: the promoted Professionals that match the filters, apart from the organic list, marked "ממומן"
        <section aria-labelledby={promotedId}>
          <h2 id={promotedId} className="text-h3">
            {PROMOTED_PROFESSIONALS_HEADING}
          </h2>
          <ul aria-label={PROMOTED_PROFESSIONALS_HEADING} className="mt-1 flex flex-col">
            {results.promoted.map(({ promotionId, card }) => (
              <li key={promotionId} className="border-b border-divider py-4">
                <Card card={card} promotionId={promotionId} badge={SPONSORED_LABEL} onOpen={() => void call((token) => reportPromotionClick(token, promotionId))} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
          <ul aria-label={RESULTS_LABEL} className="mt-1 flex flex-col">
            {results.cards.map((card) => (
              <li key={card.id} className="border-b border-divider py-4">
                <Card card={card} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
