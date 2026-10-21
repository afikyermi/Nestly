import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { StaffListing } from '@nestly/shared';
import { MarketplaceCard } from '@/components/domain/marketplace-card';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { listingPath } from '@/lib/marketplace-link';
import {
  ADMIN_HIDDEN_DONE,
  ADMIN_HIDE,
  ADMIN_LISTINGS_EMPTY,
  ADMIN_LISTINGS_SEARCH,
  ADMIN_REASON_LABEL,
  ADMIN_REASON_REQUIRED,
  ADMIN_RESTORE,
  ADMIN_RESTORED_DONE,
  ADMIN_SEARCH_BUTTON,
  EXPIRED_BADGE,
  HIDDEN_BADGE,
  SOLD_BADGE,
  cityText,
  conditionText,
  imageAltOf,
  priceText,
  sellerText,
} from '@/lib/marketplace-texts';
import { fetchStaffListings, setListingVisibility } from '@/services/api/marketplace';
import { ACTION_FAILED_TEXT, FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, RETRY_LABEL } from './admin-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; listings: StaffListing[] };

// The staff's Marketplace listings (§3.2 MARKETPLACE_MODERATE; FR-MKT-001): every listing, hidden, sold and expired ones included, newest first
// and hidden ones on top; a title search; hide or bring back one with a reason, which the database writes to the Audit Log in the same step.
// Reported listings are also handled from the reports queue. Staff never edit or delete a listing.
export function MarketplaceAdminScreen() {
  const call = useAdminCall();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [notice, setNotice] = useState('');

  const load = useCallback(
    async (text: string) => {
      setView({ kind: 'loading' });
      const outcome = await call((token) => fetchStaffListings(token, text));
      setView(outcome.kind === 'ok' ? { kind: 'loaded', listings: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
    },
    [call],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  function find(event: FormEvent) {
    event.preventDefault();
    void load(search);
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={find} className="flex flex-wrap items-end gap-3">
        <FormField label={ADMIN_LISTINGS_SEARCH} className="min-w-64 flex-1">
          {(control) => <TextInput {...control} value={search} onChange={(event) => setSearch(event.target.value)} />}
        </FormField>
        <Button type="submit" variant="soft">
          {ADMIN_SEARCH_BUTTON}
        </Button>
      </form>
      <p role="status" className="text-small">
        {notice}
      </p>
      {view.kind === 'loading' ? (
        <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}
      {view.kind === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{view.message}</InlineAlert>
          <Button variant="soft" onClick={() => void load(search)}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : null}
      {view.kind === 'loaded' && view.listings.length === 0 ? <p>{ADMIN_LISTINGS_EMPTY}</p> : null}
      {view.kind === 'loaded' && view.listings.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {view.listings.map((listing) => (
            <li key={listing.id}>
              <StaffListingCard
                listing={listing}
                onChanged={(hidden) => {
                  setNotice(hidden ? ADMIN_HIDDEN_DONE : ADMIN_RESTORED_DONE);
                  setView((now) => (now.kind === 'loaded' ? { kind: 'loaded', listings: now.listings.map((row) => (row.id === listing.id ? { ...row, isHidden: hidden } : row)) } : now));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StaffListingCard({ listing, onChanged }: { listing: StaffListing; onChanged: (hidden: boolean) => void }) {
  const call = useAdminCall();
  const id = useId();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const next = !listing.isHidden;

  const act = async () => {
    if (reason.trim() === '') return setProblem(ADMIN_REASON_REQUIRED);
    setProblem('');
    setBusy(true);
    const outcome = await call((token) => setListingVisibility(token, listing.id, next, reason.trim()));
    setBusy(false);
    if (outcome.kind === 'ok') {
      setReason('');
      onChanged(next);
    } else {
      setProblem(outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : ACTION_FAILED_TEXT);
    }
  };

  return (
    <MarketplaceCard
      variant="listing"
      title={
        <Link to={listingPath(listing.id)} dir="auto">
          {listing.title}
        </Link>
      }
      image={listing.image}
      imageAlt={imageAltOf(listing.title, 0, 1)}
      price={priceText(listing.price)}
      meta={[conditionText(listing.condition), cityText(listing.city), sellerText(listing.sellerName)].join(' · ')}
      badges={[listing.status === 'sold' ? SOLD_BADGE : null, listing.isHidden ? HIDDEN_BADGE : null, listing.isExpired ? EXPIRED_BADGE : null].filter((badge) => badge !== null)}
      footer={
        <div className="mt-2 flex flex-col gap-2">
          <FormField label={ADMIN_REASON_LABEL} htmlFor={`${id}-reason`} {...(problem === '' ? {} : { error: problem })}>
            {(control) => <TextArea {...control} rows={2} dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />}
          </FormField>
          <Button variant={next ? 'primary' : 'soft'} className="self-start" pending={busy} disabled={busy} onClick={() => void act()}>
            {next ? ADMIN_HIDE : ADMIN_RESTORE}
          </Button>
        </div>
      }
    />
  );
}
