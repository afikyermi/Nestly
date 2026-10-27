import { formatRelativeTime } from '@/lib/format-relative-time';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITIONS,
  LISTING_CONDITION_LABELS,
  MARKETPLACE_SORTS,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_AREA_LABELS,
  type ListingCard,
  type MarketplaceFilters,
  type PromotedListing,
  type SponsoredCard,
} from '@nestly/shared';
import { MarketplaceCard } from '@/components/domain/marketplace-card';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { useProCall } from '@/hooks/use-pro-call';
import { listingPath } from '@/lib/marketplace-link';
import { PROMOTED_LISTINGS_HEADING, PROMOTED_LISTING_LABEL } from '@/lib/promotion-texts';
import { reportPromotionClick } from '@/services/api/promotions';
import {
  ANY_CATEGORY,
  ANY_CITY,
  ANY_CONDITION,
  APPLY_FILTERS,
  CATEGORY_LABEL,
  CITY_LABEL,
  CLEAR_FILTERS,
  CONDITION_LABEL,
  FILTERS_LABEL,
  FREE_ONLY_LABEL,
  LOAD_FAILED,
  MAX_PRICE_LABEL,
  NEW_TAB_NOTE,
  NO_RESULTS,
  RESULTS_LABEL,
  RETRY,
  SEARCH_LABEL,
  SORT_LABEL,
  SORT_LABELS,
  SPONSOR_LINK_LABEL,
  SPONSORED_BADGE,
  SPONSORED_HEADING,
  categoryText,
  cityText,
  conditionText,
  imageAltOf,
  priceText,
  sellerText,
  sponsorText,
} from '@/lib/marketplace-texts';
import { fetchMarketplace } from '@/services/api/marketplace';

interface Filters {
  q: string;
  category: string;
  city: string;
  condition: string;
  maxPrice: string;
  free: boolean;
  sort: string;
}

const MORE_FILTERS_LABEL = 'עוד אפשרויות סינון';
const FEWER_FILTERS_LABEL = 'פחות אפשרויות סינון';

const NO_FILTERS: Filters = { q: '', category: '', city: '', condition: '', maxPrice: '', free: false, sort: 'match' };

/** What the server takes: an empty or malformed filter is no filter (the server checks every value again). */
function queryOf(filters: Filters): MarketplaceFilters {
  const pick = <T extends string>(list: readonly T[], value: string): T | undefined => list.find((item) => item === value);
  const price = /^\d{1,6}$/.test(filters.maxPrice.trim()) ? filters.maxPrice.trim() : undefined;
  const q = filters.q.trim();
  return {
    ...(q === '' ? {} : { q }),
    ...(pick(LISTING_CATEGORIES, filters.category) === undefined ? {} : { category: pick(LISTING_CATEGORIES, filters.category) }),
    ...(pick(PROFESSIONAL_AREAS, filters.city) === undefined ? {} : { city: pick(PROFESSIONAL_AREAS, filters.city) }),
    ...(pick(LISTING_CONDITIONS, filters.condition) === undefined ? {} : { condition: pick(LISTING_CONDITIONS, filters.condition) }),
    ...(price === undefined ? {} : { maxPrice: price }),
    ...(filters.free ? { free: '1' as const } : {}),
    ...(pick(MARKETPLACE_SORTS, filters.sort) === undefined ? {} : { sort: pick(MARKETPLACE_SORTS, filters.sort) }),
  };
}

const CATEGORY_OPTIONS = LISTING_CATEGORIES.map((value) => ({ value, label: LISTING_CATEGORY_LABELS[value] }));
const CITY_OPTIONS = PROFESSIONAL_AREAS.map((value) => ({ value, label: PROFESSIONAL_AREA_LABELS[value] }));
const CONDITION_OPTIONS = LISTING_CONDITIONS.map((value) => ({ value, label: LISTING_CONDITION_LABELS[value] }));
const SORT_OPTIONS = MARKETPLACE_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }));

type Results = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; listings: ListingCard[]; sponsored: SponsoredCard[]; promoted: PromotedListing[] };

// The Marketplace (FR-MKT-001, FR-ALG-006, PG-010): a product search, filters by category, city or area (§12), condition, maximum price and "for
// free only", the order, the user's listings and - apart from them, always marked "ממומן" (BR-005, AC-008, AC-020) - up to three Sponsored
// Products. Each listing opens its page (FR-MKT-005). The filters live in this screen's memory while browsing.
export function MarketplaceScreen() {
  const call = useProCall();
  const listId = useId();
  const sponsoredId = useId();
  const promotedId = useId();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  // Below 640 the search field and the actions show, and the other filters open on request (redesign 27.10.2026: the list comes first).
  const [moreFilters, setMoreFilters] = useState(false);
  const [results, setResults] = useState<Results>({ kind: 'loading' });
  const latest = useRef(0);

  const load = useCallback(
    async (next: Filters) => {
      const ticket = ++latest.current;
      setResults({ kind: 'loading' });
      const result = await call((token) => fetchMarketplace(token, queryOf(next)));
      if (ticket !== latest.current) return;
      setResults(
        result.kind === 'ok'
          ? { kind: 'loaded', listings: result.value.listings, sponsored: result.value.sponsored, promoted: result.value.promoted }
          : { kind: 'failed' },
      );
    },
    [call],
  );

  useEffect(() => {
    void load(applied);
  }, [load, applied]);

  const set = (key: Exclude<keyof Filters, 'free'>) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied({ ...filters });
  }

  return (
    <div className="flex flex-col gap-6">
      <form aria-label={FILTERS_LABEL} onSubmit={apply} className="grid grid-cols-1 gap-4 border-b border-divider pb-5 sm:grid-cols-2">
        <FormField label={SEARCH_LABEL} className="sm:col-span-2">
          {(control) => <TextInput {...control} value={filters.q} onChange={(event) => set('q')(event.target.value)} />}
        </FormField>
        <Button type="button" variant="soft" className="justify-self-start sm:hidden" aria-expanded={moreFilters} onClick={() => setMoreFilters((open) => !open)}>
          {moreFilters ? FEWER_FILTERS_LABEL : MORE_FILTERS_LABEL}
        </Button>
        <div className={moreFilters ? 'contents' : 'hidden sm:contents'}>
        <FormField label={CATEGORY_LABEL}>
          {(control) => <SelectInput {...control} options={CATEGORY_OPTIONS} placeholder={ANY_CATEGORY} value={filters.category} onChange={set('category')} />}
        </FormField>
        <FormField label={CITY_LABEL}>
          {(control) => <SelectInput {...control} options={CITY_OPTIONS} placeholder={ANY_CITY} value={filters.city} onChange={set('city')} />}
        </FormField>
        <FormField label={CONDITION_LABEL}>
          {(control) => <SelectInput {...control} options={CONDITION_OPTIONS} placeholder={ANY_CONDITION} value={filters.condition} onChange={set('condition')} />}
        </FormField>
        <FormField label={MAX_PRICE_LABEL}>
          {(control) => <TextInput {...control} dir="ltr" value={filters.maxPrice} onChange={(event) => set('maxPrice')(event.target.value)} />}
        </FormField>
        <FormField label={SORT_LABEL}>
          {(control) => <SelectInput {...control} options={SORT_OPTIONS} placeholder={SORT_LABELS.match} value={filters.sort} onChange={set('sort')} />}
        </FormField>
        <div className="flex items-end">
          <Checkbox checked={filters.free} onCheckedChange={(free) => setFilters((current) => ({ ...current, free }))}>
            {FREE_ONLY_LABEL}
          </Checkbox>
        </div>
        </div>
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
        // FR-MKT-004, §11.3, §11.5: the promoted listings that match the search and the filters, at the top, each marked "מודעה מקודמת"
        <section aria-labelledby={promotedId}>
          <h2 id={promotedId} className="text-h3">
            {PROMOTED_LISTINGS_HEADING}
          </h2>
          <ul aria-label={PROMOTED_LISTINGS_HEADING} className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-5 lg:grid-cols-3">
            {results.promoted.map(({ promotionId, listing }) => (
              <li key={promotionId}>
                <MarketplaceCard
                  variant="listing"
                  layout="tile"
                  title={
                    <Link
                      to={listingPath(listing.id)}
                      className="text-foreground no-underline underline-offset-4 hover:underline"
                      dir="auto"
                      onClick={() => void call((token) => reportPromotionClick(token, promotionId))}
                    >
                      {listing.title}
                    </Link>
                  }
                  image={listing.image}
                  imageAlt={imageAltOf(listing.title, 0, 1)}
                  price={priceText(listing.price)}
                  meta={[conditionText(listing.condition), cityText(listing.city), sellerText(listing.sellerName)].join(' · ')}
                  badges={[PROMOTED_LISTING_LABEL]}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.kind === 'loaded' && results.sponsored.length > 0 ? (
        <section aria-labelledby={sponsoredId} className="rounded-lg bg-warm p-4">
          <h2 id={sponsoredId} className="text-caption font-bold text-warm-foreground">
            {SPONSORED_HEADING}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {results.sponsored.map((unit) => (
              <li key={unit.id}>
                <MarketplaceCard
                  variant="sponsored"
                  title={<h3 dir="auto">{unit.title}</h3>}
                  image={unit.image}
                  imageAlt={imageAltOf(unit.title, 0, 1)}
                  meta={`${sponsorText(unit.sponsorName)} · ${categoryText(unit.category)}`}
                  badges={[SPONSORED_BADGE]}
                  footer={
                    <>
                      {unit.description === null ? null : (
                        <p className="text-small whitespace-pre-wrap" dir="auto">
                          {unit.description}
                        </p>
                      )}
                      {unit.linkUrl === null ? null : (
                        <a href={unit.linkUrl} target="_blank" rel="noopener noreferrer sponsored" className="self-start text-small">
                          {SPONSOR_LINK_LABEL} <span className="sr-only">{NEW_TAB_NOTE}</span>
                        </a>
                      )}
                    </>
                  }
                />
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
        {results.kind === 'loaded' && results.listings.length === 0 ? <p className="mt-2 text-muted-foreground">{NO_RESULTS}</p> : null}
        {results.kind === 'loaded' && results.listings.length > 0 ? (
          <ul aria-label={RESULTS_LABEL} className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-5 lg:grid-cols-3">
            {results.listings.map((listing) => (
              <li key={listing.id}>
                <MarketplaceCard
                  variant="listing"
                  layout="tile"
                  title={
                    <Link to={listingPath(listing.id)} className="text-foreground no-underline underline-offset-4 hover:underline" dir="auto">
                      {listing.title}
                    </Link>
                  }
                  image={listing.image}
                  imageAlt={imageAltOf(listing.title, 0, 1)}
                  price={priceText(listing.price)}
                  meta={[conditionText(listing.condition), cityText(listing.city), sellerText(listing.sellerName), formatRelativeTime(listing.createdAt)].join(' · ')}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
