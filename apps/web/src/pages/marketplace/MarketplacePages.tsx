import { Link, useParams } from 'react-router';
import { listingIdParams } from '@nestly/shared';
import { ListingFormScreen } from '@/features/marketplace/ListingFormScreen';
import { ListingScreen } from '@/features/marketplace/ListingScreen';
import { MarketplaceScreen } from '@/features/marketplace/MarketplaceScreen';
import { MyListingsScreen } from '@/features/marketplace/MyListingsScreen';
import { documentTitle } from '@/lib/document-title';
import { MARKETPLACE_PATH, MY_LISTINGS_PATH, NEW_LISTING_PATH } from '@/lib/marketplace-link';
import {
  BACK_TO_MARKETPLACE,
  BACK_TO_MINE,
  EDIT_LISTING_TITLE,
  LISTING_GONE,
  MARKETPLACE_INTRO,
  MARKETPLACE_TITLE,
  MY_LISTINGS_TITLE,
  NEW_LISTING_LABEL,
  NEW_LISTING_TITLE,
} from '@/lib/marketplace-texts';

// The Marketplace's pages (I12; PG-010, PG-019): the list (from the bottom navigation, "חנות"), "My listings", a new listing, one listing
// `/marketplace/<id>` and its edit. Each composes its screen; the screens ask the server.
export function MarketplacePage() {
  return (
    <>
      <title>{documentTitle(MARKETPLACE_TITLE)}</title>
      <h1 className="text-h2">{MARKETPLACE_TITLE}</h1>
      <p className="mt-2 text-muted-foreground">{MARKETPLACE_INTRO}</p>
      <nav aria-label={MARKETPLACE_TITLE} className="mt-3 flex flex-wrap gap-4">
        <Link to={NEW_LISTING_PATH} className="inline-flex min-h-11 items-center">
          {NEW_LISTING_LABEL}
        </Link>
        <Link to={MY_LISTINGS_PATH} className="inline-flex min-h-11 items-center">
          {MY_LISTINGS_TITLE}
        </Link>
      </nav>
      <div className="mt-4">
        <MarketplaceScreen />
      </div>
    </>
  );
}

export function MyListingsPage() {
  return (
    <>
      <title>{documentTitle(MY_LISTINGS_TITLE)}</title>
      <Link to={MARKETPLACE_PATH} className="inline-flex min-h-11 items-center">
        {BACK_TO_MARKETPLACE}
      </Link>
      <h1 className="text-h2">{MY_LISTINGS_TITLE}</h1>
      <div className="mt-4">
        <MyListingsScreen />
      </div>
    </>
  );
}

export function NewListingPage() {
  return (
    <>
      <title>{documentTitle(NEW_LISTING_TITLE)}</title>
      <Link to={MARKETPLACE_PATH} className="inline-flex min-h-11 items-center">
        {BACK_TO_MARKETPLACE}
      </Link>
      <h1 className="text-h2">{NEW_LISTING_TITLE}</h1>
      <div className="mt-4">
        <ListingFormScreen />
      </div>
    </>
  );
}

function useListingId(): string | null {
  const { listingId = '' } = useParams();
  const id = listingIdParams.safeParse({ id: listingId });
  return id.success ? id.data.id : null;
}

export function ListingPage() {
  const id = useListingId();
  return (
    <>
      <title>{documentTitle(MARKETPLACE_TITLE)}</title>
      {id === null ? <p>{LISTING_GONE}</p> : <ListingScreen key={id} listingId={id} />}
    </>
  );
}

export function EditListingPage() {
  const id = useListingId();
  return (
    <>
      <title>{documentTitle(EDIT_LISTING_TITLE)}</title>
      <Link to={MY_LISTINGS_PATH} className="inline-flex min-h-11 items-center">
        {BACK_TO_MINE}
      </Link>
      <h1 className="text-h2">{EDIT_LISTING_TITLE}</h1>
      <div className="mt-4">{id === null ? <p>{LISTING_GONE}</p> : <ListingFormScreen key={id} listingId={id} />}</div>
    </>
  );
}
