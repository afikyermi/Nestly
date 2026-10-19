import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { rememberScroll, type FeedScroll } from './feed-memory';

/** How far the reader has scrolled before "חזרה למעלה" appears (c20: a long scroll). */
const LONG_SCROLL_PX = 1500;

/** The element that scrolls: below 1024 the shell's `main`, from 1024 the page itself. */
function scroller(root: HTMLElement | null): HTMLElement | null {
  const main = root?.closest('main') ?? null;
  return main !== null && getComputedStyle(main).overflowY === 'auto' ? main : null;
}

function position(root: HTMLElement | null): FeedScroll {
  return { main: scroller(root)?.scrollTop ?? 0, page: window.scrollY };
}

export interface FeedScrollControl {
  /** True after a long scroll. */
  far: boolean;
  /** Put the scroll back at the top. */
  toTop: () => void;
}

// What the feed needs from scrolling (F3.2b c20): whether the reader is far down, the position kept for Back, and putting a remembered
// position back. The shell's own reset to the top runs after a screen mounts, so the restore waits for the next frame and for `settled` (the posting-right check adds "כתיבת פוסט" above the list).
export function useFeedScroll(rootRef: RefObject<HTMLElement | null>, restoreTo: FeedScroll | null, settled: boolean): FeedScrollControl {
  const [far, setFar] = useState(false);
  const restoring = useRef(false);

  // ux-polish-a c10: Back that closes an overlay (a menu, a confirmation, a window) stays at the same scroll. Left to the browser, it would
  // put back the scroll the feed's entry had when the overlay's entry was added (before the reader scrolled to another "⋯"). The feed puts
  // its own scroll back for Back from a post (below), so the browser's restore is off while the feed is open.
  useEffect(() => {
    const before = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = before;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const update = () => {
      if (restoring.current) return;
      const at = position(root);
      rememberScroll(at);
      setFar(Math.max(at.main, at.page) > LONG_SCROLL_PX);
    };
    const container = scroller(root);
    (container ?? window).addEventListener('scroll', update, { passive: true });
    return () => (container ?? window).removeEventListener('scroll', update);
  }, [rootRef]);

  useEffect(() => {
    if (restoreTo === null || !settled) return;
    restoring.current = true;
    // "חזרה למעלה" first: below 1024 its row shortens `main`, and a position set while `main` is still taller is clamped (F3.2 c20).
    setFar(Math.max(restoreTo.main, restoreTo.page) > LONG_SCROLL_PX);
    const frame = requestAnimationFrame(() => {
      const container = scroller(rootRef.current);
      if (container !== null) container.scrollTop = restoreTo.main;
      window.scrollTo(0, restoreTo.page);
      restoring.current = false;
    });
    return () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
    };
  }, [rootRef, restoreTo, settled]);

  const toTop = useCallback(() => {
    const container = scroller(rootRef.current);
    if (container !== null) container.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [rootRef]);

  return { far, toTop };
}
