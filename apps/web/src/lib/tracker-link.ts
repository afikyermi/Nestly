import { CYCLE_TRACKER, TRACKER_PAGES, type TrackerPage } from '@nestly/shared';

// The address of a tracker page (I6): `/trackers/<kind>`, one of the eight child trackers or `cycle`. Anything else is not a page.
export const TRACKER_PATTERN = '/trackers/:kind';

export const trackerPath = (page: TrackerPage): string => `/trackers/${page}`;

/** The tracker page of a `/trackers/<kind>` path (any trailing slash already removed), else null. */
export function trackerPageOfPath(path: string): TrackerPage | null {
  const match = /^\/trackers\/([a-z]+)$/.exec(path);
  return TRACKER_PAGES.find((page) => page === match?.[1]) ?? null;
}

export const isCyclePage = (page: TrackerPage): page is typeof CYCLE_TRACKER => page === CYCLE_TRACKER;
