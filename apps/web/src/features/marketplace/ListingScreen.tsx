import { PublishedTime } from '@/components/domain/published-time';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CHAT_TEXT_MAX, codePointLength, type ListingPage } from '@nestly/shared';
import { ReportSheet } from '@/components/domain/report-sheet';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { MediaTile } from '@/components/shared/media-tile';
import { Button } from '@/components/ui/button';
import { MoreActionsMenu } from '@/components/ui/more-actions-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { useProCall } from '@/hooks/use-pro-call';
import { reportSheetProps, useReport } from '@/hooks/use-report';
import { PATHS } from '@/app/paths';
import { conversationPath } from '@/lib/chat-link';
import { editListingPath, MARKETPLACE_PATH, MY_LISTINGS_PATH } from '@/lib/marketplace-link';
import {
  ACTION_FAILED,
  BACK_TO_MARKETPLACE,
  CANCEL_LABEL,
  CATEGORY_LABEL,
  CITY_LABEL,
  CONDITION_LABEL,
  CONTACT_FAILED,
  CONTACT_HEADING,
  CONTACT_LABEL,
  CONTACT_NOT_ALLOWED,
  CONTACT_SEND,
  CONTACT_UNAVAILABLE,
  DELETE_CONFIRM_TEXT,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  DESCRIPTION_HEADING,
  EDIT_LABEL,
  EXPIRED_BADGE,
  EXPIRED_DELETE_NOTE,
  HIDDEN_BADGE,
  LISTING_GONE,
  LOAD_FAILED,
  MARK_ACTIVE_LABEL,
  MARK_SOLD_LABEL,
  MARKED_ACTIVE_TEXT,
  MARKED_SOLD_TEXT,
  NO_PURCHASE_NOTE,
  OPEN_CONVERSATION,
  PENDING_IMAGES_NOTE,
  REPORT_FAILED_TEXT,
  REPORT_LISTING_LABEL,
  REPORTED_TEXT,
  RETRY,
  SELLER_LABEL,
  SOLD_BADGE,
  SOLD_EXPIRED_NOTE,
  SOLD_KEPT_NOTE,
  categoryText,
  cityText,
  conditionText,
  contactDraft,
  expiresText,
  imageAltOf,
  ownerExpiresText,
  priceText,
  sellerText,
} from '@/lib/marketplace-texts';
import { contactSeller, deleteListing, fetchListing, setListingStatus } from '@/services/api/marketplace';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'gone' } | { kind: 'loaded'; page: ListingPage };

const dateOf = (iso: string): string => new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' });

// One listing (FR-MKT-005, PG-019): its pictures, title, price or "למסירה", category, condition, city, seller and description (I12-B); no purchase or payment action
// (BR-069, AC-097). A reader writes to the seller in a Marketplace conversation (FR-CHAT-002, AC-059) or reports the listing; the owner edits it,
// marks it sold/given (or back) and deletes it. What the database does not allow comes back as a refusal; nothing here decides it.
export function ListingScreen({ listingId }: { listingId: string }) {
  const call = useProCall();
  const navigate = useNavigate();
  const headingId = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const report = useReport((_target, result) => setStatus(result === 'received' || result === 'already-reported' ? REPORTED_TEXT : REPORT_FAILED_TEXT));

  const load = useCallback(async () => {
    const result = await call((token) => fetchListing(token, listingId));
    setView(result.kind === 'ok' ? { kind: 'loaded', page: result.value } : result.kind === 'unavailable' || result.kind === 'invalid' ? { kind: 'gone' } : { kind: 'failed' });
  }, [call, listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.kind === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind !== 'loaded') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.kind === 'gone' ? LISTING_GONE : LOAD_FAILED}</InlineAlert>
        {view.kind === 'failed' ? (
          <Button variant="soft" onClick={() => void load()}>
            {RETRY}
          </Button>
        ) : null}
        <Link to={MARKETPLACE_PATH}>{BACK_TO_MARKETPLACE}</Link>
      </div>
    );
  }
  const { page } = view;
  const live = page.status === 'active' && !page.isHidden && !page.isExpired;
  const draft = message ?? contactDraft(page.title);
  const tooLong = codePointLength(draft.trim()) > CHAT_TEXT_MAX;

  const changeStatus = async (next: 'active' | 'sold') => {
    setBusy(true);
    setError('');
    const result = await call((token) => setListingStatus(token, page.id, next));
    setBusy(false);
    if (result.kind !== 'ok') {
      setError(ACTION_FAILED);
      // ERR-054: the listing may have passed its 60 days since the page loaded; reading it again shows why
      return void load();
    }
    setStatus(next === 'sold' ? MARKED_SOLD_TEXT : MARKED_ACTIVE_TEXT);
    await load();
  };

  const remove = async () => {
    setBusy(true);
    const result = await call((token) => deleteListing(token, page.id));
    setBusy(false);
    setConfirming(false);
    if (result.kind === 'ok') void navigate(MY_LISTINGS_PATH, { replace: true });
    else setError(ACTION_FAILED);
  };

  const contact = async () => {
    if (draft.trim() === '' || tooLong) return;
    setBusy(true);
    setError('');
    const result = await call((token) => contactSeller(token, page.id, draft.trim()));
    setBusy(false);
    if (result.kind === 'ok') void navigate(conversationPath(result.value));
    else setError(result.kind === 'unavailable' ? CONTACT_UNAVAILABLE : result.kind === 'not-allowed' ? CONTACT_NOT_ALLOWED : CONTACT_FAILED);
  };

  const badges = [page.status === 'sold' ? SOLD_BADGE : null, page.isHidden ? HIDDEN_BADGE : null, page.isExpired ? EXPIRED_BADGE : null].filter((badge) => badge !== null);

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-5">
      <div>
        <Link to={page.isMine ? MY_LISTINGS_PATH : MARKETPLACE_PATH} className="inline-flex min-h-11 items-center">
          {BACK_TO_MARKETPLACE}
        </Link>
      </div>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {badges.length === 0 ? null : (
            <p className="mb-1 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <span key={badge} className="inline-flex h-5.5 items-center rounded-sm border border-border bg-card px-2 text-caption font-bold">
                  {badge}
                </span>
              ))}
            </p>
          )}
          <h1 id={headingId} className="text-h2 wrap-anywhere" dir="auto">
            {page.title}
          </h1>
          <p className="mt-1 text-h3">{priceText(page.price)}</p>
        </div>
        {page.isMine ? null : (
          <MoreActionsMenu
            label={REPORT_LISTING_LABEL}
            menuLabel={REPORT_LISTING_LABEL}
            items={[{ key: 'report', label: REPORT_LISTING_LABEL, onSelect: () => report.start({ kind: 'listing', id: page.id }) }]}
          />
        )}
      </header>
      <p role="status" className={status === '' ? 'sr-only' : 'text-small'}>
        {status}
      </p>
      {page.images.length === 0 ? null : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {page.images.map((image, index) => (
            <li key={image.id}>
              <MediaTile image={image} alt={imageAltOf(page.title, index, page.images.length)} className="aspect-square w-full" />
            </li>
          ))}
        </ul>
      )}
      {page.isMine && page.images.some((image) => image.state === 'pending') ? <p className="text-small text-muted-foreground">{PENDING_IMAGES_NOTE}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small sm:max-w-md">
        <dt className="text-muted-foreground">{CATEGORY_LABEL}</dt>
        <dd>{categoryText(page.category)}</dd>
        <dt className="text-muted-foreground">{CONDITION_LABEL}</dt>
        <dd>{conditionText(page.condition)}</dd>
        <dt className="text-muted-foreground">{CITY_LABEL}</dt>
        <dd>{cityText(page.city)}</dd>
        <dt className="text-muted-foreground">{SELLER_LABEL}</dt>
        <dd>
          <bdi dir="auto">{sellerText(page.sellerName)}</bdi>
        </dd>
      </dl>
      {page.description === null ? null : (
        <section aria-label={DESCRIPTION_HEADING}>
          <h2 className="text-label">{DESCRIPTION_HEADING}</h2>
          <p className="mt-1 whitespace-pre-wrap wrap-anywhere" dir="auto">
            {page.description}
          </p>
        </section>
      )}
      <p className="text-small text-muted-foreground">
        <PublishedTime iso={page.createdAt} />
        {/* BR-090/091: the seller sees when a live listing is deleted, and that a sold one is kept; a reader sees until when it shows */}
        {page.status === 'sold' ? null : <> · {(page.isMine ? ownerExpiresText : expiresText)(dateOf(page.expiresAt))}</>} · {NO_PURCHASE_NOTE}
      </p>
      {page.isMine && page.status === 'sold' ? <p className="text-small">{page.isExpired ? SOLD_EXPIRED_NOTE : SOLD_KEPT_NOTE}</p> : null}
      {page.isMine && page.status === 'active' && page.isExpired ? <p className="text-small">{EXPIRED_DELETE_NOTE}</p> : null}
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
      {page.isMine ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="soft" onClick={() => void navigate(editListingPath(page.id))}>
            {EDIT_LABEL}
          </Button>
          {page.isExpired ? null : page.status === 'active' ? (
            <Button pending={busy} disabled={busy} onClick={() => void changeStatus('sold')}>
              {MARK_SOLD_LABEL}
            </Button>
          ) : (
            <Button variant="soft" pending={busy} disabled={busy} onClick={() => void changeStatus('active')}>
              {MARK_ACTIVE_LABEL}
            </Button>
          )}
          <Button variant="text" disabled={busy} onClick={() => setConfirming(true)}>
            {DELETE_LABEL}
          </Button>
        </div>
      ) : page.conversationId !== null ? (
        <Link to={conversationPath(page.conversationId)} className="self-start">
          {OPEN_CONVERSATION}
        </Link>
      ) : live ? (
        <section aria-label={CONTACT_HEADING} className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
          <FormField label={CONTACT_LABEL} {...(tooLong ? { error: CONTACT_FAILED } : {})}>
            {(control) => <TextArea {...control} rows={3} dir="auto" value={draft} onChange={(event) => setMessage(event.target.value)} />}
          </FormField>
          <Button className="self-start" pending={busy} disabled={busy || draft.trim() === ''} onClick={() => void contact()}>
            {CONTACT_SEND}
          </Button>
        </section>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={DELETE_CONFIRM_TITLE}
        description={DELETE_CONFIRM_TEXT}
        confirmLabel={DELETE_LABEL}
        cancelLabel={CANCEL_LABEL}
        pending={busy}
        onConfirm={() => void remove()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
      {report.draft !== null ? <ReportSheet {...reportSheetProps(report, report.draft, PATHS.communityRules)} /> : null}
    </article>
  );
}
