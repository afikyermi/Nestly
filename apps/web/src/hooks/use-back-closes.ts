import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isOverlayState, overlayState } from '@/lib/history-overlay';

export interface BackCloses {
  /** Leave for another screen from the open overlay: its entry is replaced, so Back from there returns to this screen, not to the overlay. */
  leaveTo: (path: string) => void;
  /** The overlay is about to close because of a press outside it: the press may be a link, so its entry is taken back only once that settles. */
  closingByPointer: () => void;
  /** A link pressed outside the overlay: its entry is taken back first, then `path` opens, so no overlay entry stays under it. */
  followAfterClose: (path: string) => void;
}

/** How long a close by an outside press waits before taking its entry back: the press's click (a link's navigation) comes first. */
const POINTER_SETTLE_MS = 400;

/** The stale overlay entry last stepped over, by key: kept outside the component so a remount (the session check) never steps twice. */
let steppedOverKey: string | null = null;

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
  const byPointer = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const back = useRef(onBack);
  back.current = onBack;
  // The latest location: the address the overlay entry repeats, and whether that entry is still the current one when a close settles.
  const here = useRef(location);
  here.current = location;

  const push = useCallback(() => {
    pushed.current = true;
    const { pathname, search, hash } = here.current;
    const state: unknown = here.current.state;
    void navigate({ pathname, search, hash }, { state: overlayState(state) });
  }, [navigate]);

  const cancelSettle = () => {
    if (settle.current !== null) clearTimeout(settle.current);
    settle.current = null;
  };

  useEffect(() => {
    if (open && !pushed.current) {
      cancelSettle();
      push();
    } else if (!open && pushed.current) {
      pushed.current = false;
      if (!byPointer.current) {
        void navigate(-1);
        return;
      }
      byPointer.current = false;
      const entry = here.current.key;
      settle.current = setTimeout(() => {
        settle.current = null;
        if (here.current.key === entry && isOverlayState(here.current.state)) void navigate(-1);
      }, POINTER_SETTLE_MS);
    }
  }, [open, navigate, push]);

  useEffect(() => {
    const overlayEntry = isOverlayState(location.state);
    if (pending.current !== null && !overlayEntry) {
      const path = pending.current;
      pending.current = null;
      void navigate(path);
      return;
    }
    if (pushed.current && !overlayEntry) {
      pushed.current = false;
      if (!back.current()) push();
      return;
    }
    if (!pushed.current && overlayEntry && settle.current === null && pending.current === null && steppedOverKey !== location.key) {
      steppedOverKey = location.key;
      void navigate(-1);
    }
  }, [location, navigate, push]);

  useEffect(() => cancelSettle, []);

  const leaveTo = useCallback(
    (path: string) => {
      const replace = pushed.current;
      pushed.current = false;
      void navigate(path, { replace });
    },
    [navigate],
  );

  const closingByPointer = useCallback(() => {
    byPointer.current = true;
  }, []);

  const followAfterClose = useCallback(
    (path: string) => {
      cancelSettle();
      byPointer.current = false;
      if (pushed.current || isOverlayState(here.current.state)) {
        pushed.current = false;
        pending.current = path;
        void navigate(-1);
      } else void navigate(path);
    },
    [navigate],
  );

  return { leaveTo, closingByPointer, followAfterClose };
}
