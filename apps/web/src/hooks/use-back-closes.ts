import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isOverlayState, overlayState } from '@/lib/history-overlay';

export interface BackCloses {
  /** Leave for another screen from the open overlay: its entry is replaced, so Back from there returns to this screen, not to the overlay. */
  leaveTo: (path: string) => void;
  /** The overlay is about to close because of a press outside it: the press may be a link, so its entry is taken back only once that settles. */
  closingByPointer: () => void;
  /** A link pressed outside the overlay: its entry is taken back first, then `path` opens (not when it is this very screen), so no overlay entry stays under it. */
  followAfterClose: (path: string) => void;
  /** True while a closed overlay's entry is still being taken back (or a close by an outside press is settling). */
  closing: () => boolean;
}

/** How long a close by an outside press waits before taking its entry back: the press's click (a link's navigation) comes first. */
const POINTER_SETTLE_MS = 400;

/** The stale overlay entry last stepped over, by key: kept outside the component so a remount (the session check) never steps twice. */
let steppedOverKey: string | null = null;

/**
 * The hook instances that hold the current overlay entry. A screen may have more than one (F3.7: the post page's menu and its comments'
 * menus): an overlay entry another instance holds is not stale, so no other instance steps over it.
 */
const holders = new Set<symbol>();

/**
 * The close by an outside press now settling: its overlay entry and the timer that takes it back. Shared like `holders`: any instance that
 * opens while that entry is still the current one takes it over (cancelling the timer) instead of stacking a new entry on it (F3.7: the post
 * page's "⋯" straight to a comment's "⋯", or the reverse).
 */
let settling: { readonly key: string; readonly timer: ReturnType<typeof setTimeout>; readonly owner: symbol } | null = null;

function cancelSettling(): void {
  if (settling !== null) clearTimeout(settling.timer);
  settling = null;
}

// Back closes an open overlay and stays on the screen (direction.md "דפוסי אינטראקציה"; F3.9 c8, c13). While `open`, one history entry with
// the same address sits on top of the screen's; Back removes it and calls onBack, which answers whether the overlay closed (false: it stays,
// e.g. a request in flight, and the entry is added again so the next Back still closes it). Closed any other way (Esc, an item), the entry is
// taken back at once; closed by an outside press, only after the press has settled and only if the overlay entry is still the current one,
// so a press outside is never undone; a link pressed outside opens only after the entry is gone (followAfterClose), so no overlay entry is
// left under it. An overlay entry found current while nothing is open (a reload, or Back/Forward onto a stale
// one) is stepped over once, so no Back is dead. One entry for the whole time something is open: a menu to its confirmation adds nothing.
export function useBackCloses(open: boolean, onBack: () => boolean): BackCloses {
  const location = useLocation();
  const navigate = useNavigate();
  const pushed = useRef(false);
  const self = useRef(Symbol('back-closes'));
  const hold = useCallback((value: boolean) => {
    pushed.current = value;
    if (value) holders.add(self.current);
    else holders.delete(self.current);
  }, []);
  const byPointer = useRef(false);
  const pending = useRef<string | null>(null);
  const back = useRef(onBack);
  back.current = onBack;
  // The latest location: the address the overlay entry repeats, and whether that entry is still the current one when a close settles.
  const here = useRef(location);
  here.current = location;

  // A step back over the overlay entry is asynchronous (a history traversal). Until it lands, a navigation started meanwhile would be undone
  // by it (F3.9 c10: a link opened right after "הסתרת הפוסט" came back to the feed with its screen state), so `closing` tells the screen to
  // hold such a link and hand it to followAfterClose.
  const stepping = useRef(false);
  const stepBack = useCallback(() => {
    stepping.current = true;
    void navigate(-1);
  }, [navigate]);

  const push = useCallback(() => {
    // A new overlay entry goes on top of whatever the last step back left: that step back no longer guards a link (closing() is false).
    stepping.current = false;
    hold(true);
    const { pathname, search, hash } = here.current;
    const state: unknown = here.current.state;
    void navigate({ pathname, search, hash }, { state: overlayState(state) });
  }, [navigate, hold]);

  useEffect(() => {
    if (open && !pushed.current) {
      // Opened again while the last close by an outside press is still settling: its entry is still the current one, so it is taken over
      // instead of stacking a second one under it (else Back would land on that stale entry and close nothing).
      const reuse = settling !== null && settling.key === here.current.key && isOverlayState(here.current.state);
      // Another instance still holds the current overlay entry (one press moved from its "⋯" to this one's, the close not yet seen): shared.
      const shared = holders.size > 0 && isOverlayState(here.current.state);
      cancelSettling();
      if (reuse || shared) hold(true);
      else push();
    } else if (!open && pushed.current) {
      hold(false);
      if (holders.size > 0) {
        // Another instance holds the entry now: the last one to let go takes it back.
        byPointer.current = false;
        return;
      }
      if (!byPointer.current) {
        stepBack();
        return;
      }
      byPointer.current = false;
      const entry = here.current.key;
      cancelSettling();
      const timer = setTimeout(() => {
        settling = null;
        if (holders.size === 0 && here.current.key === entry && isOverlayState(here.current.state)) stepBack();
      }, POINTER_SETTLE_MS);
      settling = { key: entry, timer, owner: self.current };
    }
  }, [open, navigate, push]);

  useEffect(() => {
    const overlayEntry = isOverlayState(location.state);
    if (!overlayEntry) stepping.current = false;
    if (pending.current !== null && !overlayEntry) {
      const path = pending.current;
      pending.current = null;
      void navigate(path);
      return;
    }
    if (pushed.current && !overlayEntry) {
      hold(false);
      if (!back.current()) push();
      return;
    }
    if (!pushed.current && holders.size === 0 && overlayEntry && settling === null && pending.current === null && steppedOverKey !== location.key) {
      steppedOverKey = location.key;
      stepBack();
    }
  }, [location, navigate, push]);

  useEffect(
    () => () => {
      if (settling?.owner === self.current) cancelSettling();
      holders.delete(self.current);
    },
    [],
  );

  const leaveTo = useCallback(
    (path: string) => {
      const replace = pushed.current;
      hold(false);
      void navigate(path, { replace });
    },
    [navigate],
  );

  const closingByPointer = useCallback(() => {
    byPointer.current = true;
  }, []);

  const followAfterClose = useCallback(
    (path: string) => {
      cancelSettling();
      byPointer.current = false;
      if (stepping.current) {
        // The overlay entry is already being taken back: open the link once that has landed.
        pending.current = path;
      } else if (pushed.current || isOverlayState(here.current.state)) {
        hold(false);
        const { pathname, search, hash } = here.current;
        // The screen already open (the navigation's own item, with a menu open): the overlay entry goes and nothing is added in its place.
        if (path !== `${pathname}${search}${hash}`) pending.current = path;
        stepBack();
      } else void navigate(path);
    },
    [navigate],
  );

  const closing = useCallback(() => stepping.current || (settling !== null && settling.owner === self.current), []);

  return { leaveTo, closingByPointer, followAfterClose, closing };
}
