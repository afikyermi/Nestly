import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ListingCard, PromotionOverview } from '@nestly/shared';
import { MarketplaceCard } from '@/components/domain/marketplace-card';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { listingPath, NEW_LISTING_PATH } from '@/lib/marketplace-link';
import {
  EXPIRED_BADGE,
  HIDDEN_BADGE,
  LOAD_FAILED,
  MINE_EMPTY,
  MY_LISTINGS_TITLE,
  NEW_LISTING_LABEL,
  RETRY,
  SOLD_BADGE,
  cityText,
  conditionText,
  imageAltOf,
  priceText,
} from '@/lib/marketplace-texts';
import { PromoteListing } from './PromoteListing';
import { fetchMyListings } from '@/services/api/marketplace';
import { fetchPromotionOverview } from '@/services/api/promotions';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; listings: ListingCard[] };

// "My listings" (FR-MKT-002): every listing of the caller, with its state - live, sold/given, hidden by staff, or expired (kept; it no longer shows
// in the Marketplace). Each opens its page, where the owner edits, marks and deletes it.
export function MyListingsScreen() {
  const call = useProCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  // I13 (FR-MKT-004): the listing plans and the caller's promotions; without them the listings still show, with no promote button
  const [promotions, setPromotions] = useState<PromotionOverview | null>(null);

  const loadPromotions = useCallback(async () => {
    const result = await call((token) => fetchPromotionOverview(token));
    setPromotions(result.kind === 'ok' ? result.value : null);
  }, [call]);

  const load = useCallback(async () => {
    const result = await call((token) => fetchMyListings(token));
    setView(result.kind === 'ok' ? { kind: 'loaded', listings: result.value } : { kind: 'failed' });
    void loadPromotions();
  }, [call, loadPromotions]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <Link to={NEW_LISTING_PATH} className="inline-flex min-h-11 items-center self-start rounded-md bg-primary px-4 text-label text-primary-foreground no-underline">
        {NEW_LISTING_LABEL}
      </Link>
      {view.kind === 'loading' ? (
        <div role="status" className="flex flex-col gap-3">
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}
      {view.kind === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{LOAD_FAILED}</InlineAlert>
          <Button variant="soft" onClick={() => void load()}>
            {RETRY}
          </Button>
        </div>
      ) : null}
      {view.kind === 'loaded' && view.listings.length === 0 ? <p className="text-muted-foreground">{MINE_EMPTY}</p> : null}
      {view.kind === 'loaded' && view.listings.length > 0 ? (
        <ul aria-label={MY_LISTINGS_TITLE} className="flex flex-col gap-3">
          {view.listings.map((listing) => (
            <li key={listing.id}>
              <MarketplaceCard
                variant="listing"
                title={
                  <Link to={listingPath(listing.id)} className="text-primary-strong underline-offset-4 hover:underline" dir="auto">
                    {listing.title}
                  </Link>
                }
                image={listing.image}
                imageAlt={imageAltOf(listing.title, 0, 1)}
                price={priceText(listing.price)}
                meta={[conditionText(listing.condition), cityText(listing.city)].join(' · ')}
                badges={[listing.status === 'sold' ? SOLD_BADGE : null, listing.isHidden ? HIDDEN_BADGE : null, listing.isExpired ? EXPIRED_BADGE : null].filter(
                  (badge) => badge !== null,
                )}
                footer={
                  promotions === null || listing.status !== 'active' || listing.isHidden || listing.isExpired ? undefined : (
                    <PromoteListing
                      listingId={listing.id}
                      plans={promotions.plans.filter((plan) => plan.targetKind === 'listing')}
                      promotions={promotions.promotions.filter((item) => item.listingId === listing.id)}
                      onPromoted={() => void loadPromotions()}
                    />
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
