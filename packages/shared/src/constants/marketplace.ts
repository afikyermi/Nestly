// Marketplace (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, FR-ALG-006; migration 20261022600000). The value lists and limits the web, the server
// and the database share; the CHECK constraints of marketplace_listings and sponsored_products state the same. The defaults built by ⭐ (Afik,
// 21.10.2026) are recorded in the SRS as open points: the category and condition lists, the price range.

/** The product categories (a listing's and a Sponsored Product's). */
export const LISTING_CATEGORIES = ['strollers', 'car_seats', 'furniture', 'clothing', 'toys', 'feeding', 'bath_care', 'maternity', 'books', 'other'] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_CATEGORY_LABELS: Readonly<Record<ListingCategory, string>> = {
  strollers: 'עגלות',
  car_seats: 'כיסאות בטיחות',
  furniture: 'ריהוט',
  clothing: 'ביגוד',
  toys: 'צעצועים',
  feeding: 'האכלה',
  bath_care: 'רחצה וטיפוח',
  maternity: 'הריון',
  books: 'ספרים',
  other: 'אחר',
};

/** The item's condition. */
export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'used'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const LISTING_CONDITION_LABELS: Readonly<Record<ListingCondition, string>> = {
  new: 'חדש',
  like_new: 'כמו חדש',
  good: 'טוב',
  used: 'משומש',
};

/** active, or sold ("נמכר/נמסר"); hidden and expired are read from their own fields. */
export const LISTING_STATUSES = ['active', 'sold'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_TITLE_MIN = 2;
export const LISTING_TITLE_MAX = 80;
/** The asking price in whole shekels; no price is "למסירה". */
export const LISTING_PRICE_MIN = 1;
export const LISTING_PRICE_MAX = 100_000;
/** VAL-041: images per listing. */
export const LISTING_MAX_IMAGES = 6;
/** A listing leaves the Marketplace this many days after it was published. */
export const LISTING_DAYS = 60;
/** The most listings one Marketplace page shows. */
export const MARKETPLACE_PAGE = 60;

/** The orders of the Marketplace list (FR-ALG-006): relevance (the reader's search topics, then freshness), newest, price. */
export const MARKETPLACE_SORTS = ['match', 'new', 'price_low'] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];

/** FR-ALG-008 (Intent Signal): which search topic each category answers; a category with none is ranked by freshness only. */
export const LISTING_CATEGORY_TOPICS: Readonly<Record<ListingCategory, string | null>> = {
  strollers: 'baby_gear',
  car_seats: 'baby_gear',
  furniture: 'baby_gear',
  clothing: null,
  toys: 'toys_and_play',
  feeding: 'nutrition',
  bath_care: null,
  maternity: 'pregnancy',
  books: null,
  other: null,
};

/** Sponsored Products (FR-ADMIN-009): draft -> published <-> paused; removed is final. */
export const SPONSORED_STATUSES = ['draft', 'published', 'paused', 'removed'] as const;
export type SponsoredStatus = (typeof SPONSORED_STATUSES)[number];
export const SPONSOR_NAME_MIN = 2;
export const SPONSOR_NAME_MAX = 80;
export const SPONSORED_TITLE_MIN = 2;
export const SPONSORED_TITLE_MAX = 80;
export const SPONSORED_DESCRIPTION_MAX = 1000;
export const SPONSORED_LINK_MAX = 500;
/** The same rule as sponsored_products_link_url_check: https, a host with a dot, no user part. */
export const SPONSORED_LINK_PATTERN = /^https:\/\/[^\s/?#@]*\.[^\s/?#@]+([/?#]\S*)?$/;
