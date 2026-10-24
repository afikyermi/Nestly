import type { FeedPageResponse, FeedUnit, PostView, PublishedAnnouncement } from '@nestly/shared';
import { loadedMoreText } from './feed-texts';
import { rememberPromoted } from './promoted-feed';

/**
 * initial: no page yet (skeleton) · ready: a page arrived (the list, or the empty state) · first-error / more-error: the request for the
 * first / a later page failed · blocked: the server says this account has no feed (an Admin or a Moderator).
 */
export type FeedPhase = 'initial' | 'ready' | 'first-error' | 'more-error' | 'blocked';

/**
 * Where focus goes after a hide or an undo (F3.9 screen.md), once per `seq`: the placeholder's undo button, the card's "more" button, or the
 * card now at `index` (after one was removed; none left: the heading).
 */
export type HideFocus =
  | { readonly target: 'undo' | 'more'; readonly unitId: string; readonly seq: number }
  | { readonly target: 'index'; readonly index: number; readonly seq: number };

export interface FeedState {
  phase: FeedPhase;
  /** I14 (FR-ADMIN-008): the published System Announcements, from the first page. */
  notices: PublishedAnnouncement[];
  /** A request is in flight. */
  loading: boolean;
  items: FeedUnit[];
  nextCursor: string | null;
  /** The failure text of an error phase. */
  message: string;
  /** What the polite region says; changes only with a loaded page. */
  announcement: string;
  /** Counts the announcements, so two equal texts in a row are still spoken. */
  announcementTick: number;
  /** Position (0-based) of the card focus moves to after a successful retry, else null. */
  focusIndex: number | null;
  /** What the polite region says about a like (its failure); empty otherwise. */
  likeStatus: string;
  /** Units the viewer hid on this screen: each shows the placeholder with undo, in place, while the screen stays mounted (F3.9 c9). */
  hiddenIds: readonly string[];
  /** Units with a hide or an undo in flight: one request at a time per unit (c9). */
  pendingHideIds: readonly string[];
  /** What the polite region says about a hide or an undo; empty otherwise. */
  hideStatus: string;
  /** Counts the hide statuses, so two equal texts in a row are still spoken. */
  hideStatusTick: number;
  hideFocus: HideFocus | null;
}

export const INITIAL_FEED: FeedState = {
  phase: 'initial',
  notices: [],
  loading: false,
  items: [],
  nextCursor: null,
  message: '',
  announcement: '',
  announcementTick: 0,
  focusIndex: null,
  likeStatus: '',
  hiddenIds: [],
  pendingHideIds: [],
  hideStatus: '',
  hideStatusTick: 0,
  hideFocus: null,
};

/** The units of `page` not shown yet (by unit id), each once. */
export function freshUnits(shown: readonly FeedUnit[], page: readonly FeedUnit[]): FeedUnit[] {
  const seen = new Set(shown.map((unit) => unit.id));
  return page.filter((unit) => {
    if (seen.has(unit.id)) return false;
    seen.add(unit.id);
    return true;
  });
}

/**
 * I13 (FR-ALG-007, §11.2): the page's organic units with its promoted posts in their slots — each after `afterIndex` organic units of this
 * page. A promoted unit carries source 'promoted' and is marked "ממומן" by its card; it never changes the organic order.
 */
export function withPromoted(page: FeedPageResponse): FeedUnit[] {
  const promoted = [...(page.promoted ?? [])].sort((a, b) => a.afterIndex - b.afterIndex);
  if (promoted.length === 0) return [...page.items];
  const out: FeedUnit[] = [];
  let next = 0;
  page.items.forEach((unit, index) => {
    out.push(unit);
    while (next < promoted.length && promoted[next]?.afterIndex === index + 1) {
      const slot = promoted[next];
      if (slot !== undefined) {
        rememberPromoted(slot.unit.id, slot.promotionId);
        out.push(slot.unit);
      }
      next += 1;
    }
  });
  return out;
}

/** I13 (FR-ALG-007): the promotions whose post this page adds to `shown` as a promoted unit (not already on the list, nor organic on the page). */
export function shownPromotions(shown: readonly FeedUnit[], page: FeedPageResponse): string[] {
  const seen = new Set([...shown, ...page.items].map((unit) => unit.id));
  return (page.promoted ?? []).filter((slot) => !seen.has(slot.unit.id)).map((slot) => slot.promotionId);
}

/** A loaded page joins the list (de-duplicated by unit id), or replaces it: the first page and `restarted` (a new snapshot). */
export function withPage(state: FeedState, page: FeedPageResponse, firstPage: boolean, afterRetry: boolean): FeedState {
  const replace = firstPage || page.restarted === true;
  // A post the viewer published while the first page was loading stays first when it arrives; the server's copy is dropped. A first-page retry is a new snapshot (c9).
  const own = firstPage && state.phase === 'initial' ? state.items : [];
  const kept = replace ? own : state.items;
  const added = freshUnits(kept, withPromoted(page));
  const announced = !replace && added.length > 0;
  return {
    ...state,
    phase: 'ready',
    loading: false,
    notices: replace ? (page.announcements ?? []) : state.notices,
    items: [...kept, ...added],
    nextCursor: page.nextCursor,
    message: '',
    announcement: announced ? loadedMoreText(added.length) : '',
    announcementTick: announced ? state.announcementTick + 1 : state.announcementTick,
    focusIndex: afterRetry && added.length > 0 ? kept.length : null,
    likeStatus: '',
    hideStatus: '',
    // A new snapshot drops the placeholders with the cards they stood for.
    ...(replace ? { hiddenIds: [], hideFocus: null } : {}),
  };
}

/** One unit's like set to `liked` (the count moves by one when it changed); the other units are the same objects. A unit not in the list is ignored. */
export function withLike(items: readonly FeedUnit[], id: string, liked: boolean): FeedUnit[] {
  return items.map((unit) =>
    unit.id !== id || unit.likedByMe === liked ? unit : { ...unit, likedByMe: liked, likeCount: Math.max(0, unit.likeCount + (liked ? 1 : -1)) },
  );
}

/** The units to keep for Back (F3.2 c20): a unit hidden on this screen is not restored, and neither is its placeholder (F3.9 c10). */
export function withoutHidden(items: readonly FeedUnit[], hiddenIds: readonly string[]): FeedUnit[] {
  return hiddenIds.length === 0 ? [...items] : items.filter((unit) => !hiddenIds.includes(unit.id));
}

/** What a finished hide, undo, delete or report leaves (F3.9 c9, c11; F3.7 c13): the unit no longer pending, and the status and focus the screen contract names. */
export type HideResult =
  | { kind: 'hidden'; status: string }
  | { kind: 'unhidden'; status: string }
  | { kind: 'removed'; status: string }
  | { kind: 'hide-failed'; status: string }
  | { kind: 'undo-failed'; status: string }
  /** F3.7: a report that keeps the card (404 unavailable): what happened is said, focus back on its "⋯". */
  | { kind: 'noted'; status: string };

export function withHideResult(state: FeedState, unitId: string, result: HideResult): FeedState {
  const seq = (state.hideFocus?.seq ?? 0) + 1;
  const pendingHideIds = state.pendingHideIds.filter((id) => id !== unitId);
  const base = { ...state, pendingHideIds, likeStatus: '', hideStatus: result.status, hideStatusTick: state.hideStatusTick + 1 };
  switch (result.kind) {
    case 'hidden':
      return { ...base, hiddenIds: [...state.hiddenIds.filter((id) => id !== unitId), unitId], hideFocus: { target: 'undo', unitId, seq } };
    case 'unhidden':
      return { ...base, hiddenIds: state.hiddenIds.filter((id) => id !== unitId), hideFocus: { target: 'more', unitId, seq } };
    case 'removed': {
      const index = state.items.findIndex((unit) => unit.id === unitId);
      if (index < 0) return base;
      return { ...base, items: state.items.filter((unit) => unit.id !== unitId), hiddenIds: state.hiddenIds.filter((id) => id !== unitId), hideFocus: { target: 'index', index, seq } };
    }
    case 'hide-failed':
    case 'noted':
      return { ...base, hideFocus: { target: 'more', unitId, seq } };
    case 'undo-failed':
      return { ...base, hideFocus: { target: 'undo', unitId, seq } };
  }
}

/** An own post saved from its card (ux-polish-b c2): the card shows the stored text, audience and tag; "הפוסט עודכן" is said, focus goes back to its "⋯". */
export function withEdited(state: FeedState, unitId: string, post: PostView, status: string): FeedState {
  const items = state.items.map((unit) =>
    unit.id !== unitId || unit.kind !== 'post' || post.body === null ? unit : { ...unit, body: post.body, audience: post.audience, stageTag: post.stageTag },
  );
  return withHideResult({ ...state, items }, unitId, { kind: 'noted', status });
}

/** Focus goes to a card's "⋯" and nothing is said (its edit form closed without saving). */
export function withMoreFocus(state: FeedState, unitId: string): FeedState {
  return { ...state, hideFocus: { target: 'more', unitId, seq: (state.hideFocus?.seq ?? 0) + 1 } };
}

/** A post just published joins the top of the loaded list, once (feed-composer c7, c9). A new snapshot replaces the list, and with it this unit. */
export function withPublished(state: FeedState, unit: FeedUnit): FeedState {
  // After a failed first page the error stands alone; the retry brings the server's order only (c9).
  if (state.phase === 'first-error') return state;
  return { ...state, items: [unit, ...state.items.filter((item) => item.id !== unit.id)], likeStatus: '' };
}

/**
 * A share just made by the viewer (F3.5 c11): it joins the top of the loaded list as a published post does, and what happened is said in the
 * action channel (the hide statuses' region and tick). Focus is not moved: it goes back to the "שיתוף בפיד" that opened the window.
 */
export function withShared(state: FeedState, unit: FeedUnit, status: string): FeedState {
  return { ...withPublished(state, unit), likeStatus: '', hideStatus: status, hideStatusTick: state.hideStatusTick + 1 };
}

/** What the action channel says (the hide statuses' region and tick): an outcome of a card's comments that moves no count (ux-polish-a c7, c8). */
export function withStatus(state: FeedState, status: string): FeedState {
  return { ...state, likeStatus: '', hideStatus: status, hideStatusTick: state.hideStatusTick + 1 };
}

/**
 * A comment added to or deleted from a card (ux-polish-a c4, c5, c7): its "תגובות, N" moves by `delta` (never below 0), kept for Back with the
 * rest of the list (c11), and `status` is said in the action channel.
 */
export function withCommentCount(state: FeedState, unitId: string, delta: number, status: string): FeedState {
  const items = state.items.map((unit) => (unit.id !== unitId ? unit : { ...unit, commentCount: Math.max(0, unit.commentCount + delta) }));
  return withStatus({ ...state, items }, status);
}
