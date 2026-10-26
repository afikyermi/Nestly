import { Link, useParams } from 'react-router';
import { listingIdParams } from '@nestly/shared';
import { ListingFormScreen } from '@/features/marketplace/ListingFormScreen';
import { ListingScreen } from '@/features/marketplace/ListingScreen';
import { MarketplaceScreen } from '@/features/marketplace/MarketplaceScreen';
import { MyListingsScreen } from '@/features/marketplace/MyListingsScreen';
import { useAccountKind } from '@/hooks/use-account-kind';
import { useStaffAccess } from '@/hooks/use-staff-access';
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
  NOT_REGULAR_TEXT,
  PRO_VIEW_ONLY_NOTE,
  STAFF_NOT_PUBLISHER_TEXT,
} from '@/lib/marketplace-texts';

// The Marketplace's pages (I12; PG-010, PG-019): the list (from the bottom navigation, "חנות"), "My listings", a new listing, one listing
// `/marketplace/<id>` and its edit. Each composes its screen; the screens ask the server.
// I12-B (Afik §10.5): a Professional opens the Marketplace ("חנות", from its menu) to view and contact only, and a staff account to review:
// neither is offered "פרסום מודעה" or "המודעות שלי" (presentation only; the database refuses a listing that is not a Regular's). An unknown
// kind shows the Regular screens, as everywhere.
function usePublisher(): boolean | null {
  const kind = useAccountKind();
  const staff = useStaffAccess();
  if (staff.kind === 'staff') return false;
  return kind === 'loading' || staff.kind === 'loading' ? null : kind === 'regular' || kind === 'unknown';
}

/** A Professional or staff account that reached a publishing page by address: what it can do instead. */
function NotPublisher() {
  const staff = useStaffAccess();
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      <p>{staff.kind === 'staff' ? STAFF_NOT_PUBLISHER_TEXT : NOT_REGULAR_TEXT}</p>
      <Link to={MARKETPLACE_PATH} className="inline-flex min-h-11 items-center">
        {BACK_TO_MARKETPLACE}
      </Link>
    </div>
  );
}

export function MarketplacePage() {
  const publisher = usePublisher();
  const kind = useAccountKind();
  return (
    <>
      <title>{documentTitle(MARKETPLACE_TITLE)}</title>
      <h1 className="text-h2">{MARKETPLACE_TITLE}</h1>
      <p className="mt-2 text-muted-foreground">{MARKETPLACE_INTRO}</p>
      {publisher === true ? (
        <nav aria-label={MARKETPLACE_TITLE} className="mt-3 flex flex-wrap gap-4">
          <Link to={NEW_LISTING_PATH} className="inline-flex min-h-11 items-center">
            {NEW_LISTING_LABEL}
          </Link>
          <Link to={MY_LISTINGS_PATH} className="inline-flex min-h-11 items-center">
            {MY_LISTINGS_TITLE}
          </Link>
        </nav>
      ) : null}
      {kind === 'professional' ? <p className="mt-3">{PRO_VIEW_ONLY_NOTE}</p> : null}
      <div className="mt-4">
        <MarketplaceScreen />
      </div>
    </>
  );
}

export function MyListingsPage() {
  const publisher = usePublisher();
  return (
    <>
      <title>{documentTitle(MY_LISTINGS_TITLE)}</title>
      <Link to={MARKETPLACE_PATH} className="inline-flex min-h-11 items-center">
        {BACK_TO_MARKETPLACE}
      </Link>
      <h1 className="text-h2">{MY_LISTINGS_TITLE}</h1>
      {publisher === false ? <NotPublisher /> : null}
      {publisher === true ? (
        <div className="mt-4">
          <MyListingsScreen />
        </div>
      ) : null}
    </>
  );
}

export function NewListingPage() {
  const publisher = usePublisher();
  return (
    <>
      <title>{documentTitle(NEW_LISTING_TITLE)}</title>
      <Link to={MARKETPLACE_PATH} className="inline-flex min-h-11 items-center">
        {BACK_TO_MARKETPLACE}
      </Link>
      <h1 className="text-h2">{NEW_LISTING_TITLE}</h1>
      {publisher === false ? <NotPublisher /> : null}
      {publisher === true ? (
        <div className="mt-4">
          <ListingFormScreen />
        </div>
      ) : null}
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
