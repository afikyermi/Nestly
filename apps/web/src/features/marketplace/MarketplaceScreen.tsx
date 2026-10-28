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
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { CheckIcon, ChevronDownIcon, SearchIcon } from '@/components/ui/icons';
import { useProCall } from '@/hooks/use-pro-call';
import { cn } from '@/lib/cn';
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

// A filter chip (redesign 27.10.2026): a pill with the `input` border; one whose value is not its default is selected - a primary
// outline on the subtle brand surface.
function chipStyles(selected: boolean): string {
  return cn(
    'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-small transition-colors duration-fast ease-standard',
    selected
      ? 'border-primary bg-brand-subtle font-bold text-badge-foreground ring-1 ring-primary ring-inset'
      : 'border-input bg-card text-foreground hover:bg-muted',
  );
}

interface ChipSelectProps {
  /** The accessible name (the filter's label); the chip itself shows the chosen option. */
  label: string;
  options: { value: string; label: string }[];
  /** The first option, with value `""`. */
  placeholder: string;
  value: string;
  /** Default: any value other than `""`. */
  selected?: boolean;
  onChange: (value: string) => void;
}

// A native <select> drawn as a chip, so the platform picker, the keyboard and the screen reader work as with any select.
function ChipSelect({ label, options, placeholder, value, selected = value !== '', onChange }: ChipSelectProps) {
  return (
    <div className="relative shrink-0">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(chipStyles(selected), 'cursor-pointer appearance-none pe-9')}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className={cn('pointer-events-none absolute end-3 top-1/2 size-4.5 -translate-y-1/2', selected ? 'text-badge-foreground' : 'text-muted-foreground')}
      />
    </div>
  );
}

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
      {/* Redesign 27.10.2026: a pill search field, one row of filter chips (it scrolls sideways on a phone and wraps from 640; the
          padding keeps the focus ring inside the scroll box), and the two actions. Nothing applies until "הצגה". */}
      <form aria-label={FILTERS_LABEL} onSubmit={apply} className="flex flex-col gap-3 border-b border-divider pb-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label={SEARCH_LABEL}
            placeholder={SEARCH_LABEL}
            value={filters.q}
            onChange={(event) => set('q')(event.target.value)}
            className="block min-h-11 w-full rounded-full border border-input bg-card ps-11 pe-4 text-body text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto p-1 sm:flex-wrap sm:overflow-visible">
          <ChipSelect label={CATEGORY_LABEL} options={CATEGORY_OPTIONS} placeholder={ANY_CATEGORY} value={filters.category} onChange={set('category')} />
          <ChipSelect label={CITY_LABEL} options={CITY_OPTIONS} placeholder={ANY_CITY} value={filters.city} onChange={set('city')} />
          <ChipSelect label={CONDITION_LABEL} options={CONDITION_OPTIONS} placeholder={ANY_CONDITION} value={filters.condition} onChange={set('condition')} />
          <label className={cn(chipStyles(filters.maxPrice.trim() !== ''), 'gap-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring')}>
            <span className="whitespace-nowrap">{MAX_PRICE_LABEL}</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={filters.maxPrice}
              onChange={(event) => set('maxPrice')(event.target.value)}
              className="min-h-11 w-16 bg-transparent text-start focus-visible:outline-none"
            />
          </label>
          <ChipSelect
            label={SORT_LABEL}
            options={SORT_OPTIONS}
            placeholder={SORT_LABELS.match}
            value={filters.sort}
            selected={filters.sort !== '' && filters.sort !== 'match'}
            onChange={set('sort')}
          />
          {/* A real checkbox, hidden visually: the whole chip is its label and shows its state and its focus ring. */}
          <label
            className={cn(chipStyles(filters.free), 'cursor-pointer gap-1.5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring')}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={filters.free}
              onChange={(event) => {
                const free = event.target.checked;
                setFilters((current) => ({ ...current, free }));
              }}
            />
            {filters.free ? <CheckIcon className="size-4.5" /> : null}
            <span className="whitespace-nowrap">{FREE_ONLY_LABEL}</span>
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="rounded-full px-4 text-small">
            {APPLY_FILTERS}
          </Button>
          <Button
            type="button"
            variant="soft"
            className="rounded-full px-4 text-small"
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
