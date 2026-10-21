// Marketplace (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, FR-ALG-006, BR-005, BR-017, BR-046, BR-069, VAL-013, VAL-041). The web checks what it
// sends and the server checks again, by the same rules (the database's CHECKs say the same). Every body is strict; no body names the caller,
// and nothing here decides who may do what (RLS does).
import { z } from 'zod';
import {
  CHAT_TEXT_MAX,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  LISTING_MAX_IMAGES,
  LISTING_PRICE_MAX,
  LISTING_PRICE_MIN,
  LISTING_STATUSES,
  LISTING_TITLE_MAX,
  LISTING_TITLE_MIN,
  MARKETPLACE_SORTS,
  PROFESSIONAL_AREAS,
  SPONSOR_NAME_MAX,
  SPONSOR_NAME_MIN,
  SPONSORED_DESCRIPTION_MAX,
  SPONSORED_LINK_MAX,
  SPONSORED_LINK_PATTERN,
  SPONSORED_STATUSES,
  SPONSORED_TITLE_MAX,
  SPONSORED_TITLE_MIN,
  STAFF_REASON_MAX,
} from '../constants/index.js';
import { mediaImage } from '../media/index.js';
import { checkName, codePointLength } from './text.js';

const uuid = z.guid().transform((value) => value.toLowerCase());

/** A trimmed name of min..max code points; the message is the code the form shows. */
const nameOf = (min: number, max: number, code: string) =>
  z
    .string()
    .max(4 * max, code)
    .transform((raw, ctx) => {
      const result = checkName(raw, min, max);
      if (result.ok) return result.value;
      ctx.issues.push({ code: 'custom', message: code, input: raw });
      return z.NEVER;
    });

/** Free text: trimmed, not blank, no NUL, at most `max` code points. */
const textOf = (max: number, code: string) =>
  z
    .string()
    .max(4 * max, code)
    .refine((value) => value.trim() !== '' && !value.includes('\u0000') && codePointLength(value.trim()) <= max, code)
    .transform((value) => value.trim());

export const MARKETPLACE_ERROR_CODES = ['title_length', 'category_required', 'condition_required', 'price_invalid', 'city_required', 'too_many_images'] as const;
export type MarketplaceErrorCode = (typeof MARKETPLACE_ERROR_CODES)[number];

/** A path id: `guid`, so Postgres' cast cannot fail; else 400 before any query. */
export const listingIdParams = z.object({ id: uuid });

/** POST /api/marketplace/listings and PUT /api/marketplace/listings/:id (FR-MKT-002): no description field (§3.11). */
export const listingSchema = z.strictObject({
  title: nameOf(LISTING_TITLE_MIN, LISTING_TITLE_MAX, 'title_length'),
  category: z.enum(LISTING_CATEGORIES, { error: 'category_required' }),
  condition: z.enum(LISTING_CONDITIONS, { error: 'condition_required' }),
  /** Whole shekels; null is "למסירה" (to give away). */
  price: z.number({ error: 'price_invalid' }).int('price_invalid').min(LISTING_PRICE_MIN, 'price_invalid').max(LISTING_PRICE_MAX, 'price_invalid').nullable(),
  city: z.enum(PROFESSIONAL_AREAS, { error: 'city_required' }),
  /** New images to attach, in order (the caller's own unattached listing images); on an edit they follow the images already there. */
  imageIds: z.array(uuid).max(LISTING_MAX_IMAGES, 'too_many_images').default([]),
});
export type ListingInput = z.input<typeof listingSchema>;
export type ListingWrite = z.output<typeof listingSchema>;

/** POST /api/marketplace/listings/:id/status: the owner marks it sold/given, or back. */
export const listingStatusSchema = z.strictObject({ status: z.enum(LISTING_STATUSES) });

/** POST /api/marketplace/listings/:id/contact (FR-MKT-005): the first message to the seller. Same rule as a chat message. */
export const listingContactSchema = z.strictObject({ text: textOf(CHAT_TEXT_MAX, 'invalid') });

/** A query string number: absent or empty is no filter. */
const queryNumber = (max: number) =>
  z
    .string()
    .regex(/^\d{1,6}$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(max))
    .optional();

/** POST /api/marketplace (FR-MKT-001, FR-ALG-006): text, category, city, condition, "for free only", maximum price, order; strings, as a form holds them. */
export const marketplaceQuerySchema = z.strictObject({
  q: z
    .string()
    .max(400)
    .transform((value) => value.trim())
    .refine((value) => !value.includes('\u0000') && codePointLength(value) <= 100)
    .optional(),
  category: z.enum(LISTING_CATEGORIES).optional(),
  city: z.enum(PROFESSIONAL_AREAS).optional(),
  condition: z.enum(LISTING_CONDITIONS).optional(),
  free: z.enum(['1']).optional(),
  maxPrice: queryNumber(LISTING_PRICE_MAX),
  sort: z.enum(MARKETPLACE_SORTS).optional(),
});
export type MarketplaceQuery = z.output<typeof marketplaceQuerySchema>;
/** What the web sends (every value a string, as the form holds it). */
export type MarketplaceFilters = z.input<typeof marketplaceQuerySchema>;

// ---- answers ----------------------------------------------------------------------------------------------------------------------------

/** One listing as a list shows it: the first image (when one is ready, or the owner's own), the seller's name. */
export const listingCard = z.strictObject({
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
  sellerName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  image: mediaImage.nullable(),
});
export type ListingCard = z.infer<typeof listingCard>;

/** A Sponsored Product as the Marketplace shows it: always marked as sponsored (BR-005, AC-008), never as a user's listing (AC-020). */
export const sponsoredCard = z.strictObject({
  id: z.guid(),
  sponsorName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.enum(LISTING_CATEGORIES),
  linkUrl: z.string().nullable(),
  image: mediaImage.nullable(),
});
export type SponsoredCard = z.infer<typeof sponsoredCard>;

/** GET /api/marketplace: the organic listings and, apart from them, the sponsored units (FR-ALG-006: a separate exposure layer). */
export const marketplaceResponse = z.strictObject({ listings: z.array(listingCard), sponsored: z.array(sponsoredCard) });
export type MarketplaceResponse = z.infer<typeof marketplaceResponse>;

/** GET /api/marketplace/mine: the caller's own listings, every state. */
export const myListingsResponse = z.strictObject({ listings: z.array(listingCard) });

/** GET /api/marketplace/listings/:id (FR-MKT-005): the listing page. `conversationId`: the caller's existing conversation with the seller. */
export const listingPage = listingCard.extend({
  sellerId: z.guid(),
  images: z.array(mediaImage),
  updatedAt: z.iso.datetime(),
  conversationId: z.guid().nullable(),
});
export type ListingPage = z.infer<typeof listingPage>;

export const listingCreatedResponse = z.strictObject({ id: z.guid() });
export const listingContactResponse = z.strictObject({ conversationId: z.guid() });

// ---- Sponsored Products (FR-ADMIN-009; SPONSORED_PRODUCT_MANAGE, Admin Only) -----------------------------------------------------------

/** POST /api/admin/sponsored and PATCH /api/admin/sponsored/:id. A demo coupon is an ordinary product whose text says "דוגמה" (OP-023). */
export const sponsoredSchema = z.strictObject({
  sponsorName: nameOf(SPONSOR_NAME_MIN, SPONSOR_NAME_MAX, 'sponsor_length'),
  title: nameOf(SPONSORED_TITLE_MIN, SPONSORED_TITLE_MAX, 'title_length'),
  description: textOf(SPONSORED_DESCRIPTION_MAX, 'description_too_long').nullable(),
  category: z.enum(LISTING_CATEGORIES, { error: 'category_required' }),
  linkUrl: z
    .string()
    .trim()
    .max(SPONSORED_LINK_MAX, 'link_invalid')
    .regex(SPONSORED_LINK_PATTERN, 'link_invalid')
    .nullable(),
  /** One image (a sponsored image the Admin uploaded), attached once; null keeps the product without one. */
  imageId: uuid.nullable().default(null),
});
export type SponsoredInput = z.input<typeof sponsoredSchema>;
export type SponsoredWrite = z.output<typeof sponsoredSchema>;

export const sponsoredStatusSchema = z.strictObject({ status: z.enum(['published', 'paused', 'removed']) });

export const sponsoredItem = z.strictObject({
  id: z.guid(),
  sponsorName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.enum(LISTING_CATEGORIES),
  linkUrl: z.string().nullable(),
  status: z.enum(SPONSORED_STATUSES),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  image: mediaImage.nullable(),
});
export type SponsoredItem = z.infer<typeof sponsoredItem>;
export const sponsoredListResponse = z.strictObject({ items: z.array(sponsoredItem) });

// ---- staff: listings (MARKETPLACE_MODERATE) -----------------------------------------------------------------------------------------------

/** POST /api/admin/listings/:id/visibility: hide or restore, with the reason the Audit Log keeps. */
export const listingVisibilitySchema = z.strictObject({
  hidden: z.boolean(),
  reason: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value !== '' && !value.includes('\u0000') && codePointLength(value) <= STAFF_REASON_MAX, 'invalid'),
});
export type ListingVisibilityRequest = z.output<typeof listingVisibilitySchema>;

export const staffListingsResponse = z.strictObject({ listings: z.array(listingCard.extend({ sellerId: z.guid() })) });
export type StaffListing = z.infer<typeof staffListingsResponse>['listings'][number];
