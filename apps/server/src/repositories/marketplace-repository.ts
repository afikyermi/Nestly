// Marketplace (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, FR-ALG-006; migration 20261022600000). Runs inside the caller's identity transaction
// and nowhere else. Who reads a listing, a Sponsored Product or an image, and who may write one, is the database's (marketplace_listings_*,
// sponsored_products_*, media_assets_* policies and the update guards): nothing here narrows rows for permission. The Marketplace list asks
// for live listings only (active, not hidden, not expired) because that is what the list is, not who may see it: the owner's own policy shows it
// its hidden and expired listings too, on "My listings". No statement carries the caller's id as a value: the owner defaults to auth.uid().

import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_TOPICS,
  LISTING_CONDITIONS,
  LISTING_MAX_IMAGES,
  LISTING_STATUSES,
  MARKETPLACE_PAGE,
  PROFESSIONAL_AREAS,
  SPONSORED_STATUSES,
  type ListingWrite,
  type MarketplaceQuery,
  type SponsoredWrite,
} from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const iso = (column: SQL) => sql`to_char(${column} at time zone 'UTC', ${isoMs})`;
const MINE_LIMIT = 100;
const STAFF_LIMIT = 100;
const SPONSORED_UNITS = 3;

const listingRow = z.object({
  id: z.guid(),
  title: z.string(),
  category: z.enum(LISTING_CATEGORIES),
  condition: z.enum(LISTING_CONDITIONS),
  price: z.number().int().nullable(),
  city: z.enum(PROFESSIONAL_AREAS),
  status: z.enum(LISTING_STATUSES),
  isHidden: z.boolean(),
  isExpired: z.boolean(),
  isMine: z.boolean(),
  sellerId: z.guid(),
  sellerName: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  updatedAt: z.string(),
});
export type ListingRow = z.infer<typeof listingRow>;

const listingColumns = sql`
  l.id, l.title, l.category, l.item_condition as condition, l.price, l.city, l.status, l.is_hidden as "isHidden",
  (l.expires_at <= now()) as "isExpired", (l.owner_id = (select auth.uid())) as "isMine", l.owner_id as "sellerId", n.full_name as "sellerName",
  ${iso(sql.raw('l.created_at'))} as "createdAt", ${iso(sql.raw('l.expires_at'))} as "expiresAt", ${iso(sql.raw('l.updated_at'))} as "updatedAt"`;

/**
 * FR-MKT-001, FR-ALG-006: the live listings the caller may read, filtered as asked. The order `match` weighs the reader's own search topics
 * (FR-ALG-008, Intent Signal: a category answers one topic, capped at 1) and freshness (half of it after a week); `new` is newest first;
 * `price_low` the lowest price first (for free first). A text is looked for in the title.
 */
export async function readMarketplace(tx: IdentityTx, query: MarketplaceQuery, topicWeights: readonly { topic: string; weight: number }[]): Promise<ListingRow[]> {
  const filters: SQL[] = [sql`l.status = 'active'`, sql`not l.is_hidden`, sql`l.expires_at > now()`];
  if (query.category !== undefined) filters.push(sql`l.category = ${query.category}`);
  if (query.city !== undefined) filters.push(sql`l.city = ${query.city}`);
  if (query.condition !== undefined) filters.push(sql`l.item_condition = ${query.condition}`);
  if (query.free === '1') filters.push(sql`l.price is null`);
  if (query.maxPrice !== undefined) filters.push(sql`coalesce(l.price, 0) <= ${query.maxPrice}`);
  if (query.q !== undefined && query.q !== '') filters.push(sql`l.title ilike ${`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  const weightOf = new Map(topicWeights.map(({ topic, weight }) => [topic, weight]));
  const boosts = LISTING_CATEGORIES.flatMap((category) => {
    const topic = LISTING_CATEGORY_TOPICS[category];
    const weight = topic === null ? 0 : (weightOf.get(topic) ?? 0);
    return weight > 0 ? [{ category, weight: Math.min(1, weight) }] : [];
  });
  const intent =
    boosts.length === 0
      ? sql`0::float8`
      : sql`coalesce((${sql.param(boosts.map((b) => b.weight))}::float8[])[array_position(${sql.param(boosts.map((b) => b.category))}::text[], l.category)], 0::float8)`;
  const order = {
    match: sql`(${intent} + power(2::float8, -extract(epoch from (now() - l.created_at))::float8 / (86400 * 7))) desc, l.created_at desc`,
    new: sql`l.created_at desc`,
    price_low: sql`coalesce(l.price, 0) asc, l.created_at desc`,
  }[query.sort ?? 'match'];
  return z.array(listingRow).parse(
    await tx.execute(sql`
      select ${listingColumns}
      from nestly.marketplace_listings l
      left join nestly.regular_names n on n.user_id = l.owner_id
      where ${sql.join(filters, sql` and `)}
      order by ${order}, l.id
      limit ${MARKETPLACE_PAGE}`),
  );
}

/** The caller's own listings, every state (sold, hidden by staff, expired), newest first. */
export async function readOwnListings(tx: IdentityTx): Promise<ListingRow[]> {
  return z.array(listingRow).parse(
    await tx.execute(sql`
      select ${listingColumns}
      from nestly.marketplace_listings l
      left join nestly.regular_names n on n.user_id = l.owner_id
      where l.owner_id = (select auth.uid())
      order by l.created_at desc, l.id
      limit ${MINE_LIMIT}`),
  );
}

/** One listing as the caller may read it, with the caller's conversation with the seller (if any); undefined when it cannot. */
export async function readListing(tx: IdentityTx, id: string): Promise<(ListingRow & { conversationId: string | null }) | undefined> {
  const [row] = z.array(listingRow.extend({ conversationId: z.guid().nullable() })).parse(
    await tx.execute(sql`
      select ${listingColumns},
             (select c.id from nestly.conversations c
               where c.user_a = least((select auth.uid()), l.owner_id) and c.user_b = greatest((select auth.uid()), l.owner_id)
                 and l.owner_id <> (select auth.uid())) as "conversationId"
      from nestly.marketplace_listings l
      left join nestly.regular_names n on n.user_id = l.owner_id
      where l.id = ${id}::uuid`),
  );
  return row;
}

/** MARKETPLACE_MODERATE: every listing (hidden, sold and expired included), newest first, optionally those whose title holds the text. */
export async function readStaffListings(tx: IdentityTx, search: string): Promise<ListingRow[]> {
  const text = search.trim();
  const where = text === '' ? sql`true` : sql`l.title ilike ${`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`;
  return z.array(listingRow).parse(
    await tx.execute(sql`
      select ${listingColumns}
      from nestly.marketplace_listings l
      left join nestly.regular_names n on n.user_id = l.owner_id
      where ${where}
      order by l.is_hidden desc, l.created_at desc, l.id
      limit ${STAFF_LIMIT}`),
  );
}

// ---- images ------------------------------------------------------------------------------------------------------------------------------

const imageRow = z.object({ id: z.guid(), status: z.enum(['pending', 'passed', 'queued', 'approved', 'rejected']), width: z.number().int(), height: z.number().int() });
const ownedImageRow = imageRow.extend({ ownerKey: z.guid(), position: z.number().int() });
export type OwnedImageRow = z.infer<typeof ownedImageRow>;

/** The images of these listings the caller may read, in order (ownerKey = the listing). */
export async function readListingImages(tx: IdentityTx, listingIds: readonly string[]): Promise<OwnedImageRow[]> {
  if (listingIds.length === 0) return [];
  return z.array(ownedImageRow).parse(
    await tx.execute(sql`
      select m.id, m.status, m.width, m.height, m.listing_id as "ownerKey", m.position
      from nestly.media_assets m
      where m.listing_id = any(${sql.param([...listingIds])}::uuid[])
      order by m.listing_id, m.position`),
  );
}

/** The image of these Sponsored Products the caller may read (ownerKey = the product). */
export async function readSponsoredImages(tx: IdentityTx, productIds: readonly string[]): Promise<OwnedImageRow[]> {
  if (productIds.length === 0) return [];
  return z.array(ownedImageRow).parse(
    await tx.execute(sql`
      select m.id, m.status, m.width, m.height, m.sponsored_product_id as "ownerKey", m.position
      from nestly.media_assets m
      where m.sponsored_product_id = any(${sql.param([...productIds])}::uuid[])
      order by m.sponsored_product_id, m.position`),
  );
}

/** The first free place of a listing's images (a place freed by a removed picture is used again); null when all six are taken. */
export async function nextListingPosition(tx: IdentityTx, listingId: string): Promise<number | null> {
  const [row] = z.array(z.object({ next: z.number().int().nullable() })).parse(
    await tx.execute(sql`
      select min(p)::int as next from generate_series(0, ${LISTING_MAX_IMAGES - 1}) as p
      where not exists (select 1 from nestly.media_assets m where m.listing_id = ${listingId}::uuid and m.position = p)`),
  );
  return row?.next ?? null;
}

/** Attaches one of the caller's unattached listing images at a place; false when the database did not (not theirs, not a listing image, taken). */
export async function attachListingImage(tx: IdentityTx, imageId: string, listingId: string, position: number): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.media_assets set listing_id = ${listingId}::uuid, position = ${position}
    where id = ${imageId}::uuid and listing_id is null and kind = 'listing'
    returning id`);
  return rows.length === 1;
}

/** Attaches the Admin's unattached sponsored image to a product, at place 0. */
export async function attachSponsoredImage(tx: IdentityTx, imageId: string, productId: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    update nestly.media_assets set sponsored_product_id = ${productId}::uuid, position = 0
    where id = ${imageId}::uuid and sponsored_product_id is null and kind = 'sponsored'
    returning id`);
  return rows.length === 1;
}

/** Removes one of the caller's own images of a listing (the owner's delete policy; never a queued or refused one). */
export async function deleteListingImage(tx: IdentityTx, listingId: string, imageId: string): Promise<boolean> {
  const rows = await tx.execute(sql`delete from nestly.media_assets where id = ${imageId}::uuid and listing_id = ${listingId}::uuid returning id`);
  return rows.length === 1;
}

// ---- the owner's writes ------------------------------------------------------------------------------------------------------------------

/** A new listing, active (the database sets the owner, the clocks and the expiry). */
export async function insertListing(tx: IdentityTx, listing: ListingWrite): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      insert into nestly.marketplace_listings (title, category, item_condition, price, city)
      values (${listing.title}, ${listing.category}, ${listing.condition}, ${listing.price}, ${listing.city})
      returning id`),
  );
  if (row === undefined) throw new Error('the listing insert returned no row');
  return row.id;
}

/** The owner's edit of its listing's fields; 0 when there is none it may edit. */
export async function updateListing(tx: IdentityTx, id: string, listing: ListingWrite): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.marketplace_listings
    set title = ${listing.title}, category = ${listing.category}, item_condition = ${listing.condition}, price = ${listing.price}, city = ${listing.city}
    where id = ${id}::uuid
    returning id`);
  return rows.length;
}

/** Sold/given or back to active (the guard stamps sold_at). */
export async function setListingStatus(tx: IdentityTx, id: string, status: 'active' | 'sold'): Promise<number> {
  const rows = await tx.execute(sql`update nestly.marketplace_listings set status = ${status} where id = ${id}::uuid returning id`);
  return rows.length;
}

/** Deletes the caller's listing at once (its images and conversations lose the link; the job removes the images after a day). */
export async function deleteListing(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.execute(sql`delete from nestly.marketplace_listings where id = ${id}::uuid returning id`);
  return rows.length;
}

/** MARKETPLACE_MODERATE hides or restores a listing (audited in the same transaction, with nestly.audit_reason). */
export async function setListingHidden(tx: IdentityTx, id: string, hidden: boolean): Promise<number> {
  const rows = await tx.execute(sql`update nestly.marketplace_listings set is_hidden = ${hidden} where id = ${id}::uuid and is_hidden <> ${hidden} returning id`);
  return rows.length;
}

/** The Marketplace conversation with a listing's owner (FR-MKT-005, AC-059); the database checks the listing and the pair. */
export async function openMarketplaceConversation(tx: IdentityTx, ownerId: string, listingId: string): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      insert into nestly.conversations (context, user_a, user_b, listing_id)
      values ('marketplace', least((select auth.uid()), ${ownerId}::uuid), greatest((select auth.uid()), ${ownerId}::uuid), ${listingId}::uuid)
      returning id`),
  );
  if (row === undefined) throw new Error('the conversation insert returned no row');
  return row.id;
}

// ---- Sponsored Products ------------------------------------------------------------------------------------------------------------------

const sponsoredRow = z.object({
  id: z.guid(),
  sponsorName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.enum(LISTING_CATEGORIES),
  linkUrl: z.string().nullable(),
  status: z.enum(SPONSORED_STATUSES),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type SponsoredRow = z.infer<typeof sponsoredRow>;

const sponsoredColumns = sql`
  sp.id, sp.sponsor_name as "sponsorName", sp.title, sp.description, sp.category, sp.link_url as "linkUrl", sp.status,
  ${iso(sql.raw('sp.published_at'))} as "publishedAt", ${iso(sql.raw('sp.updated_at'))} as "updatedAt"`;

/** The published Sponsored Products for the Marketplace's sponsored units: those of the asked category first, then the newest. */
export async function readPublishedSponsored(tx: IdentityTx, category: string | undefined): Promise<SponsoredRow[]> {
  const first = category === undefined ? sql`` : sql`(sp.category = ${category}) desc,`;
  return z.array(sponsoredRow).parse(
    await tx.execute(sql`
      select ${sponsoredColumns} from nestly.sponsored_products sp
      where sp.status = 'published'
      order by ${first} sp.published_at desc, sp.id
      limit ${SPONSORED_UNITS}`),
  );
}

/** SPONSORED_PRODUCT_MANAGE: every product (removed ones last), newest first. */
export async function readAllSponsored(tx: IdentityTx): Promise<SponsoredRow[]> {
  return z.array(sponsoredRow).parse(
    await tx.execute(sql`
      select ${sponsoredColumns} from nestly.sponsored_products sp
      order by (sp.status = 'removed')::int, sp.created_at desc, sp.id
      limit ${STAFF_LIMIT}`),
  );
}

export async function readSponsored(tx: IdentityTx, id: string): Promise<SponsoredRow | undefined> {
  const [row] = z.array(sponsoredRow).parse(await tx.execute(sql`select ${sponsoredColumns} from nestly.sponsored_products sp where sp.id = ${id}::uuid`));
  return row;
}

export async function insertSponsored(tx: IdentityTx, product: SponsoredWrite): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      insert into nestly.sponsored_products (sponsor_name, title, description, category, link_url)
      values (${product.sponsorName}, ${product.title}, ${product.description}, ${product.category}, ${product.linkUrl})
      returning id`),
  );
  if (row === undefined) throw new Error('the sponsored product insert returned no row');
  return row.id;
}

export async function updateSponsored(tx: IdentityTx, id: string, product: SponsoredWrite): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.sponsored_products
    set sponsor_name = ${product.sponsorName}, title = ${product.title}, description = ${product.description}, category = ${product.category},
        link_url = ${product.linkUrl}
    where id = ${id}::uuid
    returning id`);
  return rows.length;
}

export async function setSponsoredStatus(tx: IdentityTx, id: string, status: 'published' | 'paused' | 'removed'): Promise<number> {
  const rows = await tx.execute(sql`update nestly.sponsored_products set status = ${status} where id = ${id}::uuid and status <> ${status} returning id`);
  return rows.length;
}
