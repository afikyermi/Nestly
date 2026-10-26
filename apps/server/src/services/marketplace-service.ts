// Marketplace (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, FR-ALG-006, FR-ALG-008, BR-005, BR-017, BR-046, BR-069). The caller is authenticated;
// each call is one identity transaction. The database decides who may read, publish, edit, delete, hide and contact (RLS and the guards); this
// layer orders the steps of one action (a listing and its images together; a conversation and its first message together) and names a database
// refusal by its SQLSTATE: 42501 not allowed, 23503 no such row, 23505 already done, 23514 a value out of range. No title, message or link text
// reaches a log line. Read addresses of images are signed after the transaction, only for rows the caller's own read returned.

import {
  MAX_TOPICS_PER_SEARCH,
  detectTopics,
  type ListingCard,
  type ListingPage,
  type ListingVisibilityRequest,
  type ListingWrite,
  type MarketplaceQuery,
  type MarketplaceResponse,
  type MediaImage,
  type SponsoredCard,
  type SponsoredItem,
  type SponsoredWrite,
  type StaffListing,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { enableStaffView, readStaffAccess, setAuditReason } from '../repositories/admin-repository.js';
import { insertMessage, markRead } from '../repositories/chat-repository.js';
import {
  attachListingImage,
  attachSponsoredImage,
  deleteListing,
  deleteListingImage,
  insertListing,
  insertSponsored,
  nextListingPosition,
  openMarketplaceConversation,
  readAllSponsored,
  readListing,
  readListingImages,
  readMarketplace,
  readOwnListings,
  readPublishedSponsored,
  readSponsored,
  readSponsoredImages,
  readStaffListings,
  setListingHidden,
  setListingStatus,
  setSponsoredStatus,
  updateListing,
  updateSponsored,
  type ListingRow,
  type OwnedImageRow,
  type SponsoredRow,
} from '../repositories/marketplace-repository.js';
import { readOwnTopicWeights, recordTopics } from '../repositories/search-repository.js';
import { withUrls } from './media-service.js';
import { promotedListings, recordExposure } from './promoted-units.js';

export type MarketRefusal =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'not_allowed' }
  | { readonly kind: 'already_done' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'expired' };
export type MarketOutcome<T> = ({ readonly kind: 'ok' } & T) | MarketRefusal;

/** A database refusal by SQLSTATE; undefined for anything else (a fault, rethrown). */
function refusalOf(error: unknown): MarketRefusal | undefined {
  switch (readDatabaseFault(error)?.code) {
    case '42501':
      return { kind: 'not_allowed' };
    case '23503':
      return { kind: 'unavailable' };
    case '23505':
      return { kind: 'already_done' };
    case '23514':
    case '22P02':
      return { kind: 'invalid' };
    default:
      return undefined;
  }
}

async function guarded<T>(work: () => Promise<MarketOutcome<T>>): Promise<MarketOutcome<T>> {
  try {
    return await work();
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

/** Thrown inside a transaction to roll it back with a refusal (an image that would not attach). */
class Refused extends Error {
  constructor(readonly refusal: MarketRefusal) {
    super('refused');
    this.name = 'Refused';
  }
}

async function inTx<T>(database: Database, identity: Identity, work: (tx: IdentityTx) => Promise<MarketOutcome<T>>): Promise<MarketOutcome<T>> {
  return guarded(async () => {
    try {
      return await inIdentityTransaction(database, identity, work);
    } catch (error) {
      if (error instanceof Refused) return error.refusal;
      throw error;
    }
  });
}

/**
 * FR-ALG-008: a search's topics, for a Regular or Professional account. search_intents_insert_own refuses any other (a staff account browsing
 * the Marketplace): that refusal, in its own savepoint, records nothing and the list still answers.
 */
async function recordOwnTopics(tx: IdentityTx, topics: readonly string[]): Promise<void> {
  if (topics.length === 0) return;
  await tx.transaction((savepoint) => recordTopics(savepoint, topics)).catch((error: unknown) => {
    if (readDatabaseFault(error)?.code !== '42501') throw error;
  });
}

/** The Intent Signal's half-life for the Marketplace order (FR-ALG-008: it decays; a topic is gone after 30 days). */
const INTENT_HALF_LIFE_HOURS = 24 * 7;

/** Signed views of image rows, by their owner key (a listing or a product), in order. */
async function imagesByKey(storage: MediaStorage | undefined, rows: readonly OwnedImageRow[]): Promise<Map<string, MediaImage[]>> {
  const out = new Map<string, MediaImage[]>();
  if (storage === undefined || rows.length === 0) return out;
  const views = await withUrls(storage, rows);
  for (const row of rows) {
    const view = views.get(row.id);
    if (view !== undefined) out.set(row.ownerKey, [...(out.get(row.ownerKey) ?? []), view]);
  }
  return out;
}

/** Per listing, the one row a card shows: the first checked image, or for the owner's own listing the first at all. Only these are signed. */
function coverRows(listings: readonly ListingRow[], rows: readonly OwnedImageRow[]): OwnedImageRow[] {
  const mine = new Set(listings.filter((row) => row.isMine).map((row) => row.id));
  const out = new Map<string, OwnedImageRow>();
  for (const row of rows) {
    const ready = row.status === 'passed' || row.status === 'approved';
    const current = out.get(row.ownerKey);
    const currentReady = current !== undefined && (current.status === 'passed' || current.status === 'approved');
    if (current === undefined ? ready || mine.has(row.ownerKey) : ready && !currentReady) out.set(row.ownerKey, row);
  }
  return [...out.values()];
}

/** The card's picture: the first ready image, or for the owner the first one at all (it sees its own pending pictures). */
function cover(row: ListingRow, images: readonly MediaImage[] | undefined): MediaImage | null {
  if (images === undefined) return null;
  return images.find((image) => image.state === 'ready') ?? (row.isMine ? (images[0] ?? null) : null);
}

function card(row: ListingRow, images: readonly MediaImage[] | undefined): ListingCard {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    condition: row.condition,
    price: row.price,
    city: row.city,
    status: row.status,
    isHidden: row.isHidden,
    isExpired: row.isExpired,
    isMine: row.isMine,
    sellerName: row.sellerName,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    image: cover(row, images),
  };
}

function sponsoredCard(row: SponsoredRow, images: readonly MediaImage[] | undefined): SponsoredCard {
  return {
    id: row.id,
    sponsorName: row.sponsorName,
    title: row.title,
    description: row.description,
    category: row.category,
    linkUrl: row.linkUrl,
    image: images?.find((image) => image.state === 'ready') ?? null,
  };
}

function sponsoredItem(row: SponsoredRow, images: readonly MediaImage[] | undefined): SponsoredItem {
  return { ...row, image: images?.[0] ?? null };
}

// ---- the Marketplace ---------------------------------------------------------------------------------------------------------------------

/**
 * GET /api/marketplace (FR-MKT-001, FR-ALG-006): the live listings as asked, and apart from them up to three published Sponsored Products
 * (BR-005: always marked; never mixed into the organic order). A searched text's topics are recorded for the Intent Signal (FR-ALG-008: the
 * topic only, never the text).
 */
export async function listMarketplace(database: Database, identity: Identity, storage: MediaStorage | undefined, query: MarketplaceQuery): Promise<MarketplaceResponse> {
  const read = await inIdentityTransaction(database, identity, async (tx) => {
    if (query.q !== undefined && query.q !== '') await recordOwnTopics(tx, detectTopics(query.q).slice(0, MAX_TOPICS_PER_SEARCH));
    const weights = (query.sort ?? 'match') === 'match' ? await readOwnTopicWeights(tx, new Date().toISOString(), INTENT_HALF_LIFE_HOURS) : [];
    const listings = await readMarketplace(tx, query, weights);
    const sponsored = await readPublishedSponsored(tx, query.category);
    // I13 (§11.3, FR-MKT-004): every promoted listing that matches the same search and filters, at the top, labelled "מודעה מקודמת"
    const promoted = await promotedListings(tx, query);
    const promotedIds = new Set(promoted.map((unit) => unit.row.id));
    const images = storage === undefined ? [] : await readListingImages(tx, [...new Set([...listings.map((row) => row.id), ...promotedIds])]);
    const sponsoredImages = storage === undefined ? [] : await readSponsoredImages(tx, sponsored.map((row) => row.id));
    // the organic list is exactly as without promotions (BR-004, AC-062): a promoted listing may appear in it too
    return { listings, sponsored, promoted, images, sponsoredImages };
  });
  const byListing = await imagesByKey(storage, coverRows([...read.listings, ...read.promoted.map((unit) => unit.row)], read.images));
  const byProduct = await imagesByKey(storage, read.sponsoredImages);
  if (read.promoted.length > 0) await recordExposure(database, identity, { impressions: read.promoted.map((unit) => unit.promotionId) });
  return {
    listings: read.listings.map((row) => card(row, byListing.get(row.id))),
    sponsored: read.sponsored.map((row) => sponsoredCard(row, byProduct.get(row.id))),
    promoted: read.promoted.map((unit) => ({ promotionId: unit.promotionId, listing: card(unit.row, byListing.get(unit.row.id)) })),
  };
}

/** GET /api/marketplace/mine: the caller's own listings, every state. */
export async function listOwnListings(database: Database, identity: Identity, storage: MediaStorage | undefined): Promise<ListingCard[]> {
  const read = await inIdentityTransaction(database, identity, async (tx) => {
    const listings = await readOwnListings(tx);
    return { listings, images: storage === undefined ? [] : await readListingImages(tx, listings.map((row) => row.id)) };
  });
  const byListing = await imagesByKey(storage, coverRows(read.listings, read.images));
  return read.listings.map((row) => card(row, byListing.get(row.id)));
}

/** GET /api/marketplace/listings/:id (FR-MKT-005): the listing page; `unavailable` when the caller cannot read it. */
export async function readListingPage(database: Database, identity: Identity, storage: MediaStorage | undefined, id: string): Promise<MarketOutcome<{ page: ListingPage }>> {
  const read = await inIdentityTransaction(database, identity, async (tx) => {
    const row = await readListing(tx, id);
    return row === undefined ? undefined : { row, images: storage === undefined ? [] : await readListingImages(tx, [id]) };
  });
  if (read === undefined) return { kind: 'unavailable' };
  const images = (await imagesByKey(storage, read.images)).get(id) ?? [];
  const { row } = read;
  return {
    kind: 'ok',
    page: { ...card(row, images), sellerId: row.sellerId, description: row.description, images: row.isMine ? images : images.filter((image) => image.state === 'ready'), updatedAt: row.updatedAt, conversationId: row.conversationId },
  };
}

/** Attaches new images after the ones already there; any image that will not attach (not the caller's, refused, taken) rolls everything back. */
async function attachAll(tx: IdentityTx, listingId: string, imageIds: readonly string[]): Promise<void> {
  for (const imageId of imageIds) {
    const position = await nextListingPosition(tx, listingId);
    if (position === null || !(await attachListingImage(tx, imageId, listingId, position))) throw new Refused({ kind: 'invalid' });
  }
}

/** POST /api/marketplace/listings (FR-MKT-002): the listing and its images, together. */
export async function createListing(database: Database, identity: Identity, listing: ListingWrite): Promise<MarketOutcome<{ id: string }>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<{ id: string }>> => {
    const id = await insertListing(tx, listing);
    await attachAll(tx, id, listing.imageIds);
    return { kind: 'ok', id };
  });
}

/** PUT /api/marketplace/listings/:id: the owner's edit; new images join after those already there (VAL-041: at most 6 in all). */
export async function editListing(database: Database, identity: Identity, id: string, listing: ListingWrite): Promise<MarketOutcome<object>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<object>> => {
    if ((await updateListing(tx, id, listing)) === 0) return { kind: 'unavailable' };
    await attachAll(tx, id, listing.imageIds);
    return { kind: 'ok' };
  });
}

/** DELETE /api/marketplace/listings/:id/images/:imageId: the owner removes one picture. */
export async function removeListingImage(database: Database, identity: Identity, id: string, imageId: string): Promise<MarketOutcome<object>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<object>> => ((await deleteListingImage(tx, id, imageId)) ? { kind: 'ok' } : { kind: 'unavailable' }));
}

/**
 * POST /api/marketplace/listings/:id/status: sold/given, or back (decisions §3 item 11). Past its 60 days a listing's status no longer moves
 * (ERR-054, `expired`): a sold one back on sale would be deleted at the next daily run, an expired one marked sold would escape it (BR-090).
 * The guard refuses both too.
 */
export async function changeListingStatus(database: Database, identity: Identity, id: string, status: 'active' | 'sold'): Promise<MarketOutcome<object>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<object>> => {
    const listing = await readListing(tx, id);
    if (listing?.isMine === true && listing.isExpired && listing.status !== status) return { kind: 'expired' };
    return (await setListingStatus(tx, id, status)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' };
  });
}

/**
 * DELETE /api/marketplace/listings/:id: the owner's delete. The one place that decides what an owner's delete does: today the listing is gone at
 * once (Afik's default, 21.10.2026); an open report keeps only its copied title. Whether a reported listing is held instead (as a post is,
 * BR-080) is open with Afik; a hold would change this function only.
 */
export async function removeOwnListing(database: Database, identity: Identity, id: string): Promise<MarketOutcome<object>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<object>> => ((await deleteListing(tx, id)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' }));
}

/**
 * POST /api/marketplace/listings/:id/contact (FR-MKT-005, FR-CHAT-002, AC-059): the first message to the seller. An existing conversation with
 * the seller goes on; otherwise a Marketplace conversation opens from this listing, and it and the message stand or fall together.
 */
export async function contactSeller(database: Database, identity: Identity, id: string, text: string): Promise<MarketOutcome<{ conversationId: string }>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<{ conversationId: string }>> => {
    const listing = await readListing(tx, id);
    if (listing === undefined || listing.isMine || listing.status !== 'active' || listing.isHidden || listing.isExpired) return { kind: 'unavailable' };
    const conversationId = listing.conversationId ?? (await openMarketplaceConversation(tx, listing.sellerId, id));
    await insertMessage(tx, conversationId, text);
    await markRead(tx, { conversationId });
    return { kind: 'ok', conversationId };
  });
}

// ---- staff: listings (MARKETPLACE_MODERATE) ------------------------------------------------------------------------------------------------

/** Whether the caller holds the key now (presentation: a friendlier 403 than an empty answer; the database decides every row). SPONSORED_PRODUCT_MANAGE
 *  is Admin Only (§3.2): the Admin's role is the key. */
async function hasKey(tx: IdentityTx, key: 'MARKETPLACE_MODERATE' | 'SPONSORED_PRODUCT_MANAGE'): Promise<boolean> {
  const access = await readStaffAccess(tx);
  if (access === undefined) return false;
  return key === 'SPONSORED_PRODUCT_MANAGE' ? access.role === 'admin' : access.permissions.includes(key);
}

/** GET /api/admin/listings?search=: every listing for MARKETPLACE_MODERATE (a friendlier 403 than an empty list without it). */
export async function listStaffListings(database: Database, identity: Identity, storage: MediaStorage | undefined, search: string): Promise<MarketOutcome<{ listings: StaffListing[] }>> {
  const read = await inIdentityTransaction(database, identity, async (tx) => {
    if (!(await hasKey(tx, 'MARKETPLACE_MODERATE'))) return undefined;
    await enableStaffView(tx);
    const listings = await readStaffListings(tx, search);
    return { listings, images: storage === undefined ? [] : await readListingImages(tx, listings.map((row) => row.id)) };
  });
  if (read === undefined) return { kind: 'forbidden' };
  const byListing = await imagesByKey(storage, coverRows(read.listings, read.images));
  return { kind: 'ok', listings: read.listings.map((row) => ({ ...card(row, byListing.get(row.id)), sellerId: row.sellerId })) };
}

/** POST /api/admin/listings/:id/visibility: hide or restore, the reason to the Audit Log in the same transaction. */
export async function changeListingVisibility(database: Database, identity: Identity, id: string, request: ListingVisibilityRequest): Promise<MarketOutcome<object>> {
  return inTx(database, identity, async (tx): Promise<MarketOutcome<object>> => {
    if (!(await hasKey(tx, 'MARKETPLACE_MODERATE'))) return { kind: 'forbidden' };
    await setAuditReason(tx, request.reason);
    return (await setListingHidden(tx, id, request.hidden)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' };
  });
}

// ---- Sponsored Products (FR-ADMIN-009; SPONSORED_PRODUCT_MANAGE, Admin Only) --------------------------------------------------------------

async function sponsoredItemOf(tx: IdentityTx, id: string): Promise<{ row: SponsoredRow; images: OwnedImageRow[] } | undefined> {
  const row = await readSponsored(tx, id);
  return row === undefined ? undefined : { row, images: await readSponsoredImages(tx, [id]) };
}

async function viewOf(storage: MediaStorage | undefined, read: { row: SponsoredRow; images: OwnedImageRow[] }): Promise<SponsoredItem> {
  return sponsoredItem(read.row, (await imagesByKey(storage, read.images)).get(read.row.id));
}

export async function listSponsored(database: Database, identity: Identity, storage: MediaStorage | undefined): Promise<MarketOutcome<{ items: SponsoredItem[] }>> {
  const read = await inIdentityTransaction(database, identity, async (tx) => {
    if (!(await hasKey(tx, 'SPONSORED_PRODUCT_MANAGE'))) return undefined;
    const rows = await readAllSponsored(tx);
    return { rows, images: storage === undefined ? [] : await readSponsoredImages(tx, rows.map((row) => row.id)) };
  });
  if (read === undefined) return { kind: 'forbidden' };
  const byProduct = await imagesByKey(storage, read.images);
  return { kind: 'ok', items: read.rows.map((row) => sponsoredItem(row, byProduct.get(row.id))) };
}

/** POST /api/admin/sponsored: a draft, with its image (audited). */
export async function createSponsored(database: Database, identity: Identity, storage: MediaStorage | undefined, product: SponsoredWrite): Promise<MarketOutcome<{ item: SponsoredItem }>> {
  const outcome = await inTx(database, identity, async (tx): Promise<MarketOutcome<{ read: { row: SponsoredRow; images: OwnedImageRow[] } }>> => {
    if (!(await hasKey(tx, 'SPONSORED_PRODUCT_MANAGE'))) return { kind: 'forbidden' };
    const id = await insertSponsored(tx, product);
    if (product.imageId !== null && !(await attachSponsoredImage(tx, product.imageId, id))) throw new Refused({ kind: 'invalid' });
    const read = await sponsoredItemOf(tx, id);
    if (read === undefined) throw new Error('the new sponsored product is not readable');
    return { kind: 'ok', read };
  });
  return outcome.kind === 'ok' ? { kind: 'ok', item: await viewOf(storage, outcome.read) } : outcome;
}

/** PATCH /api/admin/sponsored/:id: an edit (a removed product cannot be edited: 404); a new image only when it has none. */
export async function editSponsored(database: Database, identity: Identity, storage: MediaStorage | undefined, id: string, product: SponsoredWrite): Promise<MarketOutcome<{ item: SponsoredItem }>> {
  const outcome = await inTx(database, identity, async (tx): Promise<MarketOutcome<{ read: { row: SponsoredRow; images: OwnedImageRow[] } }>> => {
    if (!(await hasKey(tx, 'SPONSORED_PRODUCT_MANAGE'))) return { kind: 'forbidden' };
    if ((await updateSponsored(tx, id, product)) === 0) return { kind: 'unavailable' };
    if (product.imageId !== null && !(await attachSponsoredImage(tx, product.imageId, id))) throw new Refused({ kind: 'invalid' });
    const read = await sponsoredItemOf(tx, id);
    return read === undefined ? { kind: 'unavailable' } : { kind: 'ok', read };
  });
  return outcome.kind === 'ok' ? { kind: 'ok', item: await viewOf(storage, outcome.read) } : outcome;
}

/** POST /api/admin/sponsored/:id/status: publish, pause or remove (the guard refuses another move: 400). */
export async function changeSponsoredStatus(
  database: Database,
  identity: Identity,
  storage: MediaStorage | undefined,
  id: string,
  status: 'published' | 'paused' | 'removed',
): Promise<MarketOutcome<{ item: SponsoredItem }>> {
  const outcome = await inTx(database, identity, async (tx): Promise<MarketOutcome<{ read: { row: SponsoredRow; images: OwnedImageRow[] } }>> => {
    if (!(await hasKey(tx, 'SPONSORED_PRODUCT_MANAGE'))) return { kind: 'forbidden' };
    if ((await setSponsoredStatus(tx, id, status)) === 0) return { kind: 'unavailable' };
    const read = await sponsoredItemOf(tx, id);
    return read === undefined ? { kind: 'unavailable' } : { kind: 'ok', read };
  });
  return outcome.kind === 'ok' ? { kind: 'ok', item: await viewOf(storage, outcome.read) } : outcome;
}
