import { checkUserId } from '@nestly/shared';

// The Marketplace's addresses (I12; PG-010, PG-019): the list, "My listings", a new listing, one listing `/marketplace/<id>` and its edit
// `/marketplace/<id>/edit`. Opening one always asks the server again.
export const MARKETPLACE_PATH = '/marketplace';
export const MY_LISTINGS_PATH = '/marketplace/mine';
export const NEW_LISTING_PATH = '/marketplace/new';
export const LISTING_PATTERN = '/marketplace/:listingId';
export const EDIT_LISTING_PATTERN = '/marketplace/:listingId/edit';

export const listingPath = (id: string): string => `/marketplace/${id}`;
export const editListingPath = (id: string): string => `/marketplace/${id}/edit`;

/** The listing id of a `/marketplace/<id>` or `/marketplace/<id>/edit` path (any trailing slash already removed), else null: only a uuid counts. */
export function listingIdOfPath(path: string): string | null {
  const match = /^\/marketplace\/([^/]+)(?:\/edit)?$/.exec(path);
  const checked = checkUserId(match?.[1]);
  return checked.ok ? checked.userId : null;
}
